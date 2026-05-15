/* ─────────────────────────────────────────────────────────
   MusicStats — Personality Engine + Social Features
   ───────────────────────────────────────────────────────── */
'use strict';

// ══════════════════════════════════════════════════════════
// PERSONALITY ENGINE
// ══════════════════════════════════════════════════════════

const PERSONALITIES = [
  {
    id: 'nocturno',
    name: 'Noctámbulo Melancólico',
    emoji: '🌙',
    color: '#5E5CE6',
    colorRGB: '94,92,230',
    desc: 'Tu música suena mejor a las 2am. Buscas letras que entiendan lo que no puedes decir.',
    tags: ['R&B', 'Soul', 'Indie', 'Alternative'],
    artists: ['The Weeknd', 'Frank Ocean', 'Billie Eilish', 'Lana Del Rey'],
    match: (s) => {
      const genres = getTopGenres(s);
      return genres.some(g => ['R&B','Soul','Indie','Alternative','Dream Pop'].includes(g));
    }
  },
  {
    id: 'fiestero',
    name: 'Rey del Perreo',
    emoji: '🔥',
    color: '#FF9F0A',
    colorRGB: '255,159,10',
    desc: 'Tu playlist es el pre, el during y el after. Cualquier lugar se convierte en pista contigo.',
    tags: ['Reggaeton', 'Latin', 'Trap Latino'],
    artists: ['Bad Bunny', 'J Balvin', 'Daddy Yankee', 'Peso Pluma'],
    match: (s) => {
      const top = getTopArtists(s, 3).map(a => a.name);
      return top.some(n => ['Bad Bunny','J Balvin','Daddy Yankee','Peso Pluma','Rauw Alejandro','Anuel AA'].includes(n))
        || getTopGenres(s).includes('Latin');
    }
  },
  {
    id: 'mainstream',
    name: 'Oído de Oro',
    emoji: '⭐',
    color: '#FFD60A',
    colorRGB: '255,214,10',
    desc: 'Tú no sigues tendencias, las defines. Siempre tienes la canción del momento antes que todos.',
    tags: ['Pop', 'Top 40'],
    artists: ['Taylor Swift', 'Dua Lipa', 'Harry Styles', 'Olivia Rodrigo'],
    match: (s) => {
      const top = getTopArtists(s, 3).map(a => a.name);
      return top.some(n => ['Taylor Swift','Dua Lipa','Harry Styles','Olivia Rodrigo','Ariana Grande','Beyoncé'].includes(n))
        || getTopGenres(s).includes('Pop');
    }
  },
  {
    id: 'trapper',
    name: 'Alma de Trap',
    emoji: '🎤',
    color: '#30D158',
    colorRGB: '48,209,88',
    desc: 'Flows, bars y beats que golpean. Escuchas letras como poesía urbana y así las vives.',
    tags: ['Hip-Hop', 'Rap', 'Trap'],
    artists: ['Drake', 'Kendrick Lamar', 'Travis Scott', 'J. Cole'],
    match: (s) => {
      const top = getTopArtists(s, 3).map(a => a.name);
      return top.some(n => ['Drake','Kendrick Lamar','Travis Scott','J. Cole','21 Savage','Lil Baby'].includes(n))
        || getTopGenres(s).some(g => ['Hip-Hop','Rap','Trap'].includes(g));
    }
  },
  {
    id: 'explorador',
    name: 'Explorador Sonoro',
    emoji: '🌍',
    color: '#64D2FF',
    colorRGB: '100,210,255',
    desc: 'Tu biblioteca es un pasaporte. Mezclas géneros, idiomas y épocas sin ningún remordimiento.',
    tags: ['World', 'Jazz', 'Electronic', 'Indie'],
    artists: ['Rosalía', 'Bad Bunny', 'Doja Cat', 'Tyler the Creator'],
    match: (s) => {
      const artistCount = (s.artists || []).length;
      return artistCount >= 6;
    }
  },
  {
    id: 'intenso',
    name: 'Intensidad Total',
    emoji: '⚡',
    color: '#FC3C44',
    colorRGB: '252,60,68',
    desc: 'Cuando encuentras una canción buena, la escuchas 50 veces seguidas. Sin disculpas.',
    tags: ['Fanático', 'Obsesivo'],
    artists: [],
    match: (s) => {
      const top = [...(s.songs||[])].sort((a,b)=>b.plays-a.plays)[0];
      return top && top.plays > 50;
    }
  },
];

