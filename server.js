const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

// .env loader (local dev) – on Railway use dashboard variables
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const PORT = process.env.PORT || 3000;
const STATS_KEY = process.env.STATS_KEY;
const TMDB_TOKEN = process.env.TMDB_TOKEN;
const SUBDL_API_KEY = process.env.SUBDL_API_KEY || '';
const OS_API_KEY = process.env.OS_API_KEY || '';

if (!STATS_KEY) { console.error('Missing env: STATS_KEY'); process.exit(1); }
if (!TMDB_TOKEN) { console.error('Missing env: TMDB_TOKEN'); process.exit(1); }

const GENRE_MAP = {
  28: 'اكشن', 12: 'مغامرة', 16: 'انمي', 35: 'كوميديا',
  80: 'جريمة', 99: 'وثائقي', 18: 'دراما', 10751: 'عائلي',
  14: 'خيال', 36: 'تاريخي', 27: 'رعب', 10402: 'موسيقى',
  9648: 'غموض', 10749: 'رومانسي', 878: 'خيال علمي',
  10770: 'تلفزيون', 53: 'اثارة', 10752: 'حرب', 37: 'غرب امريكي',
  10759: 'اكشن مغامرة', 10762: 'اطفال', 10763: 'اخبار', 10764: 'واقع', 10766: 'مسلسلات'
};

let watchLinks = {};
try {
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'movies-source.json'), 'utf8'));
  source.forEach(m => { watchLinks[m.tmdb_id] = m.watch_link; });
} catch {}

let stats = {
  totalViews: 0,
  totalVisitors: 0,
  byDay: {},
  devices: {},
  browsers: {},
  countries: {},
  pages: {},
  models: {},
  seenSids: {},
  ipGeo: {},
  visits: []
};
try {
  const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, 'stats.json'), 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.byDay === 'object') {
    stats = parsed;
    if (typeof stats.pages !== 'object') stats.pages = {};
    if (typeof stats.ipGeo !== 'object') stats.ipGeo = {};
    if (!Array.isArray(stats.visits)) stats.visits = [];
  }
} catch {}

const activeSessions = new Map(); // sid -> lastSeen timestamp
const geoCache = new Map();
const trackTimes = new Map();

function saveStats() {
  try { fs.writeFileSync(path.join(__dirname, 'stats.json'), JSON.stringify(stats)); } catch {}
}

function cleanupSessions() {
  const now = Date.now();
  for (const [sid, last] of activeSessions) {
    if (now - last > 60000) activeSessions.delete(sid);
  }
}

function parseUA(ua = '') {
  ua = ua.toLowerCase();
  let browser = 'أخرى';
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera';
  else if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';
  let os = 'أخرى';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) os = 'iOS';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('mac os')) os = 'Mac';
  else if (ua.includes('linux')) os = 'Linux';
  let device = 'كمبيوتر';
  if (ua.includes('ipad') || ua.includes('tablet')) device = 'تابلت';
  else if (ua.includes('mobi') || ua.includes('android') || ua.includes('iphone')) device = 'موبايل';
  let model = '';
  if (ua.includes('iphone')) model = 'iPhone';
  else if (ua.includes('ipad')) model = 'iPad';
  else {
    const m = ua.match(/; ([^;]+?) build\//);
    if (m) model = m[1].trim();
  }
  return { browser, os, device, model };
}

