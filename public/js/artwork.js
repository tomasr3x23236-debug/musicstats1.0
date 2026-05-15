/* ─────────────────────────────────────────────────────────
   iTunes Search API — Artwork Fetcher
   Obtiene portadas de artistas y canciones gratis sin auth
   ───────────────────────────────────────────────────────── */
'use strict';

const ArtworkCache = {
  _cache: {},
  _pending: {},

  // Obtener artwork de artista
  async getArtist(name) {
    if (!name) return null;
    const key = 'artist:' + name.toLowerCase();
    if (this._cache[key] !== undefined) return this._cache[key];
    if (this._pending[key]) return this._pending[key];

    this._pending[key] = this._fetchArtist(name).then(url => {
      this._cache[key] = url;
      delete this._pending[key];
      return url;
    });
    return this._pending[key];
  },

  // Obtener artwork de canción/álbum
  async getSong(title, artist) {
    if (!title) return null;
    const key = 'song:' + (title + artist).toLowerCase().replace(/\s/g,'');
    if (this._cache[key] !== undefined) return this._cache[key];
    if (this._pending[key]) return this._pending[key];

    this._pending[key] = this._fetchSong(title, artist).then(url => {
      this._cache[key] = url;
      delete this._pending[key];
      return url;
    });
    return this._pending[key];
  },

  async _fetchArtist(name) {
    try {
      const q = encodeURIComponent(name);
      const res = await fetch(
        `https://itunes.apple.com/search?term=${q}&entity=musicArtist&limit=1&media=music`,
        { signal: AbortSignal.timeout(4000) }
      );
      const data = await res.json();
      const result = data.results?.[0];
      if (!result?.artworkUrl100) return null;
      // Escalar de 100px a 400px
      return result.artworkUrl100.replace('100x100', '400x400');
    } catch { return null; }
  },

  async _fetchSong(title, artist) {
    try {
      const q = encodeURIComponent(title + (artist ? ' ' + artist : ''));
      const res = await fetch(
        `https://itunes.apple.com/search?term=${q}&entity=song&limit=3&media=music`,
        { signal: AbortSignal.timeout(4000) }
      );
      const data = await res.json();
      // Buscar el resultado que más coincida con el artista
      let result = data.results?.[0];
      if (artist && data.results?.length > 1) {
        const artistLower = artist.toLowerCase();
        const match = data.results.find(r =>
          r.artistName?.toLowerCase().includes(artistLower) ||
          artistLower.includes(r.artistName?.toLowerCase())
        );
        if (match) result = match;
      }
      if (!result?.artworkUrl100) return null;
      return result.artworkUrl100.replace('100x100bb', '400x400bb');
    } catch { return null; }
  },

  // Precargar un lote de artistas/canciones en paralelo
  async prefetch(artists = [], songs = []) {
    const promises = [
      ...artists.slice(0, 10).map(a => this.getArtist(a.name)),
      ...songs.slice(0, 10).map(s => this.getSong(s.title || s.name, s.artist)),
    ];
    await Promise.allSettled(promises);
  },

  // Guardar caché en sessionStorage para no refetch en la misma sesión
  persist() {
    try { sessionStorage.setItem('ms_artwork', JSON.stringify(this._cache)); } catch(e) {}
  },
  restore() {
    try {
      const s = sessionStorage.getItem('ms_artwork');
      if (s) this._cache = JSON.parse(s);
    } catch(e) {}
  }
};

// Restaurar caché al cargar
ArtworkCache.restore();
// Guardar caché periódicamente
setInterval(() => ArtworkCache.persist(), 30000);

// Helper: crear elemento img con fallback a emoji
function artworkImg(url, fallback, size, borderRadius) {
  size = size || 40;
  borderRadius = borderRadius || '8px';
  if (url) {
    return `<img src="${url}" alt="artwork"
      style="width:${size}px;height:${size}px;object-fit:cover;border-radius:${borderRadius};display:block;"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
      <span style="display:none;width:${size}px;height:${size}px;border-radius:${borderRadius};background:rgba(252,60,68,0.1);align-items:center;justify-content:center;font-size:${Math.round(size*0.45)}px;flex-shrink:0;">${fallback || '🎵'}</span>`;
  }
  return `<span style="width:${size}px;height:${size}px;border-radius:${borderRadius};background:rgba(252,60,68,0.1);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.45)}px;flex-shrink:0;">${fallback || '🎵'}</span>`;
}

window.ArtworkCache = ArtworkCache;
window.artworkImg = artworkImg;
