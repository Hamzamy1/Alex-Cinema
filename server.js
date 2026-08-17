const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3000;
const STATS_KEY = process.env.STATS_KEY || 'AQFB8n7Czu3Ns9hISObPw1kY5aXGTclv';
const TMDB_TOKEN = process.env.TMDB_TOKEN || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5ODMwNjI0M2RhNGVjNjEwMmFmM2IwODZlZDY1ZTc3OCIsIm5iZiI6MTc4Mjc0MzQ4Ni45NzEsInN1YiI6IjZhNDI4MWJlN2Q0ZDJkNGI1OGY3OTI3NCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.j2W2F4ZWqv4mtun4S-A_ofuC0Fp-MBwtzCwcQj88Ax4';

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

let totalVisits = 0;
try {
  totalVisits = Number(fs.readFileSync(path.join(__dirname, 'stats.json'), 'utf8')) || 0;
} catch {}

const activeSessions = new Map(); // sid -> lastSeen timestamp

function saveStats() {
  try { fs.writeFileSync(path.join(__dirname, 'stats.json'), String(totalVisits)); } catch {}
}

function cleanupSessions() {
  const now = Date.now();
  for (const [sid, last] of activeSessions) {
    if (now - last > 60000) activeSessions.delete(sid);
  }
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
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
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
        if (!imdbId) { sendJson(res, { ok: false, embed_url: '' }); return; }

        // 1) Check YouTube links from movies-source.json
        if (tmdbId && watchLinks[tmdbId]) {
          const watchLink = watchLinks[tmdbId];
          const ytMatch = watchLink.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (ytMatch) {
            sendJson(res, { ok: true, embed_url: watchLink, type: 'youtube', video_id: ytMatch[1] });
            return;
          }
        }

        // 2) Known embed sources (cleanest first – vaplayer has Arabic subs, no ads, full control)
        const srcId = tmdbId || imdbId;
        const sources = [
          // vaplayer.ru (VidAPI) – Arabic subs, custom colors, postMessage (controls=true for seek/quality)
          srcId ? `https://vaplayer.ru/embed/${mediaType}/${srcId}?primaryColor=%23e50914&ds_lang=ar&autoplay=1&showTitle=false` : null,
          // vidsrc.wiki – TMDB ID, no ads, supports subtitles & controls=0
          tmdbId ? `https://vidsrc.wiki/embed/${mediaType}/${tmdbId}?sub=ar&controls=0&autoplay=1` : null,
          // vidsrc.fyi – TMDB/IMDB ID, no ads, supports subtitles
          tmdbId ? `https://vidsrc.fyi/embed/${mediaType}/${tmdbId}?sub=ar` : null,
          // vidsrc.sbs – TMDB ID, no ads, supports subtitles & controls=0
          tmdbId ? `https://vidsrc.sbs/embed/${mediaType}/${tmdbId}?sub=ar&controls=0&autoplay=1` : null,
          // ملاحظة: تم حذف المصادر المليانة إعلانات (vidsrc.xyz, embed.su, vidsrc.to, vidbinge, imdb.su)
        ].filter(Boolean);

        for (const src of sources) {
          try {
            const checkRes = await fetch(src, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(5000)
            });
            if (checkRes.status === 200) {
              const text = await checkRes.text();
              if (text.length > 200 && !text.includes('File not found') && !text.includes('Not Found') && !text.includes('broken')) {
                sendJson(res, { ok: true, embed_url: src, type: 'embed' });
                return;
              }
            }
          } catch {}
        }

        sendJson(res, { ok: false, embed_url: '' });
      } catch (e) {
        sendJson(res, { ok: false, embed_url: '' });
      }
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
      sendJson(res, { visits: totalVisits, active: activeSessions.size });
      return;
    }

    // Static files
    let filePath = p === '/' ? '/index.html' : p;
    const fullPath = path.join(__dirname, filePath);
    const ext = path.extname(filePath);
    fs.readFile(fullPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('File not found'); return; }
      if (ext === '.html') { totalVisits++; saveStats(); }
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Alex Cinema running on port ${PORT}`);
});
