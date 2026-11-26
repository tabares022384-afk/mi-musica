// Mi Música Móvil — lee los datos que vienen DENTRO de la canción (MP3: ID3v2 / ID3v1; M4A: átomos MP4).
// Solo lee el comienzo del archivo; no carga la canción completa. Nunca escribe en el archivo.
(function () {
  const CAMPOS_ID3 = { TIT2: 'titulo', TPE1: 'artista', TALB: 'album', TCON: 'genero', TDRC: 'anio', TYER: 'anio',
                       TT2: 'titulo', TP1: 'artista', TAL: 'album', TCO: 'genero', TYE: 'anio' };
  const CAMPOS_MP4 = { '©nam': 'titulo', '©ART': 'artista', '©alb': 'album', '©gen': 'genero', '©day': 'anio' };
  const leer = (f, a, b) => f.slice(a, b).arrayBuffer().then(x => new Uint8Array(x));

  function texto(b, cod) {
    try {
      if (cod === 0) return new TextDecoder('latin1').decode(b);
      if (cod === 1) return new TextDecoder('utf-16').decode(b);
      if (cod === 2) return new TextDecoder('utf-16be').decode(b);
      return new TextDecoder('utf-8').decode(b);
    } catch (e) { return ''; }
  }
  const limpiar = s => (s || '').replace(/\u0000+/g, ' ').replace(/﻿/g, '').trim();
  const genero = g => { const m = /^\((\d+)\)(.*)$/.exec(g); return m ? (m[2] || '').trim() : g; };

  // Lee el ID3v2 cuadro por cuadro: solo baja los cuadros de texto y SALTA la carátula (que puede pesar varios MB).
  async function id3(f) {
    const h = await leer(f, 0, 10);
    if (h[0] !== 73 || h[1] !== 68 || h[2] !== 51) return null;
    const ver = h[3], tam = (h[6] << 21) | (h[7] << 14) | (h[8] << 7) | h[9], fin = 10 + tam;
    const corto = ver === 2, cab = corto ? 6 : 10;
    const out = {};
    let pos = 10;
    if (h[5] & 0x40 && ver >= 3) {
      const e = await leer(f, 10, 14);
      pos += ver === 4 ? ((e[0] << 21) | (e[1] << 14) | (e[2] << 7) | e[3]) : (4 + ((e[0] << 24) | (e[1] << 16) | (e[2] << 8) | e[3]));
    }
    // Ventana de lectura: se piden 64 KB a la vez; si un cuadro no interesa, se salta sin leerlo
    let vIni = 0, v = new Uint8Array(0);
    const asegurar = async (a, n) => { if (a < vIni || a + n > vIni + v.length) { vIni = a; v = await leer(f, a, Math.min(fin, a + Math.max(n, 65536))); } };
    let vueltas = 0;
    while (pos + cab <= fin && vueltas++ < 400) {
      await asegurar(pos, cab);
      const b = v, i = pos - vIni;
      if (i + cab > b.length) break;
      const id = String.fromCharCode(...b.slice(i, i + (corto ? 3 : 4)));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      let n;
      if (corto) n = (b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5];
      else if (ver === 4) n = (b[i + 4] << 21) | (b[i + 5] << 14) | (b[i + 6] << 7) | b[i + 7];
      else n = ((b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7]) >>> 0;
      if (n <= 0 || pos + cab + n > fin) break;
      const campo = CAMPOS_ID3[id];
      if (campo && !out[campo] && n < 65536) {
        await asegurar(pos + cab, n);
        const j = pos + cab - vIni;
        out[campo] = limpiar(texto(v.subarray(j + 1, j + n), v[j]));
      }
      pos += cab + n;
      if (out.titulo && out.artista && out.album && out.genero && out.anio) break;
    }
    if (out.genero) out.genero = genero(out.genero);
    if (out.anio) out.anio = out.anio.slice(0, 4);
    return out;
  }

  async function id3v1(f) {
    if (f.size < 128) return null;
    const b = await leer(f, f.size - 128, f.size);
    if (b[0] !== 84 || b[1] !== 65 || b[2] !== 71) return null;
    const t = (a, z) => limpiar(new TextDecoder('latin1').decode(b.subarray(a, z)));
    return { titulo: t(3, 33), artista: t(33, 63), album: t(63, 93), anio: t(93, 97) };
  }

  async function mp4(f) {
    // Busca moov → udta → meta → ilst. El moov puede estar al final: se recorren los átomos de primer nivel.
    let pos = 0, moov = null;
    while (pos + 8 <= f.size) {
      const h = await leer(f, pos, pos + 16);
      const dv = new DataView(h.buffer);
      let n = dv.getUint32(0); const tipo = String.fromCharCode(h[4], h[5], h[6], h[7]);
      if (n === 1) n = Number(dv.getBigUint64(8)); else if (n === 0) n = f.size - pos;
      if (n < 8) return null;
      if (tipo === 'moov') { moov = await leer(f, pos, pos + Math.min(n, 8 * 1024 * 1024)); break; }
      pos += n;
    }
    if (!moov) return null;
    const out = {};
    const dv = new DataView(moov.buffer);
    const recorrer = (a, z) => {
      let i = a;
      while (i + 8 <= z) {
        const n = dv.getUint32(i); const t = String.fromCharCode(moov[i + 4], moov[i + 5], moov[i + 6], moov[i + 7]);
        if (n < 8 || i + n > z) break;
        if (t === 'moov' || t === 'udta' || t === 'ilst') recorrer(i + 8, i + n);
        else if (t === 'meta') recorrer(i + 12, i + n);
        else if (CAMPOS_MP4[t] || t === 'gnre') {
          const d = i + 8;
          if (dv.getUint32(d) > 16 && String.fromCharCode(moov[d + 4], moov[d + 5], moov[d + 6], moov[d + 7]) === 'data') {
            const len = dv.getUint32(d);
            if (t === 'gnre') { if (!out.genero) out.genero = GEN1[dv.getUint16(d + 16) - 1] || ''; }
            else out[CAMPOS_MP4[t]] = limpiar(new TextDecoder('utf-8').decode(moov.subarray(d + 16, d + len)));
          }
        }
        i += n;
      }
    };
    recorrer(0, moov.length);
    if (out.anio) out.anio = out.anio.slice(0, 4);
    return out;
  }
  const GEN1 = ['Blues','Classic Rock','Country','Dance','Disco','Funk','Grunge','Hip-Hop','Jazz','Metal','New Age','Oldies','Other','Pop','R&B','Rap','Reggae','Rock'];

  // «Artista - Título.mp3» → datos desde el nombre (igual que Mi Música del PC)
  function desdeNombre(nombre) {
    const base = nombre.replace(/\.[^.]+$/, '').replace(/_[A-Za-z0-9_-]{11}$/, '').replace(/\s+/g, ' ').trim();
    const p = base.split(' - ');
    if (p.length >= 2) return { artista: p[0].trim(), titulo: p.slice(1).join(' - ').trim() };
    return { artista: '', titulo: base };
  }

  async function leerDatos(f) {
    let d = null;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    try {
      if (ext === 'm4a' || ext === 'mp4' || ext === 'aac') d = await mp4(f);
      else d = (await id3(f)) || (await id3v1(f));
    } catch (e) { d = null; }
    const n = desdeNombre(f.name);
    d = d || {};
    return { titulo: d.titulo || n.titulo, artista: d.artista || n.artista, album: d.album || '', genero: d.genero || '', anio: d.anio || '' };
  }

  window.Etiquetas = { leerDatos, desdeNombre };
})();
