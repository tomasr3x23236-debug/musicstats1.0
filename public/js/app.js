/* ─────────────────────────────────────────────────────────
   MusicStats — Apple Music Tracker
   Integración real con MusicKit JS v3 + motor de estadísticas local
   ───────────────────────────────────────────────────────── */

'use strict';

// ── Config (inyectada desde el servidor via /api/config) ──
let MUSICKIT_TOKEN = null;

// ── Estado global ──
let music = null;       // instancia MusicKit
let state = null;       // datos del usuario
let npTimer = null;     // intervalo now-playing
let npElapsed = 0;      // segundos transcurridos en canción actual
let currentTrackId = null;

const DEMO_MODE_KEY = 'ms_demo';
const STATE_KEY = 'ms_state';

// Emojis de respaldo para artistas/canciones sin artwork
const FALLBACK_EMOJIS = ['🎵','🎤','🎸','🎧','🎶','🔥','💫','⭐','🎹','🎷'];
const GENRE_COLORS = {
  'Pop':'#FC3C44','Latin':'#FF9F0A','Hip-Hop / Rap':'#30D158',
  'R&B / Soul':'#5E5CE6','Electronic':'#64D2FF','Rock':'#FF453A',
  'Indie':'#FFD60A','Clásica':'#BF5AF2','Jazz':'#FF6B73','Otro':'#8E8E93'
};

// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════
async function init() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    MUSICKIT_TOKEN = cfg.developerToken || null;
  } catch (e) {
    MUSICKIT_TOKEN = null;
  }

  if (!MUSICKIT_TOKEN) {
    document.getElementById('configNotice').style.display = 'block';
  }

  // ¿Ya conectado?
  const saved = loadState();
  if (saved) {
    state = saved;
    showDashboard();
    renderAll();
    if (!saved.demoMode && MUSICKIT_TOKEN) {
      await initMusicKit();
      startNowPlayingPoller();
    } else {
      startDemoNowPlaying();
    }
  }
}

// ════════════════════════════════════════════════════════════
// MUSICKIT — Autenticación real
// ════════════════════════════════════════════════════════════
async function initMusicKit() {
  if (!MUSICKIT_TOKEN) return false;
  try {
    await MusicKit.configure({
      developerToken: MUSICKIT_TOKEN,
      app: { name: 'MusicStats', build: '1.0' }
    });
    music = MusicKit.getInstance();
    return true;
  } catch (e) {
    console.error('MusicKit init error:', e);
    return false;
  }
}

async function connectAppleMusic() {
  const btn = document.getElementById('btnConnect');
  const errEl = document.getElementById('connectError');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Conectando…';
  showScreen('loading');

  if (!MUSICKIT_TOKEN) {
    // Modo demo
    state = buildDemoState();
    state.demoMode = true;
    saveState();
    showDashboard();
    renderAll();
    startDemoNowPlaying();
    return;
  }

  // Intento real
  try {
    const ok = await initMusicKit();
    if (!ok) throw new Error('No se pudo inicializar MusicKit');

    const token = await music.authorize();
    if (!token) throw new Error('Autorización cancelada');

    // Obtener info del usuario
    const me = await music.api.music('/v1/me/account');
    const displayName = me?.data?.attributes?.storefront || 'Apple Music';

    state = loadState() || buildFreshState();
    state.demoMode = false;
    state.userName = displayName;
    state.connectedAt = Date.now();
    saveState();

    showDashboard();
    renderAll();
    startNowPlayingPoller();
  } catch (e) {
    showScreen('connect');
    btn.disabled = false;
    btn.textContent = 'Conectar Apple Music';
    errEl.style.display = 'block';
    errEl.textContent = '⚠️ ' + (e.message || 'Error al conectar. Intenta de nuevo.');
  }
}

// ════════════════════════════════════════════════════════════
// NOW PLAYING — Poller real (MusicKit)
// ════════════════════════════════════════════════════════════
function startNowPlayingPoller() {
  if (!music) return;

  // Listener nativo de MusicKit
  music.addEventListener(MusicKit.Events.nowPlayingItemDidChange, onTrackChange);
  music.addEventListener(MusicKit.Events.playbackStateDidChange, onPlaybackChange);

  // Tick cada segundo para el progreso visual
  npTimer = setInterval(tickProgress, 1000);
}

