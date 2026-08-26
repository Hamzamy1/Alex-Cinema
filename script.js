/* ===== Ad Blocker: منع الإعلانات والـ popups ===== */
(function() {
  // 1) منع كل window.open
  window.open = function() { return null; };

  // 2) منع الإعلانات عن طريق link clicks
  document.addEventListener('click', function(e) {
    const t = e.target.closest('a[href]');
    if (t && t.href && /doubleclick|googlesyndication|adsterra|propeller|monetag|exoclick|taboola|outbrain/i.test(t.href)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // 3) MutationObserver: يراقب العناصر الجديدة ويحذف الإعلانات
  var AD_RE = /ad[s]?[-_]?banner|popup[-_]?overlay|sponsor[-_]?wrap|click[-_]?under|popunder|interstitial[-_]?ad/i;
  var AD_SCRIPT_RE = /doubleclick|googlesyndication|propellerads|monetag|adsterra|exoclick|hilltopads|popads|popcash|juicyads|trafficjunky|taboola|outbrain|criteo/i;
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        var n = nodes[j];
        if (n.nodeType !== 1) continue;
        var tag = n.tagName;
        var id = n.id || '';
        var cls = n.className || '';
        // شيل divs إعلانية
        if (tag === 'DIV' && AD_RE.test(id + cls)) { n.remove(); continue; }
        // شيل iframes إعلانية
        if (tag === 'IFRAME' && n.src && AD_SCRIPT_RE.test(n.src)) { n.remove(); continue; }
        // شيل scripts إعلانية
        if (tag === 'SCRIPT' && n.src && AD_SCRIPT_RE.test(n.src)) { n.remove(); continue; }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 4) منع navigation أثناء المشاهدة
  window.addEventListener('beforeunload', function(e) {
    if (typeof isPlayerOpen !== 'undefined' && isPlayerOpen) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
/* ===== End Ad Blocker ===== */

let currentPage = 1;
let currentQuery = '';
let currentGenre = '';
let currentSection = 'home';
let totalPages = 1;
let currentImdbId = null;
let currentMediaType = 'movie';
let currentItemId = null;
let currentSeason = null;
let currentEpisode = null;

const SECTION_CONFIG = {
  home:   { title: 'الرئيسية',     api: '/api/discover?type=movie&sort=popularity.desc', heroTitle: 'أهلاً بك في Alex Cinema', heroSub: 'مش هتحتار و تقول أشوف إيه... إحنا جبناهولك لحد عندك.' },
  movies: { title: 'الأفلام',       api: '/api/discover?type=movie&sort=popularity.desc', heroTitle: 'الأفلام', heroSub: 'تصفح أحدث الأفلام من جميع أنحاء العالم.' },
  tv:     { title: 'المسلسلات',     api: '/api/discover?type=tv&sort=popularity.desc',    heroTitle: 'المسلسلات', heroSub: 'أشهر المسلسلات العالمية والعربية.' },
  arabic: { title: 'عربي',          api: '/api/discover?type=movie&language=ar&sort=popularity.desc', heroTitle: 'عربي', heroSub: 'أحدث الأفلام والمسلسلات العربية.' },
  foreign:{ title: 'أجنبي',         api: '/api/discover?type=movie&language=en&sort=popularity.desc', heroTitle: 'أجنبي', heroSub: 'أحدث الأفلام والمسلسلات الأجنبية.' }
};

const GENRES_DATA = [
  { id: 28,  name: 'أكشن',       icon: 'fas fa-burst',        color: '#e50914', bg: 'linear-gradient(135deg, #2a0a0e, #1a0508)' },
  { id: 18,  name: 'دراما',      icon: 'fas fa-masks-theater', color: '#8b5cf6', bg: 'linear-gradient(135deg, #1a0f2e, #0f0a1e)' },
  { id: 878, name: 'خيال علمي',   icon: 'fas fa-rocket',       color: '#06b6d4', bg: 'linear-gradient(135deg, #0a1e2a, #061520)' },
  { id: 35,  name: 'كوميديا',     icon: 'fas fa-face-laugh',    color: '#f59e0b', bg: 'linear-gradient(135deg, #2a1f0a, #1e1608)' },
  { id: 12,  name: 'مغامرة',     icon: 'fas fa-compass',       color: '#10b981', bg: 'linear-gradient(135deg, #0a2a1e, #081e15)' },
  { id: 27,  name: 'رعب',        icon: 'fas fa-ghost',         color: '#6b21a8', bg: 'linear-gradient(135deg, #1a0a2e, #120820)' },
  { id: 10749,name: 'رومانسي',   icon: 'fas fa-heart',         color: '#ec4899', bg: 'linear-gradient(135deg, #2a0a1e, #1e0815)' },
  { id: 80,  name: 'جريمة',      icon: 'fas fa-mask',          color: '#ef4444', bg: 'linear-gradient(135deg, #2a0a0a, #1e0808)' },
  { id: 16,  name: 'انمي',       icon: 'fas fa-star',          color: '#f97316', bg: 'linear-gradient(135deg, #2a1a0a, #1e1208)' },
  { id: 53,  name: 'اثارة',      icon: 'fas fa-bolt',          color: '#eab308', bg: 'linear-gradient(135deg, #2a220a, #1e1908)' },
  { id: 9648,name: 'غموض',       icon: 'fas fa-question-circle',color: '#6366f1', bg: 'linear-gradient(135deg, #14142a, #0e0e20)' },
  { id: 99,  name: 'وثائقي',     icon: 'fas fa-camera',        color: '#78716c', bg: 'linear-gradient(135deg, #1a1a1a, #111111)' }
];

async function api(path) {
  const res = await fetch(path);
  return res.json();
}

function renderGenres() {
  const grid = document.getElementById('genresGrid');
  if (!grid) return;
  grid.innerHTML = GENRES_DATA.map(g =>
    `<div class="genre-card" style="background:${g.bg}" onclick="selectGenre(${g.id}, '${g.name}')">
      <div class="genre-card-shine"></div>
      <div class="genre-card-icon" style="color:${g.color}"><i class="${g.icon}"></i></div>
      <div class="genre-card-name">${g.name}</div>
      <div class="genre-card-count">تصفح الأفلام</div>
    </div>`
  ).join('');
}

function selectGenre(genreId, genreName) {
  currentGenre = String(genreId);
  currentSection = 'genres';
  currentQuery = '';
  currentPage = 1;
  currentMediaType = 'movie';

  const genresSection = document.getElementById('genresSection');
  const filters = document.getElementById('filtersSection');
  const moviesSection = document.querySelector('.movies-section');
  if (genresSection) genresSection.style.display = 'none';
  if (filters) filters.style.display = 'none';
  if (moviesSection) moviesSection.style.display = 'block';

  document.getElementById('sectionTitle').textContent = genreName;

  document.querySelectorAll('#mainNav a').forEach(x => x.classList.remove('active'));
  const genresLink = document.querySelector('#mainNav a[data-section="genres"]');
  if (genresLink) genresLink.classList.add('active');

  loadMovies();
}

async function loadMovies() {
  const grid = document.getElementById('moviesGrid');
  const loading = document.getElementById('loading');
  const pagination = document.getElementById('pagination');
  const sectionTitle = document.getElementById('sectionTitle');
  const heroTitle = document.getElementById('heroTitle');
  const heroSub = document.getElementById('heroSub');

  if (loading) loading.style.display = 'block';

  const cfg = SECTION_CONFIG[currentSection] || SECTION_CONFIG.home;
  if (sectionTitle) { sectionTitle.textContent = cfg.title; replayAnim(sectionTitle); }
  if (heroTitle) { heroTitle.textContent = cfg.heroTitle; replayAnim(heroTitle); }
  if (heroSub) { heroSub.textContent = cfg.heroSub; replayAnim(heroSub); }

  if (grid) {
    grid.innerHTML = '<div class="skeleton-grid">' + Array(10).fill(0).map(() =>
      '<div class="skeleton-card"><div class="skeleton-poster"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>'
    ).join('') + '</div>';
  }

  try {
    let data;
    let url;
    if (currentQuery) {
      url = `/api/search?type=${currentMediaType}&q=${encodeURIComponent(currentQuery)}&page=${currentPage}`;
    } else if (currentSection === 'genres') {
      url = `/api/discover?type=${currentMediaType}&genre=${currentGenre}&page=${currentPage}`;
    } else if (currentSection === 'arabic') {
      url = `/api/discover?type=${currentMediaType}&language=ar&page=${currentPage}`;
    } else if (currentSection === 'foreign') {
      url = `/api/discover?type=${currentMediaType}&language=en&page=${currentPage}`;
    } else {
      url = cfg.api + `&page=${currentPage}`;
      if (currentGenre) url += `&genre=${currentGenre}`;
    }
    data = await api(url);
    totalPages = Math.min(data.total_pages || 1, 500);
    renderMovies(data.results || []);
    updatePagination();
  } catch (err) {
    console.error(err);
    if (grid) grid.innerHTML = '<div class="no-results"><i class="fas fa-exclamation-triangle"></i><h3>حدث خطأ</h3><p>تأكد من تشغيل السيرفر</p></div>';
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function renderMovies(items) {
  const grid = document.getElementById('moviesGrid');
  const totalCount = document.getElementById('totalCount');
  if (!grid) return;
  if (totalCount) animateCount(totalCount, items.length);

  if (items.length === 0) {
    grid.innerHTML = '<div class="no-results"><i class="fas fa-search"></i><h3>لا توجد نتائج</h3><p>حاول بكلمات بحث مختلفة</p></div>';
    return;
  }

  grid.innerHTML = items.map(m => {
    const poster = m.poster_path
      ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
      : 'https://via.placeholder.com/300x450/1a1a2e/666?text=No+Poster';
    const title = m.title || m.name || 'Unknown';
    const year = (m.release_date || m.first_air_date || '').split('-')[0];
    const rating = m.vote_average ? m.vote_average.toFixed(1) : '';
    const type = m.media_type || (m.first_air_date ? 'tv' : 'movie');
    const badge = m.watch_link ? '<span class="badge-watch"><i class="fas fa-play"></i> متاح</span>' : '';
    const typeLabel = type === 'tv' ? '<span class="badge-type"><i class="fas fa-tv"></i> مسلسل</span>' : '';

    return `
      <div class="movie-card" onclick="openDetail(${m.id}, '${type}')">
        <img class="poster" src="${poster}" alt="${title}" loading="lazy">
        <div class="card-overlay">
          <div class="card-play"><i class="fas fa-play"></i></div>
        </div>
        <div class="card-body">
          <div class="card-title">${title}</div>
          <div class="card-meta">
            <span class="card-year">${year}</span>
            ${rating ? `<span class="card-rating"><i class="fas fa-star"></i> ${rating}</span>` : ''}
          </div>
          <div class="card-badges">${typeLabel}${badge}</div>
        </div>
        <span class="card-glare"></span>
      </div>
    `;
  }).join('');
}

function openDetail(id, type) {
  const div = document.createElement('div');
  div.className = 'page-transition';
  document.body.appendChild(div);
  setTimeout(() => {
    window.location.href = `movie.html?type=${type}&id=${id}`;
  }, 200);
}

function updatePagination() {
  const pagination = document.getElementById('pagination');
  const pageInfo = document.getElementById('pageInfo');
  if (!pagination) return;
  if (totalPages <= 1) { pagination.style.display = 'none'; return; }
  pagination.style.display = 'flex';
  if (pageInfo) pageInfo.textContent = `الصفحة ${currentPage} من ${totalPages}`;
  document.getElementById('prevPage').disabled = currentPage <= 1;
  document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

// ---- Detail Page ----
async function loadMovieDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const type = params.get('type') || 'movie';
  const loading = document.getElementById('loading');
  const content = document.getElementById('detailContent');
  if (!id || !loading || !content) return;

  try {
    const item = await api(`/api/detail?type=${type}&id=${id}`);
    if (item.error) { loading.innerHTML = 'العنصر غير موجود'; return; }

    loading.style.display = 'none';
    content.style.display = 'grid';
    currentItemId = Number(id);
    currentMediaType = type;
    currentSeason = null;
    currentEpisode = null;

    const poster = item.poster_path
      ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
      : 'https://via.placeholder.com/350x500/1a1a2e/666?text=No+Poster';
    const title = item.title || item.name || 'Unknown';
    const year = (item.release_date || item.first_air_date || '').split('-')[0];

    document.getElementById('detailPoster').src = poster;
    document.getElementById('detailPoster').alt = title;
    document.title = `${title} - Alex Cinema`;
    document.getElementById('detailTitle').textContent = title;
    document.getElementById('detailYear').textContent = year;
    document.getElementById('detailRating').innerHTML = `<i class="fas fa-star"></i> ${item.vote_average ? item.vote_average.toFixed(1) : ''}`;
    document.getElementById('detailDescription').textContent = item.overview || 'لا يوجد وصف';

    const genresEl = document.getElementById('detailGenres');
    const displayGenres = item.genres ? item.genres.map(g => g.name) : item.genre_names || [];
    genresEl.innerHTML = displayGenres.map(g => `<span>${g}</span>`).join('');

    const typeLabel = type === 'tv' ? 'مسلسل' : 'فيلم';
    const badge = document.getElementById('detailTypeLabel');
    badge.textContent = typeLabel;
    badge.className = `type-badge ${type}`;

    document.getElementById('watchBtnText').textContent = type === 'tv' ? 'مشاهدة المسلسل' : 'مشاهدة الفيلم';

    currentImdbId = item.imdb_id || null;
    const watchBtn = document.getElementById('watchBtn');
    const noLinkMsg = document.getElementById('noLinkMsg');
    if (currentImdbId) {
      watchBtn.style.display = 'inline-flex';
      if (noLinkMsg) noLinkMsg.style.display = 'none';
    } else {
      watchBtn.style.display = 'none';
      if (noLinkMsg) noLinkMsg.style.display = 'block';
    }

    // TV seasons
    if (type === 'tv' && item.seasons) {
      const seasons = item.seasons.filter(s => s.season_number > 0);
      const seasonsSection = document.getElementById('seasonsSection');
      const seasonSelect = document.getElementById('seasonSelect');
      if (seasonsSection && seasonSelect && seasons.length) {
        seasonsSection.style.display = 'block';
        seasonSelect.innerHTML = seasons.map(s => `<option value="${s.season_number}">الموسم ${s.season_number} (${s.episode_count || '?'} حلقة)</option>`).join('');
        loadEpisodes();
      }
    }
  } catch (err) {
    console.error(err);
    loading.innerHTML = 'حدث خطأ في تحميل البيانات';
  }
}

async function loadEpisodes() {
  const seasonNum = document.getElementById('seasonSelect')?.value;
  if (!seasonNum || !currentItemId) return;
  currentSeason = Number(seasonNum);
  const grid = document.getElementById('episodesGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> جارٍ التحميل...</div>';
  try {
    const data = await api(`/api/tv-season?id=${currentItemId}&season=${seasonNum}`);
    const episodes = data.episodes || [];
    if (!episodes.length) {
      grid.innerHTML = '<div class="no-episodes">لا توجد حلقات لهذا الموسم</div>';
      return;
    }
    grid.innerHTML = episodes.map(ep => `
      <div class="episode-card" onclick="watchEpisode(${ep.episode_number})">
        <div class="episode-number">${ep.episode_number}</div>
        <div class="episode-info">
          <div class="episode-name">${ep.name || `حلقة ${ep.episode_number}`}</div>
          <div class="episode-overview">${ep.overview || 'لا يوجد وصف'}</div>
        </div>
      </div>
    `).join('');
  } catch {
    grid.innerHTML = '<div class="no-episodes">حدث خطأ في تحميل الحلقات</div>';
  }
}

function watchEpisode(epNum) {
  currentEpisode = epNum;
  document.getElementById('playerTitle').textContent = `${document.getElementById('detailTitle').textContent} - الحلقة ${epNum}`;
  watchMovie(currentImdbId, currentItemId);
}

function goBack() { window.history.back(); }

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  const snd = document.getElementById('errorSound');
  if (snd) { snd.pause(); snd.currentTime = 0; }
}

/* ===== Professional Player ===== */
let playerTimer = null;
let pendingVoiceEnd = null;
let playerCount = 10;
let playerEmbedUrl = '';
let playerType = '';
let playerVideoId = '';
let controlsTimeout = null;
let isPlayerOpen = false;
let hasVideoLoaded = false;
let ytIframe = null;
let playerSources = [];
let currentSourceIdx = 0;
let tipTimer = null;

async function watchMovie(imdbId, tmdbId) {
  if (!imdbId || isPlayerOpen) return;
  isPlayerOpen = true;
  const poster = document.getElementById('detailPoster').src;
  const title = document.getElementById('playerTitle').textContent || document.getElementById('detailTitle').textContent;
  const overlay = document.getElementById('playerOverlay');
  document.getElementById('playerMovieTitle').textContent = title;
  document.getElementById('playerPoster').src = poster;
  overlay.style.display = 'flex';
  playTipVoice();

  const apiUrl = tmdbId
    ? `/api/player-url?imdb_id=${imdbId}&type=${currentMediaType}&tmdb_id=${tmdbId}${currentMediaType === 'tv' && currentSeason ? `&season=${currentSeason}&episode=${currentEpisode || 1}` : ''}`
    : `/api/player-url?imdb_id=${imdbId}&type=${currentMediaType}`;
  const res = await fetch(apiUrl);
  const data = await res.json();

  if (data.ok && data.embed_url) {
    playerEmbedUrl = data.embed_url;
    playerType = data.type || 'embed';
    playerVideoId = data.video_id || '';
    playerSources = Array.isArray(data.sources) && data.sources.length
      ? data.sources
      : (playerType === 'embed' ? [{ name: 'سيرفر 1', url: data.embed_url }] : []);
    currentSourceIdx = 0;
    // Show custom controls only for YouTube (can control playback),
    // hide for embed sources (iframe handles its own controls)
    const ctrls = document.getElementById('playerControls');
    if (ctrls) {
      if (playerType === 'youtube' && playerVideoId) {
        ctrls.style.display = 'flex';
        ctrls.style.opacity = '0';
      } else {
        ctrls.style.display = 'none';
      }
    }
    startVoiceSequence();
  } else {
    overlay.style.display = 'none';
    isPlayerOpen = false;
    stopTipVoice();
    document.getElementById('modalOverlay').style.display = 'flex';
    const snd = document.getElementById('errorSound');
    if (snd) { snd.currentTime = 0; snd.play().catch(() => {}); }
  }
}

const KARAOKE_LINES = [
  'لو الفيلم جديد، بنجيبهولك تصوير سينما من تاني يوم في السينما.',
  'وبعد حوالي 10 أيام بنجيب نسخة HD أصلي حتى لو لسه بيتعرض في السينما.',
  'إحنا الأسرع.. مفيش حد بيسبقنا ولا بينزّل الفيلم قبلنا.',
  'ولو لقيت تصوير سينما على سيرفر معيّن بعد الـ 10 أيام دول، بدّل لسيرفر تاني —',
  'يمكن الـ HD نزل هناك ولسه مسمعتش عنه على الأولاني، أو العكس.',
  'المهم تبدّل بين السيرفرات لحد ما تلاقي الـ HD.',
  'ولو الترجمة ناقصة، جرّب زرار الترجمة الخارجية.. وبس كده.. مشاهدة سعيدة!'
];
let karaokeThresholds = [];
let karaokeDuration = 0;
let karaokeRaf = null;
let tipVoiceShown = false;

function buildKaraoke(duration) {
  const box = document.getElementById('karaokeBox');
  const lines = document.getElementById('karaokeLines');
  if (!box || !lines || !duration || !isFinite(duration) || duration <= 0) return;
  karaokeDuration = duration;
  const weights = KARAOKE_LINES.map(l => l.length + 6);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  karaokeThresholds = weights.map(w => { const s = (acc / total) * duration; acc += w; return s; });
  lines.innerHTML = KARAOKE_LINES.map(() =>
    '<div class="k-line k-future"><span class="k-text"></span><span class="k-caret"></span></div>'
  ).join('');
  box.classList.add('on');
}

function tickKaraoke() {
  const snd = document.getElementById('tipVoice');
  const els = document.querySelectorAll('#karaokeLines .k-line');
  if (!snd || !els.length || !karaokeThresholds.length) { karaokeRaf = null; return; }
  const t = snd.currentTime || 0;
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const txt = KARAOKE_LINES[i];
    const textEl = el.querySelector('.k-text');
    const start = karaokeThresholds[i];
    const end = (i + 1 < karaokeThresholds.length) ? karaokeThresholds[i + 1] : karaokeDuration;
    if (t >= end) {
      if (textEl.textContent.length !== txt.length) {
        el.classList.remove('k-now', 'k-future');
        el.classList.add('k-done');
        textEl.textContent = txt;
      }
    } else if (t >= start) {
      const p = (end > start) ? (t - start) / (end - start) : 1;
      const n = Math.min(txt.length, Math.floor(p * txt.length));
      if (!el.classList.contains('k-now')) {
        el.classList.remove('k-future', 'k-done');
        el.classList.add('k-now');
      }
      if (textEl.textContent.length !== n) textEl.textContent = txt.slice(0, n);
    } else if (textEl.textContent) {
      textEl.textContent = '';
      el.classList.add('k-future');
    }
  }
  if (!snd.paused && !snd.ended && typeof isPlayerOpen !== 'undefined' && isPlayerOpen) {
    karaokeRaf = requestAnimationFrame(tickKaraoke);
  } else {
    karaokeRaf = null;
  }
}

function clearKaraoke() {
  if (karaokeRaf) { cancelAnimationFrame(karaokeRaf); karaokeRaf = null; }
  karaokeThresholds = [];
  const box = document.getElementById('karaokeBox');
  if (box) box.classList.remove('on');
  const lines = document.getElementById('karaokeLines');
  if (lines) lines.innerHTML = '';
}

function playTipVoice() {
  const snd = document.getElementById('tipVoice');
  if (!snd || tipVoiceShown) return;
  snd.volume = 1;
  let dur = (snd.duration && isFinite(snd.duration) && snd.duration > 0) ? snd.duration : 0;
  buildKaraoke(dur || 34);
  if (!dur) {
    snd.addEventListener('loadedmetadata', function () {
      if (snd.duration && isFinite(snd.duration) && snd.duration > 0 && Math.abs(snd.duration - karaokeDuration) > 1.5) {
        buildKaraoke(snd.duration);
        if (!snd.paused && karaokeRaf === null) karaokeRaf = requestAnimationFrame(tickKaraoke);
      }
    }, { once: true });
  }
  snd.play().then(() => {
    tipVoiceShown = true;
    if (karaokeRaf === null) karaokeRaf = requestAnimationFrame(tickKaraoke);
  }).catch(() => {});
}

function stopTipVoice() {
  const snd = document.getElementById('tipVoice');
  if (snd && !snd.paused) { snd.pause(); snd.currentTime = 0; }
  pendingVoiceEnd = null;
  clearKaraoke();
}

function startVoiceSequence() {
  const intro = document.getElementById('playerIntro');
  const wrap = document.getElementById('playerVideoWrap');
  intro.style.display = 'flex';
  wrap.style.display = 'none';
  clearInterval(playerTimer);
  const snd = document.getElementById('tipVoice');
  if (snd && !snd.paused && !snd.ended) {
    pendingVoiceEnd = function () { pendingVoiceEnd = null; loadVideo(); };
    snd.addEventListener('ended', function () {
      if (pendingVoiceEnd) { var f = pendingVoiceEnd; pendingVoiceEnd = null; f(); }
    }, { once: true });
  } else {
    loadVideo();
  }
}

function skipIntro() {
  if (!isPlayerOpen || hasVideoLoaded) return;
  if (!playerEmbedUrl) { stopTipVoice(); return; }
  clearInterval(playerTimer);
  loadVideo();
}

function loadVideo() {
  if (!playerEmbedUrl || hasVideoLoaded) return;
  hasVideoLoaded = true;
  stopTipVoice();
  const intro = document.getElementById('playerIntro');
  const wrap = document.getElementById('playerVideoWrap');
  const container = document.getElementById('playerVideoContainer');
  const loading = document.getElementById('playerLoading');
  const controls = document.getElementById('playerControls');
  if (!intro || !wrap || !container) return;

  intro.style.display = 'none';
  wrap.style.display = 'block';
  container.innerHTML = '';
  if (loading) loading.classList.add('active');

  // Show/hide quality button based on source type
  const qBtn = document.getElementById('ctrlQualityBtn');
  if (qBtn) qBtn.style.display = (playerType === 'youtube' && playerVideoId) ? 'inline-flex' : 'none';

  const extBtn = document.getElementById('ctrlExtSubBtn');
  if (extBtn) {
    extBtn.style.display = playerType === 'embed' ? 'inline-flex' : 'none';
    extBtn.classList.remove('ext-active');
  }

  if (playerType === 'embed') {
    renderServerBar();
    if (!tipVoiceShown) showQualityTip();
  } else {
    const bar = document.getElementById('serverBar');
    if (bar) bar.style.display = 'none';
  }

  if (playerType === 'youtube' && playerVideoId) {
    loadYoutubePlayer(playerVideoId, container, loading, controls);
  } else {
    loadEmbedPlayer(playerEmbedUrl, container, loading, controls);
  }
}

function loadYoutubePlayer(videoId, container, loading, controls) {
  ytIframe = document.createElement('iframe');
  // Enable Arabic captions via cc_load_policy=1 & hl=ar & cc_lang_pref=ar
  ytIframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1&cc_load_policy=1&hl=ar&cc_lang_pref=ar`;
  ytIframe.allow = 'autoplay;fullscreen;picture-in-picture;encrypted-media';
  ytIframe.allowFullscreen = true;
  // Sandbox يمنع أي redirect أو بوب أب إعلاني (من غير allow-top-navigation / allow-popups)
  ytIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms');
  container.appendChild(ytIframe);

  // Show subtitle button for YouTube
  const subBtn = document.getElementById('ctrlSubBtn');
  if (subBtn) subBtn.style.display = 'inline-flex';

  let loaded = false;
  const show = () => { if (!loaded) { loaded = true; if (loading) loading.classList.remove('active'); if (controls) controls.style.opacity = '1'; } };
  ytIframe.onload = show;
  setTimeout(show, 4000);
}

function toggleYtSubtitles() {
  if (!ytIframe || !playerVideoId) return;
  const currentSrc = ytIframe.src;
  const hasCC = currentSrc.includes('&cc_load_policy=1');
  const icon = document.getElementById('ctrlSubBtn')?.querySelector('i');
  if (hasCC) {
    ytIframe.src = currentSrc.replace('cc_load_policy=1', 'cc_load_policy=0');
    if (icon) icon.className = 'fas fa-closed-captioning';
  } else {
    ytIframe.src = currentSrc.replace('cc_load_policy=0', 'cc_load_policy=1');
    if (icon) icon.className = 'fas fa-closed-captioning text-red';
  }
}

function setYtQuality(quality) {
  if (!ytIframe || !playerVideoId) return;
  let src = `https://www.youtube.com/embed/${playerVideoId}?enablejsapi=1&autoplay=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`;
  if (quality !== 'auto') src += `&vq=${encodeURIComponent(quality)}`;
  ytIframe.src = src;
}

/* ===== External Subtitles (SubDL - manual toggle to save quota) ===== */
let extSubActive = false;
let extSubBusy = false;

function updateExtSubBtn(active) {
  const btn = document.getElementById('ctrlExtSubBtn');
  if (!btn) return;
  btn.classList.toggle('ext-active', active);
  const icon = btn.querySelector('i');
  if (icon && !extSubBusy) icon.className = 'fas fa-language';
}

async function toggleExternalSub() {
  const btn = document.getElementById('ctrlExtSubBtn');
  if (!btn || extSubBusy || playerType !== 'embed' || !isPlayerOpen) return;
  extSubBusy = true;
  const icon = btn.querySelector('i');
  try {
    if (extSubActive) {
      extSubActive = false;
      updateExtSubBtn(false);
      const ok = await reloadPlayerFrame(false);
      showToast(ok ? 'رجعت للترجمة الأساسية' : 'تعذر الرجوع للترجمة الأساسية');
    } else {
      if (icon) icon.className = 'fas fa-spinner fa-spin';
      const q = new URLSearchParams({ type: currentMediaType, id: currentItemId });
      if (currentMediaType === 'tv' && currentSeason) {
        q.set('season', currentSeason);
        q.set('episode', currentEpisode || 1);
      }
      const res = await fetch('/api/subtitle-lookup?' + q.toString());
      const d = await res.json();
      if (d.ok && d.url) {
        const ok = await reloadPlayerFrame(true, d.url);
        if (ok) {
          extSubActive = true;
          updateExtSubBtn(true);
          showToast('تم تشغيل الترجمة الخارجية');
        } else {
          showToast('تعذر تشغيل الترجمة الخارجية');
        }
      } else {
        showToast('مفيش ترجمة خارجية للعنوان ده');
      }
    }
  } catch {
    showToast('حصل خطأ، جرب تاني');
  } finally {
    extSubBusy = false;
    updateExtSubBtn(extSubActive);
  }
}

async function reloadPlayerFrame(withSub, subUrl) {
  const api = currentItemId
    ? `/api/player-url?imdb_id=${currentImdbId}&type=${currentMediaType}&tmdb_id=${currentItemId}${currentMediaType === 'tv' && currentSeason ? `&season=${currentSeason}&episode=${currentEpisode || 1}` : ''}`
    : `/api/player-url?imdb_id=${currentImdbId}&type=${currentMediaType}`;
  const url = withSub && subUrl ? api + '&sub_url=' + encodeURIComponent(subUrl) : api;
  const d = await fetch(url).then(r => r.json());
  if (!(d.ok && d.embed_url)) return false;
  const iframe = document.querySelector('#playerVideoContainer iframe');
  if (!iframe) return false;
  iframe.src = d.embed_url;
  if (Array.isArray(d.sources) && d.sources.length) {
    playerSources = d.sources;
    currentSourceIdx = 0;
    renderServerBar();
  }
  return true;
}

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function loadEmbedPlayer(embedUrl, container, loading, controls) {
  const iframe = document.createElement('iframe');
  iframe.src = embedUrl;
  iframe.allow = 'autoplay;fullscreen;picture-in-picture;encrypted-media';
  iframe.allowFullscreen = true;
  iframe.setAttribute('loading', 'lazy');
  container.appendChild(iframe);

  // Anti click-under: نحط overlay فوق المشغل يلقط أول click كان هروح للإعلان
  const shield = document.createElement('div');
  shield.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:999999;cursor:pointer;background:transparent;';
  shield.addEventListener('click', function handler(e) {
    e.stopPropagation();
    e.preventDefault();
    shield.remove();
    // بعد ما شلنا الـ overlay، نambsss click على الـ iframe مباشرة
    try { iframe.contentWindow.postMessage({ action: 'click' }, '*'); } catch {}
  }, true);
  container.style.position = container.style.position || 'relative';
  container.appendChild(shield);

  let loaded = false;
  const show = () => { if (!loaded) { loaded = true; if (loading) loading.classList.remove('active'); if (controls) controls.style.opacity = '1'; } };
  iframe.onload = show;
  setTimeout(show, 8000);
}

/* ===== Server switcher & quality tip ===== */
function renderServerBar() {
  const bar = document.getElementById('serverBar');
  if (!bar) return;
  if (playerType !== 'embed' || !playerSources || !playerSources.length) {
    bar.style.display = 'none';
    return;
  }
  bar.innerHTML =
    '<span class="server-label"><i class="fas fa-server"></i> السيرفرات:</span>' +
    playerSources.map((s, i) =>
      `<button class="server-btn${i === currentSourceIdx ? ' active' : ''}" onclick="switchServer(${i})">${i + 1}</button>`
    ).join('');
  bar.style.display = 'flex';
}

function switchServer(i) {
  if (!hasVideoLoaded || i === currentSourceIdx || !playerSources[i]) return;
  currentSourceIdx = i;
  const container = document.getElementById('playerVideoContainer');
  const loading = document.getElementById('playerLoading');
  const oldFrame = container ? container.querySelector('iframe') : null;
  if (oldFrame && playerSources[i].url) {
    if (loading) loading.classList.add('active');
    // بنبني إطار جديد نضيف بدل ما نغيّر رابط القديم — بعض المشغلات
    // (زي vidsrc/cinesrc) بتبوظ لو الإطار فيه حالة من مشغل تاني قبله
    const fresh = document.createElement('iframe');
    fresh.src = playerSources[i].url;
    fresh.allow = 'autoplay;fullscreen;picture-in-picture;encrypted-media';
    fresh.allowFullscreen = true;
    fresh.setAttribute('loading', 'lazy');
    oldFrame.replaceWith(fresh);
    // Anti click-under shield للسيرفر الجديد
    const oldShield = container.querySelector('div[style*="z-index:999999"]');
    if (oldShield) oldShield.remove();
    const newShield = document.createElement('div');
    newShield.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:999999;cursor:pointer;background:transparent;';
    newShield.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      newShield.remove();
    }, true);
    container.appendChild(newShield);
    let done = false;
    fresh.onload = () => { if (!done) { done = true; if (loading) loading.classList.remove('active'); } };
    setTimeout(() => { if (!done) { done = true; if (loading) loading.classList.remove('active'); } }, 8000);
  }
  document.querySelectorAll('#serverBar .server-btn').forEach((b, bi) => b.classList.toggle('active', bi === i));
  showToast('اتبدل للسيرفر ' + (i + 1) + (extSubActive && !playerSources[i].url.includes('sub') ? ' (السيرفر ده مش بيدعم الترجمة الخارجية)' : ''));
}

function showQualityTip() {
  const tip = document.getElementById('qualityTip');
  if (!tip) return;
  tip.classList.add('show');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(hideQualityTip, 16000);
}

function hideQualityTip() {
  clearTimeout(tipTimer);
  const tip = document.getElementById('qualityTip');
  if (tip) tip.classList.remove('show');
}

/* ===== Player Controls ===== */
function togglePlay() {
  const icon = document.getElementById('ctrlPlayIcon');
  icon.classList.toggle('fa-play');
  icon.classList.toggle('fa-pause');
}

function toggleMute() {
  const icon = document.getElementById('ctrlVolumeIcon');
  const range = document.getElementById('ctrlVolumeRange');
  if (range.value > 0) {
    range.dataset.prevVolume = range.value;
    range.value = 0;
    icon.className = 'fas fa-volume-mute';
  } else {
    range.value = range.dataset.prevVolume || 0.5;
    icon.className = range.value > 0.5 ? 'fas fa-volume-up' : range.value > 0 ? 'fas fa-volume-down' : 'fas fa-volume-mute';
  }
}

function toggleQualityMenu() {
  const menu = document.getElementById('ctrlQualityMenu');
  if (menu) menu.classList.toggle('open');
}

function initPlayerUI() {
  const volRange = document.getElementById('ctrlVolumeRange');
  if (volRange) {
    volRange.addEventListener('input', function() {
      const icon = document.getElementById('ctrlVolumeIcon');
      icon.className = this.value > 0.5 ? 'fas fa-volume-up' : this.value > 0 ? 'fas fa-volume-down' : 'fas fa-volume-mute';
    });
  }

  const overlay = document.getElementById('playerOverlay');
  if (overlay) {
    overlay.addEventListener('mousemove', () => {
      overlay.classList.add('show-controls');
      clearTimeout(controlsTimeout);
      controlsTimeout = setTimeout(() => {
        overlay.classList.remove('show-controls');
      }, 3000);
    });
    overlay.addEventListener('mouseleave', () => {
      clearTimeout(controlsTimeout);
      overlay.classList.remove('show-controls');
    });
  }

  // Close quality menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('ctrlQualityMenu');
    const btn = document.getElementById('ctrlQualityBtn');
    if (menu && menu.classList.contains('open') && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
    }
  });
}

function updateProgressUI(currentTime, duration) {
  const timeEl = document.getElementById('ctrlTime');
  const played = document.getElementById('ctrlPlayed');
  const thumb = document.getElementById('ctrlThumb');
  const input = document.getElementById('ctrlProgressInput');

  if (duration) {
    timeEl.dataset.duration = duration;
    timeEl.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    const pct = (currentTime / duration) * 100;
    played.style.width = pct + '%';
    thumb.style.left = pct + '%';
    input.value = pct;
  }
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function togglePip() {
  const container = document.getElementById('playerVideoContainer');
  const video = container.querySelector('video');
  if (video && document.pictureInPictureEnabled) {
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    } else {
      video.requestPictureInPicture();
    }
  }
}

function toggleFullscreen() {
  const container = document.getElementById('playerOverlay');
  if (document.fullscreenElement) {
    document.exitFullscreen();
    const icon = document.getElementById('ctrlFullscreenBtn').querySelector('i');
    if (icon) icon.className = 'fas fa-expand';
  } else {
    container.requestFullscreen?.();
    const icon = document.getElementById('ctrlFullscreenBtn').querySelector('i');
    if (icon) icon.className = 'fas fa-compress';
  }
}

function closePlayer() {
  clearInterval(playerTimer);
  stopTipVoice();
  tipVoiceShown = false;
  isPlayerOpen = false;
  hasVideoLoaded = false;
  ytIframe = null;
  extSubActive = false;
  playerSources = [];
  currentSourceIdx = 0;
  const $ = id => document.getElementById(id);
  const ov = $('playerOverlay');
  if (ov) ov.style.display = 'none';
  const c = $('playerVideoContainer');
  if (c) c.innerHTML = '';
  const i = $('playerIntro');
  if (i) i.style.display = 'flex';
  const w = $('playerVideoWrap');
  if (w) w.style.display = 'none';
  hideQualityTip();
  const sb = $('serverBar');
  if (sb) { sb.style.display = 'none'; sb.innerHTML = ''; }
  const co = $('playerControls');
  if (co) co.style.display = 'none';
  const ic = $('ctrlPlayIcon');
  if (ic) ic.className = 'fas fa-play';
  const pp = $('ctrlPlayed');
  if (pp) pp.style.width = '0';
  const pt = $('ctrlThumb');
  if (pt) pt.style.left = '0';
  const pin = $('ctrlProgressInput');
  if (pin) pin.value = '0';
  const tim = $('ctrlTime');
  if (tim) tim.textContent = '00:00 / 00:00';
  const sub = $('ctrlSubBtn');
  if (sub) { sub.style.display = 'none'; const si = sub.querySelector('i'); if (si) si.className = 'fas fa-closed-captioning'; }
  const ext = $('ctrlExtSubBtn');
  if (ext) {
    ext.style.display = 'none';
    ext.classList.remove('ext-active');
    const ei = ext.querySelector('i');
    if (ei) ei.className = 'fas fa-language';
  }
  const toast = $('toast');
  if (toast) toast.classList.remove('show');
  if (document.fullscreenElement) document.exitFullscreen();
  playerType = '';
  playerVideoId = '';
  playerEmbedUrl = '';
}

function replayMovie() {
  const container = document.getElementById('playerVideoContainer');
  const iframe = container.querySelector('iframe');
  if (iframe) {
    const src = iframe.src;
    iframe.src = '';
    setTimeout(() => { iframe.src = src; }, 200);
  }
}

/* Keyboard shortcuts */
document.addEventListener('keydown', (e) => {
  try {
    const overlay = document.getElementById('playerOverlay');
    if (!overlay || overlay.style.display === 'none' || overlay.style.display === '') return;
    switch (e.code) {
      case 'Space': e.preventDefault(); if (playerType === 'youtube') togglePlay(); break;
      case 'KeyF': toggleFullscreen(); break;
      case 'KeyM': if (playerType === 'youtube') toggleMute(); break;
      case 'Escape': closePlayer(); break;
    }
  } catch (e) {}
});



function initScrollEffect() {
  const header = document.querySelector('.header');
  if (!header) return;
  window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 50));
}

/* ===== Site Stats (private - no display in UI) ===== */
let statsSessionId = localStorage.getItem('alex_cinema_sid') || 's-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
localStorage.setItem('alex_cinema_sid', statsSessionId);

function heartbeat() {
  fetch(`/api/heartbeat?sid=${encodeURIComponent(statsSessionId)}`).catch(() => {});
}

function trackPage() {
  const q = new URLSearchParams({
    sid: statsSessionId,
    page: location.pathname + location.search,
    ref: (document.referrer || '').slice(0, 300),
    screen: (screen.width || 0) + 'x' + (screen.height || 0),
    lang: navigator.language || '',
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    conn: (navigator.connection && navigator.connection.effectiveType) || '',
    ram: navigator.deviceMemory ? navigator.deviceMemory + 'GB' : ''
  });
  fetch('/api/track?' + q.toString(), { keepalive: true }).catch(() => {});
}

trackPage();
heartbeat();
setInterval(heartbeat, 20000);

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  initScrollEffect();
  initPlayerUI();
  initUiPolish();
  initCardTilt();
  const isDetailPage = window.location.pathname.includes('movie.html');

  if (isDetailPage) { loadMovieDetail(); return; }

  document.querySelectorAll('#mainNav a[data-section]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('#mainNav a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      currentSection = a.dataset.section;
      currentGenre = '';
      currentQuery = '';
      currentPage = 1;

      if (currentSection === 'tv') {
        currentMediaType = 'tv';
      } else {
        currentMediaType = 'movie';
      }

      const filters = document.getElementById('filtersSection');
      const genresSection = document.getElementById('genresSection');
      const moviesSection = document.querySelector('.movies-section');

      if (currentSection === 'genres') {
        if (filters) filters.style.display = 'none';
        if (genresSection) { genresSection.style.display = 'block'; renderGenres(); }
        if (moviesSection) moviesSection.style.display = 'none';
      } else {
        if (genresSection) genresSection.style.display = 'none';
        if (filters) filters.style.display = currentSection === 'home' || currentSection === 'movies' || currentSection === 'tv' ? 'block' : 'none';
        if (moviesSection) moviesSection.style.display = 'block';
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.filter-btn[data-filter=""]')?.classList.add('active');
        document.getElementById('searchInput').value = '';
        loadMovies();
      }
    });
  });

  document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.querySelector('.nav').classList.toggle('open');
  });

  const searchInput = document.getElementById('searchInput');
  let searchTimer;
  searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentQuery = e.target.value;
      currentPage = 1;
      loadMovies();
    }, 400);
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentGenre = btn.dataset.filter;
      currentQuery = '';
      currentPage = 1;
      if (searchInput) searchInput.value = '';
      loadMovies();
    });
  });

  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; loadMovies(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; loadMovies(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  loadMovies();
});