function getGeo(ip) {
  if (geoCache.has(ip)) return Promise.resolve(geoCache.get(ip));
  if (stats.ipGeo[ip]) { geoCache.set(ip, stats.ipGeo[ip]); return Promise.resolve(stats.ipGeo[ip]); }
  return new Promise(resolve => {
    https.get(`https://ipwho.is/${encodeURIComponent(ip)}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const g = {
            country: j.country || 'غير معروف',
            city: j.city || '',
            isp: (j.connection && j.connection.isp) || ''
          };
          stats.ipGeo[ip] = g;
          geoCache.set(ip, g);
          saveStats();
          resolve(g);
        } catch { resolve({ country: 'غير معروف', city: '', isp: '' }); }
      });
    }).on('error', () => resolve({ country: 'غير معروف', city: '', isp: '' }));
  });
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '0.0.0.0';
}

/* ================= External Subtitles Engine ================= */
const SUBS_DIR = path.join(__dirname, 'subs-cache');
try { fs.mkdirSync(SUBS_DIR, { recursive: true }); } catch {}

const imdbIdCache = new Map();
const subPending = new Map();
let subHintShown = false;

function siteOrigin(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function fetchWithTimeout(url, opts = {}, ms = 15000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms), redirect: 'follow' });
}

async function resolveImdbId(type, tmdbId) {
  const ck = `${type}-${tmdbId}`;
  if (imdbIdCache.has(ck)) return imdbIdCache.get(ck);
  try {
    const j = await tmdbFetch(`/${type}/${tmdbId}/external_ids`);
    const imdb = j.imdb_id || '';
    imdbIdCache.set(ck, imdb);
    return imdb;
  } catch { return ''; }
}

function srtToVtt(srt) {
  let t = srt.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  t = t.replace(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/g, (_, h, m, s, ms) =>
    `${h.padStart(2, '0')}:${m}:${s}.${ms.padEnd(3, '0')}`);
  return 'WEBVTT\n\n' + t.trim() + '\n';
}

function assTime(t) {
  const m = String(t).trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!m) return '00:00:00.000';
  return `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${m[3].padStart(2, '0')}.${m[4].padEnd(3, '0')}`;
}

function assToVtt(text) {
  const out = ['WEBVTT', ''];
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('Dialogue:')) continue;
    const parts = line.slice(9).split(',');
    if (parts.length < 10) continue;
    const start = assTime(parts[1]);
    const end = assTime(parts[2]);
    let txt = parts.slice(9).join(',')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!txt) continue;
    out.push(String(++n), `${start} --> ${end}`, txt, '');
  }
  return out.join('\n') + '\n';
}

function unzipFirstSubtitle(buf) {
  try {
    const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    let pos = 0;
    while (true) {
      const idx = buf.indexOf(sig, pos);
      if (idx < 0) return null;
      const method = buf.readUInt16LE(idx + 8);
      const compSize = buf.readUInt32LE(idx + 18);
      const nameLen = buf.readUInt16LE(idx + 26);
      const extraLen = buf.readUInt16LE(idx + 28);
      const name = buf.slice(idx + 30, idx + 30 + nameLen).toString('utf8');
      const dataStart = idx + 30 + nameLen + extraLen;
      if (/\.(srt|vtt)$/i.test(name)) {
        const raw = buf.slice(dataStart, compSize > 0 ? dataStart + compSize : buf.length);
        const data = method === 0 ? raw : zlib.inflateRawSync(raw);
        return smartDecode(data);
      }
      pos = dataStart + Math.max(compSize, 1);
    }
  } catch { return null; }
}

function subScore(c, season, episode) {
  let sc = 0;
  if (c.format === 'srt') sc -= 10;
  else if (c.format === 'vtt') sc -= 8;
  else if (c.format === 'ass' || c.format === 'ssa') sc += 5;
  if (season != null && Number(c.season) === Number(season)) sc -= 3;
  else if (season != null && Number(c.season) > 0) sc += 20;
  if (episode != null && Number(c.episode) === Number(episode)) sc -= 2;
  else if (episode != null && Number(c.episode) > 0 && Number(c.episode) !== Number(episode)) sc += 15;
  return sc;
}

async function findSubdl(imdbId, tmdbId, type, season, episode) {
  const p = new URLSearchParams({ type, languages: 'ar' });
  if (imdbId) p.set('imdb_id', imdbId); else p.set('tmdb_id', tmdbId);
  if (type === 'tv') {
    if (season != null) p.set('season_number', season);
    if (episode != null) p.set('episode_number', episode);
  }
  const r = await fetchWithTimeout('https://api.subdl.com/api/v2/subtitles/search?' + p.toString(), {
    headers: { 'Authorization': 'Bearer ' + SUBDL_API_KEY, 'Accept': 'application/json' }
  }, 10000);
  if (!r.ok) throw new Error('subdl http ' + r.status);
  const j = await r.json();
  const candidates = [];
  for (const s of (j.subtitles || [])) {
    const files = Array.isArray(s.unpack_files) && s.unpack_files.length ? s.unpack_files : [s];
    for (const f of files) {
      const u = f.url || s.url;
      if (!u) continue;
      const fmtMatch = String(f.format || (u.match(/\.(\w{3})(\?|$)/) || [])[1] || '').toLowerCase();
      candidates.push({
        url: u,
        format: fmtMatch,
        season: f.season !== undefined ? f.season : s.season,
        episode: f.episode !== undefined ? f.episode : s.episode
      });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => subScore(a, season, episode) - subScore(b, season, episode));
  const best = candidates[0];
  return { download_link: /^https?:/i.test(best.url) ? best.url : 'https://api.subdl.com' + best.url };
}

async function findOpenSubtitles(imdbId, type, season, episode) {
  const headers = { 'Api-Key': OS_API_KEY, 'User-Agent': 'AlexCinema v1.0', 'Accept': 'application/json' };
  const p = new URLSearchParams({ languages: 'ar', type });
  if (imdbId) p.set('imdb_id', String(imdbId).replace(/^tt/, ''));
  if (type === 'tv') {
    if (season != null) p.set('season_number', season);
    if (episode != null) p.set('episode_number', episode);
  }
  const r1 = await fetchWithTimeout('https://api.opensubtitles.com/api/v1/subtitles?' + p.toString(), { headers }, 10000);
  if (!r1.ok) throw new Error('os http ' + r1.status);
  const j1 = await r1.json();
  const items = ((j1.data || []).map(d => d.attributes) || [])
    .filter(a => a.files && a.files.length)
    .sort((a, b) => (b.ratings || 0) - (a.ratings || 0) || (a.ai_translated ? 1 : 0) - (b.ai_translated ? 1 : 0));
  if (!items.length) return null;
  const fileId = items[0].files[0].file_id;
  const r2 = await fetchWithTimeout('https://api.opensubtitles.com/api/v1/download', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId })
  }, 10000);
  if (!r2.ok) throw new Error('os dl http ' + r2.status);
  const j2 = await r2.json();
  return j2.link ? { download_link: j2.link } : null;
}

function smartDecode(buf) {
  if (buf.length > 2 && buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf.slice(2));
  if (buf.length > 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return new TextDecoder('utf-8').decode(buf.slice(3));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch {
    try { return new TextDecoder('windows-1256').decode(buf); }
    catch { return buf.toString('latin1'); }
  }
}

async function downloadSubtitleContent(sub) {
  let link = sub.download_link;
  if (!/^https?:/i.test(link)) link = 'https://dl.subdl.com' + (link.startsWith('/') ? '' : '/') + link;
  const r = await fetchWithTimeout(link, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 20000);
  if (!r.ok) throw new Error('sub dl http ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.slice(0, 2).toString() === 'PK') {
    const inner = unzipFirstSubtitle(buf);
    if (!inner) throw new Error('zip has no subtitle');
    return inner;
  }
  return smartDecode(buf);
}

function subKey(type, id, season, episode) {
  return `${type}-${id}` + (type === 'tv' ? `-s${season}-e${episode}` : '') + '-ar';
}

async function buildVtt(type, id, season, episode) {
  const imdbId = await resolveImdbId(type, id);
  let sub = null, searched = false;
  if (SUBDL_API_KEY) { try { sub = await findSubdl(imdbId, id, type, season, episode); searched = true; } catch {} }
  if (!sub && OS_API_KEY) { try { sub = await findOpenSubtitles(imdbId, type, season, episode); searched = true; } catch {} }
  if (!sub) return searched ? null : undefined;
  const text = await downloadSubtitleContent(sub);
  if (/\[Events\]/i.test(text) || /^\s*\[Script Info\]/im.test(text)) return assToVtt(text);
  return srtToVtt(text);
}

async function ensureExternalSubtitle(req, type, id, season, episode) {
  if (!SUBDL_API_KEY && !OS_API_KEY) {
    if (!subHintShown) {
      subHintShown = true;
      console.log('Info: set SUBDL_API_KEY or OS_API_KEY env to enable external Arabic subtitles');
    }
    return null;
  }
  if (!id) return null;
  const key = subKey(type, id, season, episode);
  const vttPath = path.join(SUBS_DIR, key + '.vtt');

  if (fs.existsSync(vttPath)) {
    try {
      if (fs.readFileSync(vttPath, 'utf8').length > 50) return `${siteOrigin(req)}/api/subtitle/${key}.vtt`;
    } catch {}
  }

  const negPath = path.join(SUBS_DIR, key + '.miss');
  try {
    if (fs.existsSync(negPath) && Date.now() - fs.statSync(negPath).mtimeMs < 24 * 3600 * 1000) return null;
  } catch {}

  if (subPending.has(key)) {
    const ok = await subPending.get(key).catch(() => false);
    return ok ? `${siteOrigin(req)}/api/subtitle/${key}.vtt` : null;
  }

  console.log('Subtitle lookup (consumes quota):', key);
  const job = buildVtt(type, id, season, episode)
    .then(vtt => {
      if (vtt && vtt.length > 50) {
        fs.writeFileSync(vttPath, vtt);
        console.log('Subtitle cached:', key);
        return true;
      }
      if (vtt === null) fs.writeFileSync(negPath, '');
      return false;
    });
  subPending.set(key, job);
  const ok = await job.finally(() => subPending.delete(key)).catch(() => false);
  return ok ? `${siteOrigin(req)}/api/subtitle/${key}.vtt` : null;
}

/* ================= End Subtitles Engine ================= */

function buildEmbedSources(mediaType, srcId, season, episode, subUrl) {
  const enc = encodeURIComponent;
  const isTv = mediaType === 'tv';
  const epPath = isTv ? `/${season}/${episode}` : '';
  const list = [];
  const label = enc('عربي');

  if (subUrl) {
    // Sources that support injecting OUR subtitle file
    list.push({ name: 'vidlink', url: `https://vidlink.pro/${mediaType}/${srcId}${isTv ? `/${season}/${episode}` : ''}?sub_file=${enc(subUrl)}&sub_label=${label}&autoplay=true` });
    list.push({ name: 'vidsrc.cc', url: `https://vidsrc.cc/v2/embed/${mediaType}/${srcId}${epPath}?autoplay=1&sub.file=${enc(subUrl)}&sub.label=${label}` });
    list.push({ name: 'vidsrc.me', url: isTv
      ? `https://vidsrc-embed.ru/embed/tv?tmdb=${srcId}&season=${season}&episode=${episode}&sub_url=${enc(subUrl)}&autoplay=1`
      : `https://vidsrc-embed.ru/embed/movie?tmdb=${srcId}&sub_url=${enc(subUrl)}&autoplay=1` });
    list.push({ name: 'yapgrid', url: `https://yapgrid.com/embed/${mediaType}/${srcId}${isTv ? `/${season}/${episode}` : ''}?sub_url=${enc(subUrl)}&sub_lang=ar&sub_label=${label}&autoplay=1` });
  }

  // Fallbacks with built-in provider subs
  list.push(
    { name: 'vaplayer', url: srcId ? `https://vaplayer.ru/embed/${mediaType}/${srcId}${epPath}?primaryColor=%23e50914&ds_lang=ar&autoplay=1&showTitle=false` : null },
    { name: 'vidsrc.wiki', url: /^\d+$/.test(srcId) ? `https://vidsrc.wiki/embed/${mediaType}/${srcId}${epPath}?sub=ar&controls=0&autoplay=1` : null },
    { name: 'vidsrc.sbs', url: /^\d+$/.test(srcId) ? `https://vidsrc.sbs/embed/${mediaType}/${srcId}${epPath}?sub=ar&controls=0&autoplay=1` : null }
  );

  return list.filter(s => s.url);
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err.message);
});