function onTrackChange(event) {
  const item = music.nowPlayingItem;
  if (!item) return;

  const trackId = item.id;
  if (trackId === currentTrackId) return;

  // Registrar la canción anterior si hubo
  if (currentTrackId && npElapsed > 15) {
    logCurrentTrack();
  }

  currentTrackId = trackId;
  npElapsed = 0;

  state.nowPlaying = {
    id: trackId,
    title: item.attributes?.name || 'Desconocido',
    artist: item.attributes?.artistName || '',
    album: item.attributes?.albumName || '',
    artwork: getArtworkUrl(item.attributes?.artwork),
    duration: item.attributes?.durationInMillis ? Math.round(item.attributes.durationInMillis / 1000) : 210,
    emoji: FALLBACK_EMOJIS[Math.floor(Math.random() * FALLBACK_EMOJIS.length)]
  };

  renderNowPlaying();
  saveState();
}

function onPlaybackChange(event) {
  renderNowPlaying();
}

function tickProgress() {
  if (!music || music.playbackState !== MusicKit.PlaybackStates.playing) return;
  npElapsed++;

  // Registrar cuando lleva más de 30s (canción efectivamente escuchada)
  if (npElapsed === 30) {
    logCurrentTrack();
  }

  // Actualizar barra visual
  const fillEl = document.getElementById('np-fill');
  const curEl = document.getElementById('np-cur');
  if (fillEl && state.nowPlaying) {
    const dur = state.nowPlaying.duration || 210;
    const pos = music.currentPlaybackTime || npElapsed;
    const pct = Math.min((pos / dur) * 100, 100).toFixed(1);
    fillEl.style.width = pct + '%';
    if (curEl) curEl.textContent = formatTime(Math.floor(pos));
  }
}

function logCurrentTrack() {
  if (!state.nowPlaying) return;
  const { title, artist, album, artwork, emoji } = state.nowPlaying;
  const minsListened = Math.round(npElapsed / 60) || 1;

  // Sumar a totales
  state.totalMins += minsListened;
  state.totalPlays++;

  // Artistas
  let art = state.artists.find(a => a.name === artist);
  if (!art) { art = { name: artist, plays: 0, mins: 0, artwork }; state.artists.push(art); }
  art.plays++; art.mins += minsListened;

  // Canciones
  let song = state.songs.find(s => s.title === title && s.artist === artist);
  if (!song) { song = { title, artist, album, plays: 0, mins: 0, artwork, emoji }; state.songs.push(song); }
  song.plays++; song.mins += minsListened;

  // Historial
  state.history.unshift({ title, artist, artwork, emoji, ts: Date.now(), mins: minsListened });
  if (state.history.length > 500) state.history.pop();

  // Racha
  updateStreak();

  // Mes actual
  const monthIdx = new Date().getMonth();
  state.monthMins[monthIdx] = (state.monthMins[monthIdx] || 0) + minsListened;

  saveState();
  renderAll();
}

// ════════════════════════════════════════════════════════════
// NOW PLAYING — Demo mode (simulado)
// ════════════════════════════════════════════════════════════
function startDemoNowPlaying() {
  let elapsed = 0;
  const songs = state.songs;

  function pickSong() {
    return songs[Math.floor(Math.random() * songs.length)];
  }

  let current = pickSong();
  state.nowPlaying = { ...current, title: current.name || current.title, duration: 200 };
  renderNowPlaying();

  npTimer = setInterval(() => {
    elapsed++;
    const dur = state.nowPlaying.duration || 200;

    // Barra visual
    const fillEl = document.getElementById('np-fill');
    const curEl = document.getElementById('np-cur');
    if (fillEl) fillEl.style.width = Math.min((elapsed / dur) * 100, 100).toFixed(1) + '%';
    if (curEl) curEl.textContent = formatTime(elapsed);

    // Cambio de canción
    if (elapsed >= dur) {
      elapsed = 0;
      const s = pickSong();
      state.totalPlays++;
      state.totalMins += 3;
      let art = state.artists.find(a => a.name === s.artist);
      if (art) { art.plays++; art.mins += 3; }
      let song = state.songs.find(x => (x.name || x.title) === (s.name || s.title));
      if (song) { song.plays++; song.mins += 3; }
      state.history.unshift({ title: s.name || s.title, artist: s.artist, emoji: s.emoji, ts: Date.now(), mins: 3 });
      current = s;
      state.nowPlaying = { ...s, title: s.name || s.title, duration: 180 + Math.floor(Math.random() * 60) };
      updateStreak();
      saveState();
      renderAll();
    }
  }, 1000);
}