/* ===== UI polish: count-up, replay animations, ripple, scroll progress ===== */
function animateCount(el, to) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !isFinite(to) || to <= 0) { el.textContent = `${to} عنوان`; return; }
  const dur = 700;
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / dur);
    el.textContent = `${Math.round(to * (1 - Math.pow(1 - k, 3)))} عنوان`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function replayAnim(el) {
  if (!el) return;
  el.classList.remove('anim-swap');
  void el.offsetWidth;
  el.classList.add('anim-swap');
  el.addEventListener('animationend', function h() {
    el.classList.remove('anim-swap');
    el.removeEventListener('animationend', h);
  });
}

function initUiPolish() {
  initStarfield();

  const docEl = document.documentElement;
  const prog = document.getElementById('scrollProgress');
  const toTop = document.getElementById('toTopBtn');
  const field = document.getElementById('starfield');

  const onScroll = () => {
    const y = window.scrollY || docEl.scrollTop || document.body.scrollTop || 0;
    const max = Math.max(1, docEl.scrollHeight - docEl.clientHeight);
    if (prog) prog.style.transform = `scaleX(${Math.min(1, y / max)})`;
    if (toTop) toTop.classList.toggle('show', y > 420);
    if (field) field.style.transform = `translate3d(0, ${(y * -0.06).toFixed(1)}px, 0)`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  document.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn,.watch-btn,.page-btn,.modal-btn,.server-btn,.back-btn,.player-back');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.15;
    const ink = document.createElement('span');
    ink.className = 'ripple-ink';
    ink.style.width = ink.style.height = size + 'px';
    ink.style.left = (e.clientX - rect.left - size / 2) + 'px';
    ink.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ink);
    setTimeout(() => ink.remove(), 700);
  });
}

