let currentPage = 1;
let currentQuery = '';
let currentGenre = '';
let currentSection = 'home';
let totalPages = 1;
let currentImdbId = null;
let currentMediaType = 'movie';
let currentItemId = null;

const SECTION_CONFIG = {
  home:   { title: 'الرئيسية',     api: '/api/discover?type=movie&sort=popularity.desc', heroTitle: 'أهلاً بك في Alex Cinema', heroSub: 'مش هتحتار و تقول أشوف إيه... إحنا جبناهولك لحد عندك.' },
  movies: { title: 'الأفلام',       api: '/api/discover?type=movie&sort=popularity.desc', heroTitle: 'الأفلام', heroSub: 'تصفح أحدث الأفلام من جميع أنحاء العالم.' },
  tv:     { title: 'المسلسلات',     api: '/api/discover?type=tv&sort=popularity.desc',    heroTitle: 'المسلسلات', heroSub: 'أشهر المسلسلات العالمية والعربية.' },
  arabic: { title: 'عربي',          api: '/api/discover?type=movie&language=ar&sort=popularity.desc', heroTitle: 'عربي', heroSub: 'أحدث الأفلام والمسلسلات العربية.' },
  foreign:{ title: 'أجنبي',         api: '/api/discover?type=movie&language=en&sort=popularity.desc', heroTitle: 'أجنبي', heroSub: 'أحدث الأفلام والمسلسلات الأجنبية.' }
};