function tmdbFetch(apiPath) {
  return new Promise((resolve, reject) => {
    const sep = apiPath.includes('?') ? '&' : '?';
    const opts = {
      hostname: 'api.themoviedb.org',
      path: '/3' + apiPath + sep + 'language=ar-SA',
      headers: {
        'Authorization': 'Bearer ' + TMDB_TOKEN,
        'Accept': 'application/json'
      }
    };
    https.get(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('parse fail')); } });
    }).on('error', reject);
  });
}

function attach(item, type) {
  if (watchLinks[item.id]) item.watch_link = watchLinks[item.id];
  item.genre_names = (item.genre_ids || []).map(id => GENRE_MAP[id] || '').filter(Boolean);
  if (!item.genre_names.length && item.genres) {
    item.genre_names = item.genres.map(g => GENRE_MAP[g.id] || g.name).filter(Boolean);
  }
  item.media_type = type;
  item.release_date = item.release_date || item.first_air_date || '';
  return item;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' });
      res.end();
      return;
    }

    if (p === '/api/discover') {
      try {
        const type = url.searchParams.get('type') || 'movie';
        const genre = url.searchParams.get('genre') || '';
        const lang = url.searchParams.get('language') || '';
        const page = url.searchParams.get('page') || 1;
        const sort = url.searchParams.get('sort') || 'popularity.desc';
        let tmdbUrl = `/discover/${type}?sort_by=${sort}&page=${page}`;
        if (genre) tmdbUrl += `&with_genres=${genre}`;
        if (lang) tmdbUrl += `&with_original_language=${lang}`;
        const data = await tmdbFetch(tmdbUrl);
        data.results = (data.results || []).map(r => attach(r, type));
        sendJson(res, data);
      } catch (e) {
        sendJson(res, { results: [], total_pages: 0, error: e.message });
      }
      return;
    }

    if (p === '/api/detail') {
      try {
        const type = url.searchParams.get('type') || 'movie';
        const id = url.searchParams.get('id');
        if (!id) { sendJson(res, { error: 'no id' }); return; }
        const data = await tmdbFetch(`/${type}/${id}`);
        data.genre_names = (data.genres || []).map(g => GENRE_MAP[g.id] || g.name).filter(Boolean);
        if (watchLinks[data.id]) {
          data.watch_link = watchLinks[data.id];
          const yt = watchLinks[data.id].match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (yt) data.youtube_id = yt[1];
        }
        data.media_type = type;
        data.tmdb_id = data.id;
        sendJson(res, data);
      } catch (e) {
        sendJson(res, { error: 'not found' });
      }
      return;
    }

    if (p === '/api/search') {
      try {
        const type = url.searchParams.get('type') || 'movie';
        const q = url.searchParams.get('q');
        const page = url.searchParams.get('page') || 1;
        if (!q) { sendJson(res, { results: [] }); return; }
        const data = await tmdbFetch(`/search/${type}?query=${encodeURIComponent(q)}&page=${page}`);
        data.results = (data.results || []).map(r => attach(r, type));
        sendJson(res, data);
      } catch (e) {
        sendJson(res, { results: [], error: e.message });
      }
      return;
    }

    if (p === '/api/tv-season') {
      try {
        const id = url.searchParams.get('id');
        const season = url.searchParams.get('season');
        if (!id || !season) { sendJson(res, { error: 'missing params' }); return; }
        const data = await tmdbFetch(`/tv/${id}/season/${season}`);
        sendJson(res, data);
      } catch (e) {
        sendJson(res, { error: 'not found' });
      }
      return;
    }

    if (p === '/api/player-url') {
      try {
        const imdbId = url.searchParams.get('imdb_id');
        const mediaType = url.searchParams.get('type') || 'movie';
        const tmdbId = url.searchParams.get('tmdb_id');
        if (!imdbId && !tmdbId) { sendJson(res, { ok: false, embed_url: '' }); return; }

        // 1) Check YouTube links from movies-source.json
        if (tmdbId && watchLinks[tmdbId]) {
          const watchLink = watchLinks[tmdbId];
          const ytMatch = watchLink.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (ytMatch) {
            sendJson(res, { ok: true, embed_url: watchLink, type: 'youtube', video_id: ytMatch[1] });
            return;
          }
        }

        let season = null, episode = null;
        if (mediaType === 'tv') {
          season = parseInt(url.searchParams.get('season')) || 1;
          episode = parseInt(url.searchParams.get('episode')) || 1;
        }

        // External sub only when the client explicitly asks for it (saves SubDL quota)
        const subUrl = url.searchParams.get('sub_url') || null;
        // Check ALL candidate sources in parallel – return every healthy one
        // (lets the user switch servers when quality is bad)
        const sources = buildEmbedSources(mediaType, tmdbId || imdbId, season, episode, subUrl);
        const checked = await Promise.all(sources.map(async src => {
          try {
            const checkRes = await fetch(src.url, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(5000)
            });
            if (checkRes.status !== 200) return null;
            const text = await checkRes.text();
            if (text.length > 200 && !text.includes('File not found') && !text.includes('Not Found') && !text.includes('broken')) return src;
            return null;
          } catch { return null; }
        }));
        const healthy = checked.filter(Boolean);

        if (healthy.length) {
          sendJson(res, {
            ok: true,
            embed_url: healthy[0].url,
            type: 'embed',
            source: healthy[0].name,
            sources: healthy.map((s, i) => ({ name: 'سيرفر ' + (i + 1), provider: s.name, url: s.url }))
          });
        } else {
          sendJson(res, { ok: false, embed_url: '' });
        }
      } catch (e) {
        sendJson(res, { ok: false, embed_url: '' });
      }
      return;
    }

    // On-demand external Arabic subtitle lookup – called only when user clicks the button
    if (p === '/api/subtitle-lookup') {
      const mediaType = url.searchParams.get('type') || 'movie';
      const id = url.searchParams.get('id');
      if (!id) { sendJson(res, { ok: false }); return; }
      let season = null, episode = null;
      if (mediaType === 'tv') {
        season = parseInt(url.searchParams.get('season')) || 1;
        episode = parseInt(url.searchParams.get('episode')) || 1;
      }
      try {
        const subUrl = await ensureExternalSubtitle(req, mediaType, id, season, episode);
        sendJson(res, { ok: !!subUrl, url: subUrl || '' });
      } catch {
        sendJson(res, { ok: false, url: '' });
      }
      return;
    }

    // Serve cached external subtitles as WebVTT (CORS open – embed players fetch it)
    const subRoute = p.match(/^\/api\/subtitle\/((?:movie|tv)-[\w.-]+)\.vtt$/);
    if (subRoute) {
      const fp = path.join(SUBS_DIR, subRoute[1] + '.vtt');
      fs.readFile(fp, (err, data) => {
        if (err) { res.writeHead(404, { 'Access-Control-Allow-Origin': '*' }); res.end('not found'); return; }
        res.writeHead(200, {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(data);
      });
      return;
    }

    // Proxy for masking embed URLs
    if (p === '/api/proxy-embed') {
      try {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) { sendJson(res, { error: 'no url' }, 400); return; }
        const response = await fetch(decodeURIComponent(targetUrl), {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://vidsrc.to/' }
        });
        const contentType = response.headers.get('content-type') || 'text/html';
        const body = await response.text();
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(body);
      } catch (e) {
        sendJson(res, { error: 'proxy failed' }, 502);
      }
      return;
    }

    // Analytics: track page view (sent by client JS)
    if (p === '/api/track') {
      const sid = url.searchParams.get('sid') || '';
      const page = (url.searchParams.get('page') || '/').slice(0, 300);
      const ref = (url.searchParams.get('ref') || '').slice(0, 300);
      const screen = (url.searchParams.get('screen') || '').slice(0, 20);
      const lang = (url.searchParams.get('lang') || '').slice(0, 20);
      const tz = (url.searchParams.get('tz') || '').slice(0, 40);
      const conn = (url.searchParams.get('conn') || '').slice(0, 20);
      const ram = (url.searchParams.get('ram') || '').slice(0, 20);
      const ip = getClientIp(req);
      const now = Date.now();

      // rate limit: max 5 tracks per 10s per IP
      const times = trackTimes.get(ip) || [];
      const recent = times.filter(t => now - t < 10000);
      if (recent.length >= 5) { sendJson(res, { ok: true }); return; }
      recent.push(now);
      trackTimes.set(ip, recent);

      const ua = parseUA(req.headers['user-agent'] || '');
      const today = new Date().toISOString().slice(0, 10);

      stats.totalViews++;
      stats.byDay[today] = (stats.byDay[today] || 0) + 1;
      stats.devices[ua.device] = (stats.devices[ua.device] || 0) + 1;
      stats.browsers[ua.browser] = (stats.browsers[ua.browser] || 0) + 1;
      const pageKey = page === '/' ? 'الرئيسية' : page.includes('movie.html') ? 'تفاصيل فيلم' : page;
      if (!stats.pages) stats.pages = {};
      stats.pages[pageKey] = (stats.pages[pageKey] || 0) + 1;
      if (!stats.seenSids[sid]) {
        stats.seenSids[sid] = 1;
        stats.totalVisitors++;
        if (Object.keys(stats.seenSids).length > 20000) stats.seenSids = {};
      }
      stats.visits.unshift({ t: now, page, ref, ip, device: ua.device, browser: ua.browser, os: ua.os, model: ua.model, screen, lang, tz, conn, ram, country: '' });
      if (stats.visits.length > 1000) stats.visits.length = 1000;
      if (ua.model && !/windows|linux|mac/i.test(ua.model)) {
        stats.models[ua.model] = (stats.models[ua.model] || 0) + 1;
      }
      saveStats();

      getGeo(ip).then(g => {
        const country = (g.country || 'غير معروف') + (g.city ? ' - ' + g.city : '');
        stats.countries[country] = (stats.countries[country] || 0) + 1;
        const entry = stats.visits.find(v => v.ip === ip && v.t === now);
        if (entry) { entry.country = country; entry.isp = g.isp; }
        saveStats();
      });

      sendJson(res, { ok: true });
      return;
    }

    // Stats: heartbeat + live counter
    if (p === '/api/heartbeat') {
      const sid = url.searchParams.get('sid') || '';
      if (sid) activeSessions.set(sid, Date.now());
      sendJson(res, { ok: true });
      return;
    }

    if (p === '/api/stats') {
      const key = url.searchParams.get('key') || '';
      if (key !== STATS_KEY) {
        sendJson(res, { error: 'unauthorized' }, 403);
        return;
      }
      cleanupSessions();
      const today = new Date().toISOString().slice(0, 10);
      sendJson(res, {
        views: stats.totalViews,
        visitors: stats.totalVisitors,
        today: stats.byDay[today] || 0,
        active: activeSessions.size
      });
      return;
    }

    // Admin dashboard (protected)
    if (p === '/admin') {
      const key = url.searchParams.get('key') || '';
      res.writeHead(302, { Location: `/admin.html?key=${encodeURIComponent(key)}` });
      res.end();
      return;
    }

    if (p === '/api/admin') {
      const key = url.searchParams.get('key') || '';
      const action = url.searchParams.get('action') || '';
      if (key !== STATS_KEY) {
        sendJson(res, { error: 'unauthorized' }, 403);
        return;
      }
      cleanupSessions();
      if (action === 'clear') {
        stats.visits = [];
        saveStats();
      }
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        days.push({ d: d.slice(5), v: stats.byDay[d] || 0 });
      }
      sendJson(res, {
        today: stats.byDay[today] || 0,
        yesterday: stats.byDay[yesterday] || 0,
        views: stats.totalViews,
        visitors: stats.totalVisitors,
        active: activeSessions.size,
        days,
        devices: stats.devices || {},
        browsers: stats.browsers || {},
        countries: stats.countries || {},
        pages: stats.pages || {},
        models: stats.models || {},
        visits: stats.visits.slice(0, 50),
        now: Date.now()
      });
      return;
    }

    // Static files
    let filePath = p === '/' ? '/index.html' : p;
    const fullPath = path.join(__dirname, filePath);
    const ext = path.extname(filePath);
    fs.readFile(fullPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('File not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    console.error('Server error:', e);
    res.writeHead(500);
    res.end('Server error');
  }
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Alex Cinema running on port ${PORT}`);
});