function initCardTilt() {
  const grid = document.getElementById('moviesGrid');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  if (!grid || reduce || !finePointer) return;

  let raf = null;
  let pending = null;

  const apply = () => {
    raf = null;
    const p = pending;
    pending = null;
    if (!p || !p.card || !p.card.isConnected) return;
    const rect = p.card.getBoundingClientRect();
    const px = (p.x - rect.left) / rect.width;
    const py = (p.y - rect.top) / rect.height;
    p.card.style.setProperty('--ry', ((px - 0.5) * 10).toFixed(2) + 'deg');
    p.card.style.setProperty('--rx', ((0.5 - py) * 8).toFixed(2) + 'deg');
    p.card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
    p.card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  };

  grid.addEventListener('mousemove', e => {
    const card = e.target.closest('.movie-card');
    if (!card) return;
    pending = { card, x: e.clientX, y: e.clientY };
    if (raf === null) raf = requestAnimationFrame(apply);
  }, { passive: true });

  grid.addEventListener('mouseout', e => {
    const card = e.target.closest('.movie-card');
    if (card && !(e.relatedTarget && card.contains(e.relatedTarget))) {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    }
  });
}

function initStarfield() {
  if (document.getElementById('starfield')) return;
  const field = document.createElement('div');
  field.id = 'starfield';

  const gauss = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;

  [['a', 34, 1], ['b', 22, 0.65]].forEach(([cls, count, dim]) => {
    const layer = document.createElement('div');
    layer.className = 'sf-layer ' + cls;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'sf-star';
      s.style.width = s.style.height = (Math.random() * 1.6 + 0.8).toFixed(1) + 'px';
      s.style.left = (Math.random() * 100).toFixed(2) + '%';
      s.style.top = (Math.random() * 100).toFixed(2) + '%';
      s.style.setProperty('--o', (0.12 + Math.random() * 0.38 * dim).toFixed(2));
      s.style.setProperty('--tdur', (2.5 + Math.random() * 5).toFixed(1) + 's');
      s.style.setProperty('--tdelay', (-Math.random() * 7).toFixed(1) + 's');
      layer.appendChild(s);
    }
    field.appendChild(layer);
  });

  const layerC = document.createElement('div');
  layerC.className = 'sf-layer c';
  const band = document.createElement('div');
  band.className = 'sf-band';

  for (let i = 0; i < 3; i++) {
    const hz = document.createElement('span');
    hz.className = 'sf-haze';
    const size = Math.round(26 + Math.random() * 10);
    hz.style.width = hz.style.height = size + 'vmax';
    hz.style.left = (10 + i * 34 + Math.random() * 8).toFixed(1) + '%';
    hz.style.top = (32 + gauss() * 16).toFixed(1) + '%';
    band.appendChild(hz);
  }

  for (let i = 0; i < 90; i++) {
    const s = document.createElement('span');
    s.className = 'sf-star';
    s.style.width = s.style.height = (Math.random() * 0.9 + 0.5).toFixed(1) + 'px';
    s.style.left = (Math.random() * 100).toFixed(2) + '%';
    s.style.top = (50 + gauss() * 24).toFixed(1) + '%';
    s.style.setProperty('--o', (0.06 + Math.random() * 0.22).toFixed(2));
    s.style.setProperty('--tdur', (3 + Math.random() * 6).toFixed(1) + 's');
    s.style.setProperty('--tdelay', (-Math.random() * 9).toFixed(1) + 's');
    band.appendChild(s);
  }
  layerC.appendChild(band);

  for (let i = 0; i < 8; i++) {
    const s = document.createElement('span');
    s.className = 'sf-star lg';
    s.style.width = s.style.height = (2.4 + Math.random() * 1.2).toFixed(1) + 'px';
    s.style.left = (Math.random() * 100).toFixed(2) + '%';
    s.style.top = (Math.random() * 100).toFixed(2) + '%';
    s.style.setProperty('--o', (0.45 + Math.random() * 0.35).toFixed(2));
    s.style.setProperty('--tdur', (4 + Math.random() * 5).toFixed(1) + 's');
    s.style.setProperty('--tdelay', (-Math.random() * 9).toFixed(1) + 's');
    layerC.appendChild(s);
  }
  field.appendChild(layerC);

  const makeShooter = () => {
    const sh = document.createElement('span');
    sh.className = 'sf-shooter';
    sh.style.left = (8 + Math.random() * 78).toFixed(1) + '%';
    sh.style.top = (3 + Math.random() * 42).toFixed(1) + '%';
    sh.style.setProperty('--ang', (-16 - Math.random() * 34).toFixed(0) + 'deg');
    sh.style.setProperty('--len', Math.round(80 + Math.random() * 90) + 'px');
    sh.style.setProperty('--peak', (0.55 + Math.random() * 0.35).toFixed(2));
    return sh;
  };

  const applyTiming = (sh, dur, delay) => {
    sh.style.setProperty('--sdur', dur.toFixed(1) + 's');
    sh.style.setProperty('--sdelay', delay.toFixed(1) + 's');
  };

  for (let i = 0; i < 14; i++) {
    const sh = makeShooter();
    applyTiming(sh, 8, -(i * 0.61 + Math.random() * 0.15));
    field.appendChild(sh);
  }

  for (let i = 0; i < 6; i++) {
    const sh = makeShooter();
    applyTiming(sh, 9.5 + Math.random() * 3.5, -Math.random() * 13);
    field.appendChild(sh);
  }

  document.body.prepend(field);
}