// ════════════════════════════════════════════════════════════
// MANUAL LOG
// ════════════════════════════════════════════════════════════
function manualLog() {
  const titleEl = document.getElementById('inputSong');
  const artistEl = document.getElementById('inputArtist');
  const title = titleEl.value.trim();
  const artist = artistEl.value.trim();
  if (!title || !artist) return;

  const emojis = ['🎵','🎶','🎸','🎤','🎧','🔥','⭐','💫'];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  const mins = 3;

  let song = state.songs.find(s => (s.title || s.name) === title && s.artist === artist);
  if (!song) { song = { title, artist, plays: 0, mins: 0, emoji }; state.songs.push(song); }
  song.plays++; song.mins += mins;

  let art = state.artists.find(a => a.name === artist);
  if (!art) { art = { name: artist, plays: 0, mins: 0 }; state.artists.push(art); }
  art.plays++; art.mins += mins;

  state.totalPlays++;
  state.totalMins += mins;
  state.history.unshift({ title, artist, emoji, ts: Date.now(), mins });

  saveState();
  renderAll();
  titleEl.value = '';
  artistEl.value = '';
}

// ════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════
async function renderAll() {
  // Precargar artworks en paralelo antes de renderizar
  if (window.ArtworkCache) {
    await ArtworkCache.prefetch(state.artists || [], state.songs || []);
  }
  renderNowPlaying();
  renderStats();
  await renderMiniArtists();
  await renderMiniSongs();
  renderGenres();
  renderHeatmap();
  await renderAllArtists();
  await renderAllSongs();
  await renderHistory();
  renderMonthChart();
}

async function renderNowPlaying() {
  const el = document.getElementById('nowPlayingSection');
  if (!el) return;
  const np = state.nowPlaying;
  if (!np) { el.innerHTML = ''; return; }

  // Buscar artwork real si no hay uno guardado
  let artUrl = np.artwork;
  if (!artUrl && window.ArtworkCache) {
    artUrl = await ArtworkCache.getSong(np.title || np.name, np.artist)
          || await ArtworkCache.getArtist(np.artist);
  }

  const artHtml = artUrl
    ? `<img src="${artUrl}" alt="artwork" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" onerror="this.style.display='none'" />`
    : `<span style="font-size:28px">${np.emoji || '🎵'}</span>`;

  el.innerHTML = `
    <div class="now-playing">
      <div class="np-art">${artHtml}</div>
      <div class="np-meta">
        <div class="np-live"><div class="np-dot"></div>Reproduciendo ahora</div>
        <div class="np-title">${esc(np.title || np.name)}</div>
        <div class="np-artist">${esc(np.artist)}</div>
        <div class="np-progress-wrap">
          <div class="np-times">
            <span id="np-cur">0:00</span>
            <span>${formatTime(np.duration || 210)}</span>
          </div>
          <div class="np-bar"><div class="np-fill" id="np-fill" style="width:0%"></div></div>
        </div>
      </div>
    </div>`;
}

