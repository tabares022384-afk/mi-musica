// Mi Música Móvil — lee los datos que vienen DENTRO de la canción. Nunca escribe en el archivo.
// MP3: ID3v2 (2.2, 2.3, 2.4, con o sin «unsynchronisation») + ID3v1 (completa lo que falte, también el género por número).
// M4A/AAC/MP4: átomos iTunes. FLAC: Vorbis comments. OGG/OGA/Opus: Vorbis comments / OpusTags.
// Género por número («(13)», «13», byte de ID3v1, «gnre» de M4A) → nombre (13 = Pop), como hacen las demás apps.
(function () {
  const CAMPOS_ID3 = { TIT2: 'titulo', TPE1: 'artista', TPE2: 'artista2', TALB: 'album', TCON: 'genero', TDRC: 'anio', TYER: 'anio', TDOR: 'anio2', TORY: 'anio2',
                       TT2: 'titulo', TP1: 'artista', TP2: 'artista2', TAL: 'album', TCO: 'genero', TYE: 'anio' };
  const CAMPOS_MP4 = { '©nam': 'titulo', '©ART': 'artista', 'aART': 'artista2', '©alb': 'album', '©gen': 'genero', '©day': 'anio' };
  const CAMPOS_VORBIS = { TITLE: 'titulo', ARTIST: 'artista', ALBUMARTIST: 'artista2', 'ALBUM ARTIST': 'artista2', ALBUM: 'album', GENRE: 'genero', DATE: 'anio', YEAR: 'anio', ORIGINALDATE: 'anio2' };
  // Lista estándar de géneros por número (ID3v1 + Winamp)
  const GEN = ['Blues','Classic Rock','Country','Dance','Disco','Funk','Grunge','Hip-Hop','Jazz','Metal','New Age','Oldies','Other','Pop','R&B','Rap','Reggae','Rock',
    'Techno','Industrial','Alternative','Ska','Death Metal','Pranks','Soundtrack','Euro-Techno','Ambient','Trip-Hop','Vocal','Jazz+Funk','Fusion','Trance',
    'Classical','Instrumental','Acid','House','Game','Sound Clip','Gospel','Noise','Alternative Rock','Bass','Soul','Punk','Space','Meditative','Instrumental Pop',
    'Instrumental Rock','Ethnic','Gothic','Darkwave','Techno-Industrial','Electronic','Pop-Folk','Eurodance','Dream','Southern Rock','Comedy','Cult','Gangsta',
    'Top 40','Christian Rap','Pop/Funk','Jungle','Native American','Cabaret','New Wave','Psychedelic','Rave','Showtunes','Trailer','Lo-Fi','Tribal','Acid Punk',
    'Acid Jazz','Polka','Retro','Musical','Rock & Roll','Hard Rock','Folk','Folk-Rock','National Folk','Swing','Fast Fusion','Bebop','Latin','Revival','Celtic',
    'Bluegrass','Avantgarde','Gothic Rock','Progressive Rock','Psychedelic Rock','Symphonic Rock','Slow Rock','Big Band','Chorus','Easy Listening','Acoustic',
    'Humour','Speech','Chanson','Opera','Chamber Music','Sonata','Symphony','Booty Bass','Primus','Porn Groove','Satire','Slow Jam','Club','Tango','Samba',
    'Folklore','Ballad','Power Ballad','Rhythmic Soul','Freestyle','Duet','Punk Rock','Drum Solo','A Cappella','Euro-House','Dance Hall','Goa','Drum & Bass',
    'Club-House','Hardcore','Terror','Indie','Britpop','Punk','Polsk Punk','Beat','Christian Gangsta Rap','Heavy Metal','Black Metal','Crossover',
    'Contemporary Christian','Christian Rock','Merengue','Salsa','Thrash Metal','Anime','J-Pop','Synthpop','Abstract','Art Rock','Baroque','Bhangra',
    'Big Beat','Breakbeat','Chillout','Downtempo','Dub','EBM','Eclectic','Electro','Electroclash','Emo','Experimental','Garage','Global','IDM','Illbient',
    'Industro-Goth','Jam Band','Krautrock','Leftfield','Lounge','Math Rock','New Romantic','Nu-Breakz','Post-Punk','Post-Rock','Psytrance','Shoegaze',
    'Space Rock','Trop Rock','World Music','Neoclassical','Audiobook','Audio Theatre','Neue Deutsche Welle','Podcast','Indie Rock','G-Funk','Dubstep',
    'Garage Rock','Psybient'];
  const leer = (f, a, b) => f.slice(a, b).arrayBuffer().then(x => new Uint8Array(x));
  const ascii = (b, a, n) => String.fromCharCode(...b.subarray(a, a + n));

  function texto(b, cod) {
    try {
      if (cod === 0) return new TextDecoder('latin1').decode(b);
      if (cod === 1) return new TextDecoder('utf-16').decode(b);
      if (cod === 2) return new TextDecoder('utf-16be').decode(b);
      return new TextDecoder('utf-8').decode(b);
    } catch (e) { return ''; }
  }
  const limpiar = s => (s || '').replace(/﻿/g, '').replace(/\u0000+/g, ' ').replace(/\s+/g, ' ').trim();
  // «(13)», «13», «(13)Pop», «Pop\0Rock», «RX», «CR» → nombre del género
  function normGenero(g) {
    g = (g || '').split('\u0000').map(x => x.trim()).filter(Boolean)[0] || '';
    let m = /^\((\d+)\)\s*(.*)$/.exec(g);
    if (m) return limpiar(m[2]) || GEN[+m[1]] || '';
    if (/^\d{1,3}$/.test(g)) return GEN[+g] || '';
    if (g === 'RX' || g === '(RX)') return 'Remix';
    if (g === 'CR' || g === '(CR)') return 'Cover';
    return limpiar(g);
  }
  const anio = s => ((s || '').match(/\d{4}/) || [''])[0];
  // Quita la «unsynchronisation» (FF 00 → FF)
  function desincronizar(b) {
    const out = new Uint8Array(b.length); let j = 0;
    for (let i = 0; i < b.length; i++) { out[j++] = b[i]; if (b[i] === 0xFF && b[i + 1] === 0x00) i++; }
    return out.subarray(0, j);
  }

  // ---------------- MP3: ID3v2 (cuadro por cuadro, salta la carátula)
  async function id3(f) {
    const h = await leer(f, 0, 10);
    if (h[0] !== 73 || h[1] !== 68 || h[2] !== 51) return null;
    const ver = h[3], flags = h[5], tam = (h[6] << 21) | (h[7] << 14) | (h[8] << 7) | h[9], fin = 10 + tam;
    const corto = ver === 2, cab = corto ? 6 : 10;
    const out = { _tipo: 'ID3v2.' + ver };
    // v2.2 / v2.3 con «unsynchronisation» en todo el tag: se lee entero (hasta 2 MB) y se arregla antes de leer
    if ((flags & 0x80) && ver < 4) {
      const todo = desincronizar(await leer(f, 10, Math.min(fin, 10 + 2 * 1024 * 1024)));
      leerCuadros(todo, 0, todo.length, ver, corto, cab, out, (flags & 0x40) && ver === 3);
      return terminar(out);
    }
    let pos = 10;
    if (flags & 0x40 && ver >= 3) {
      const e = await leer(f, 10, 14);
      pos += ver === 4 ? ((e[0] << 21) | (e[1] << 14) | (e[2] << 7) | e[3]) : (4 + ((e[0] << 24) | (e[1] << 16) | (e[2] << 8) | e[3]));
    }
    let vIni = 0, v = new Uint8Array(0);
    const asegurar = async (a, n) => { if (a < vIni || a + n > vIni + v.length) { vIni = a; v = await leer(f, a, Math.min(fin, a + Math.max(n, 65536))); } };
    let vueltas = 0;
    while (pos + cab <= fin && vueltas++ < 500) {
      await asegurar(pos, cab);
      const b = v, i = pos - vIni;
      if (i + cab > b.length) break;
      const id = ascii(b, i, corto ? 3 : 4);
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      let n;
      if (corto) n = (b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5];
      else if (ver === 4) n = (b[i + 4] << 21) | (b[i + 5] << 14) | (b[i + 6] << 7) | b[i + 7];
      else n = ((b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7]) >>> 0;
      if (n <= 0 || pos + cab + n > fin) break;
      const campo = CAMPOS_ID3[id];
      if (campo && !out[campo] && n < 65536) {
        await asegurar(pos + cab, n);
        const j = pos + cab - vIni;
        let datos = v.subarray(j, j + n);
        if (ver === 4 && !corto) {
          const fmt = b[i + 9];
          if (fmt & 0x01) datos = datos.subarray(4);            // trae la longitud original delante
          if (fmt & 0x02) datos = desincronizar(datos);          // «unsynchronisation» solo de este cuadro
        }
        out[campo] = limpiar(texto(datos.subarray(1), datos[0]));
      }
      pos += cab + n;
      if (out.titulo && out.artista && out.album && out.genero && out.anio) break;
    }
    return terminar(out);
  }
  function leerCuadros(b, a, z, ver, corto, cab, out, conExtendido) {
    let i = a;
    if (conExtendido) i += 4 + ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
    while (i + cab <= z) {
      const id = ascii(b, i, corto ? 3 : 4);
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      const n = corto ? ((b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5]) : (((b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7]) >>> 0);
      if (n <= 0 || i + cab + n > z) break;
      const campo = CAMPOS_ID3[id];
      if (campo && !out[campo]) out[campo] = limpiar(texto(b.subarray(i + cab + 1, i + cab + n), b[i + cab]));
      i += cab + n;
    }
  }
  function terminar(out) {
    if (!out.artista && out.artista2) out.artista = out.artista2;
    if (!out.anio && out.anio2) out.anio = out.anio2;
    if (out.genero) out.genero = normGenero(out.genero);
    if (out.anio) out.anio = anio(out.anio);
    delete out.artista2; delete out.anio2;
    return out;
  }

  // ---------------- MP3: ID3v1 (últimos 128 bytes), también el género por número
  async function id3v1(f) {
    if (f.size < 128) return null;
    const b = await leer(f, f.size - 128, f.size);
    if (b[0] !== 84 || b[1] !== 65 || b[2] !== 71) return null;
    const t = (a, z) => limpiar(new TextDecoder('latin1').decode(b.subarray(a, z)));
    return { titulo: t(3, 33), artista: t(33, 63), album: t(63, 93), anio: anio(t(93, 97)), genero: b[127] < GEN.length ? GEN[b[127]] : '' };
  }

  // ---------------- M4A / AAC / MP4
  async function mp4(f) {
    let pos = 0, moov = null, vueltas = 0;
    while (pos + 8 <= f.size && vueltas++ < 200) {
      const h = await leer(f, pos, pos + 16);
      const dv = new DataView(h.buffer);
      let n = dv.getUint32(0); const tipo = ascii(h, 4, 4);
      if (n === 1) n = Number(dv.getBigUint64(8)); else if (n === 0) n = f.size - pos;
      if (n < 8) return null;
      if (tipo === 'moov') { moov = await leer(f, pos, pos + Math.min(n, 8 * 1024 * 1024)); break; }
      pos += n;
    }
    if (!moov) return null;
    const out = { _tipo: 'MP4' };
    const dv = new DataView(moov.buffer);
    const recorrer = (a, z) => {
      let i = a;
      while (i + 8 <= z) {
        const n = dv.getUint32(i); const t = ascii(moov, i + 4, 4);
        if (n < 8 || i + n > z) break;
        if (t === 'moov' || t === 'udta' || t === 'ilst') recorrer(i + 8, i + n);
        else if (t === 'meta') recorrer(i + 12, i + n);
        else if (CAMPOS_MP4[t] || t === 'gnre') {
          const d = i + 8;
          if (d + 16 <= i + n && ascii(moov, d + 4, 4) === 'data') {
            const len = dv.getUint32(d);
            if (t === 'gnre') { if (!out.genero) out.genero = GEN[dv.getUint16(d + 16) - 1] || ''; }
            else if (!out[CAMPOS_MP4[t]]) out[CAMPOS_MP4[t]] = limpiar(new TextDecoder('utf-8').decode(moov.subarray(d + 16, d + len)));
          }
        }
        i += n;
      }
    };
    recorrer(0, moov.length);
    return terminar(out);
  }

  // ---------------- Vorbis comments (FLAC y OGG/Opus)
  function vorbis(b, i, out) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (i + 8 > b.length) return out;
    const vend = dv.getUint32(i, true); i += 4 + vend;
    if (i + 4 > b.length) return out;
    const n = dv.getUint32(i, true); i += 4;
    for (let k = 0; k < n && k < 300 && i + 4 <= b.length; k++) {
      const len = dv.getUint32(i, true); i += 4;
      if (i + len > b.length) break;
      const s = new TextDecoder('utf-8').decode(b.subarray(i, i + len)); i += len;
      const p = s.indexOf('='); if (p < 1) continue;
      const campo = CAMPOS_VORBIS[s.slice(0, p).toUpperCase()];
      if (campo && !out[campo]) out[campo] = limpiar(s.slice(p + 1));
    }
    return out;
  }
  async function flac(f) {
    const h = await leer(f, 0, 4);
    if (ascii(h, 0, 4) !== 'fLaC') return null;
    let pos = 4;
    for (let k = 0; k < 64 && pos + 4 <= f.size; k++) {
      const c = await leer(f, pos, pos + 4);
      const ultimo = c[0] & 0x80, tipo = c[0] & 0x7F, n = (c[1] << 16) | (c[2] << 8) | c[3];
      if (tipo === 4) return terminar(vorbis(await leer(f, pos + 4, pos + 4 + Math.min(n, 1024 * 1024)), 0, { _tipo: 'FLAC' }));
      pos += 4 + n;                       // la carátula (tipo 6) se salta sin leerla
      if (ultimo) break;
    }
    return { _tipo: 'FLAC' };
  }
  async function ogg(f) {
    const b = await leer(f, 0, Math.min(f.size, 256 * 1024));
    if (ascii(b, 0, 4) !== 'OggS') return null;
    // Se quitan las cabeceras de página («OggS» + segmentos) para unir el paquete de comentarios aunque cruce páginas
    const partes = []; let i = 0;
    while (i + 27 <= b.length && ascii(b, i, 4) === 'OggS') {
      const nseg = b[i + 26]; let tam = 0;
      for (let s = 0; s < nseg; s++) tam += b[i + 27 + s];
      const ini = i + 27 + nseg; partes.push(b.subarray(ini, Math.min(b.length, ini + tam))); i = ini + tam;
      if (partes.length > 40) break;
    }
    const total = partes.reduce((s, p) => s + p.length, 0), u = new Uint8Array(total); let o = 0;
    for (const p of partes) { u.set(p, o); o += p.length; }
    const buscar = m => { for (let k = 0; k + m.length <= u.length; k++) { let ok = true; for (let q = 0; q < m.length; q++) if (u[k + q] !== m.charCodeAt(q)) { ok = false; break; } if (ok) return k; } return -1; };
    let k = buscar('OpusTags'); if (k >= 0) return terminar(vorbis(u, k + 8, { _tipo: 'Opus' }));
    k = buscar('\x03vorbis'); if (k >= 0) return terminar(vorbis(u, k + 7, { _tipo: 'OGG' }));
    return { _tipo: 'OGG' };
  }

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
      if (['m4a', 'mp4', 'aac', 'm4b'].includes(ext)) d = await mp4(f);
      else if (ext === 'flac') d = await flac(f);
      else if (['ogg', 'oga', 'opus'].includes(ext)) d = await ogg(f);
      if (!d) {
        // MP3 (o un archivo con otra extensión pero con ID3): ID3v2 y, para lo que falte, ID3v1
        d = (await id3(f)) || {};
        if (!d.titulo || !d.artista || !d.album || !d.genero || !d.anio) {
          const v1 = await id3v1(f);
          if (v1) { for (const k of ['titulo', 'artista', 'album', 'genero', 'anio']) if (!d[k] && v1[k]) d[k] = v1[k]; d._tipo = (d._tipo ? d._tipo + '+' : '') + 'ID3v1'; }
        }
      }
    } catch (e) { d = d || {}; d._error = e.message; }
    const n = desdeNombre(f.name);
    d = d || {};
    return { titulo: d.titulo || n.titulo, artista: d.artista || n.artista, album: d.album || '', genero: d.genero || '', anio: d.anio || '',
      _tipo: d._tipo || 'sin datos internos', _error: d._error };
  }

  window.Etiquetas = { leerDatos, desdeNombre, normGenero };
})();