const DEFAULT_PERSONALITY = {
  id: 'descubridor',
  name: 'Alma en Desarrollo',
  emoji: '🎵',
  color: '#BF5AF2',
  colorRGB: '191,90,242',
  desc: 'Tu sonido está tomando forma. Sigues explorando y eso es exactamente lo más cool que puedes hacer.',
  tags: ['En evolución'],
  artists: [],
};

function getTopGenres(state) {
  return (state.genres || []).sort((a,b)=>b.pct-a.pct).map(g=>g.name);
}
function getTopArtists(state, n) {
  return [...(state.artists||[])].sort((a,b)=>b.plays-a.plays).slice(0,n);
}

function computePersonality(state) {
  for (const p of PERSONALITIES) {
    if (p.match(state)) return p;
  }
  return DEFAULT_PERSONALITY;
}

// ══════════════════════════════════════════════════════════
// SOCIAL / BATTLE ENGINE
// ══════════════════════════════════════════════════════════

const SOCIAL_KEY = 'ms_social';

function getSocialState() {
  try { const s = localStorage.getItem(SOCIAL_KEY); return s ? JSON.parse(s) : { friends: [], battles: [] }; }
  catch { return { friends: [], battles: [] }; }
}
function saveSocialState(s) {
  try { localStorage.setItem(SOCIAL_KEY, JSON.stringify(s)); } catch(e) {}
}

// Genera un código de perfil público compartible
function generateProfileCode(state) {
  const p = computePersonality(state);
  const topArtist = [...(state.artists||[])].sort((a,b)=>b.plays-a.plays)[0];
  const payload = {
    v: 1,
    name: state.userName || 'Usuario',
    mins: state.totalMins || 0,
    plays: state.totalPlays || 0,
    streak: state.streak || 0,
    personalityId: p.id,
    topArtist: topArtist?.name || '—',
    topArtistPlays: topArtist?.plays || 0,
    ts: Date.now(),
  };
  return btoa(JSON.stringify(payload)).replace(/=/g,'');
}

function decodeProfileCode(code) {
  try {
    const padded = code + '=='.slice((code.length % 4) || 4);
    return JSON.parse(atob(padded));
  } catch { return null; }
}

function computeCompatibility(myState, friendData) {
  let score = 0;
  const myPersonality = computePersonality(myState);

  // Misma personalidad = 30 pts
  if (myPersonality.id === friendData.personalityId) score += 30;

  // Top artist en común
  const myTopArtists = getTopArtists(myState, 5).map(a => a.name);
  if (myTopArtists.includes(friendData.topArtist)) score += 25;

  // Minutos similares (dentro del 50%)
  const myMins = myState.totalMins || 0;
  const friendMins = friendData.mins || 0;
  if (friendMins > 0) {
    const ratio = Math.min(myMins, friendMins) / Math.max(myMins, friendMins);
    score += Math.round(ratio * 20);
  }

  // Racha similar
  const myStreak = myState.streak || 0;
  const friendStreak = friendData.streak || 0;
  if (friendStreak > 0) {
    const sRatio = Math.min(myStreak, friendStreak) / Math.max(myStreak, friendStreak);
    score += Math.round(sRatio * 15);
  }

  // Bonus por ambos muy activos
  if (myMins > 5000 && friendMins > 5000) score += 10;

  return Math.min(score, 100);
}

function battleResult(myState, friendData) {
  const cats = [
    { name: 'Minutos', mine: myState.totalMins||0, theirs: friendData.mins||0, unit: 'min', icon: '⏱' },
    { name: 'Plays', mine: myState.totalPlays||0, theirs: friendData.plays||0, unit: '', icon: '🎵' },
    { name: 'Racha', mine: myState.streak||0, theirs: friendData.streak||0, unit: 'días', icon: '🔥' },
  ];
  let myWins = 0;
  cats.forEach(c => { if (c.mine >= c.theirs) myWins++; });
  return { cats, winner: myWins >= 2 ? 'me' : 'them', myWins, theirWins: 3 - myWins };
}

// Exportar para uso global
window.MusicPersonality = { computePersonality, generateProfileCode, decodeProfileCode, computeCompatibility, battleResult, PERSONALITIES, getSocialState, saveSocialState };