function renderStats() {
  const s = state;
  const hrs = Math.floor(s.totalMins / 60);
  const days = Math.floor((Date.now() - (s.connectedAt || Date.now())) / 86400000) + 1;
  const avgDay = days > 0 ? Math.round(s.totalMins / days) : s.totalMins;

  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Minutos</div>
      <div class="stat-value">${s.totalMins.toLocaleString()}</div>
      <div class="stat-sub">${hrs} horas en total</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Reproducciones</div>
      <div class="stat-value">${s.totalPlays.toLocaleString()}</div>
      <div class="stat-sub">${state.songs.length} canciones únicas</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Racha</div>
      <div class="stat-value">${s.streak}</div>
      <div class="stat-sub">días consecutivos</div>
      <div class="stat-badge">🔥 Mejor: ${s.bestStreak}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Promedio/día</div>
      <div class="stat-value">${avgDay}</div>
      <div class="stat-sub">minutos por día</div>
    </div>`;
}

async function renderMiniArtists() {
  const top = sortedArtists().slice(0, 5);
  const max = top[0]?.plays || 1;
  // Obtener artworks
  const artworks = window.ArtworkCache
    ? await Promise.all(top.map(a => ArtworkCache.getArtist(a.name)))
    : top.map(() => null);

  document.getElementById('miniArtists').innerHTML = top.map((a, i) => {
    const url = artworks[i] || a.artwork;
    const imgHtml = url
      ? `<img src="${url}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:9px;display:block;" onerror="this.outerHTML='<span style=\"font-size:20px\">${FALLBACK_EMOJIS[i]}</span>'">`
      : `<span style="font-size:20px">${FALLBACK_EMOJIS[i]}</span>`;
    return `<div class="item-row">
      <div class="rank ${rankClass(i)}">${i + 1}</div>
      <div class="item-art" style="overflow:hidden">${imgHtml}</div>
      <div class="item-info">
        <div class="item-name">${esc(a.name)}</div>
        <div class="bar-wrap"><div class="bar" style="width:${Math.round(a.plays/max*100)}%"></div></div>
      </div>
      <div class="item-count">${a.plays}</div>
    </div>`;
  }).join('') || emptyState('Aún no hay artistas registrados');
}

async function renderMiniSongs() {
  const top = sortedSongs().slice(0, 5);
  const max = top[0]?.plays || 1;
  const artworks = window.ArtworkCache
    ? await Promise.all(top.map(s => ArtworkCache.getSong(s.title || s.name, s.artist)))
    : top.map(() => null);

  document.getElementById('miniSongs').innerHTML = top.map((s, i) => {
    const url = artworks[i] || s.artwork;
    const imgHtml = url
      ? `<img src="${url}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:9px;display:block;" onerror="this.outerHTML='<span style=\"font-size:20px\">${s.emoji || '🎵'}</span>'">`
      : `<span style="font-size:20px">${s.emoji || '🎵'}</span>`;
    return `<div class="item-row">
      <div class="rank ${rankClass(i)}">${i + 1}</div>
      <div class="item-art" style="overflow:hidden">${imgHtml}</div>
      <div class="item-info">
        <div class="item-name">${esc(s.title || s.name)}</div>
        <div class="item-sub">${esc(s.artist)}</div>
        <div class="bar-wrap"><div class="bar" style="width:${Math.round(s.plays/max*100)}%"></div></div>
      </div>
      <div class="item-count">${s.plays}</div>
    </div>`;
  }).join('') || emptyState('Aún no hay canciones registradas');
}

function renderGenres() {
  const genres = computeGenres();
  const max = genres[0]?.pct || 1;
  document.getElementById('genreChart').innerHTML = genres.map(g => `
    <div class="genre-row">
      <div class="genre-name">${g.name}</div>
      <div class="genre-outer"><div class="genre-inner" style="width:${g.pct}%;background:${g.color}"></div></div>
      <div class="genre-pct">${g.pct}%</div>
    </div>`).join('');
}

function renderHeatmap() {
  const days = ['L','M','X','J','V','S','D'];
  const weeks = 4;
  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay() + 1);

  // Agrupar historial por día
  const dayMins = {};
  state.history.forEach(h => {
    const d = new Date(h.ts).toDateString();
    dayMins[d] = (dayMins[d] || 0) + h.mins;
  });

  const maxMins = Math.max(...Object.values(dayMins), 1);

  let html = '';
  days.forEach((d, di) => {
    html += `<div class="hm-col"><div class="hm-day">${d}</div>`;
    for (let w = weeks - 1; w >= 0; w--) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() - w * 7 + di);
      const mins = dayMins[date.toDateString()] || 0;
      const level = mins === 0 ? 0 : mins < maxMins * 0.25 ? 1 : mins < maxMins * 0.5 ? 2 : mins < maxMins * 0.75 ? 3 : 4;
      html += `<div class="hm-cell l${level}" title="${date.toLocaleDateString('es-MX')}: ${mins} min"></div>`;
    }
    html += '</div>';
  });
  document.getElementById('heatmap').innerHTML = html;
}

async function renderAllArtists() {
  const artists = sortedArtists();
  const max = artists[0]?.plays || 1;
  const artworks = window.ArtworkCache
    ? await Promise.all(artists.slice(0,20).map(a => ArtworkCache.getArtist(a.name)))
    : artists.map(() => null);

  document.getElementById('artistCount').textContent = artists.length + ' artistas';
  document.getElementById('allArtists').innerHTML = artists.map((a, i) => {
    const url = artworks[i] || a.artwork;
    const fb = FALLBACK_EMOJIS[i % FALLBACK_EMOJIS.length];
    const imgHtml = url
      ? `<img src="${url}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:9px;display:block;" onerror="this.outerHTML='<span style=\"font-size:20px\">${fb}</span>'">`
      : `<span style="font-size:20px">${fb}</span>`;
    return `<div class="item-row">
      <div class="rank ${rankClass(i)}">${i + 1}</div>
      <div class="item-art" style="overflow:hidden">${imgHtml}</div>
      <div class="item-info">
        <div class="item-name" style="font-size:14px">${esc(a.name)}</div>
        <div class="item-sub">${a.mins} min · ${a.plays} reproducciones</div>
        <div class="bar-wrap" style="margin-top:6px"><div class="bar" style="width:${Math.round(a.plays/max*100)}%"></div></div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:700">${a.plays}</div>
        <div style="font-size:10px;color:var(--text3)">plays</div>
      </div>
    </div>`;
  }).join('') || emptyState('Aún no hay artistas');
}

async function renderAllSongs() {
  const songs = sortedSongs();
  const max = songs[0]?.plays || 1;
  const artworks = window.ArtworkCache
    ? await Promise.all(songs.slice(0,20).map(s => ArtworkCache.getSong(s.title || s.name, s.artist)))
    : songs.map(() => null);

  document.getElementById('songCount').textContent = songs.length + ' canciones';
  document.getElementById('allSongs').innerHTML = songs.map((s, i) => {
    const url = artworks[i] || s.artwork;
    const fb = s.emoji || '🎵';
    const imgHtml = url
      ? `<img src="${url}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:9px;display:block;" onerror="this.outerHTML='<span style=\"font-size:20px\">${fb}</span>'">`
      : `<span style="font-size:20px">${fb}</span>`;
    return `<div class="item-row">
      <div class="rank ${rankClass(i)}">${i + 1}</div>
      <div class="item-art" style="overflow:hidden">${imgHtml}</div>
      <div class="item-info">
        <div class="item-name" style="font-size:14px">${esc(s.title || s.name)}</div>
        <div class="item-sub">${esc(s.artist)} · ${s.mins} min</div>
        <div class="bar-wrap" style="margin-top:6px"><div class="bar" style="width:${Math.round(s.plays/max*100)}%"></div></div>
      </div>
      <div style="text-align:right">
        <div style="font-size:15px;font-weight:700">${s.plays}</div>
        <div style="font-size:10px;color:var(--text3)">plays</div>
      </div>
    </div>`;
  }).join('') || emptyState('Aún no hay canciones');
}

async function renderHistory() {
  const hist = state.history.slice(0, 30);
  document.getElementById('totalPlaysLabel').textContent = state.totalPlays.toLocaleString() + ' reproducciones';
  const artworks = window.ArtworkCache
    ? await Promise.all(hist.map(h => ArtworkCache.getSong(h.title || h.name, h.artist)))
    : hist.map(() => null);

  document.getElementById('historyList').innerHTML = hist.map((h, i) => {
    const d = new Date(h.ts);
    const time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('es-MX', { weekday: 'short', month: 'short', day: 'numeric' });
    const url = artworks[i] || h.artwork;
    const fb = h.emoji || '🎵';
    const imgHtml = url
      ? `<img src="${url}" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:8px;display:block;" onerror="this.outerHTML='<span style=\"font-size:18px\">${fb}</span>'">`
      : `<span style="font-size:18px">${fb}</span>`;
    return `<div class="history-row">
      <div class="h-art" style="overflow:hidden">${imgHtml}</div>
      <div class="h-info">
        <div class="h-name">${esc(h.title || h.name)}</div>
        <div class="h-meta">${esc(h.artist)} · ${h.mins} min</div>
      </div>
      <div class="h-time">${time}<br><span style="font-size:9px">${date}</span></div>
    </div>`;
  }).join('') || emptyState('Sin historial todavía');
}

