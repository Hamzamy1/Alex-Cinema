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

let stats = {
  totalViews: 0,
  totalVisitors: 0,
  byDay: {},
  devices: {},
  browsers: {},
  countries: {},
  pages: {},
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
  return { browser, os, device };
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
          const g = { country: j.country || 'غير معروف', city: j.city || '' };
          stats.ipGeo[ip] = g;
          geoCache.set(ip, g);
          saveStats();
          resolve(g);
        } catch { resolve({ country: 'غير معروف', city: '' }); }
      });
    }).on('error', () => resolve({ country: 'غير معروف', city: '' }));
  });
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '0.0.0.0';
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

    // Analytics: track page view (sent by client JS)
    if (p === '/api/track') {
      const sid = url.searchParams.get('sid') || '';
      const page = (url.searchParams.get('page') || '/').slice(0, 300);
      const ref = (url.searchParams.get('ref') || '').slice(0, 300);
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
      stats.visits.unshift({ t: now, page, ref, ip, device: ua.device, browser: ua.browser, os: ua.os, country: '' });
      if (stats.visits.length > 1000) stats.visits.length = 1000;
      saveStats();

      getGeo(ip).then(g => {
        const country = (g.country || 'غير معروف') + (g.city ? ' - ' + g.city : '');
        stats.countries[country] = (stats.countries[country] || 0) + 1;
        const entry = stats.visits.find(v => v.ip === ip && v.t === now);
        if (entry) entry.country = country;
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
      if (key !== STATS_KEY) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!DOCTYPE html><html lang="ar" dir="rtl"><body style="background:#0f0f1a;color:#fff;font-family:Tahoma;text-align:center;padding-top:100px;"><h1>403 - ممنوع</h1><p>مفتاح غير صحيح</p></body></html>');
        return;
      }
      cleanupSessions();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderAdmin());
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

function renderAdmin() {
  const today = new Date().toISOString().slice(0, 10);
  const todayViews = stats.byDay[today] || 0;
  const active = activeSessions.size;

  let days = [];
  let maxDay = 1;
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const v = stats.byDay[d] || 0;
    days.push({ d, v });
    if (v > maxDay) maxDay = v;
  }
  const daysHtml = days.map(x => {
    const h = Math.max(4, Math.round((x.v / maxDay) * 100));
    return `<div class="bar-col"><div class="bar" style="height:${h}%"><span>${x.v}</span></div><div class="bar-label">${x.d.slice(5)}</div></div>`;
  }).join('');

  const listHtml = (obj, n = 6) => {
    const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
    if (!entries.length) return '<div class="muted">لا توجد بيانات بعد</div>';
    return entries.map(([k, v], i) => {
      const pct = Math.round((v / entries[0][1]) * 100);
      return `<div class="row"><span>${k}</span><div class="bar-line"><div style="width:${pct}%"></div></div><b>${v}</b></div>`;
    }).join('');
  };

  const visitsRows = stats.visits.slice(0, 25).map(v => {
    const time = new Date(v.t).toLocaleString('ar-EG');
    const pageName = v.page === '/' ? 'الرئيسية' : v.page.includes('movie.html') ? 'تفاصيل فيلم' : v.page;
    return `<tr><td>${time}</td><td>${pageName}</td><td>${v.device} (${v.os})</td><td>${v.browser}</td><td>${v.country || 'جارٍ التحديد...'}</td><td dir="ltr">${v.ip}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="15">
<title>Alex Cinema - الإحصائيات</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0f0f1a; color:#e5e5e5; font-family:Tahoma,Arial,sans-serif; padding:24px; }
  h1 { font-size:22px; margin-bottom:4px; }
  .sub { color:#888; font-size:13px; margin-bottom:20px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:14px; margin-bottom:24px; }
  .card { background:#1a1a2e; border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:18px; }
  .card .num { font-size:28px; font-weight:bold; color:#e50914; }
  .card .lbl { color:#999; font-size:13px; margin-top:4px; }
  .card .num.green { color:#4ade80; }
  .card .num.blue { color:#60a5fa; }
  .panel { background:#1a1a2e; border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:18px; margin-bottom:24px; }
  .panel h2 { font-size:16px; margin-bottom:14px; color:#fff; }
  .chart { display:flex; align-items:flex-end; gap:6px; height:160px; }
  .bar-col { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end; }
  .bar { width:70%; background:linear-gradient(180deg,#e50914,#7a0a0e); border-radius:6px 6px 0 0; min-height:4px; position:relative; }
  .bar span { position:absolute; top:-20px; font-size:11px; color:#bbb; width:100%; text-align:center; }
  .bar-label { font-size:10px; color:#666; margin-top:6px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
  @media (max-width:768px){ .grid2{ grid-template-columns:1fr; } }
  .row { display:flex; align-items:center; gap:10px; margin-bottom:10px; font-size:13px; }
  .row span { min-width:110px; }
  .row b { color:#fff; min-width:30px; text-align:left; }
  .bar-line { flex:1; background:#22223a; border-radius:5px; height:8px; overflow:hidden; }
  .bar-line div { height:100%; background:#e50914; border-radius:5px; }
  .muted { color:#666; font-size:13px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th,td { padding:8px 10px; text-align:right; border-bottom:1px solid rgba(255,255,255,0.05); }
  th { color:#999; font-weight:normal; }
  td { color:#ddd; }
  tr:hover td { background:rgba(229,9,20,0.05); }
</style>
</head>
<body>
  <h1>📊 إحصائيات Alex Cinema</h1>
  <div class="sub">آخر تحديث: ${new Date().toLocaleString('ar-EG')} — يتم التحديث تلقائيًا كل 15 ثانية</div>

  <div class="cards">
    <div class="card"><div class="num">${todayViews.toLocaleString('ar-EG')}</div><div class="lbl">زيارات اليوم</div></div>
    <div class="card"><div class="num">${stats.totalViews.toLocaleString('ar-EG')}</div><div class="lbl">إجمالي الزيارات</div></div>
    <div class="card"><div class="num blue">${stats.totalVisitors.toLocaleString('ar-EG')}</div><div class="lbl">زوار فريدين (أجهزة)</div></div>
    <div class="card"><div class="num green">${active.toLocaleString('ar-EG')}</div><div class="lbl">متصل الآن</div></div>
  </div>

  <div class="panel">
    <h2>الزيارات آخر 14 يوم</h2>
    <div class="chart">${daysHtml}</div>
  </div>

  <div class="grid2">
    <div class="panel"><h2>الأجهزة</h2>${listHtml(stats.devices)}</div>
    <div class="panel"><h2>المتصفحات</h2>${listHtml(stats.browsers)}</div>
    <div class="panel"><h2>الدول</h2>${listHtml(stats.countries)}</div>
    <div class="panel"><h2>أكثر الصفحات زيارة</h2>${listHtml(stats.pages || {})}</div>
  </div>

  <div class="panel">
    <h2>آخر الزيارات (${Math.min(stats.visits.length, 25)})</h2>
    <table>
      <tr><th>الوقت</th><th>الصفحة</th><th>الجهاز</th><th>المتصفح</th><th>الدولة</th><th>IP</th></tr>
      ${visitsRows}
    </table>
  </div>
</body>
</html>`;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Alex Cinema running on port ${PORT}`);
});
