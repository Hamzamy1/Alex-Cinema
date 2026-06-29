const fs = require('fs');
const https = require('https');

const TMDB_KEY = '';
const TMDB_READ_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5ODMwNjI0M2RhNGVjNjEwMmFmM2IwODZlZDY1ZTc3OCIsIm5iZiI6MTc4Mjc0MzQ4Ni45NzEsInN1YiI6IjZhNDI4MWJlN2Q0ZDJkNGI1OGY3OTI3NCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.j2W2F4ZWqv4mtun4S-A_ofuC0Fp-MBwtzCwcQj88Ax4';

const GENRE_MAP = {
  28: 'اكشن', 12: 'مغامرة', 16: 'انميشن', 35: 'كوميديا',
  80: 'جريمة', 99: 'وثائقي', 18: 'دراما', 10751: 'عائلي',
  14: 'خيال', 36: 'تاريخي', 27: 'رعب', 10402: 'موسيقى',
  9648: 'غموض', 10749: 'رومانسي', 878: 'خيال علمي',
  10770: 'تلفزيون', 53: 'اثارة', 10752: 'حرب', 37: 'غرب امريكي'
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { 'Accept': 'application/json' }
    };
    if (TMDB_READ_TOKEN) {
      opts.headers['Authorization'] = `Bearer ${TMDB_READ_TOKEN}`;
    }
    https.get(url, opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Parse failed')); }
      });
    }).on('error', reject);
  });
}

async function fetchMovie(tmdbId) {
  const key = TMDB_READ_TOKEN ? '' : `&api_key=${TMDB_KEY}`;
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?language=ar-SA${key}`;
  const enUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?language=en-US${key}`;

  const [ar, en] = await Promise.all([fetch(url), fetch(enUrl)]);

  if (ar.success === false) {
    console.error(`  ✗ Failed (ID ${tmdbId}): ${ar.status_message}`);
    return null;
  }

  return {
    id: tmdbId,
    title: en.title,
    title_ar: ar.title,
    year: parseInt(ar.release_date) || 0,
    genre: (ar.genres || []).map(g => GENRE_MAP[g.id] || g.name).filter(Boolean),
    rating: ar.vote_average || 0,
    poster: ar.poster_path
      ? `https://image.tmdb.org/t/p/w500${ar.poster_path}`
      : '',
    description: ar.overview || '',
    description_en: en.overview || ''
  };
}

async function main() {
  const source = JSON.parse(fs.readFileSync('movies-source.json', 'utf8'));
  console.log(`Found ${source.length} movies in source file\n`);

  const results = [];
  let success = 0;
  let fail = 0;

  for (let i = 0; i < source.length; i++) {
    const item = source[i];
    process.stdout.write(`[${i + 1}/${source.length}] Fetching ID ${item.tmdb_id}... `);

    const data = await fetchMovie(item.tmdb_id);
    if (data) {
      data.watch_link = item.watch_link;
      data.poster = data.poster || item.poster || '';
      results.push(data);
      success++;
      console.log(`✓ ${data.title_ar || data.title}`);
    } else {
      fail++;
      console.log('');
    }

    if (i < source.length - 1) await new Promise(r => setTimeout(r, 250));
  }

  fs.writeFileSync('movies.json', JSON.stringify(results, null, 2), 'utf8');

  const jsData = 'const MOVIES_DATA = ' + JSON.stringify(results, null, 2) + ';\n';
  fs.writeFileSync('data.js', jsData, 'utf8');

  console.log(`\nDone! ${success} succeeded, ${fail} failed`);
  console.log(`Saved to movies.json and data.js`);
}

main().catch(console.error);