async function api(path) {
  const res = await fetch(path);
  return res.json();
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
  if (sectionTitle) sectionTitle.textContent = cfg.title;
  if (heroTitle) heroTitle.textContent = cfg.heroTitle;
  if (heroSub) heroSub.textContent = cfg.heroSub;

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
  if (totalCount) totalCount.textContent = `${items.length} عنوان`;

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
let playerCount = 10;
let playerEmbedUrl = '';
let playerType = '';
let playerVideoId = '';
let playerYtPlayer = null;
let controlsTimeout = null;

async function watchMovie(imdbId, tmdbId) {
  if (!imdbId) return;
  const poster = document.getElementById('detailPoster').src;
  const title = document.getElementById('playerTitle').textContent || document.getElementById('detailTitle').textContent;
  const overlay = document.getElementById('playerOverlay');
  document.getElementById('playerMovieTitle').textContent = title;
  document.getElementById('playerPoster').src = poster;
  overlay.style.display = 'flex';

  const apiUrl = tmdbId
    ? `/api/player-url?imdb_id=${imdbId}&type=${currentMediaType}&tmdb_id=${tmdbId}`
    : `/api/player-url?imdb_id=${imdbId}&type=${currentMediaType}`;
  const res = await fetch(apiUrl);
  const data = await res.json();

  if (data.ok && data.embed_url) {
    playerEmbedUrl = data.embed_url;
    playerType = data.type || 'embed';
    playerVideoId = data.video_id || '';
    document.getElementById('playerControls').style.display = 'flex';
    document.getElementById('playerControls').style.opacity = '0';
    startCountdown();
  } else {
    overlay.style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'flex';
    const snd = document.getElementById('errorSound');
    if (snd) { snd.currentTime = 0; snd.play().catch(() => {}); }
  }
}

function startCountdown() {
  const intro = document.getElementById('playerIntro');
  const wrap = document.getElementById('playerVideoWrap');
  const countEl = document.getElementById('playerCountdown');
  intro.style.display = 'flex';
  wrap.style.display = 'none';
  playerCount = 10;
  countEl.textContent = playerCount;
  clearInterval(playerTimer);
  playerTimer = setInterval(() => {
    playerCount--;
    countEl.textContent = playerCount;
    countEl.classList.remove('pulse');
    void countEl.offsetWidth;
    countEl.classList.add('pulse');
    if (playerCount <= 0) {
      clearInterval(playerTimer);
      loadVideo();
    }
  }, 1000);
}

function skipIntro() {
  clearInterval(playerTimer);
  loadVideo();
}

function loadVideo() {
  const intro = document.getElementById('playerIntro');
  const wrap = document.getElementById('playerVideoWrap');
  const container = document.getElementById('playerVideoContainer');
  const loading = document.getElementById('playerLoading');
  const controls = document.getElementById('playerControls');

  intro.style.display = 'none';
  wrap.style.display = 'block';
  container.innerHTML = '';
  loading.classList.add('active');

  if (playerType === 'youtube' && playerVideoId) {
    loadYoutubePlayer(playerVideoId, container, loading, controls);
  } else {
    loadEmbedPlayer(playerEmbedUrl, container, loading, controls);
  }
}

function loadYoutubePlayer(videoId, container, loading, controls) {
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`;
  iframe.allow = 'autoplay;fullscreen;picture-in-picture;encrypted-media';
  iframe.allowFullscreen = true;
  container.appendChild(iframe);

  let loaded = false;
  const show = () => { if (!loaded) { loaded = true; loading.classList.remove('active'); controls.style.opacity = '1'; } };

  iframe.onload = show;

  setTimeout(show, 4000);
}

function loadEmbedPlayer(embedUrl, container, loading, controls) {
  const iframe = document.createElement('iframe');
  iframe.src = embedUrl;
  iframe.allow = 'autoplay;fullscreen;picture-in-picture;encrypted-media';
  iframe.allowFullscreen = true;
  container.appendChild(iframe);

  let loaded = false;
  const show = () => { if (!loaded) { loaded = true; loading.classList.remove('active'); controls.style.opacity = '1'; } };

  iframe.onload = show;

  setTimeout(show, 8000);
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
    document.getElementById('ctrlFullscreenBtn').querySelector('i').className = 'fas fa-expand';
  } else {
    container.requestFullscreen?.();
    document.getElementById('ctrlFullscreenBtn').querySelector('i').className = 'fas fa-compress';
  }
}

function closePlayer() {
  clearInterval(playerTimer);
  document.getElementById('playerOverlay').style.display = 'none';
  document.getElementById('playerVideoContainer').innerHTML = '';
  document.getElementById('playerIntro').style.display = 'flex';
  document.getElementById('playerVideoWrap').style.display = 'none';
  document.getElementById('playerControls').style.display = 'none';
  document.getElementById('ctrlPlayIcon').className = 'fas fa-play';
  document.getElementById('ctrlPlayed').style.width = '0';
  document.getElementById('ctrlThumb').style.left = '0';
  document.getElementById('ctrlProgressInput').value = '0';
  document.getElementById('ctrlTime').textContent = '00:00 / 00:00';
  if (document.fullscreenElement) document.exitFullscreen();
  playerType = '';
  playerVideoId = '';
  playerEmbedUrl = '';
  playerYtPlayer = null;
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
  const overlay = document.getElementById('playerOverlay');
  if (overlay.style.display === 'none' || overlay.style.display === '') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      togglePlay();
      break;
    case 'KeyF':
      toggleFullscreen();
      break;
    case 'KeyM':
      toggleMute();
      break;
    case 'Escape':
      closePlayer();
      break;
  }
});



function initScrollEffect() {
  const header = document.querySelector('.header');
  if (!header) return;
  window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 50));
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  initScrollEffect();
  initPlayerUI();
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

      if (currentSection === 'tv' || currentSection === 'genres') {
        currentMediaType = 'tv';
      } else {
        currentMediaType = 'movie';
      }

      const filters = document.getElementById('filtersSection');
      filters.style.display = currentSection === 'genres' || currentSection === 'home' || currentSection === 'movies' || currentSection === 'tv' ? 'block' : 'none';

      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.filter-btn[data-filter=""]')?.classList.add('active');
      document.getElementById('searchInput').value = '';
      loadMovies();
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