function renderMonthChart() {
  const data = state.monthMins;
  const labels = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const max = Math.max(...data, 1);
  const curMonth = new Date().getMonth();

  document.getElementById('monthChart').innerHTML = data.map((v, i) => {
    const pct = Math.round((v / max) * 100);
    const isCur = i === curMonth;
    const color = isCur ? 'var(--pink)' : i > curMonth ? 'rgba(255,255,255,0.06)' : 'rgba(252,60,68,0.3)';
    return `<div class="m-col">
      <div class="m-outer"><div class="m-inner" style="height:${pct}%;background:${color}"></div></div>
      <div class="m-label">${labels[i]}</div>
    </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════
function sortedArtists() { return [...state.artists].sort((a,b) => b.plays - a.plays); }
function sortedSongs() { return [...state.songs].sort((a,b) => b.plays - a.plays); }
function rankClass(i) { return i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''; }
function esc(str) { return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatTime(s) { const m = Math.floor(s/60); const sec = s%60; return m+':'+(sec<10?'0':'')+sec; }
function emptyState(msg) { return `<div class="empty"><div class="empty-icon">🎵</div>${msg}</div>`; }

function getArtworkUrl(artwork) {
  if (!artwork) return null;
  return artwork.url?.replace('{w}','80').replace('{h}','80') || null;
}

function computeGenres() {
  // En modo demo usamos géneros predefinidos; en real vendría del catálogo
  const demo = [
    { name: 'Latin', pct: 38, color: GENRE_COLORS['Latin'] },
    { name: 'Pop', pct: 24, color: GENRE_COLORS['Pop'] },
    { name: 'Hip-Hop / Rap', pct: 20, color: GENRE_COLORS['Hip-Hop / Rap'] },
    { name: 'R&B / Soul', pct: 12, color: GENRE_COLORS['R&B / Soul'] },
    { name: 'Indie', pct: 6, color: GENRE_COLORS['Indie'] },
  ];
  return state.genres || demo;
}

function updateStreak() {
  const today = new Date().toDateString();
  if (state.lastActiveDay === today) return;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (state.lastActiveDay === yesterday) {
    state.streak++;
  } else if (state.lastActiveDay !== today) {
    state.streak = 1;
  }
  state.bestStreak = Math.max(state.streak, state.bestStreak || 0);
  state.lastActiveDay = today;
}

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════
function buildFreshState() {
  return {
    userName: 'Usuario', connectedAt: Date.now(), demoMode: false,
    totalMins: 0, totalPlays: 0, streak: 1, bestStreak: 1,
    lastActiveDay: new Date().toDateString(),
    artists: [], songs: [], history: [], genres: null,
    monthMins: new Array(12).fill(0), nowPlaying: null
  };
}

function buildDemoState() {
  return {
    userName: 'Demo', connectedAt: Date.now() - 86400000 * 30, demoMode: true,
    totalMins: 18432, totalPlays: 3369, streak: 47, bestStreak: 62,
    lastActiveDay: new Date().toDateString(),
    artists: [
      { name: 'Bad Bunny', plays: 847, mins: 2541 },
      { name: 'Taylor Swift', plays: 623, mins: 1869 },
      { name: 'Drake', plays: 511, mins: 1533 },
      { name: 'The Weeknd', plays: 489, mins: 1467 },
      { name: 'Peso Pluma', plays: 334, mins: 1002 },
      { name: 'Kendrick Lamar', plays: 298, mins: 894 },
      { name: 'Rosalía', plays: 267, mins: 801 },
    ],
    songs: [
      { name: 'Tití Me Preguntó', title: 'Tití Me Preguntó', artist: 'Bad Bunny', plays: 142, mins: 426, emoji: '🌶️' },
      { name: 'Cruel Summer', title: 'Cruel Summer', artist: 'Taylor Swift', plays: 118, mins: 354, emoji: '☀️' },
      { name: 'One Dance', title: 'One Dance', artist: 'Drake', plays: 97, mins: 291, emoji: '💃' },
      { name: 'Blinding Lights', title: 'Blinding Lights', artist: 'The Weeknd', plays: 89, mins: 267, emoji: '⚡' },
      { name: 'LADY GAGA', title: 'LADY GAGA', artist: 'Peso Pluma', plays: 78, mins: 234, emoji: '🔥' },
      { name: 'Not Like Us', title: 'Not Like Us', artist: 'Kendrick Lamar', plays: 71, mins: 213, emoji: '🎤' },
      { name: 'DESPECHÁ', title: 'DESPECHÁ', artist: 'Rosalía', plays: 65, mins: 195, emoji: '🌹' },
    ],
    history: generateDemoHistory(),
    genres: [
      { name: 'Latin', pct: 38, color: '#FF9F0A' },
      { name: 'Pop', pct: 24, color: '#FC3C44' },
      { name: 'Hip-Hop / Rap', pct: 20, color: '#30D158' },
      { name: 'R&B / Soul', pct: 12, color: '#5E5CE6' },
      { name: 'Indie', pct: 6, color: '#64D2FF' },
    ],
    monthMins: [1240,1580,980,2100,1760,1430,1890,2340,1670,2010,1550,2890],
    nowPlaying: null
  };
}

function generateDemoHistory() {
  const songs = [
    { title: 'Tití Me Preguntó', artist: 'Bad Bunny', emoji: '🌶️' },
    { title: 'Cruel Summer', artist: 'Taylor Swift', emoji: '☀️' },
    { title: 'LADY GAGA', artist: 'Peso Pluma', emoji: '🔥' },
    { title: 'One Dance', artist: 'Drake', emoji: '💃' },
    { title: 'Blinding Lights', artist: 'The Weeknd', emoji: '⚡' },
  ];
  const history = [];
  const now = Date.now();
  for (let i = 0; i < 25; i++) {
    const s = songs[i % songs.length];
    history.push({ ...s, ts: now - i * 15 * 60000, mins: 3 + Math.floor(Math.random() * 2) });
  }
  return history;
}

function loadState() {
  try { const s = localStorage.getItem(STATE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch(e) {}
}

// ════════════════════════════════════════════════════════════
// UI
// ════════════════════════════════════════════════════════════
function showScreen(name) {
  ['connect','loading','dashboard'].forEach(s => {
    document.getElementById(`screen-${s}`).style.display = s === name ? (s === 'loading' ? 'flex' : 'block') : 'none';
  });
}

function showDashboard() {
  showScreen('dashboard');
  document.getElementById('userPill').style.display = 'flex';
  document.getElementById('userName').textContent = state.userName || 'Usuario';
  document.getElementById('userInitial').textContent = (state.userName || 'U')[0].toUpperCase();
}

function switchTab(tab) {
  const tabs = ['overview','artists','songs','history'];
  document.querySelectorAll('.tab').forEach((el, i) => el.classList.toggle('active', tabs[i] === tab));
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
  document.getElementById(`panel-${tab}`).classList.add('active');
}

function disconnect() {
  if (!confirm('¿Desconectar tu cuenta? Se borrarán las estadísticas guardadas localmente.')) return;
  clearInterval(npTimer);
  if (music) {
    try { music.unauthorize(); } catch(e) {}
  }
  localStorage.removeItem(STATE_KEY);
  state = null;
  music = null;
  document.getElementById('userPill').style.display = 'none';
  showScreen('connect');
  document.getElementById('btnConnect').disabled = false;
  document.getElementById('btnConnect').textContent = 'Conectar Apple Music';
}

// ── Arrancar ──
document.addEventListener('DOMContentLoaded', init);
