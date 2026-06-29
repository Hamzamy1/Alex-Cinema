const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = 3000;
const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5ODMwNjI0M2RhNGVjNjEwMmFmM2IwODZlZDY1ZTc3OCIsIm5iZiI6MTc4Mjc0MzQ4Ni45NzEsInN1YiI6IjZhNDI4MWJlN2Q0ZDJkNGI1OGY3OTI3NCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.j2W2F4ZWqv4mtun4S-A_ofuC0Fp-MBwtzCwcQj88Ax4';

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
  const source = JSON.parse(fs.readFileSync('movies-source.json', 'utf8'));
  source.forEach(m => { watchLinks[m.tmdb_id] = m.watch_link; });
} catch {}

function tmdbFetch(apiPath) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.themoviedb.org',
      path: '/3' + apiPath + '&language=ar-SA',
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
  const gid = type === 'tv' ? 'genre_ids' : 'genre_ids';
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const json = (data) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
  };

  // Unified discover: /api/discover?type=movie|tv&genre=&language=&page=&sort=
  if (p === '/api/discover') {
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
    json(data);
    return;
  }

  // Unified detail: /api/detail?type=movie|tv&id=
  if (p === '/api/detail') {
    const type = url.searchParams.get('type') || 'movie';
    const id = url.searchParams.get('id');
    if (!id) { json({ error: 'no id' }); return; }
    try {
      const data = await tmdbFetch(`/${type}/${id}`);
      data.genre_names = (data.genres || []).map(g => GENRE_MAP[g.id] || g.name).filter(Boolean);
      if (watchLinks[data.id]) data.watch_link = watchLinks[data.id];
      data.media_type = type;
      json(data);
    } catch { json({ error: 'not found' }); }
    return;
  }

  // Search: /api/search?type=movie|tv&q=&page=
  if (p === '/api/search') {
    const type = url.searchParams.get('type') || 'movie';
    const q = url.searchParams.get('q');
    const page = url.searchParams.get('page') || 1;
    if (!q) { json({ results: [] }); return; }
    const data = await tmdbFetch(`/search/${type}?query=${encodeURIComponent(q)}&page=${page}`);
    data.results = (data.results || []).map(r => attach(r, type));
    json(data);
    return;
  }

  // TV Season detail: /api/tv-season?id=&season=
  if (p === '/api/tv-season') {
    const id = url.searchParams.get('id');
    const season = url.searchParams.get('season');
    if (!id || !season) { json({ error: 'missing params' }); return; }
    try {
      const data = await tmdbFetch(`/tv/${id}/season/${season}`);
      json(data);
    } catch { json({ error: 'not found' }); }
    return;
  }

  // Player URL: /api/player-url?imdb_id=&type=movie|tv
  if (p === '/api/player-url') {
    const imdbId = url.searchParams.get('imdb_id');
    const mediaType = url.searchParams.get('type') || 'movie';
    if (!imdbId) { json({ ok: false, embed_url: '' }); return; }
    try {
      const [imdbRes, apiRes] = await Promise.all([
        fetch(`https://imdb.su/title/${imdbId}/`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000)
        }),
        fetch(`https://streamdata.vaplayer.ru/api.php?imdb=${imdbId}&type=${mediaType}`, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://nextgencloudfabric.com/' }, signal: AbortSignal.timeout(8000)
        })
      ]);
      let embedUrl = '';
      if (imdbRes.status === 200) {
        const html = await imdbRes.text();
        const match = html.match(/src="(https?:\/\/[^"]+embed\/(?:movie|tv)\/[^"]+)"/);
        if (match) embedUrl = match[1];
      }
      const apiData = await apiRes.json();
      const ok = apiData.status_code === '200' && apiData.data && apiData.data.file_name;
      json({ ok: !!ok, embed_url: embedUrl });
    } catch { json({ ok: false, embed_url: '' }); }
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
});

server.listen(PORT, () => {
  console.log(`🚀 Alex Cinema on http://localhost:${PORT}`);
  console.log(`📽️  ${Object.keys(watchLinks).length} titles in library`);
});
