/* ─────────────────────────────────────────────────────────
   iTunes Search API — Artwork Fetcher v2
   Usa búsqueda por álbum para obtener portadas reales
   ───────────────────────────────────────────────────────── */
'use strict';

const ArtworkCache = {
  _cache: {},
  _pending: {},

  async getArtist(name) {
    if (!name) return null;
    const key = 'a:' + name.toLowerCase().trim();
    if (this._cache[key] !== undefined) return this._cache[key];
    if (this._pending[key]) return this._pending[key];
    this._pending[key] = this._fetchArtist(name).then(url => {
      this._cache[key] = url;
      delete this._pending[key];
      this._save();
      return url;
    });
    return this._pending[key];
  },

  async getSong(title, artist) {
    if (!title) return null;
    const key = 's:' + (title + '|' + (artist||'')).toLowerCase().replace(/\s/g,'');
    if (this._cache[key] !== undefined) return this._cache[key];
    if (this._pending[key]) return this._pending[key];
    this._pending[key] = this._fetchSong(title, artist).then(url => {
      this._cache[key] = url;
      delete this._pending[key];
      this._save();
      return url;
    });
    return this._pending[key];
  },

  // Busca el álbum más popular del artista → portada real
  async _fetchArtist(name) {
    try {
      const q = encodeURIComponent(name);
      // Buscar álbum del artista — esto devuelve la portada real del disco
      const res = await fetch(
        `https://itunes.apple.com/search?term=${q}&entity=album&media=music&limit=5&attribute=artistTerm`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await res.json();
      if (!data.results?.length) return null;

      // Filtrar resultados que coincidan mejor con el artista
      const nameLower = name.toLowerCase();
      const match = data.results.find(r =>
        r.artistName?.toLowerCase().includes(nameLower) ||
        nameLower.includes(r.artistName?.toLowerCase())
      ) || data.results[0];

      const url = match?.artworkUrl100;
      if (!url) return null;
      // Escalar a 500px para mejor calidad
      return url.replace('100x100bb', '500x500bb').replace('100x100', '500x500');
    } catch(e) { return null; }
  },

  // Busca la canción específica → portada del single/álbum
  async _fetchSong(title, artist) {
    try {
      const q = encodeURIComponent(title + (artist ? ' ' + artist : ''));
      const res = await fetch(
        `https://itunes.apple.com/search?term=${q}&entity=song&media=music&limit=5`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await res.json();
      if (!data.results?.length) return null;

      // Priorizar resultado con artista coincidente
      let best = data.results[0];
      if (artist) {
        const al = artist.toLowerCase();
        const match = data.results.find(r =>
          r.artistName?.toLowerCase().includes(al) ||
          al.includes(r.artistName?.toLowerCase())
        );
        if (match) best = match;
      }

      const url = best?.artworkUrl100;
      if (!url) return null;
      return url.replace('100x100bb', '500x500bb').replace('100x100', '500x500');
    } catch(e) { return null; }
  },

  // Precargar en paralelo (máx 8 a la vez para no saturar)
  async prefetch(artists = [], songs = []) {
    const batch = [
      ...artists.slice(0, 8).map(a => this.getArtist(a.name)),
      ...songs.slice(0, 8).map(s => this.getSong(s.title || s.name, s.artist)),
    ];
    await Promise.allSettled(batch);
  },

  _save() {
    try { sessionStorage.setItem('ms_aw2', JSON.stringify(this._cache)); } catch(e) {}
  },
  _load() {
    try { const s = sessionStorage.getItem('ms_aw2'); if (s) this._cache = JSON.parse(s); } catch(e) {}
  }
};

ArtworkCache._load();

// Helper para img con fallback a emoji
function artworkImg(url, fallback, size, radius) {
  size = size || 42; radius = radius || '9px';
  const style = `width:${size}px;height:${size}px;object-fit:cover;border-radius:${radius};display:block;flex-shrink:0;`;
  const fbStyle = `width:${size}px;height:${size}px;border-radius:${radius};background:rgba(252,60,68,0.1);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.42)}px;flex-shrink:0;`;
  if (url) {
    return `<img src="${url}" alt="" style="${style}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span style="${fbStyle};display:none;">${fallback||'🎵'}</span>`;
  }
  return `<span style="${fbStyle}">${fallback||'🎵'}</span>`;
}

// Helper para canvas — dibuja imagen recortada con border-radius
async function canvasArtwork(ctx, url, x, y, w, h, r) {
  if (!url) return false;
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
      ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r);
      ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h);
      ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r);
      ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, x, y, w, h);
      ctx.restore();
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

window.ArtworkCache = ArtworkCache;
window.artworkImg = artworkImg;
window.canvasArtwork = canvasArtwork;
