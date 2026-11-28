// Mi Música Móvil — app SOLO para el teléfono (versión 2, 25-11-2026).
// Reglas de Edwin:
//  • Categoría = Álbum (PROPIAS, DESPECHO, ANIVERSARIO…). La app nunca escribe dentro de los archivos de música:
//    lo que Edwin corrige (título, artista, categoría, género, año) queda solo en la app.
//  • Estrellas 0-6 y ❤ favorita = ESTATUS (🥉 Bronce, 🥈 Plata, 🥇 Oro, 💎 Diamante).
//  • Escucha = terminó, o sonó 30 s o más, o la mitad de la canción; si no, es «salto».
//  • TODO cambio queda en el HISTORIAL: estatus, datos, canciones agregadas/quitadas, actualizaciones de la biblioteca,
//    listas y respaldos. Lo que se puede devolver tiene «Deshacer».
//  • Respaldo completo (estatus, ❤, escuchas, listas inteligentes, historial, correcciones) para no perder nada.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const vista = $('#vista'), audio = $('#audio');
  const S = {
    canciones: new Map(), listas: new Map(), escLocal: new Map(), cambios: [], memoria: new Map(),
    cola: [], pos: -1, fuente: { tipo: 'todo', nombre: 'Toda mi música' }, azar: true, repetir: 'todo',
    actual: null, url: null, segundos: 0, ultimoT: 0,
    filtros: { q: '', categorias: [], generos: [], anios: [], artistas: [], carpetas: [], estatus: [], orden: 'titulo' }, limite: 150,
    config: { noRepetirArtista: true, pantallaEncendida: true, diasRespaldo: 7, autoEscaneo: true }, wake: null, histFiltro: 'todo',
    carpeta: null, permiso: false, escaneando: false, ultimoEscaneo: '',
  };
  // APP INSTALADA (APK): la música sale del catálogo de Android y suena en segundo plano con el servicio propio
  const NATIVO = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const Bib = NATIVO ? (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin('Biblioteca') : window.Capacitor.Plugins.Biblioteca) : null;
  const puedeCarpeta = () => !NATIVO && typeof window.showDirectoryPicker === 'function';
  const EXT_AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav|weba|m4b)$/i;
  const EXT_NO_REPRODUCE = /\.(wma|amr|ape|aiff?|mid|midi|ra|ac3|dsf|mka)$/i;   // audio que el teléfono no puede tocar en la app
  const ESTATUS = [
    { min: 7, nombre: '💎 Diamante', clave: 'diamante' },
    { min: 5, nombre: '🥇 Oro', clave: 'oro' },
    { min: 3, nombre: '🥈 Plata', clave: 'plata' },
    { min: 1, nombre: '🥉 Bronce', clave: 'bronce' },
    { min: 0, nombre: 'Sin estatus', clave: 'sin' },
  ];
  const puntos = c => (c.calificacion || 0) + (c.favorita ? 1 : 0);
  const estatusDe = c => ESTATUS.find(e => puntos(c) >= e.min);
  const CAMPOS_DATOS = [['titulo', 'Título'], ['artista', 'Artista'], ['album', 'Categoría'], ['genero', 'Género'], ['anio', 'Año']];
  const NOMBRE_CAMPO = { favorita: '❤ Favorita', calificacion: '★ Estrellas', titulo: '✏️ Título', artista: '✏️ Artista', album: '✏️ Categoría', genero: '✏️ Género', anio: '✏️ Año',
    agregadas: '➕ Canciones agregadas', actualizacion: '🔄 Biblioteca actualizada', quitada: '🗑 Quitada de la app', quitadas: '🗑 Quitadas de la app',
    escaneo: '🔍 Escaneo de la carpeta', carpeta: '📁 Carpeta conectada',
    lista_crear: '🗂️ Lista creada', lista_inteligente: '⚡ Lista inteligente creada', lista_reglas: '⚡ Reglas cambiadas', lista_agregar: '➕ A lista', lista_sacar: '➖ De lista',
    lista_nombre: '✏️ Lista renombrada', lista_borrada: '🗑 Lista borrada', respaldo_guardado: '💾 Respaldo guardado', respaldo_cargado: '📂 Respaldo restaurado' };

  // ---------------------------------------------------------------- utilidades
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16) + Math.random().toString(16).slice(2)).replace(/-/g, '');
  const ahora = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  const mmss = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const miles = n => Number(n || 0).toLocaleString('es-CO');
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const claveArchivo = (archivo, tamano) => `${(archivo || '').toLowerCase()}|${tamano || 0}`;
  const fechaCorta = f => f ? f.slice(8, 10) + '/' + f.slice(5, 7) + '/' + f.slice(0, 4) + ' ' + f.slice(11, 16) : '';
  const diasDesde = f => f ? (Date.now() - new Date(f.replace(' ', 'T')).getTime()) / 864e5 : Infinity;
  function color(t) { let h = 0; for (const ch of t || '?') h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 45% 38%)`; }
  const iniciales = c => ((c.titulo || c.archivo || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '♪').toUpperCase();
  const categoriaDe = c => (c.album || '').trim();
  const anioDe = c => ((c.anio || '').match(/\d{4}/) || [''])[0];
  const esCategoria = a => a && a === a.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(a);
  function toast(t, error) { const e = $('#toast'); e.textContent = t; e.className = 'ver' + (error ? ' error' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => e.className = '', 2600); }
  // Ventanas: la flecha ATRÁS de Android cierra la ventana abierta (y no actúa sobre la pantalla de atrás).
  // Al abrir una ventana se agrega un paso al historial; atrás lo consume y solo cierra la ventana.
  let modalEnHistorial = false, cerrandoPorBoton = false;
  function modal(html) {
    $('#modalHoja').innerHTML = html; $('#modal').classList.add('ver'); $('#modalHoja').scrollTop = 0;
    if (!modalEnHistorial) { try { history.pushState({ mmVentana: 1 }, ''); modalEnHistorial = true; } catch (e) {} }
  }
  function cerrarModal() {
    $('#modal').classList.remove('ver');
    if (!modalEnHistorial) return;
    modalEnHistorial = false;
    const h = location.hash;
    // Se quita el paso de la ventana, salvo que el botón haya llevado a otra pantalla (eso no se deshace)
    setTimeout(() => { if (location.hash === h && history.state && history.state.mmVentana && !modalEnHistorial) { cerrandoPorBoton = true; history.back(); } }, 0);
  }
  window.addEventListener('popstate', () => {
    if (cerrandoPorBoton) { cerrandoPorBoton = false; return; }
    if ($('#modal').classList.contains('ver')) { $('#modal').classList.remove('ver'); modalEnHistorial = false; }
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') cerrarModal(); });

  const total = c => S.escLocal.get(c.id) || { esc: 0, sal: 0, mes: 0, ultima: '' };

  // ---------------------------------------------------------------- carga inicial
  async function cargar() {
    const [cs, ls, es, cm, me] = await Promise.all([DB.todos('canciones'), DB.todos('listas'), DB.todos('escuchas'), DB.todos('cambios'), DB.todos('memoria')]);
    S.canciones = new Map(cs.map(c => [c.id, c]));
    if (typeof cambioDatos === 'function') cambioDatos();
    S.listas = new Map(ls.map(l => [l.uid, l]));
    S.memoria = new Map(me.map(m => [m.id, m]));
    S.cambios = cm;
    S.escLocal = new Map();
    const mes = ahora().slice(0, 7);
    for (const e of es) sumarEscucha(e, mes);
    S.escuchas = es;   // todas las escuchas con su fecha: de aquí sale «Mi resumen»
    S.config = Object.assign(S.config, await DB.leerConfig('ajustes', {}));
    S.ultimoRespaldo = await DB.leerConfig('ultimoRespaldo', '');
    S.ultimoEscaneo = await DB.leerConfig('ultimoEscaneo', '');
    // VARIAS CARPETAS: S.raices = [{id:'r0', h}, {id:'r1', h}…]. La primera (r0) es la que había antes.
    S.raices = await DB.leerConfig('raices', null);
    if (!S.raices) { const h = await DB.leerConfig('carpeta', null); S.raices = h ? [{ id: 'r0', h }] : []; }
    S.carpeta = S.raices.length ? S.raices[0].h : null;   // «hay carpeta conectada»
    S.permiso = false;
    if (S.raices.length) {
      S.permiso = true;
      for (const r of S.raices) { let ok = false; try { ok = (await r.h.queryPermission({ mode: 'read' })) === 'granted'; } catch (e) {} r.ok = ok; if (!ok) S.permiso = false; }
    }
    S.informe = await DB.leerConfig('informeEscaneo', null);
    const est = await DB.leerConfig('estado', null);
    if (est) { S.cola = (est.cola || []).filter(id => S.canciones.has(id)); S.pos = Math.min(est.pos ?? -1, S.cola.length - 1); S.fuente = est.fuente || S.fuente; S.azar = est.azar ?? true; S.repetir = est.repetir || 'todo'; S.tiempoGuardado = est.tiempo || 0; }
  }
  function sumarEscucha(e, mes) {
    const v = S.escLocal.get(e.cancionId) || { esc: 0, sal: 0, mes: 0, ultima: '' };
    if (e.clase === 'salto') v.sal++; else { v.esc++; if (e.fecha.startsWith(mes)) v.mes++; }
    if (e.fecha > v.ultima) v.ultima = e.fecha;
    S.escLocal.set(e.cancionId, v);
  }
  function guardarEstado() {
    DB.guardarConfig('estado', { cola: S.cola, pos: S.pos, fuente: S.fuente, azar: S.azar, repetir: S.repetir, tiempo: audio.currentTime || 0 }).catch(() => {});
  }
  setInterval(() => { if (!audio.paused) guardarEstado(); }, 10000);

  // ---------------------------------------------------------------- historial
  async function anotar(o) {
    const c = o.cancion; delete o.cancion;
    const reg = Object.assign({ fecha: ahora(), tipo: 'estatus', cancionId: c ? c.id : null, titulo: c ? (c.titulo || c.archivo) : '', artista: c ? c.artista : '', antes: '', despues: '', deshacible: false, deshecho: false, origen: 'manual' }, o);
    reg.n = await DB.poner('cambios', reg); S.cambios.push(reg);
    return reg;
  }
  // Cambia un dato de una canción y lo deja en el historial (estatus o datos corregidos)
  async function ponerCampo(c, campo, valor, origen) {
    const antes = c[campo] ?? (campo === 'favorita' || campo === 'calificacion' ? 0 : '');
    if (antes === valor) return false;
    c[campo] = valor;
    if (!['favorita', 'calificacion'].includes(campo)) { c.editados = c.editados || {}; c.editados[campo] = valor; }
    await DB.poner('canciones', c);
    cambioDatos();
    if (S.actual && S.actual.id === c.id) sesionMedios(c);   // la tarjeta de notificaciones muestra el nuevo estatus
    await anotar({ cancion: c, tipo: ['favorita', 'calificacion'].includes(campo) ? 'estatus' : 'datos', campo, antes, despues: valor, deshacible: origen !== 'deshacer', origen: origen || 'manual' });
    return true;
  }
  const ponerFavorita = (c, v, o) => ponerCampo(c, 'favorita', v ? 1 : 0, o);
  const ponerEstrellas = (c, v, o) => ponerCampo(c, 'calificacion', v, o);

  async function deshacer(n) {
    const r = S.cambios.find(x => x.n === n);
    if (!r || r.deshecho || !r.deshacible) return;
    const c = S.canciones.get(r.cancionId);
    if ((r.tipo === 'estatus' || r.tipo === 'datos')) { if (!c) return toast('Esa canción ya no está en la app', true); await ponerCampo(c, r.campo, r.antes, 'deshacer'); }
    else if (r.campo === 'lista_agregar') await sacarDeLista(r.lista, r.cancionId, 'deshacer');
    else if (r.campo === 'lista_sacar') await agregarALista(r.lista, r.cancionId, 'deshacer');
    else if (r.campo === 'lista_crear' || r.campo === 'lista_inteligente') { const l = S.listas.get(r.lista); if (l) { await DB.borrar('listas', l.uid); S.listas.delete(l.uid); await anotar({ tipo: 'lista', campo: 'lista_borrada', antes: l.nombre, origen: 'deshacer', lista: l.uid }); } }
    else if (r.campo === 'lista_reglas') { const l = S.listas.get(r.lista); if (l) { l.reglas = JSON.parse(r.reglasAntes); await DB.poner('listas', l); await anotar({ tipo: 'lista', campo: 'lista_reglas', antes: r.despues, despues: r.antes, origen: 'deshacer', lista: l.uid }); } }
    else if (r.campo === 'lista_nombre') { const l = S.listas.get(r.lista); if (l) { l.nombre = r.antes; await DB.poner('listas', l); await anotar({ tipo: 'lista', campo: 'lista_nombre', antes: r.despues, despues: r.antes, origen: 'deshacer', lista: l.uid }); } }
    r.deshecho = true; r.fechaDeshecho = ahora(); await DB.poner('cambios', r);
    toast('↩ Cambio deshecho'); pintar();
  }

  // ---------------------------------------------------------------- reproductor
  // RAPIDEZ: la app recuerda dónde está cada canción y cada carpeta (S._fh / S._dirs) para no buscarlas cada vez.
  S._fh = new Map(); S._dirs = new Map();
  // Clave única de una canción dentro de TODAS las carpetas conectadas (la primera carpeta conserva la clave de antes)
  const claveRuta = (raiz, ruta) => (raiz && raiz !== 'r0' ? raiz + '|' : '') + (ruta || '').toLowerCase();
  const raizDe = id => (S.raices.find(r => r.id === (id || 'r0')) || {}).h;
  async function carpetaDe(raiz, partes) {
    let d = raizDe(raiz), camino = '';
    if (!d) throw new Error('Esa carpeta ya no está conectada');
    for (const p of partes) {
      camino = camino ? camino + '/' + p : p;
      const k = claveRuta(raiz, camino);
      let h = S._dirs.get(k);
      if (!h) { h = await d.getDirectoryHandle(p); S._dirs.set(k, h); }
      d = h;
    }
    return d;
  }
  async function archivoDe(c) {
    if (c.origen === 'carpeta') {
      if (!S.carpeta) throw new Error('No hay carpeta de música conectada');
      if (!S.permiso && !(await pedirPermiso())) throw new Error('Falta el permiso para leer tu carpeta de música');
      const k = claveRuta(c.raiz, c.ruta), guardado = S._fh.get(k);
      if (guardado) { try { return await guardado.getFile(); } catch (e) { S._fh.delete(k); } }
      const partes = c.ruta.split('/');
      try {
        const fh = await (await carpetaDe(c.raiz, partes.slice(0, -1))).getFileHandle(partes[partes.length - 1]);
        S._fh.set(k, fh);
        return await fh.getFile();
      } catch (e) { S._dirs.clear(); throw new Error('Esa canción ya no está en el teléfono. Toca 🔍 Escanear.'); }
    }
    const a = await DB.uno('archivos', c.id);
    if (!a) throw new Error('La canción ya no está guardada en la app');
    return a.blob;
  }
  function cerrarEscucha(completa) {
    const c = S.actual;
    if (!c) return;
    const seg = S.segundos, dur = audio.duration || c.duracion || 0;
    S.segundos = 0;
    if (seg < 1 && !completa) return;
    const clase = (completa || seg >= 30 || (dur && seg >= dur * 0.5)) ? 'escucha' : 'salto';
    const e = { uuid: uid(), cancionId: c.id, fecha: ahora(), segundos: Math.round(seg * 10) / 10, clase };
    DB.poner('escuchas', e);
    sumarEscucha(e, e.fecha.slice(0, 7));
    if (S.escuchas) S.escuchas.push(e);
    cambioDatos();
  }
  // Deja lista la siguiente canción mientras suena la actual: el cambio es inmediato
  function prepararSiguiente() {
    const id = S.cola[S.pos + 1], c = id && S.canciones.get(id);
    if (!c || c.origen === 'android' || (S._pre && S._pre.id === id)) return;
    archivoDe(c).then(f => { S._pre = { id, f }; }).catch(() => {});
  }
  async function sonar(pos, desde) {
    if (pos < 0 || pos >= S.cola.length) return;
    cerrarEscucha(false);
    S.pos = pos;
    const c = S.canciones.get(S.cola[pos]);
    if (!c) return siguiente();
    S.actual = c;
    refrescarSonando();   // la pantalla cambia al instante, antes de cargar el archivo
    try {
      if (c.origen === 'android') {
        // App instalada: el archivo se toca directo desde el teléfono (sin copiarlo ni abrirlo antes)
        if (S.url) { URL.revokeObjectURL(S.url); S.url = null; }
        audio.src = window.Capacitor.convertFileSrc(c.ruta);
      } else {
        const f = (S._pre && S._pre.id === c.id) ? S._pre.f : await archivoDe(c);
        S._pre = null;
        if (S.url) URL.revokeObjectURL(S.url);
        S.url = URL.createObjectURL(f);
        audio.src = S.url;
      }
      if (desde) audio.currentTime = desde;
      S.ultimoT = desde || 0;
      await audio.play().catch(() => {});
    } catch (e) { toast('⚠️ ' + e.message, true); return setTimeout(() => siguiente(true), 800); }
    sesionMedios(c); guardarEstado();
    setTimeout(prepararSiguiente, 1500);
  }
  // Al cambiar de canción NO se redibuja toda la pantalla: solo «Sonando» (si está abierta), la mini barra y la canción marcada
  function refrescarSonando() {
    const ruta = (location.hash || '#/sonando').split('/')[1] || 'sonando';
    if (ruta === 'sonando') { pintar(); return; }
    pintarMini();
    document.querySelectorAll('.cancion.sonando').forEach(e => e.classList.remove('sonando'));
    if (S.actual) document.querySelectorAll('.cancion[data-id]').forEach(e => { if (e.dataset.id === S.actual.id) e.classList.add('sonando'); });
  }
  function siguiente(auto) {
    if (!S.cola.length) return;
    if (auto && S.repetir === 'una') return sonar(S.pos);
    let p = S.pos + 1;
    if (p >= S.cola.length) { if (S.repetir === 'no' && auto) { audio.pause(); return; } if (S.azar) S.cola = barajar(S.cola); p = 0; }
    sonar(p);
  }
  function anterior() {
    if (audio.currentTime > 5) { audio.currentTime = 0; return; }
    sonar(Math.max(0, S.pos - 1));
  }
  function playPausa() {
    if (!S.actual) { if (!S.cola.length) armarCola({ tipo: 'todo', nombre: 'Toda mi música' }); if (S.cola.length) sonar(Math.max(0, S.pos), S.tiempoGuardado); return; }
    if (audio.paused) audio.play(); else audio.pause();
  }
  audio.addEventListener('timeupdate', () => {
    const t = audio.currentTime, d = t - S.ultimoT;
    if (d > 0 && d < 2) S.segundos += d;
    S.ultimoT = t;
    actualizarProgreso();
  });
  audio.addEventListener('seeking', () => { S.ultimoT = audio.currentTime; });
  audio.addEventListener('ended', () => { cerrarEscucha(true); siguiente(true); });
  audio.addEventListener('play', () => { pintarBotonesPlay(); pedirPantalla(); });
  audio.addEventListener('pause', () => { pintarBotonesPlay(); guardarEstado(); });
  audio.addEventListener('loadedmetadata', () => {
    const c = S.actual;
    if (c && audio.duration && Math.abs((c.duracion || 0) - audio.duration) > 1) { c.duracion = Math.round(audio.duration * 10) / 10; DB.poner('canciones', c); }
  });
  // Tarjeta del panel de notificaciones y de la pantalla bloqueada: título, artista, categoría, carátula y barra de avance.
  // Los botones ⏮ ⏯ ⏭ de esa tarjeta (y los del volante o Bluetooth) mueven la app aunque esté en segundo plano.
  const _caratulas = new Map();
  function caratula(c) {
    const clave = (categoriaDe(c) || c.artista || '') + '|' + iniciales(c) + '|' + puntos(c);
    if (_caratulas.has(clave)) return _caratulas.get(clave);
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 512; const x = cv.getContext('2d');
      x.fillStyle = color(categoriaDe(c) || c.artista || 'Mi Música'); x.fillRect(0, 0, 512, 512);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 200px system-ui, sans-serif'; x.fillText(iniciales(c), 256, 230);
      x.font = 'bold 52px system-ui, sans-serif'; x.fillText(('★'.repeat(c.calificacion || 0) + (c.favorita ? ' ❤' : '')) || '♪', 256, 400);
      const url = cv.toDataURL('image/png');
      if (_caratulas.size > 60) _caratulas.clear();
      _caratulas.set(clave, url); return url;
    } catch (e) { return 'icono-512.png'; }
  }
  function sesionMedios(c) {
    avisarNativo();
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: c.titulo || c.archivo, artist: c.artista || '', album: categoriaDe(c) || c.carpeta || '',
      artwork: [{ src: caratula(c), sizes: '512x512', type: 'image/png' }] });
    posicionMedios();
  }
  function posicionMedios() {
    try {
      if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !audio.duration || !isFinite(audio.duration)) return;
      navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, audio.duration) });
    } catch (e) {}
  }
  audio.addEventListener('loadedmetadata', posicionMedios);
  audio.addEventListener('seeked', posicionMedios);
  audio.addEventListener('play', posicionMedios);
  // App instalada: la tarjeta de notificaciones (servicio de Android) se actualiza con cada cambio
  let _avisoT = 0;
  function avisarNativo() {
    if (!NATIVO || !S.actual) return;
    clearTimeout(_avisoT);
    _avisoT = setTimeout(() => {
      const c = S.actual;
      Bib.notificar({ titulo: c.titulo || c.archivo, artista: [c.artista, categoriaDe(c)].filter(Boolean).join(' · '), sonando: !audio.paused,
        duracionMs: Math.round((audio.duration || c.duracion || 0) * 1000), posicionMs: Math.round((audio.currentTime || 0) * 1000) }).catch(() => {});
    }, 150);
  }
  if (NATIVO) {
    ['play', 'pause', 'seeked', 'loadedmetadata'].forEach(ev => audio.addEventListener(ev, avisarNativo));
    audio.addEventListener('play', () => { if (!S._avisosPedidos) { S._avisosPedidos = true; Bib.permisoAvisos().catch(() => {}); } }, { once: true });
    Bib.addListener('accion', e => {
      const t = (e && e.tipo) || '';
      if (t === 'siguiente') siguiente();
      else if (t === 'anterior') anterior();
      else if (t === 'play') { if (audio.paused) playPausa(); }
      else if (t === 'pausa') audio.pause();
      else if (t.startsWith('ir:')) audio.currentTime = (+t.slice(3) || 0) / 1000;
      avisarNativo();
    });
  }
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => playPausa());
    ms.setActionHandler('pause', () => audio.pause());
    ms.setActionHandler('nexttrack', () => siguiente());
    ms.setActionHandler('previoustrack', () => anterior());
    try { ms.setActionHandler('seekto', e => { audio.currentTime = e.seekTime; posicionMedios(); }); } catch (e) {}
    try { ms.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); posicionMedios(); }); } catch (e) {}
    try { ms.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); posicionMedios(); }); } catch (e) {}
    try { ms.setActionHandler('enterpictureinpicture', () => ventanaFlotante().catch(() => {})); } catch (e) {}
  }
  audio.addEventListener('play', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
  audio.addEventListener('pause', () => { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
  async function pedirPantalla() {
    if (!document.body.classList.contains('carro') || !S.config.pantallaEncendida || !navigator.wakeLock) return;
    try { S.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') { guardarEstado(); return; }
    pedirPantalla();
    // Al volver a la app (por ejemplo después de pasar canciones al teléfono) escanea sola si pasaron 5 minutos
    if (NATIVO) { if (S.config.autoEscaneo && S.canciones.size && diasDesde(S.ultimoEscaneo) > 5 / 1440) escanearAndroid('auto'); return; }
    if (S.carpeta && S.permiso && S.config.autoEscaneo && diasDesde(S.ultimoEscaneo) > 5 / 1440) escanear('auto');
  });

  // ---------------------------------------------------------------- colas y filtros
  function barajar(ids) {
    const a = ids.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (S.config.noRepetirArtista) {
      const art = id => norm((S.canciones.get(id) || {}).artista);
      for (let i = 1; i < a.length; i++) {
        if (art(a[i]) && art(a[i]) === art(a[i - 1])) {
          for (let k = i + 1; k < a.length; k++) { if (art(a[k]) !== art(a[i - 1])) { [a[i], a[k]] = [a[k], a[i]]; break; } }
        }
      }
    }
    return a;
  }
  function idsDeFuente(f) {
    const todas = [...S.canciones.values()];
    switch (f.tipo) {
      case 'categoria': return todas.filter(c => categoriaDe(c) === f.valor).map(c => c.id);
      case 'carpeta': return todas.filter(c => c.carpeta === f.valor).map(c => c.id);
      case 'favoritas': return todas.filter(c => c.favorita).map(c => c.id);
      case 'estatus': return todas.filter(c => estatusDe(c).clave === f.valor).map(c => c.id);
      case 'lista': { const l = S.listas.get(f.valor); return l ? idsDeLista(l) : []; }
      case 'ids': return (f.ids || []).filter(id => S.canciones.has(id));
      default: return todas.map(c => c.id);
    }
  }
  function armarCola(f, empezarEn) {
    let ids = idsDeFuente(f);
    if (!ids.length) { toast('No hay canciones ahí todavía', true); return false; }
    const lista = f.tipo === 'lista' ? S.listas.get(f.valor) : null;
    const ordenPropio = lista && lista.reglas && lista.reglas.orden && lista.reglas.orden !== 'azar';
    if (S.azar && !f.enOrden && !ordenPropio) ids = barajar(ids);
    if (empezarEn) { ids = ids.filter(i => i !== empezarEn); ids.unshift(empezarEn); }
    S.fuente = { tipo: f.tipo, valor: f.valor, nombre: f.nombre, ids: f.tipo === 'ids' ? f.ids : undefined };
    S.cola = ids; S.pos = 0;
    return true;
  }
  function sonarFuente(f, empezarEn) { if (armarCola(f, empezarEn)) { sonar(0); if (location.hash !== '#/sonando') location.hash = '#/sonando'; } }

  const OBT = {
    categorias: c => categoriaDe(c) || '(sin categoría)', generos: c => c.genero || '(sin género)', anios: c => anioDe(c) || '(sin año)',
    artistas: c => c.artista || '(sin artista)', carpetas: c => c.carpeta || '(sin carpeta)', estatus: c => estatusDe(c).clave,
  };
  // Texto de búsqueda de cada canción, guardado aparte para que buscar sea instantáneo (se rehace si cambian sus datos)
  const _textos = new WeakMap();
  const textoBusqueda = c => {
    const firma = `${c.titulo}|${c.artista}|${c.album}|${c.genero}|${c.anio}`;
    const t = _textos.get(c);
    if (t && t[0] === firma) return t[1];
    // Búsqueda en TODO lo de la canción: título, artista, categoría, género, año, carpeta, ruta y nombre del archivo
    const n = norm(`${c.titulo} ${c.artista} ${c.album} ${c.genero} ${c.anio} ${c.carpeta || ''} ${c.archivo} ${(c.ruta || '').split('/').slice(-3, -1).join(' ')}`);
    _textos.set(c, [firma, n]); return n;
  };
  const CAMPOS_FILTRO = ['categorias', 'generos', 'anios', 'artistas', 'carpetas', 'estatus'];
  function cumple(c, F, q) {
    for (const k of CAMPOS_FILTRO) if (F[k] && F[k].length && !F[k].includes(OBT[k](c))) return false;
    if (q.length) { const t = textoBusqueda(c); if (!q.every(p => t.includes(p))) return false; }
    return true;
  }
  // RAPIDEZ: los cálculos pesados (filtrar, ordenar, contar categorías) se guardan y se reutilizan hasta que algo cambie.
  // cambioDatos() avisa que algo cambió (estrellas, ❤, escuchas, canciones nuevas, datos completados…).
  let _version = 0;
  const _memo = new Map();
  function cambioDatos() { _version++; _memo.clear(); }
  function recordar(clave, calcular) {
    const k = clave + '|' + _version + '|' + S.canciones.size;
    if (_memo.has(k)) return _memo.get(k);
    const v = calcular(); if (_memo.size > 40) _memo.clear(); _memo.set(k, v); return v;
  }
  const COMPARAR = new Intl.Collator('es', { sensitivity: 'base', numeric: true }).compare;   // mucho más rápido que localeCompare
  function filtrar() {
    const F = S.filtros;
    return recordar('filtrar:' + JSON.stringify(F), () => {
      let q = norm(F.q).split(/\s+/).filter(Boolean);
      // Varias palabras: si están juntas como frase en alguna canción («carpeta 3», «marc anthony»), se busca la frase exacta
      const frase = q.join(' ');
      if (q.length > 1 && [...S.canciones.values()].some(c => textoBusqueda(c).includes(frase))) q = [frase];
      return ordenar([...S.canciones.values()].filter(c => cumple(c, F, q)), F.orden);
    });
  }
  function ordenar(r, o) {
    if (o === 'escuchas') r.sort((a, b) => total(b).esc - total(a).esc);
    else if (o === 'estatus') r.sort((a, b) => puntos(b) - puntos(a) || total(b).esc - total(a).esc);
    else if (o === 'recientes') r.sort((a, b) => (a.alta || '') < (b.alta || '') ? 1 : (a.alta || '') > (b.alta || '') ? -1 : 0);
    else if (o === 'anio') r.sort((a, b) => (+anioDe(b) || 0) - (+anioDe(a) || 0));
    else if (o === 'anioAsc') r.sort((a, b) => (+anioDe(a) || 9999) - (+anioDe(b) || 9999));
    else if (o === 'artista') r.sort((a, b) => COMPARAR(a.artista || '', b.artista || '') || COMPARAR(a.titulo || '', b.titulo || ''));
    else if (o === 'azar') r = r.map(c => [Math.random(), c]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    else r.sort((a, b) => COMPARAR(a.titulo || '', b.titulo || ''));
    return r;
  }
  function valoresDe(campo) {
    return recordar('valores:' + campo, () => {
      if (campo === 'estatus') { const n = {}; for (const c of S.canciones.values()) { const k = estatusDe(c).clave; n[k] = (n[k] || 0) + 1; } return ESTATUS.map(e => [e.clave, n[e.clave] || 0, e.nombre]); }
      const m = new Map();
      for (const c of S.canciones.values()) { const v = OBT[campo](c); m.set(v, (m.get(v) || 0) + 1); }
      const r = [...m.entries()].map(([v, n]) => [v, n, v]);
      return campo === 'anios' ? r.sort((a, b) => COMPARAR(b[0], a[0])) : r.sort((a, b) => b[1] - a[1]);
    });
  }

  // ---------------------------------------------------------------- listas (normales e inteligentes)
  function idsDeLista(l) {
    if (!l.reglas) return (l.ids || []).filter(id => S.canciones.has(id));
    return recordar('lista:' + JSON.stringify(l.reglas), () => calcularLista(l.reglas));
  }
  function calcularLista(R) {
    const q = norm(R.texto || '').split(/\s+/).filter(Boolean);
    const r = [...S.canciones.values()].filter(c => {
      if (!cumple(c, R, q)) return false;   // categorías, géneros, años, artistas, carpetas, estatus y texto
      const an = +anioDe(c) || 0;
      if (R.anioDesde && (!an || an < R.anioDesde)) return false;
      if (R.anioHasta && (!an || an > R.anioHasta)) return false;
      if (R.soloFavoritas && !c.favorita) return false;
      if ((c.calificacion || 0) < (R.estrellasMin || 0)) return false;
      const t = total(c);
      if (t.esc < (R.escuchasMin || 0)) return false;
      if (R.nuncaEscuchadas && t.esc > 0) return false;
      if (R.sinOirDias && t.ultima && diasDesde(t.ultima) < R.sinOirDias) return false;
      if (R.agregadasDias && diasDesde(c.alta) > R.agregadasDias) return false;
      if (R.excluirSaltadas && t.sal >= 2 && t.sal > t.esc) return false;
      return true;
    });
    return ordenar(r, R.orden === 'azar' ? 'titulo' : R.orden).slice(0, R.limite || 100000).map(c => c.id);
  }
  async function crearLista(nombre, ids, reglas) {
    const l = { uid: uid(), nombre, ids: ids || [], reglas: reglas || null, creada: ahora() };
    await DB.poner('listas', l); S.listas.set(l.uid, l);
    await anotar({ tipo: 'lista', campo: reglas ? 'lista_inteligente' : 'lista_crear', despues: nombre, detalle: reglas ? describirReglas(reglas) : `${l.ids.length} canciones`, lista: l.uid, deshacible: true });
    return l;
  }
  async function agregarALista(luid, id, origen) {
    const l = S.listas.get(luid), c = S.canciones.get(id);
    if (!l || l.reglas || l.ids.includes(id)) return;
    l.ids.push(id); await DB.poner('listas', l);
    await anotar({ cancion: c, tipo: 'lista', campo: 'lista_agregar', despues: l.nombre, lista: l.uid, deshacible: origen !== 'deshacer', origen: origen || 'manual' });
    if (origen !== 'deshacer') toast(`➕ Agregada a «${l.nombre}»`);
  }
  async function sacarDeLista(luid, id, origen) {
    const l = S.listas.get(luid); if (!l) return;
    l.ids = l.ids.filter(x => x !== id); await DB.poner('listas', l);
    await anotar({ cancion: S.canciones.get(id), tipo: 'lista', campo: 'lista_sacar', antes: l.nombre, lista: l.uid, deshacible: origen !== 'deshacer', origen: origen || 'manual' });
  }
  function describirReglas(R) {
    const p = [], n = { categorias: 'Categoría', generos: 'Género', artistas: 'Artista', carpetas: 'Carpeta' };
    for (const k in n) if (R[k] && R[k].length) p.push(`${n[k]}: ${R[k].join(', ')}`);
    if (R.estatus && R.estatus.length) p.push('Estatus: ' + R.estatus.map(k => ESTATUS.find(e => e.clave === k).nombre).join(', '));
    if (R.anios && R.anios.length) p.push('Año: ' + R.anios.join(', '));
    if (R.texto) p.push(`que digan «${R.texto}»`);
    if (R.anioDesde || R.anioHasta) p.push(`Años ${R.anioDesde || '…'} a ${R.anioHasta || '…'}`);
    if (R.soloFavoritas) p.push('solo ❤');
    if (R.estrellasMin) p.push(`${R.estrellasMin}★ o más`);
    if (R.escuchasMin) p.push(`${R.escuchasMin}+ escuchas`);
    if (R.nuncaEscuchadas) p.push('nunca escuchadas');
    if (R.sinOirDias) p.push(`sin oír hace ${R.sinOirDias}+ días`);
    if (R.agregadasDias) p.push(`agregadas en los últimos ${R.agregadasDias} días`);
    if (R.excluirSaltadas) p.push('sin las que siempre salto');
    const ord = { escuchas: 'más sonadas primero', estatus: 'mejor estatus primero', recientes: 'recientes primero', anio: 'más nuevas primero', anioAsc: 'más viejas primero', titulo: 'por título' };
    if (R.orden && ord[R.orden]) p.push(ord[R.orden]);
    if (R.limite) p.push(`máximo ${R.limite}`);
    return p.join(' · ') || 'Todas las canciones';
  }

  // ---------------------------------------------------------------- agregar / actualizar la biblioteca
  // Busca la trayectoria guardada de una canción (por su código, por su ruta o por nombre + tamaño)
  function buscarMemoria(c) {
    if (S.memoria.has(c.id)) return S.memoria.get(c.id);
    const ruta = c.ruta ? claveRuta(c.raiz, c.ruta) : '', arch = claveArchivo(c.archivo, c.tamano);
    for (const m of S.memoria.values()) {
      if (ruta && m.ruta && claveRuta(m.raiz, m.ruta) === ruta) return m;
      if (m.archivo && claveArchivo(m.archivo, m.tamano) === arch) return m;
    }
    return null;
  }
  // La canción vuelve con el MISMO código que tenía: así recupera escuchas, listas e historial
  function aplicarMemoria(c) {
    const m = buscarMemoria(c);
    if (!m) return null;
    c.id = m.id;
    c.favorita = m.favorita || 0; c.calificacion = m.calificacion || 0;
    if (m.editados) { c.editados = Object.assign({}, m.editados); Object.assign(c, m.editados); }
    if (m.alta) c.alta = m.alta;
    return m;
  }
  async function olvidarMemoria(m) { if (m) { await DB.borrar('memoria', m.id); S.memoria.delete(m.id); } }
  async function procesarArchivos(files, modo) {
    files = [...files].filter(f => /\.(mp3|m4a|aac|ogg|opus|flac|wav)$/i.test(f.name) || (f.type || '').startsWith('audio/'));
    if (!files.length) return toast('No elegiste canciones', true);
    await DB.persistir();
    const antes = S.canciones.size, nuevas = [], recuperadas = [], vistas = new Set();
    let ya = 0;
    modal(`<h2>${modo === 'actualizar' ? '🔄 Actualizando la biblioteca…' : '➕ Agregando canciones…'}</h2><p id="avTxt">0 de ${files.length}</p><div class="progreso-carga"><i id="avBar"></i></div><p class="ayuda">No cierres la app. Las canciones se guardan dentro de la app para sonar sin internet.</p>`);
    for (let i = 0; i < files.length; i++) {
      const f = files[i], id = claveArchivo(f.name, f.size), ruta = f.webkitRelativePath || f.name;
      const carpeta = ruta.includes('/') ? ruta.split('/').slice(-2, -1)[0] : '';
      vistas.add(id);
      if (S.canciones.has(id)) {
        ya++;
        const c = S.canciones.get(id);
        if (f.webkitRelativePath && c.ruta !== ruta) { c.ruta = ruta; c.carpeta = carpeta; await DB.poner('canciones', c); }
      } else {
        const d = await Etiquetas.leerDatos(f);
        d.tipoEtiqueta = d._tipo; delete d._tipo; delete d._error;
        const c = Object.assign({ id, archivo: f.name, tamano: f.size, ruta, carpeta, favorita: 0, calificacion: 0, alta: ahora() }, d);
        const m = aplicarMemoria(c);
        if (m) recuperadas.push(c.titulo);
        try { await DB.poner('archivos', { id: c.id, blob: f }); } catch (e) { cerrarModal(); toast('⚠️ No hay espacio para más canciones en el teléfono', true); break; }
        await DB.poner('canciones', c); S.canciones.set(c.id, c); nuevas.push(c); vistas.add(c.id);
        await olvidarMemoria(m);
      }
      if (i % 3 === 0 || i === files.length - 1) { const t = $('#avTxt'), b = $('#avBar'); if (t) t.textContent = `${i + 1} de ${files.length}`; if (b) b.style.width = ((i + 1) / files.length * 100) + '%'; }
    }
    // Canciones de esas mismas carpetas que ya no están en el teléfono
    let faltan = [];
    if (modo === 'actualizar') {
      const raices = new Set(files.filter(f => f.webkitRelativePath).map(f => f.webkitRelativePath.split('/')[0] + '/'));
      if (raices.size) faltan = [...S.canciones.values()].filter(c => !vistas.has(c.id) && [...raices].some(r => (c.ruta || '').startsWith(r)));
    }
    cambioDatos();
    if (nuevas.length || modo === 'actualizar')
      await anotar({ tipo: 'biblioteca', campo: modo === 'actualizar' ? 'actualizacion' : 'agregadas', antes: `${miles(antes)} canciones`, despues: `${miles(S.canciones.size)} canciones`,
        detalle: { nuevas: nuevas.map(c => `${c.titulo} — ${c.artista || 'Sin artista'}`), recuperadas, yaEstaban: ya, faltan: faltan.map(c => `${c.titulo} — ${c.artista || ''}`) } });
    pintar();
    if (faltan.length) {
      S._faltan = faltan.map(c => c.id);
      modal(`<h2>🔄 Biblioteca actualizada</h2><p>✅ ${miles(nuevas.length)} nuevas · ${miles(ya)} ya estaban${recuperadas.length ? ` · ${miles(recuperadas.length)} recuperaron su estatus` : ''}</p>
        <div class="caja aviso-c"><p><b>${miles(faltan.length)} canciones de esa carpeta ya no están en el teléfono.</b></p>
        <p class="suave peq">${faltan.slice(0, 30).map(c => esc(c.titulo)).join(' · ')}${faltan.length > 30 ? ' …' : ''}</p>
        <p class="ayuda">Si las quitas de la app, su estatus, ❤ y escuchas se guardan: si vuelven, las recuperan.</p></div>
        <div class="botones dos"><button class="btn sec" data-accion="cerrar">Dejarlas</button><button class="btn peligro" data-accion="quitarFaltantes">Quitarlas de la app</button></div>`);
    } else {
      cerrarModal();
      toast(`✅ ${miles(nuevas.length)} nuevas${ya ? ` · ${miles(ya)} ya estaban` : ''}${recuperadas.length ? ` · ${recuperadas.length} con su estatus de antes` : ''}`);
    }
  }
  // Quita canciones de la app (libera espacio) pero RECUERDA su estatus, ❤, correcciones y escuchas
  async function quitarDeApp(ids, motivo, sinAnotar) {
    const nombres = [];
    for (const id of ids) {
      const c = S.canciones.get(id); if (!c) continue;
      const m = { id, favorita: c.favorita || 0, calificacion: c.calificacion || 0, editados: c.editados || null, alta: c.alta, titulo: c.titulo, artista: c.artista,
        ruta: c.ruta || '', raiz: c.raiz || 'r0', archivo: c.archivo, tamano: c.tamano };
      await DB.poner('memoria', m); S.memoria.set(id, m);
      await DB.borrar('archivos', id); await DB.borrar('canciones', id); S.canciones.delete(id);
      S.cola = S.cola.filter(x => x !== id);
      nombres.push(`${c.titulo} — ${c.artista || ''}`);
    }
    cambioDatos();
    if (sinAnotar) return nombres.length;
    if (nombres.length === 1) await anotar({ tipo: 'biblioteca', campo: 'quitada', antes: nombres[0], detalle: motivo || '' });
    else if (nombres.length) await anotar({ tipo: 'biblioteca', campo: 'quitadas', antes: `${miles(nombres.length)} canciones`, detalle: { quitadas: nombres, motivo } });
    return nombres.length;
  }

  // ---------------------------------------------------------------- carpeta de música del teléfono (sin copiar)
  // La app se conecta UNA vez a la carpeta (por ejemplo «Music») y la vuelve a leer cuando Edwin toca 🔍 Escanear,
  // al abrir la app y al volver a ella. Detecta canciones nuevas, modificadas, movidas y borradas.
  // Se pueden conectar VARIAS carpetas (Music, la memoria SD, otras). Cada una se escanea con las demás.
  async function guardarRaices() {
    await DB.guardarConfig('raices', S.raices.map(r => ({ id: r.id, h: r.h })));
    S.carpeta = S.raices.length ? S.raices[0].h : null;
  }
  async function conectarCarpeta() {
    if (!puedeCarpeta()) return toast('Este teléfono no deja conectar carpetas; usa «Agregar canciones»', true);
    let h;
    try { h = await window.showDirectoryPicker({ id: 'musica', mode: 'read' }); } catch (e) { return; }
    for (const r of S.raices) { try { if (await r.h.isSameEntry(h)) return toast(`«${h.name}» ya está conectada`, true); } catch (e) {} }
    const usados = new Set(S.raices.map(r => r.id));
    let n = 0; while (usados.has('r' + n)) n++;
    S.raices.push({ id: 'r' + n, h, ok: true });
    S.permiso = S.raices.every(r => r.ok);
    await guardarRaices();
    await anotar({ tipo: 'biblioteca', campo: 'carpeta', antes: '', despues: h.name });
    await escanear('manual');
  }
  function quitarCarpeta(id) {
    const r = S.raices.find(x => x.id === id); if (!r) return;
    const n = [...S.canciones.values()].filter(c => c.origen === 'carpeta' && (c.raiz || 'r0') === id).length;
    modal(`<h2>📁 ¿Desconectar «${esc(r.h.name)}»?</h2><p>Sus <b>${miles(n)}</b> canciones salen de la app. Tus archivos del teléfono NO se tocan.</p>
      <p class="suave peq">Su trayectoria (estrellas, ❤, escuchas) queda guardada: si vuelves a conectar la carpeta, la recuperan.</p>
      <div class="botones dos"><button class="btn sec" data-accion="cerrar">Cancelar</button><button class="btn peligro" data-accion="quitarCarpetaSi" data-id="${esc(id)}">Desconectar</button></div>`);
  }
  async function quitarCarpetaSi(id) {
    const r = S.raices.find(x => x.id === id); if (!r) return;
    const ids = [...S.canciones.values()].filter(c => c.origen === 'carpeta' && (c.raiz || 'r0') === id).map(c => c.id);
    await quitarDeApp(ids, `Carpeta «${r.h.name}» desconectada`);
    S.raices = S.raices.filter(x => x.id !== id);
    S.permiso = S.raices.length ? S.raices.every(x => x.ok) : false;
    await guardarRaices();
    await anotar({ tipo: 'biblioteca', campo: 'carpeta', antes: r.h.name, despues: '(desconectada)' });
    cerrarModal(); toast(`📁 «${r.h.name}» desconectada`); pintar();
  }
  // Android le quita a la app el permiso de las carpetas al cerrarla. Se vuelve a pedir SOLO con el primer toque
  // en cualquier parte (un toque es lo que Android exige). Una sola petición a la vez.
  let _pidiendo = null;
  function pedirPermiso() {
    if (!S.carpeta) return Promise.resolve(false);
    if (S.permiso) return Promise.resolve(true);
    if (_pidiendo) return _pidiendo;
    _pidiendo = (async () => {
      for (const r of S.raices) {
        if (r.ok) continue;
        try { r.ok = (await r.h.requestPermission({ mode: 'read' })) === 'granted'; } catch (e) { r.ok = false; }
      }
      S.permiso = S.raices.length > 0 && S.raices.every(r => r.ok);
      _pidiendo = null;
      if (S.permiso) alConectar();
      return S.permiso;
    })();
    return _pidiendo;
  }
  // Apenas hay permiso: carga dónde está cada canción, completa géneros/años pendientes y revisa la carpeta
  let _conectado = false;
  function alConectar() {
    if (_conectado) return; _conectado = true;
    pintar();
    cargarManijas().then(() => {
      // La canción donde ibas queda lista: el primer ▶ suena de inmediato
      const id = S.cola[Math.max(0, S.pos)], c = id && S.canciones.get(id);
      if (c && !S.actual) archivoDe(c).then(f => { S._pre = { id, f }; }).catch(() => {});
      if (S.config.autoEscaneo) escanear('auto');
      releerUnaVez().then(completarDatos);
    });
  }
  // Versión 7: las canciones que nunca se leyeron bien (versiones anteriores las marcaban como leídas aunque fallara)
  // se vuelven a leer UNA vez. Nunca se pisa lo que Edwin corrigió a mano.
  const tieneDatos = c => !!(c.album || c.genero || c.anio);
  async function releerUnaVez() {
    // Versión 10: el lector nuevo entiende géneros por número, ID3v1, FLAC y OGG. Se releen UNA vez solo las canciones
    // que quedaron sin género (las que tienen género corregido a mano no se tocan).
    if (!(await DB.leerConfig('ajuste10', false))) {
      const sin = [...S.canciones.values()].filter(c => !c.genero && !(c.editados && 'genero' in c.editados) && !c.pendienteDatos);
      sin.forEach(c => { c.pendienteDatos = 1; delete c.errorDatos; });
      for (let i = 0; i < sin.length; i += 300) await DB.varios('canciones', sin.slice(i, i + 300));
      await DB.guardarConfig('ajuste10', true);
      await DB.guardarConfig('ajuste9', true); await DB.guardarConfig('relectura7', true);
      return;
    }
    // Versión 9: la relectura de la v7 marcó TODAS las canciones. Las que ya tienen categoría, género o año
    // quedan como leídas; solo se releen las que de verdad están vacías.
    if (!(await DB.leerConfig('ajuste9', false))) {
      const ya = [...S.canciones.values()].filter(c => c.pendienteDatos && !c.modificada && tieneDatos(c));
      ya.forEach(c => { delete c.pendienteDatos; c.datosLeidos = 1; });
      for (let i = 0; i < ya.length; i += 300) await DB.varios('canciones', ya.slice(i, i + 300));
      await DB.guardarConfig('ajuste9', true);
    }
    if (await DB.leerConfig('relectura7', false)) return;
    const marcar = [...S.canciones.values()].filter(c => c.origen === 'carpeta' && !c.datosLeidos && !c.pendienteDatos && !tieneDatos(c));
    marcar.forEach(c => { c.pendienteDatos = 1; });
    for (let i = 0; i < marcar.length; i += 300) await DB.varios('canciones', marcar.slice(i, i + 300));
    await DB.guardarConfig('relectura7', true);
  }
  async function releerTodas() {
    const marcar = [...S.canciones.values()].filter(c => !c.pendienteDatos);
    marcar.forEach(c => { c.pendienteDatos = 1; delete c.errorDatos; });
    for (let i = 0; i < marcar.length; i += 300) await DB.varios('canciones', marcar.slice(i, i + 300));
    toast(`🏷️ Leyendo otra vez los datos de ${miles(marcar.length)} canciones`);
    completarDatos();
  }
  document.addEventListener('click', () => { if (S.carpeta && !S.permiso) pedirPermiso(); }, true);
  // Dónde está cada canción (guardado en el teléfono): así no hay que buscarla carpeta por carpeta cada vez
  async function cargarManijas() {
    try {
      const ms = await DB.todos('manijas');
      for (const m of ms) if (!S._fh.has(m.k)) S._fh.set(m.k, m.h);
      S._manijasGuardadas = new Set(ms.map(m => m.k));
    } catch (e) { S._manijasGuardadas = new Set(); }
  }
  async function guardarManijas() {
    const ya = S._manijasGuardadas || new Set(), nuevas = [];
    for (const [k, h] of S._fh) if (!ya.has(k)) nuevas.push({ k, h });
    for (let i = 0; i < nuevas.length; i += 300) { try { await DB.varios('manijas', nuevas.slice(i, i + 300)); } catch (e) { return; } }
    nuevas.forEach(n => ya.add(n.k)); S._manijasGuardadas = ya;
  }
  // Recorre la carpeta. Muestra en vivo: carpeta actual, carpetas revisadas, canciones encontradas. Lee de a 12 a la vez.
  const CARPETAS_SALTAR = /^(android|\.thumbnails|thumbnails|cache|\.cache|lost\.dir|notifications|ringtones|alarms)$/i;
  // Recorre TODAS las carpetas conectadas. Lleva la cuenta por carpeta y de los audios que el teléfono no puede tocar.
  async function leerDisco(avance, completo) {
    // Canciones ya conocidas (clave → tamaño/fecha). En revisión completa no se usa: se abre todo.
    const conocidas = completo ? null : new Map([...S.canciones.values()].filter(c => c.origen === 'carpeta').map(c => [claveRuta(c.raiz, c.ruta), c]));
    const disco = new Map(), est = { carpetas: 0, canciones: 0, actual: '', porRaiz: {}, noReproduce: {}, saltadas: [], porSub: {},
      archivosVistos: 0, otrosTipos: {}, carpetasConError: [], fallos: [], noLeidos: [] };
    // Si una carpeta o un archivo da error, se anota y se SIGUE con el resto (antes se perdía en silencio).
    // Lo que no se pudo leer nunca se toma como «borrado» (est.noLeidos protege esas canciones).
    async function recorrer(raiz, dir, base, nombreRaiz) {
      if (S.cancelar) throw new Error('cancelado');
      est.carpetas++; est.actual = nombreRaiz + (base ? '/' + base : ''); avance && avance(est);
      if (base) S._dirs.set(claveRuta(raiz, base), dir);
      const archivos = [], subcarpetas = [];
      try {
        for await (const [nombre, h] of dir.entries()) {
          if (S.cancelar) throw new Error('cancelado');
          if (nombre.startsWith('.')) continue;
          const ruta = base ? base + '/' + nombre : nombre;
          if (h.kind === 'directory') {
            if (CARPETAS_SALTAR.test(nombre)) { if (est.saltadas.length < 20) est.saltadas.push(nombreRaiz + '/' + ruta); continue; }
            subcarpetas.push([h, ruta]); continue;
          }
          est.archivosVistos++;
          if (EXT_AUDIO.test(nombre)) archivos.push([ruta, nombre, h]);
          else {
            const x = (nombre.includes('.') ? nombre.split('.').pop() : '(sin tipo)').toLowerCase().slice(0, 8);
            if (EXT_NO_REPRODUCE.test(nombre)) est.noReproduce[x] = (est.noReproduce[x] || 0) + 1;
            else est.otrosTipos[x] = (est.otrosTipos[x] || 0) + 1;
          }
        }
      } catch (e) {
        if (e.message === 'cancelado') throw e;
        est.carpetasConError.push(nombreRaiz + (base ? '/' + base : '') + ' (' + (e.name || e.message) + ')');
        est.noLeidos.push(claveRuta(raiz, base ? base + '/' : ''));   // sus canciones no se dan por borradas
      }
      // RÁPIDO: una canción que la app ya conoce NO se abre (abrir 6.000 archivos en Android es lo lento).
      // Solo se abren las nuevas. En «revisión completa» se abren todas para detectar archivos modificados.
      const nuevos = [];
      for (const a of archivos) {
        const k = claveRuta(raiz, a[0]), c = conocidas && conocidas.get(k);
        if (c) {
          disco.set(k, { raiz, ruta: a[0], nombre: a[1], tamano: c.tamano, mtime: c.mtime, conocida: true });
          S._fh.set(k, a[2]);
          est.porRaiz[raiz] = (est.porRaiz[raiz] || 0) + 1;
          const sub = nombreRaiz + (a[0].includes('/') ? '/' + a[0].split('/')[0] : '');
          est.porSub[sub] = (est.porSub[sub] || 0) + 1;
        } else nuevos.push(a);
      }
      est.canciones = disco.size; avance && avance(est);
      for (let i = 0; i < nuevos.length; i += 12) {
        if (S.cancelar) throw new Error('cancelado');
        await Promise.all(nuevos.slice(i, i + 12).map(async ([ruta, nombre, h]) => {
          const k = claveRuta(raiz, ruta);
          let f = null;
          for (let intento = 0; intento < 2 && !f; intento++) { try { f = await h.getFile(); } catch (e) { if (intento) { est.fallos.push(nombreRaiz + '/' + ruta); est.noLeidos.push(k); } } }
          if (!f) return;
          disco.set(k, { raiz, ruta, nombre, tamano: f.size, mtime: f.lastModified });
          S._fh.set(k, h);
          est.porRaiz[raiz] = (est.porRaiz[raiz] || 0) + 1;
          const sub = nombreRaiz + (ruta.includes('/') ? '/' + ruta.split('/')[0] : '');
          est.porSub[sub] = (est.porSub[sub] || 0) + 1;
        }));
        est.canciones = disco.size; avance && avance(est);
      }
      for (const [h, ruta] of subcarpetas) await recorrer(raiz, h, ruta, nombreRaiz);
    }
    for (const r of S.raices) {
      try { await recorrer(r.id, r.h, '', r.h.name); }
      catch (e) { if (e.message === 'cancelado') throw e; est.porRaiz[r.id] = est.porRaiz[r.id] || 0; est.errores = (est.errores || []).concat(r.h.name); }
    }
    disco.est = est;
    return disco;
  }
  // Ventana de avance: se actualiza sola cada medio segundo (no frena la lectura)
  function ventanaAvance(titulo, ayuda) {
    S.cancelar = false;
    const inicio = Date.now();
    modal(`<h2>${titulo}</h2><div class="caja"><p id="avTxt" style="font-size:1.25rem;font-weight:800">Empezando…</p><p id="avSub" class="suave peq"></p>
      <div class="progreso-carga"><i id="avBar" style="width:5%"></i></div><p id="avTiempo" class="suave peq">0:00</p></div>
      <p class="ayuda">${ayuda}</p><div class="botones"><button class="btn sec" data-accion="cancelarEscaneo">✖ Cancelar</button></div>`);
    const t = setInterval(() => {
      const e = $('#avTiempo'); if (!e) return clearInterval(t);
      e.textContent = '⏱ ' + mmss((Date.now() - inicio) / 1000);
      const b = $('#avBar'); if (b && b.dataset.indef) b.style.width = (5 + ((Date.now() - inicio) / 300) % 90) + '%';
    }, 500);
    const bar = $('#avBar'); if (bar) bar.dataset.indef = '1';
    return {
      texto(a, sub) { const x = $('#avTxt'); if (x) x.textContent = a; const y = $('#avSub'); if (y && sub != null) y.textContent = sub; },
      porcentaje(p) { const b = $('#avBar'); if (b) { delete b.dataset.indef; b.style.width = Math.max(2, Math.min(100, p)) + '%'; } },
      fin() { clearInterval(t); },
    };
  }
  function compararCarpeta(disco) {
    const enApp = new Map([...S.canciones.values()].filter(c => c.origen === 'carpeta').map(c => [claveRuta(c.raiz, c.ruta), c]));
    const nuevas = [], modificadas = [], faltan = [], movidas = [];
    for (const [k, d] of disco) {
      const c = enApp.get(k);
      if (!c) nuevas.push(d);
      else if (c.tamano !== d.tamano || (c.mtime && c.mtime !== d.mtime)) modificadas.push([c, d]);
    }
    const noLeidos = (disco.est && disco.est.noLeidos) || [];
    // p = una canción que no se pudo leer, o una carpeta (termina en «/», «|» o vacía = carpeta principal) que dio error
    const protegida = k => noLeidos.some(p => k === p || ((p === '' || p.endsWith('/') || p.endsWith('|')) && k.startsWith(p)));
    for (const [k, c] of enApp) if (!disco.has(k) && !protegida(k)) faltan.push(c);
    // Movida o renombrada de carpeta = desaparece de un sitio y aparece en otro con el mismo nombre y tamaño
    for (let i = faltan.length - 1; i >= 0; i--) {
      const c = faltan[i], j = nuevas.findIndex(d => d.nombre.toLowerCase() === (c.archivo || '').toLowerCase() && d.tamano === c.tamano);
      if (j >= 0) { movidas.push([c, nuevas[j]]); nuevas.splice(j, 1); faltan.splice(i, 1); }
    }
    const totalApp = enApp.size;
    // ¿Se desconectó la memoria o cambió la carpeta? Una carpeta que llega vacía teniendo canciones, o falta más del 30 %
    const porRaiz = (disco.est && disco.est.porRaiz) || {};
    const raizVacia = faltan.some(c => !porRaiz[c.raiz || 'r0']);
    const sospechoso = faltan.length > 0 && (disco.size === 0 || raizVacia || (faltan.length >= 5 && faltan.length > totalApp * 0.3));
    return { nuevas, modificadas, faltan, movidas, totalApp, totalDisco: disco.size, sospechoso, hayCambios: nuevas.length + modificadas.length + faltan.length + movidas.length > 0 };
  }
  // modo: 'manual' (muestra lo que encontró antes de aplicar si hay borradas) | 'auto' (al abrir la app)
  // ======== App instalada: la música sale del CATÁLOGO DE ANDROID (el mismo que usan las demás apps) ========
  // Android ya tiene título, artista, álbum (= categoría), género y año de cada canción: no hay que abrir archivos.
  const sinDato = s => (!s || s === '<unknown>') ? '' : String(s).trim();
  async function escanearAndroid(modo) {
    if (S.escaneando) return;
    S.escaneando = true;
    const manual = modo !== 'auto';
    const av = manual ? ventanaAvance('🎵 Leyendo la música de tu teléfono', 'Android ya tiene el catálogo de tus canciones con artista, álbum y género: tarda unos segundos.') : null;
    try {
      const p = await Bib.permiso();
      if (!p || !p.ok) {
        if (av) av.fin();
        cerrarModal();
        if (manual) modal(`<h2>🔒 Falta el permiso de música</h2><p>Sin ese permiso la app no puede ver tus canciones.</p>
          <p class="peq">Abre <b>Ajustes del teléfono › Aplicaciones › Mi Música › Permisos › Música y audio</b> y elige <b>Permitir</b>. Luego vuelve y toca «Cargar mi música».</p>
          <div class="botones"><button class="btn sec" data-accion="cerrar">Entendido</button></div>`);
        return;
      }
      if (av) av.texto('🎵 Consultando a Android…', '');
      const r = await Bib.leer();
      const todas = (r && r.canciones) || [];
      const lista = todas.filter(x => x.musica !== false && x.ruta);
      S.infoAndroid = { total: r.total, noMusica: r.noMusica, android: r.android, fecha: ahora() };
      DB.guardarConfig('infoAndroid', S.infoAndroid);
      if (av) av.texto(`🎵 ${miles(lista.length)} canciones en el catálogo`, 'Comparando con las que ya conoce la app…');
      const enApp = new Map([...S.canciones.values()].filter(c => c.origen === 'android').map(c => [(c.ruta || '').toLowerCase(), c]));
      const disco = new Map(lista.map(x => [x.ruta.toLowerCase(), x]));
      const nuevas = [], modificadas = [], faltan = [], movidas = [];
      for (const [k, x] of disco) {
        const c = enApp.get(k);
        if (!c) nuevas.push(x);
        else if (c.tamano !== x.tamano || c.mtime !== x.modificado || c._genAndroid !== sinDato(x.genero) || c._albAndroid !== sinDato(x.album)) modificadas.push([c, x]);
      }
      for (const [k, c] of enApp) if (!disco.has(k)) faltan.push(c);
      for (let i = faltan.length - 1; i >= 0; i--) {
        const c = faltan[i], j = nuevas.findIndex(x => (x.nombre || '').toLowerCase() === (c.archivo || '').toLowerCase() && x.tamano === c.tamano);
        if (j >= 0) { movidas.push([c, nuevas[j]]); nuevas.splice(j, 1); faltan.splice(i, 1); }
      }
      const totalApp = enApp.size;
      const sospechoso = faltan.length > 0 && (lista.length === 0 || (faltan.length >= 5 && faltan.length > totalApp * 0.3));
      const dif = { android: true, nuevas: nuevas.map(x => Object.assign({ nombre: x.nombre }, x)), modificadas, faltan, movidas, totalApp, totalDisco: lista.length, sospechoso,
        hayCambios: nuevas.length + modificadas.length + faltan.length + movidas.length > 0 };
      S._dif = dif;
      await DB.guardarConfig('ultimoEscaneo', ahora()); S.ultimoEscaneo = ahora();
      if (av) av.fin();
      if (!dif.hayCambios) { if (manual) { cerrarModal(); toast(`✅ Al día · ${miles(lista.length)} canciones`); } return; }
      if (totalApp === 0 || !faltan.length || (modo === 'auto' && !sospechoso)) { await aplicarAndroid(dif, modo); return; }
      mostrarEscaneo(dif);
    } catch (e) {
      if (av) av.fin();
      cerrarModal();
      if (manual) toast('⚠️ ' + (e.message || e), true);
    } finally { S.escaneando = false; }
  }
  function datosDeAndroid(c, x) {
    const n = Etiquetas.desdeNombre(x.nombre || c.archivo || '');
    const campos = {
      titulo: sinDato(x.titulo) || n.titulo,
      artista: sinDato(x.artista) || sinDato(x.albumArtista) || n.artista,
      album: sinDato(x.album),
      genero: Etiquetas.normGenero(sinDato(x.genero)),
      anio: x.anio > 0 ? String(x.anio).slice(0, 4) : '',
    };
    for (const k in campos) if (!(c.editados && k in c.editados)) c[k] = campos[k];   // lo corregido a mano no se pisa
    c._genAndroid = sinDato(x.genero); c._albAndroid = sinDato(x.album);
    c.tamano = x.tamano; c.mtime = x.modificado; c.duracion = Math.round((x.duracionMs || 0) / 100) / 10;
    c.idAndroid = x.id; c.datosLeidos = 2; c.tipoEtiqueta = 'Android'; delete c.pendienteDatos;
    const partes = (x.ruta || '').split('/'); c.carpeta = partes.length > 1 ? partes[partes.length - 2] : '';
    return c;
  }
  async function aplicarAndroid(dif, origen) {
    const av = origen !== 'auto' ? ventanaAvance('➕ Guardando tu música', 'Con artista, álbum, género y año que ya tiene Android.') : null;
    const recuperadas = [];
    for (const [c, x] of dif.movidas) { c.ruta = x.ruta; c.archivo = x.nombre; datosDeAndroid(c, x); }
    for (const [c, x] of dif.modificadas) datosDeAndroid(c, x);
    const cambiadas = [...dif.movidas.map(m => m[0]), ...dif.modificadas.map(m => m[0])];
    for (let i = 0; i < cambiadas.length; i += 300) await DB.varios('canciones', cambiadas.slice(i, i + 300));
    let lote = [];
    for (let i = 0; i < dif.nuevas.length; i++) {
      const x = dif.nuevas[i];
      const c = datosDeAndroid({ id: 'a' + uid(), origen: 'android', ruta: x.ruta, archivo: x.nombre, favorita: 0, calificacion: 0, alta: ahora() }, x);
      const m = aplicarMemoria(c);   // si la canción ya estuvo (respaldo o la app web), recupera su trayectoria
      if (m) { recuperadas.push(c.titulo); datosDeAndroid(c, x); await olvidarMemoria(m); }
      S.canciones.set(c.id, c); lote.push(c);
      if (lote.length >= 300 || i === dif.nuevas.length - 1) {
        await DB.varios('canciones', lote); lote = [];
        if (av) { av.texto(`➕ ${miles(i + 1)} de ${miles(dif.nuevas.length)} canciones`, ''); av.porcentaje((i + 1) / dif.nuevas.length * 100); }
      }
    }
    if (dif.faltan.length) await quitarDeApp(dif.faltan.map(c => c.id), 'Ya no está en el teléfono', true);
    if (av) av.fin();
    const fmt = c => `${c.titulo} — ${c.artista || 'Sin artista'}`;
    await anotar({ tipo: 'biblioteca', campo: 'escaneo', origen: origen === 'auto' ? 'automático' : 'manual',
      antes: `${miles(dif.totalApp)} canciones`, despues: `${miles([...S.canciones.values()].filter(c => c.origen === 'android').length)} canciones`,
      detalle: { nuevas: dif.nuevas.map(x => x.nombre), recuperadas, modificadas: dif.modificadas.map(m => fmt(m[0])), movidas: dif.movidas.map(m => `${fmt(m[0])} → ${m[1].ruta}`), faltan: dif.faltan.map(fmt) } });
    cambioDatos();
    cerrarModal();
    toast(`🎵 +${miles(dif.nuevas.length)} nuevas · ${miles(dif.modificadas.length)} actualizadas · ${miles(dif.faltan.length)} ya no están${recuperadas.length ? ` · ${recuperadas.length} con su trayectoria` : ''}`);
    if (dif.totalApp === 0 && dif.nuevas.length && location.hash !== '#/biblioteca') location.hash = '#/biblioteca';
    pintar();
  }

  async function escanear(modo) {
    if (NATIVO) return escanearAndroid(modo === 'completo' ? 'manual' : modo);
    if (S.escaneando || !S.carpeta) return;
    if (!S.permiso) { if (modo === 'auto') { pintar(); return; } if (!(await pedirPermiso())) return toast('Sin permiso no puedo leer tu carpeta', true); }
    S.escaneando = true;
    const completo = modo === 'completo';
    if (completo) modo = 'manual';
    let av = null, ultimo = 0;
    try {
      if (modo === 'manual') av = ventanaAvance(`🔍 ${completo ? 'Revisión completa de' : 'Buscando cambios en'} ${S.raices.length > 1 ? `tus ${S.raices.length} carpetas` : `«${esc(S.carpeta.name)}»`}`,
        completo ? 'Se abre cada archivo para ver si cambió. Tarda más; úsalo solo si editaste datos dentro de los archivos.' : 'Solo se buscan canciones nuevas y borradas: las que ya conoce no se abren. Puedes cancelar cuando quieras.');
      const disco = await leerDisco(est => {
        if (!av || Date.now() - ultimo < 250) return; ultimo = Date.now();
        av.texto(`🎵 ${miles(est.canciones)} canciones encontradas`, `📁 ${miles(est.carpetas)} carpetas revisadas · ahora en: ${est.actual}`);
      }, completo);
      const dif = compararCarpeta(disco);
      S._dif = dif;
      guardarManijas();
      // Informe del escaneo: cuántas canciones hay en cada carpeta y qué audios no se pueden tocar
      const e = disco.est;
      S.informe = { fecha: ahora(), porRaiz: e.porRaiz, porSub: Object.entries(e.porSub).sort((a, b) => b[1] - a[1]).slice(0, 40), noReproduce: e.noReproduce,
        saltadas: e.saltadas, errores: e.errores || [], carpetasRevisadas: e.carpetas, total: disco.size, archivosVistos: e.archivosVistos,
        otrosTipos: Object.entries(e.otrosTipos).sort((a, b) => b[1] - a[1]).slice(0, 8), carpetasConError: e.carpetasConError.slice(0, 20),
        fallos: e.fallos.length, fallosEjemplo: e.fallos.slice(0, 10) };
      DB.guardarConfig('informeEscaneo', S.informe);
      await DB.guardarConfig('ultimoEscaneo', ahora()); S.ultimoEscaneo = ahora();
      if (av) av.fin();
      if (!dif.hayCambios) { if (modo === 'manual') { cerrarModal(); toast(dif.totalDisco ? `✅ Sin cambios · ${miles(dif.totalDisco)} canciones` : '⚠️ No encontré canciones en esa carpeta', !dif.totalDisco); } return; }
      // Primera vez (la app no tenía canciones de la carpeta): entra directo, sin preguntar
      // Automático: aplica nuevas, modificadas y movidas. Las borradas también, salvo que sean demasiadas (¿carpeta desconectada?)
      // Si nada se borra (solo nuevas, cambiadas o movidas), se aplica directo: preguntar solo tiene sentido cuando algo sale
      if (dif.totalApp === 0 || !dif.faltan.length || (modo === 'auto' && !dif.sospechoso)) { await aplicarEscaneo(dif, modo); return; }
      mostrarEscaneo(dif);
    } catch (e) {
      if (av) av.fin();
      cerrarModal();
      if (e.message === 'cancelado') toast('Escaneo cancelado. No se cambió nada.');
      else if (modo === 'manual') toast('⚠️ No pude leer la carpeta: ' + e.message, true);
    } finally { S.escaneando = false; S.cancelar = false; }
  }
  function mostrarEscaneo(dif) {
    const lista = (arr, f) => arr.slice(0, 25).map(f).map(esc).join(' · ') + (arr.length > 25 ? ' …' : '');
    modal(`<h2>🔍 Lo que cambió en ${dif.android ? 'tu música' : 'tu carpeta'}</h2>
      <div class="caja">
      <p>➕ <b>${miles(dif.nuevas.length)}</b> nuevas</p>${dif.nuevas.length ? `<p class="suave peq">${lista(dif.nuevas, d => d.nombre)}</p>` : ''}
      <p>✏️ <b>${miles(dif.modificadas.length)}</b> modificadas</p>${dif.modificadas.length ? `<p class="suave peq">${lista(dif.modificadas, x => x[0].titulo)}</p>` : ''}
      <p>📂 <b>${miles(dif.movidas.length)}</b> movidas de carpeta</p>
      <p>🗑 <b>${miles(dif.faltan.length)}</b> ya no están en el teléfono</p>${dif.faltan.length ? `<p class="suave peq">${lista(dif.faltan, c => c.titulo)}</p>` : ''}
      </div>
      ${dif.sospechoso ? `<div class="caja aviso-c"><p><b>⚠️ Faltan muchas canciones (${miles(dif.faltan.length)} de ${miles(dif.totalApp)}).</b></p><p class="peq">¿Se desconectó la memoria o cambiaste la carpeta? Revisa antes de aplicar. Guarda un respaldo primero.</p></div>` : ''}
      <p class="ayuda">Las que ya no están NO pierden su trayectoria: estrellas, ❤, escuchas y listas quedan guardadas y vuelven si la canción regresa.</p>
      <div class="botones">${dif.faltan.length ? '<button class="btn prim" data-accion="escaneoRespaldo">💾 Guardar respaldo y aplicar</button><button class="btn sec" data-accion="escaneoAplicar">Aplicar sin respaldo</button>' : '<button class="btn prim" data-accion="escaneoAplicar">Aplicar</button>'}
      <button class="btn sec" data-accion="cerrar">Ahora no</button></div>`);
  }
  // Aplica lo encontrado. Las canciones entran AL INSTANTE con los datos del nombre del archivo;
  // título, artista, categoría, género y año se leen de cada canción por detrás (completarDatos).
  async function aplicarEscaneo(dif, origen) {
    const av = origen !== 'auto' ? ventanaAvance('➕ Agregando canciones', 'Entran ya con el nombre del archivo. Artista, categoría, género y año se completan solos por detrás.') : null;
    const recuperadas = [], carpetaDe = (r, raiz) => r.includes('/') ? r.split('/').slice(-2, -1)[0] : ((raizDe(raiz) || {}).name || '');
    for (const [c, d] of dif.movidas) { c.ruta = d.ruta; c.raiz = d.raiz; c.carpeta = carpetaDe(d.ruta, d.raiz); c.mtime = d.mtime; }
    if (dif.movidas.length) await DB.varios('canciones', dif.movidas.map(x => x[0]));
    for (const [c, d] of dif.modificadas) { c.tamano = d.tamano; c.mtime = d.mtime; c.modificada = ahora(); c.pendienteDatos = 1; }
    if (dif.modificadas.length) await DB.varios('canciones', dif.modificadas.map(x => x[0]));
    let lote = [];
    for (let i = 0; i < dif.nuevas.length; i++) {
      const d = dif.nuevas[i], n = Etiquetas.desdeNombre(d.nombre);
      const c = { id: 'c' + uid(), origen: 'carpeta', raiz: d.raiz, archivo: d.nombre, tamano: d.tamano, mtime: d.mtime, ruta: d.ruta, carpeta: carpetaDe(d.ruta, d.raiz),
        titulo: n.titulo, artista: n.artista, album: '', genero: '', anio: '', favorita: 0, calificacion: 0, alta: ahora(), pendienteDatos: 1 };
      const m = aplicarMemoria(c);
      if (m) { recuperadas.push(c.titulo); await olvidarMemoria(m); }
      S.canciones.set(c.id, c); lote.push(c);
      if (lote.length >= 200 || i === dif.nuevas.length - 1) {
        await DB.varios('canciones', lote); lote = [];
        if (av) { av.texto(`➕ ${miles(i + 1)} de ${miles(dif.nuevas.length)} canciones`, ''); av.porcentaje((i + 1) / dif.nuevas.length * 100); }
      }
    }
    if (av) av.fin();
    if (dif.faltan.length) await quitarDeApp(dif.faltan.map(c => c.id), 'Ya no está en el teléfono', true);
    const fmt = c => `${c.titulo} — ${c.artista || 'Sin artista'}`;
    await anotar({ tipo: 'biblioteca', campo: 'escaneo', origen: origen === 'auto' ? 'automático' : 'manual',
      antes: `${miles(dif.totalApp)} canciones`, despues: `${miles([...S.canciones.values()].filter(c => c.origen === 'carpeta').length)} canciones`,
      detalle: { nuevas: dif.nuevas.map(d => d.nombre), recuperadas, modificadas: dif.modificadas.map(x => fmt(x[0])), movidas: dif.movidas.map(x => `${fmt(x[0])} → ${x[1].ruta}`), faltan: dif.faltan.map(fmt) } });
    cerrarModal();
    toast(`🔍 +${miles(dif.nuevas.length)} nuevas · ${dif.modificadas.length} modificadas · ${dif.faltan.length} ya no están${recuperadas.length ? ` · ${recuperadas.length} recuperaron su trayectoria` : ''}`);
    cambioDatos();
    if (dif.totalApp === 0 && dif.nuevas.length && location.hash !== '#/biblioteca') location.hash = '#/biblioteca';
    pintar();
    completarDatos();
  }

  // Lee por detrás los datos internos (título, artista, categoría, género, año) de las canciones pendientes.
  // Muestra una barrita arriba. Si la app se cierra, sigue la próxima vez donde iba. Nunca pisa lo que Edwin corrigió.
  async function completarDatos() {
    if (S.completando) return;
    const pend = [...S.canciones.values()].filter(c => c.pendienteDatos);
    if (!pend.length) return;
    S.completando = true;
    const barra = $('#fondo'), total = pend.length, inicio = Date.now();
    let hechas = 0, lote = [];
    const mostrar = (txt) => {
      if (!barra) return;
      barra.hidden = false;
      const seg = hechas ? (Date.now() - inicio) / 1000 / hechas * (total - hechas) : 0;
      const falta = !hechas ? 'calculando…' : seg < 60 ? 'menos de 1 min' : `unos ${Math.ceil(seg / 60)} min`;
      barra.innerHTML = `🏷️ ${txt || 'Completando datos de tus canciones'}: <b>${miles(hechas)}</b> de ${miles(total)} · faltan ${falta}<i style="width:${Math.max(1, hechas / total * 100)}%"></i>`;
    };
    // Una canción que se queda «pegada» más de 12 s se salta (antes congelaba todo)
    const conTiempo = (p, ms) => Promise.race([p, new Promise((_, mal) => setTimeout(() => mal(new Error('tardó demasiado')), ms))]);
    mostrar();
    try {
      while (S.escaneando) { mostrar('Esperando a que termine el escaneo'); await new Promise(r => setTimeout(r, 1000)); }
      for (let i = 0; i < pend.length; i += 6) {
        if (S.carpeta && !S.permiso && pend.slice(i, i + 6).some(c => c.origen === 'carpeta')) break;   // sin permiso: se sigue después, donde iba
        await Promise.all(pend.slice(i, i + 6).map(async c => {
          try {
            const t = await conTiempo(archivoDe(c).then(f => Etiquetas.leerDatos(f)), 12000);
            for (const [campo] of CAMPOS_DATOS) if (!(c.editados && campo in c.editados) && t[campo]) c[campo] = t[campo];
            c.tipoEtiqueta = t._tipo; c.datosLeidos = 2; delete c.pendienteDatos; delete c.errorDatos;
          } catch (e) {
            // Solo se da por perdida si falla 3 veces (archivo dañado); si fue el permiso, queda pendiente
            if (S.permiso || c.origen !== 'carpeta') { c.errorDatos = (c.errorDatos || 0) + 1; if (c.errorDatos >= 3) delete c.pendienteDatos; }
          }
          lote.push(c); hechas++;
        }));
        mostrar();   // la barrita avanza con cada grupo de 6
        if (lote.length >= 30 || i + 6 >= pend.length) { await DB.varios('canciones', lote); lote = []; cambioDatos(); }
        if (hechas % 400 === 0 && /biblioteca|listas|top/.test(location.hash)) pintar();
      }
    } finally {
      S.completando = false;
      if (barra) barra.hidden = true;
      pintar();
      // Si mientras tanto llegaron canciones nuevas (otro escaneo), se siguen con ellas
      if (S.permiso && [...S.canciones.values()].some(c => c.pendienteDatos && (c.errorDatos || 0) < 3 && !pend.includes(c))) setTimeout(completarDatos, 500);
    }
  }

  // Cambia el código de una canción (al restaurar en un teléfono nuevo) sin perder nada de lo que cuelga de él
  async function recodificar(viejo, nuevo) {
    const c = S.canciones.get(viejo); if (!c || viejo === nuevo) return;
    const a = await DB.uno('archivos', viejo);
    if (a) { await DB.poner('archivos', { id: nuevo, blob: a.blob }); await DB.borrar('archivos', viejo); }
    await DB.borrar('canciones', viejo); S.canciones.delete(viejo);
    c.id = nuevo; await DB.poner('canciones', c); S.canciones.set(nuevo, c);
    const es = (await DB.todos('escuchas')).filter(e => e.cancionId === viejo); es.forEach(e => e.cancionId = nuevo); if (es.length) await DB.varios('escuchas', es);
    for (const l of S.listas.values()) if ((l.ids || []).includes(viejo)) { l.ids = l.ids.map(x => x === viejo ? nuevo : x); await DB.poner('listas', l); }
    S.cola = S.cola.map(x => x === viejo ? nuevo : x);
    cambioDatos();
  }

  // ---------------------------------------------------------------- segundo plano y ventana flotante
  // Android sigue sonando en segundo plano y deja el control en notificaciones / pantalla bloqueada (Media Session).
  // La ventana flotante es un video pequeño (dibujado en un lienzo) en «imagen en imagen», con ⏮ ⏯ ⏭.
  const PIP = { video: null, lienzo: null, ctx: null, t: null };
  const PUEDE_PIP = !!(document.pictureInPictureEnabled && HTMLCanvasElement.prototype.captureStream);
  function dibujarPip() {
    const ctx = PIP.ctx; if (!ctx) return;
    const c = S.actual || {}, W = 480, H = 270;
    ctx.fillStyle = color(categoriaDe(c) || c.artista || 'Mi Música'); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, H - 14, W, 14);
    const d = audio.duration || c.duracion || 0;
    ctx.fillStyle = '#3fd0c9'; ctx.fillRect(0, H - 14, d ? W * (audio.currentTime / d) : 0, 14);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    const corta = (t, n) => (t || '').length > n ? t.slice(0, n - 1) + '…' : (t || '');
    ctx.font = 'bold 40px system-ui, sans-serif'; ctx.fillText(corta(c.titulo || 'Mi Música', 20), W / 2, 110);
    ctx.font = '30px system-ui, sans-serif'; ctx.fillText(corta(c.artista || '', 26), W / 2, 158);
    ctx.font = 'bold 30px system-ui, sans-serif'; ctx.fillText(`${audio.paused ? '⏸ En pausa' : '▶ Sonando'} · ${'★'.repeat(c.calificacion || 0)}${c.favorita ? ' ❤' : ''}`, W / 2, 215);
  }
  async function ventanaFlotante() {
    if (!PUEDE_PIP) return toast('Este teléfono no permite la ventana flotante', true);
    if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return; }
    if (!PIP.video) {
      PIP.lienzo = document.createElement('canvas'); PIP.lienzo.width = 480; PIP.lienzo.height = 270; PIP.ctx = PIP.lienzo.getContext('2d');
      PIP.video = document.createElement('video'); PIP.video.muted = true; PIP.video.playsInline = true;
      PIP.video.srcObject = PIP.lienzo.captureStream(4);
      PIP.video.addEventListener('leavepictureinpicture', () => { clearInterval(PIP.t); PIP.t = null; });
      // El botón ⏯ de la ventana pausa el video: se traduce en pausar/seguir la música y el video sigue mostrando
      PIP.video.addEventListener('pause', () => { if (document.pictureInPictureElement !== PIP.video) return; playPausa(); PIP.video.play().catch(() => {}); setTimeout(dibujarPip, 200); });
    }
    dibujarPip();
    await PIP.video.play();
    await PIP.video.requestPictureInPicture();
    clearInterval(PIP.t); PIP.t = setInterval(dibujarPip, 1000);
  }

  // ---------------------------------------------------------------- respaldo
  async function armarRespaldo() {
    const cs = (await DB.todos('canciones')).map(c => ({ id: c.id, archivo: c.archivo, tamano: c.tamano, ruta: c.ruta || '', titulo: c.titulo, artista: c.artista, album: c.album, genero: c.genero, anio: c.anio,
      favorita: c.favorita || 0, calificacion: c.calificacion || 0, editados: c.editados || null, alta: c.alta }));
    const datos = { canciones: cs, memoria: await DB.todos('memoria'), escuchas: await DB.todos('escuchas'), listas: await DB.todos('listas'), cambios: await DB.todos('cambios'), ajustes: S.config };
    return { tipo: 'mi-musica-respaldo', version: 2, fecha: ahora(), resumen: { canciones: cs.length, escuchas: datos.escuchas.length, listas: datos.listas.length, cambios: datos.cambios.length }, datos };
  }
  async function guardarRespaldo(modo) {
    const r = await armarRespaldo();
    const nombre = `Mi Musica - respaldo ${r.fecha.slice(0, 10)} ${r.fecha.slice(11, 16).replace(':', 'h')}.json`;
    const file = new File([JSON.stringify(r)], nombre, { type: 'application/json' });
    if (modo === 'compartir' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nombre }); } catch (e) { return; }
    } else descargar(file, nombre);
    S.ultimoRespaldo = r.fecha; await DB.guardarConfig('ultimoRespaldo', r.fecha);
    await anotar({ tipo: 'respaldo', campo: 'respaldo_guardado', despues: nombre, detalle: `${miles(r.resumen.canciones)} canciones · ${miles(r.resumen.escuchas)} escuchas · ${miles(r.resumen.listas)} listas` });
    cerrarModal(); toast('💾 Respaldo guardado'); pintar();
  }
  async function restaurar(file) {
    let r; try { r = JSON.parse(await file.text()); } catch (e) { return toast('⚠️ Archivo no válido', true); }
    if (!r || r.tipo !== 'mi-musica-respaldo' || !r.datos) return toast('⚠️ Ese archivo no es un respaldo de Mi Música', true);
    const D = r.datos;
    // Escuchas: se juntan sin repetir (cada una tiene su código)
    if (D.escuchas && D.escuchas.length) await DB.varios('escuchas', D.escuchas.map(({ uuid, cancionId, fecha, segundos, clase }) => ({ uuid, cancionId, fecha, segundos, clase })));
    if (D.listas && D.listas.length) await DB.varios('listas', D.listas);
    // Historial: se agregan los registros que no estén ya
    const firma = x => `${x.fecha}|${x.cancionId}|${x.campo}|${JSON.stringify(x.despues)}`;
    const hay = new Set(S.cambios.map(firma));
    const nuevosCambios = (D.cambios || []).filter(x => !hay.has(firma(x))).map(x => { const y = Object.assign({}, x); delete y.n; return y; });
    for (const x of nuevosCambios) await DB.poner('cambios', x);
    // Estatus y correcciones: a las canciones que están en la app; las demás quedan en memoria para cuando vuelvan
    let aplicadas = 0, guardadas = 0;
    for (const m of [...(D.canciones || []), ...(D.memoria || [])]) {
      let c = S.canciones.get(m.id);
      if (!c) {   // teléfono nuevo: la canción ya está pero con otro código → toma el código del respaldo
        const ruta = (m.ruta || '').toLowerCase(), arch = claveArchivo(m.archivo, m.tamano);
        const x = [...S.canciones.values()].find(y => (ruta && (y.ruta || '').toLowerCase() === ruta) || (m.archivo && claveArchivo(y.archivo, y.tamano) === arch));
        if (x) { await recodificar(x.id, m.id); c = S.canciones.get(m.id); }
      }
      if (c) {
        c.favorita = m.favorita || 0; c.calificacion = m.calificacion || 0;
        if (m.editados) { c.editados = Object.assign({}, m.editados); Object.assign(c, m.editados); }
        if (m.alta && (!c.alta || m.alta < c.alta)) c.alta = m.alta;
        await DB.poner('canciones', c); aplicadas++;
      } else { await DB.poner('memoria', { id: m.id, favorita: m.favorita || 0, calificacion: m.calificacion || 0, editados: m.editados || null, alta: m.alta, titulo: m.titulo, artista: m.artista, ruta: m.ruta || '', archivo: m.archivo, tamano: m.tamano }); guardadas++; }
    }
    if (D.ajustes) await DB.guardarConfig('ajustes', D.ajustes);
    await cargar();
    await anotar({ tipo: 'respaldo', campo: 'respaldo_cargado', antes: fechaCorta(r.fecha), despues: file.name,
      detalle: `${miles(aplicadas)} canciones actualizadas · ${miles(guardadas)} recordadas para cuando las agregues · ${miles((D.escuchas || []).length)} escuchas · ${miles((D.listas || []).length)} listas` });
    cerrarModal(); toast('✅ Respaldo restaurado'); pintar();
  }
  function descargar(blob, nombre) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function cambiosSinRespaldo() {
    const u = S.ultimoRespaldo || '';
    return S.cambios.filter(x => x.fecha > u && x.tipo !== 'respaldo').length;
  }
  function avisoRespaldo() {
    const d = diasDesde(S.ultimoRespaldo), pend = cambiosSinRespaldo();
    if (!S.canciones.size || !pend || d < (S.config.diasRespaldo || 7)) return '';
    return `<button class="btn sec" data-accion="respaldo" style="border-color:var(--aviso);margin-bottom:10px">💾 ${S.ultimoRespaldo ? `Hace ${Math.floor(d)} días sin respaldo` : 'Todavía no tienes respaldo'} · ${miles(pend)} cambios. Toca para guardar</button>`;
  }

  // ---------------------------------------------------------------- Excel (azul petróleo)
  function cargarExcel() {
    if (window.excelAzul) return Promise.resolve();
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = 'excel_azul.js'; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el módulo de Excel')); document.head.appendChild(s); });
  }
  const texto = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  async function excel(tipo) {
    await cargarExcel();
    if (tipo === 'historial') {
      const filas = S.cambios.slice().reverse().map(r => [r.fecha, r.tipo, NOMBRE_CAMPO[r.campo] || r.campo, r.titulo || '', r.artista || '', texto(r.antes), texto(r.despues), detalleTexto(r.detalle), r.deshecho ? 'Deshecho' : 'Vigente', r.origen || '']);
      await excelAzul.descargar('Mi Musica - Historial.xlsx', [{ nombre: 'Historial', columnas: ['Fecha', 'Tipo', 'Cambio', 'Canción', 'Artista', 'Antes', 'Después', 'Detalle', 'Estado', 'Origen'].map(t => ({ t, tipo: 'txt' })), filas }]);
    } else {
      const filas = [...S.canciones.values()].map(c => { const t = total(c); return [c.titulo || '', c.artista || '', categoriaDe(c), c.genero || '', anioDe(c), c.carpeta || '', c.calificacion || 0, c.favorita ? 'Sí' : 'No', estatusDe(c).nombre.replace(/^\S+\s/, ''), t.esc, t.sal, t.ultima, c.alta || '', c.archivo || '']; })
        .sort((a, b) => b[9] - a[9]);
      await excelAzul.descargar('Mi Musica - Canciones y estatus.xlsx', [{ nombre: 'Canciones', columnas: [['Título', 'txt'], ['Artista', 'txt'], ['Categoría', 'txt'], ['Género', 'txt'], ['Año', 'txt'], ['Carpeta', 'txt'], ['Estrellas', 'int'], ['Favorita', 'txt'], ['Estatus', 'txt'], ['Escuchas', 'int'], ['Saltos', 'int'], ['Última vez', 'txt'], ['Agregada', 'txt'], ['Archivo', 'txt']].map(([t, tipo]) => ({ t, tipo })), filas }]);
    }
    toast('📊 Excel descargado (carpeta Descargas)');
  }
  function detalleTexto(d) {
    if (!d) return '';
    if (typeof d === 'string') return d;
    const p = [];
    if (d.nuevas) p.push(`Nuevas (${d.nuevas.length}): ${d.nuevas.join(' | ')}`);
    if (d.recuperadas && d.recuperadas.length) p.push(`Recuperaron estatus: ${d.recuperadas.join(' | ')}`);
    if (d.yaEstaban) p.push(`Ya estaban: ${d.yaEstaban}`);
    if (d.modificadas && d.modificadas.length) p.push(`Modificadas (${d.modificadas.length}): ${d.modificadas.join(' | ')}`);
    if (d.movidas && d.movidas.length) p.push(`Movidas (${d.movidas.length}): ${d.movidas.join(' | ')}`);
    if (d.faltan && d.faltan.length) p.push(`Ya no están en el teléfono (${d.faltan.length}): ${d.faltan.join(' | ')}`);
    if (d.quitadas) p.push(`Quitadas: ${d.quitadas.join(' | ')}`);
    if (d.motivo) p.push(d.motivo);
    return p.join(' · ');
  }

  // ---------------------------------------------------------------- piezas de pantalla
  function estrellasHtml(c, accion) {
    let h = '<div class="estrellas" role="group" aria-label="Estrellas">';
    for (let i = 1; i <= 6; i++) h += `<button class="${(c.calificacion || 0) >= i ? 'on' : ''}" data-accion="${accion}" data-v="${i}" data-id="${esc(c.id)}" aria-label="${i} estrellas">★</button>`;
    return h + '</div>';
  }
  function filaCancion(c, i, extra) {
    const t = total(c), son = S.actual && S.actual.id === c.id;
    return `<div class="cancion${son ? ' sonando' : ''}" data-accion="sonarDeLista" data-i="${i}" data-id="${esc(c.id)}">
      ${extra && extra.rank ? `<div class="rank">${extra.rank}</div>` : `<div class="mini-port" style="background:${color(categoriaDe(c) || c.artista)}">${esc(iniciales(c))}</div>`}
      <div class="c-txt"><b>${son ? '🔊 ' : ''}${esc(c.titulo || c.archivo)}</b><span>${esc(c.artista || 'Sin artista')}${categoriaDe(c) ? ' · ' + esc(categoriaDe(c)) : ''}${anioDe(c) ? ' · ' + anioDe(c) : ''}</span></div>
      <div class="c-der"><div class="meta">${c.favorita ? '<span class="h">❤</span> ' : ''}${c.calificacion ? `<span class="e">${c.calificacion}★</span>` : ''}<br>${extra && extra.dato != null ? extra.dato : (t.esc ? '▶ ' + miles(t.esc) : '')}</div>
      <button class="mas-btn" data-accion="menuCancion" data-id="${esc(c.id)}" aria-label="Opciones">⋮</button></div></div>`;
  }
  function pintarBotonesPlay() { document.querySelectorAll('[data-accion="playPausa"]').forEach(b => b.textContent = audio.paused ? '▶' : '⏸'); }
  function actualizarProgreso() {
    const d = audio.duration || (S.actual && S.actual.duracion) || 0, t = audio.currentTime || 0;
    const r = $('#barraTiempo'); if (r && !r.dataset.arrastrando) { r.max = Math.max(1, d); r.value = t; }
    const a = $('#tActual'), b = $('#tTotal'); if (a) a.textContent = mmss(t); if (b) b.textContent = mmss(d);
    const m = $('#mini .barrita'); if (m) m.style.width = (d ? t / d * 100 : 0) + '%';
  }
  function pintarMini() {
    const m = $('#mini'), c = S.actual, ruta = (location.hash || '#/sonando').split('/')[1];
    if (!c || ruta === 'sonando') { m.hidden = true; return; }
    m.hidden = false;
    m.innerHTML = `<i class="barrita"></i><div class="c-txt" data-ir="#/sonando"><b>${esc(c.titulo || c.archivo)}</b><span>${esc(c.artista || '')}</span></div>
      <button class="ib" data-accion="playPausa" aria-label="Reproducir o pausar">${audio.paused ? '▶' : '⏸'}</button>
      <button class="ib" data-accion="siguiente" aria-label="Siguiente">⏭</button>`;
    actualizarProgreso();
  }
  // Selector de varias opciones dentro de un formulario (con buscador)
  function selector(nombre, campo, sel) {
    const vals = valoresDe(campo);
    sel = sel || [];
    return `<details class="sel"${sel.length ? ' open' : ''}><summary><b>${nombre}</b> <span class="suave">${sel.length ? sel.length + ' elegidas' : 'todas'}</span></summary>
      ${vals.length > 8 ? '<input type="search" class="buscaSel" placeholder="🔎 Buscar…">' : ''}
      <div class="sel-opc">${vals.map(([v, n, t]) => `<label class="opcion" data-t="${esc(norm(t))}"><input type="checkbox" class="r-${campo}" value="${esc(v)}"${sel.includes(v) ? ' checked' : ''}> ${esc(t)} <small class="suave">${miles(n)}</small></label>`).join('')}</div></details>`;
  }

  // ---------------------------------------------------------------- pantallas
  const P = {};
  // Diagnóstico en texto para pegar en el chat: qué tipos de archivo y de datos internos hay, y ejemplos de los que fallan
  function diagnosticoTexto() {
    const t = [...S.canciones.values()], cuenta = (arr, f) => { const m = {}; arr.forEach(x => { const k = f(x); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const ext = c => ((c.archivo || '').split('.').pop() || '?').toLowerCase();
    const sinGen = t.filter(c => !c.genero), sinCat = t.filter(c => !c.album);
    const L = [];
    L.push(`MI MÚSICA — DIAGNÓSTICO ${ahora()} · versión ${(document.body.innerText.match(/versión (\d+)/) || [])[1] || '?'}`);
    L.push(`Canciones: ${t.length} · de carpeta: ${t.filter(c => c.origen === 'carpeta').length} · copiadas: ${t.filter(c => c.origen !== 'carpeta').length}`);
    if (NATIVO) L.push(`APP INSTALADA · catálogo de Android: ${S.infoAndroid ? `${S.infoAndroid.total} audios, ${S.infoAndroid.noMusica} no son música, Android ${S.infoAndroid.android}` : 'sin leer'}`);
    else L.push(`Carpetas: ${S.raices.map(r => `${r.h.name}${r.ok ? '' : ' (sin permiso)'}`).join(', ') || 'ninguna'} · permiso: ${S.permiso ? 'sí' : 'no'}`);
    L.push(`Con género: ${t.length - sinGen.length} · sin género: ${sinGen.length} · con categoría: ${t.length - sinCat.length} · con año: ${t.filter(c => anioDe(c)).length}`);
    L.push(`Pendientes de leer: ${t.filter(c => c.pendienteDatos).length} · con error al leer: ${t.filter(c => c.errorDatos).length}`);
    L.push(`Tipos de archivo: ${cuenta(t, ext).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    L.push(`Datos internos: ${cuenta(t, c => c.tipoEtiqueta || 'sin leer con v10').map(([k, n]) => `${k} ${n}`).join(', ')}`);
    L.push(`Sin género por tipo de archivo: ${cuenta(sinGen, ext).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    L.push(`Sin género por datos internos: ${cuenta(sinGen, c => c.tipoEtiqueta || 'sin leer con v10').map(([k, n]) => `${k} ${n}`).join(', ')}`);
    L.push(`Géneros más comunes: ${valoresDe('generos').slice(0, 15).map(([v, n]) => `${v} ${n}`).join(', ')}`);
    L.push(`Categorías más comunes: ${valoresDe('categorias').slice(0, 15).map(([v, n]) => `${v} ${n}`).join(', ')}`);
    L.push('Ejemplos sin género:');
    sinGen.slice(0, 15).forEach(c => L.push(`  - ${c.ruta || c.archivo} | ${c.tipoEtiqueta || '?'} | ${c.artista || ''} | cat:${c.album || ''}`));
    const I = S.informe;
    if (I) L.push(`Último escaneo ${I.fecha}: ${I.carpetasRevisadas} carpetas, ${I.archivosVistos || '?'} archivos vistos, ${I.total} canciones, carpetas con error: ${(I.carpetasConError || []).length}, ilegibles: ${I.fallos || 0}, otros tipos: ${(I.otrosTipos || []).map(([x, n]) => `${x} ${n}`).join(', ')}, no reproducibles: ${Object.entries(I.noReproduce || {}).map(([x, n]) => `${x} ${n}`).join(', ')}`);
    return L.join('\n');
  }
  // Informe del último escaneo: dónde encontró canciones y qué no pudo usar
  function informeHtml() {
    const I = S.informe; if (!I) return '';
    const noRep = Object.entries(I.noReproduce || {});
    return `<details class="sel" style="margin-top:10px"><summary><b>🔎 Qué encontró el último escaneo</b> <span class="suave">${miles(I.total)} canciones</span></summary><div class="peq" style="padding-bottom:8px">
      <p>📁 Revisó <b>${miles(I.carpetasRevisadas)}</b> carpetas y vio <b>${miles(I.archivosVistos || 0)}</b> archivos; <b>${miles(I.total)}</b> son canciones.</p>
      ${(I.otrosTipos || []).length ? `<p class="suave">Otros archivos (no son música): ${I.otrosTipos.map(([x, n]) => `${miles(n)} .${esc(x)}`).join(', ')}</p>` : ''}
      ${(I.carpetasConError || []).length ? `<p class="mal">⚠️ Carpetas que no se pudieron abrir: ${I.carpetasConError.map(esc).join(', ')}</p>` : ''}
      ${I.fallos ? `<p class="mal">⚠️ ${miles(I.fallos)} canciones no se pudieron leer, por ejemplo: ${(I.fallosEjemplo || []).map(esc).join(', ')}</p>` : ''}
      ${(I.porSub || []).map(([s, n]) => `<p>· ${esc(s)}: <b>${miles(n)}</b></p>`).join('')}
      ${noRep.length ? `<p class="aviso">⚠️ Audios que el teléfono no puede tocar en la app: ${noRep.map(([x, n]) => `${miles(n)} .${esc(x)}`).join(', ')}.</p>` : ''}
      ${(I.saltadas || []).length ? `<p class="suave">Carpetas del sistema que no se revisan: ${I.saltadas.map(esc).join(', ')}</p>` : ''}
      ${(I.errores || []).length ? `<p class="mal">No se pudo leer: ${I.errores.map(esc).join(', ')} (toca la pantalla para dar permiso y escanea otra vez).</p>` : ''}
    </div></details>`;
  }
  function avisoCarpeta() {
    if (!S.carpeta || S.permiso) return '';
    return `<button class="btn sec" data-accion="permisoCarpeta" style="border-color:var(--aviso);margin-bottom:10px">🔓 Conectando tu carpeta «${esc(S.carpeta.name)}»… (si Android pregunta, toca Permitir)</button>`;
  }
  P.sonando = () => {
    if (!S.canciones.size) return avisoCarpeta() + bienvenida();
    const c = S.actual || (S.cola.length && S.pos >= 0 ? S.canciones.get(S.cola[S.pos]) : null);
    if (!c) return `${avisoRespaldo()}<div class="repro"><div class="portada" style="background:${color('Mi Música')}">♪</div><p class="r-titulo">¿Qué quieres oír?</p>
      <button class="fuente" data-accion="elegirFuente"><span>🎚️ ${esc(S.fuente.nombre)}</span><span>›</span></button>
      <button class="ctl play" data-accion="playPausa" aria-label="Reproducir">▶</button></div>`;
    const e = estatusDe(c), t = total(c), cat = categoriaDe(c);
    return `<div class="solo-normal">${avisoCarpeta()}${avisoRespaldo()}</div><div class="repro">
      <button class="btn sec solo-carro" data-accion="modoCarro" style="max-width:260px">✖ Salir del modo carro</button>
      <div class="portada" style="background:${color(cat || c.artista)}">${esc(iniciales(c))}</div>
      <div><p class="r-titulo">${esc(c.titulo || c.archivo)}</p><p class="r-artista">${partesArtista(c.artista).length ? partesArtista(c.artista).map(n => `<a href="${enlaceArtista(n)}" class="enlace-artista">${esc(n)}</a>`).join(' · ') : 'Sin artista'}</p></div>
      <div class="chips solo-normal" style="justify-content:center">${cat ? `<a class="etq" href="${enlaceAlbum(cat)}" style="text-decoration:none;color:inherit">💿 ${esc(cat)}</a>` : ''}${c.genero ? `<button class="etq" data-accion="irGenero" data-v="${esc(c.genero)}" style="cursor:pointer">🎸 ${esc(c.genero)}</button>` : ''}${anioDe(c) ? `<button class="etq" data-accion="irAnio" data-v="${anioDe(c)}" style="cursor:pointer">${anioDe(c)}</button>` : ''}<span class="etq estatus">${e.nombre}</span></div>
      <div class="progreso"><input type="range" id="barraTiempo" min="0" step="1" aria-label="Avance de la canción"><div class="tiempos"><span id="tActual">0:00</span><span id="tTotal">0:00</span></div></div>
      <div class="controles">
        <button class="ctl" data-accion="anterior" aria-label="Anterior">⏮</button>
        <button class="ctl play" data-accion="playPausa" aria-label="Reproducir o pausar">${audio.paused ? '▶' : '⏸'}</button>
        <button class="ctl" data-accion="siguiente" aria-label="Siguiente">⏭</button>
      </div>
      <div class="fila-iconos">
        <button class="ib corazon${c.favorita ? ' on' : ''}" data-accion="favorita" data-id="${esc(c.id)}" aria-label="Favorita">${c.favorita ? '❤' : '♡'}</button>
        <button class="ib solo-normal${S.azar ? ' on' : ''}" data-accion="azar" aria-label="Al azar">🔀</button>
        <button class="ib solo-normal${S.repetir !== 'no' ? ' on' : ''}" data-accion="repetir" aria-label="Repetir">${S.repetir === 'una' ? '🔂' : '🔁'}</button>
        <button class="ib solo-normal" data-accion="verCola" aria-label="A continuación">☰</button>
        <button class="ib solo-normal" data-accion="menuCancion" data-id="${esc(c.id)}" aria-label="Más opciones">⋮</button>
        ${PUEDE_PIP && !NATIVO ? '<button class="ib flotante" data-accion="flotante" aria-label="Ventana flotante">🪟</button>' : ''}
      </div>
      ${estrellasHtml(c, 'estrellas')}
      ${colaHtml()}
      <p class="suave peq solo-normal">▶ ${miles(t.esc)} escuchas · ⏭ ${miles(t.sal)} saltos${t.ultima ? ' · última ' + fechaCorta(t.ultima) : ''}</p>
      <button class="fuente solo-normal" data-accion="elegirFuente"><span>🎚️ Sonando: <b>${esc(S.fuente.nombre)}</b> <small class="suave">(${S.pos + 1} de ${S.cola.length})</small></span><span>›</span></button>
    </div>`;
  };
  function bienvenida() {
    if (NATIVO) return `<h2>🎵 Bienvenido a Mi Música</h2>
      <div class="caja"><p><b>1.</b> ¿Ya tenías la app web? Primero toca <b>Restaurar respaldo</b> para traer tu trayectoria (estatus, ❤, escuchas, listas).</p>
      <p><b>2.</b> Toca <b>Cargar mi música</b> y, cuando Android pregunte, elige <b>Permitir</b>.</p>
      <p><b>3.</b> Listo: aparecen todas las canciones del teléfono con artista, álbum, género y año, igual que en las demás apps.</p></div>
      <div class="botones"><button class="btn sec" data-accion="restaurar">📂 Restaurar respaldo</button>
      <button class="btn prim" data-accion="cargarAndroid">🎵 Cargar mi música</button></div>`;
    if (puedeCarpeta()) return `<h2>🎵 Bienvenido a Mi Música</h2>
      <div class="caja"><p><b>1.</b> ¿Ya tenías la app? Primero toca <b>Restaurar respaldo</b> para recuperar tu trayectoria (estatus, ❤, escuchas, listas).</p>
      <p><b>2.</b> Toca <b>Conectar mi carpeta de música</b> y elige la carpeta donde guardas las canciones (por ejemplo <b>Music</b>).</p>
      <p><b>3.</b> La app lee la carpeta sin copiar nada. Cuando metas o borres canciones, toca <b>🔍 Escanear</b> (o se escanea sola al abrir).</p></div>
      <div class="botones"><button class="btn sec" data-accion="restaurar">📂 Restaurar respaldo</button>
      <button class="btn prim" data-accion="conectarCarpeta">📁 Conectar mi carpeta de música</button></div>
      <p class="ayuda">Si tu teléfono no deja elegir la carpeta, usa <a href="#" data-accion="agregar">agregar canciones sueltas</a> (se copian dentro de la app).</p>`;
    return `<h2>🎵 Bienvenido a Mi Música</h2>
      <div class="caja"><p class="aviso">Este teléfono no deja conectar una carpeta: las canciones se copian dentro de la app.</p>
      <p><b>1.</b> ¿Ya tenías la app? Toca <b>Restaurar respaldo</b> para recuperar estatus, ❤, escuchas y listas.</p>
      <p><b>2.</b> Toca <b>Agregar una carpeta</b> o <b>Agregar canciones</b>.</p></div>
      <div class="botones"><button class="btn sec" data-accion="restaurar">📂 Restaurar respaldo</button>
      <button class="btn prim" data-accion="agregarCarpeta">📁 Agregar una carpeta</button>
      <button class="btn sec" data-accion="agregar">➕ Agregar canciones sueltas</button></div>`;
  }

  P.biblioteca = () => {
    if (!S.canciones.size) return bienvenida();
    const F = S.filtros, r = filtrar();
    const chip = (campo, nombre) => `<button class="chip${F[campo].length ? ' on' : ''}" data-accion="filtro" data-campo="${campo}">${nombre}${F[campo].length ? ` <small>(${F[campo].length})</small>` : ' ▾'}</button>`;
    const hayFiltro = CAMPOS_FILTRO.some(k => F[k].length) || F.q;
    const cats = valoresDe('categorias').filter(([v, n]) => esCategoria(v) && n >= 2);
    const nombreEst = k => (ESTATUS.find(e => e.clave === k) || {}).nombre || k;
    const activos = CAMPOS_FILTRO.flatMap(k => F[k].map(v => `<button class="chip on" data-accion="quitarValor" data-campo="${k}" data-v="${esc(v)}">${esc(k === 'estatus' ? nombreEst(v) : v)} ✖</button>`));
    if (F.q) activos.unshift(`<button class="chip on" data-accion="quitarTexto">«${esc(F.q)}» ✖</button>`);
    S._vistaIds = r.map(c => c.id);
    return `${avisoCarpeta()}<div class="busca"><input type="search" id="buscar" placeholder="🔎 Buscar canción, artista, categoría, año…" value="${esc(F.q)}" autocomplete="off">
      ${F.q ? '<button class="ico-btn" data-accion="quitarTexto" aria-label="Borrar búsqueda">✖</button>' : ''}</div>
      ${cats.length ? `<div class="desliza" style="margin-top:10px">${cats.map(([v, n]) => `<button class="chip${F.categorias.includes(v) ? ' on' : ''}" data-accion="toqueCategoria" data-v="${esc(v)}">${esc(v)} <small>${miles(n)}</small></button>`).join('')}</div>` : ''}
      <div class="desliza" style="margin-top:8px">${chip('generos', '🎸 Género')}${chip('anios', '📆 Año')}${chip('artistas', '🎤 Artista')}${chip('estatus', '🏆 Estatus')}${chip('categorias', '🏷️ Categoría')}${chip('carpetas', '📁 Carpeta')}</div>
      ${hayFiltro ? `<div class="chips" style="margin-top:8px">${activos.join('')}<button class="chip limpiar" data-accion="limpiarFiltros">🧹 Limpiar todo</button></div>` : ''}
      <div class="acciones-fijas">
        <button class="btn prim" data-accion="sonarVista">▶ Sonar ${miles(r.length)}</button>
        <button class="btn sec" data-accion="guardarVista">🗂️ Crear lista</button>
      </div>
      <select id="orden">${[['titulo', 'Orden: A-Z título'], ['artista', 'Orden: A-Z artista'], ['escuchas', 'Orden: más sonadas'], ['estatus', 'Orden: mejor estatus'], ['anio', 'Orden: año (nuevas primero)'], ['anioAsc', 'Orden: año (viejas primero)'], ['recientes', 'Orden: recién agregadas']].map(([v, t]) => `<option value="${v}"${F.orden === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <p class="suave peq" style="margin:8px 2px">${hayFiltro ? `${miles(r.length)} de ${miles(S.canciones.size)} canciones` : `${miles(S.canciones.size)} canciones`}</p>
      ${F.q ? sugerenciasBusqueda(F.q) : ''}
      <div class="lista">${r.slice(0, S.limite).map((c, i) => filaCancion(c, i)).join('')}</div>
      ${r.length > S.limite ? `<div class="botones"><button class="btn sec" data-accion="verMas">Ver más (${miles(r.length - S.limite)} restantes)</button></div>` : ''}
      ${!r.length ? '<p class="suave">No hay canciones con esos filtros.</p>' : ''}
      <div class="botones">${S.carpeta ? '<button class="btn sec" data-accion="escanear">🔍 Escanear mi carpeta (nuevas, cambiadas, borradas)</button>' : '<button class="btn sec" data-accion="actualizarBiblioteca">🔄 Actualizar con las canciones del teléfono</button>'}</div>`;
  };

  P.listas = () => {
    const cats = valoresDe('categorias').filter(([v, n]) => esCategoria(v) && n >= 2);
    const todas = [...S.canciones.values()];
    const mis = [...S.listas.values()].sort((a, b) => (b.reglas ? 1 : 0) - (a.reglas ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'));
    const tarjeta = (f, nombre, n) => `<button class="tarjeta" data-accion="sonarFuente" data-f='${esc(JSON.stringify(f))}'><span class="t-et">${esc(nombre)}</span><span class="t-val">${miles(n)}</span><span class="t-sub">canciones · toca para sonar</span></button>`;
    return `<div class="botones dos"><button class="btn prim" data-accion="nuevaInteligente">⚡ Lista inteligente</button><button class="btn sec" data-accion="nuevaLista">➕ Lista normal</button></div>
      <h2>🗂️ Mis listas</h2>
      <div class="lista">${mis.map(l => `<div class="cancion" data-ir="#/lista/${esc(l.uid)}"><div class="mini-port" style="background:${color(l.nombre)}">${l.reglas ? '⚡' : '🗂️'}</div>
        <div class="c-txt"><b>${esc(l.nombre)}</b><span>${miles(idsDeLista(l).length)} canciones${l.reglas ? ' · ' + esc(describirReglas(l.reglas)) : ''}</span></div>
        <div class="c-der"><button class="mas-btn" data-accion="sonarFuente" data-f='${esc(JSON.stringify({ tipo: 'lista', valor: l.uid, nombre: l.nombre }))}' aria-label="Sonar">▶</button></div></div>`).join('') || '<p class="suave">Todavía no tienes listas. Prueba una ⚡ inteligente: se arma sola.</p>'}</div>
      <h2>⭐ Rápidas</h2><div class="tarjetas">
        ${tarjeta({ tipo: 'favoritas', nombre: '❤ Favoritas' }, '❤ Favoritas', todas.filter(c => c.favorita).length)}
        ${ESTATUS.slice(0, 3).map(e => tarjeta({ tipo: 'estatus', valor: e.clave, nombre: e.nombre }, e.nombre, todas.filter(c => estatusDe(c).clave === e.clave).length)).join('')}
      </div>
      <h2>🏷️ Mis categorías</h2><div class="tarjetas">${cats.map(([v, n]) => tarjeta({ tipo: 'categoria', valor: v, nombre: v }, v, n)).join('') || '<p class="suave">Las categorías salen del «Álbum» de tus canciones.</p>'}</div>`;
  };
  P.lista = uidL => {
    const l = S.listas.get(uidL); if (!l) return '<p>Esa lista ya no existe.</p>';
    const ids = idsDeLista(l); S._vistaIds = ids;
    return `<h2>${l.reglas ? '⚡' : '🗂️'} ${esc(l.nombre)}</h2>
      ${l.reglas ? `<div class="caja"><p class="peq"><b>Reglas:</b> ${esc(describirReglas(l.reglas))}</p><p class="ayuda">Se vuelve a armar sola cada vez con tus estrellas, ❤ y escuchas del momento.</p></div>` : ''}
      <div class="botones dos"><button class="btn prim" data-accion="sonarFuente" data-f='${esc(JSON.stringify({ tipo: 'lista', valor: l.uid, nombre: l.nombre }))}'>▶ Sonar (${miles(ids.length)})</button>
      ${l.reglas ? `<button class="btn sec" data-accion="editarInteligente" data-uid="${esc(l.uid)}">⚙️ Cambiar reglas</button>` : `<button class="btn sec" data-accion="menuLista" data-uid="${esc(l.uid)}">⋮ Opciones</button>`}</div>
      ${l.reglas ? `<div class="botones"><button class="btn sec chico" data-accion="menuLista" data-uid="${esc(l.uid)}" style="width:100%">⋮ Más opciones</button></div>` : ''}
      <div class="lista">${ids.map(id => S.canciones.get(id)).map((c, i) => filaCancion(c, i)).join('') || '<p class="suave">Ninguna canción cumple esas reglas todavía.</p>'}</div>`;
  };

  P.top = sub => {
    const todas = [...S.canciones.values()];
    const conteo = ESTATUS.map(e => [e, todas.filter(c => estatusDe(c).clave === e.clave).length]);
    const tot = todas.reduce((s, c) => { const t = total(c); s.esc += t.esc; s.sal += t.sal; return s; }, { esc: 0, sal: 0 });
    const modo = sub || 'escuchadas';
    let lista, dato;
    if (modo === 'saltadas') { lista = todas.filter(c => total(c).sal > 0).sort((a, b) => total(b).sal - total(a).sal); dato = c => '⏭ ' + miles(total(c).sal); }
    else if (modo === 'mes') { lista = todas.filter(c => total(c).mes > 0).sort((a, b) => total(b).mes - total(a).mes); dato = c => '📅 ' + miles(total(c).mes); }
    else if (modo === 'categorias' || modo === 'generos' || modo === 'anios') {
      const m = new Map(), obt = modo === 'anios' ? c => (anioDe(c) ? anioDe(c).slice(0, 3) + '0s' : '(sin año)') : OBT[modo];
      todas.forEach(c => { const k = obt(c); const v = m.get(k) || { esc: 0, n: 0 }; v.esc += total(c).esc; v.n++; m.set(k, v); });
      const filas = [...m.entries()].sort((a, b) => b[1].esc - a[1].esc || b[1].n - a[1].n);
      const max = Math.max(1, ...filas.map(f => f[1].esc));
      return cabTop(conteo, tot, modo) + `<div class="caja">${filas.map(([k, v]) => `<div style="margin:8px 0">
        <div style="display:flex;justify-content:space-between;font-weight:800"><span>${esc(k)}</span><span class="num">▶ ${miles(v.esc)}</span></div>
        <div class="progreso-carga" style="margin:4px 0"><i style="width:${v.esc / max * 100}%"></i></div><span class="suave peq">${miles(v.n)} canciones</span></div>`).join('')}</div>`;
    }
    else { lista = todas.filter(c => total(c).esc > 0).sort((a, b) => total(b).esc - total(a).esc); dato = c => '▶ ' + miles(total(c).esc); }
    lista = lista.slice(0, 100); S._vistaIds = lista.map(c => c.id);
    return cabTop(conteo, tot, modo) + `<div class="lista">${lista.map((c, i) => filaCancion(c, i, { rank: i + 1, dato: dato(c) })).join('') || '<p class="suave">Todavía no hay datos.</p>'}</div>
      ${lista.length ? `<div class="botones"><button class="btn sec" data-accion="listaDesdeRanking" data-modo="${modo}">⚡ Crear lista inteligente con este ranking</button></div>` : ''}`;
  };
  // ======== MI RESUMEN: semana, mes, trimestre, año y todo, comparado con el periodo anterior ========
  const PERIODOS = [['semana', 'Esta semana', 'la semana pasada'], ['mes', 'Este mes', 'el mes pasado'], ['trimestre', 'Este trimestre', 'el trimestre pasado'],
    ['anio', 'Este año', 'el año pasado'], ['todo', 'Todo', '']];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const txtFecha = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 00:00:00`; };
  // Inicio del periodo (atras = 0 el actual, 1 el anterior…)
  function inicioPeriodo(tipo, atras) {
    const h = new Date(); h.setHours(0, 0, 0, 0);
    if (tipo === 'semana') { const d = (h.getDay() + 6) % 7; h.setDate(h.getDate() - d - 7 * atras); }
    else if (tipo === 'mes') { h.setDate(1); h.setMonth(h.getMonth() - atras); }
    else if (tipo === 'trimestre') { h.setDate(1); h.setMonth(Math.floor(h.getMonth() / 3) * 3 - 3 * atras); }
    else if (tipo === 'anio') { h.setMonth(0, 1); h.setFullYear(h.getFullYear() - atras); }
    else return '0000';
    return txtFecha(h);
  }
  function datosCancion(id) {
    const c = S.canciones.get(id) || S.memoria.get(id) || {};
    return { titulo: c.titulo || c.archivo || '(canción que ya no está)', artista: c.artista || '', album: c.album || '', genero: c.genero || '', presente: S.canciones.has(id) };
  }
  function estadisticas(desde, hasta) {
    const es = (S.escuchas || []).filter(e => e.fecha >= desde && e.fecha < hasta);
    const r = { escuchas: 0, saltos: 0, minutos: 0, porCancion: new Map(), porArtista: new Map(), porAlbum: new Map(), porGenero: new Map(), dias: new Set(), porDia: [0, 0, 0, 0, 0, 0, 0], porHora: new Array(24).fill(0) };
    const sumar = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };
    for (const e of es) {
      r.minutos += (e.segundos || 0) / 60;
      if (e.clase === 'salto') { r.saltos++; continue; }
      r.escuchas++;
      const d = datosCancion(e.cancionId);
      sumar(r.porCancion, e.cancionId); sumar(r.porArtista, d.artista); sumar(r.porAlbum, d.album); sumar(r.porGenero, d.genero);
      r.dias.add(e.fecha.slice(0, 10));
      const f = new Date(e.fecha.replace(' ', 'T'));
      r.porDia[f.getDay()]++; r.porHora[f.getHours()]++;
    }
    r.nuevas = [...S.canciones.values()].filter(c => (c.alta || '') >= desde && (c.alta || '') < hasta).length;
    r.favMarcadas = S.cambios.filter(x => x.campo === 'favorita' && x.despues && x.fecha >= desde && x.fecha < hasta && !x.deshecho).length;
    return r;
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  function variacion(act, ant) {
    if (!ant) return act ? '<span class="bien">nuevo</span>' : '';
    const p = Math.round((act - ant) / ant * 100);
    return p === 0 ? '<span class="suave">igual</span>' : `<span class="${p > 0 ? 'bien' : 'mal'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)} %</span>`;
  }
  function barras(items, accion) {
    if (!items.length) return '<p class="suave peq">Todavía sin datos en este periodo.</p>';
    const max = Math.max(1, ...items.map(x => x[1]));
    return items.map(([k, n], i) => `<div ${accion ? accion(k) : ''} style="margin:7px 0;${accion ? 'cursor:pointer' : ''}">
      <div style="display:flex;justify-content:space-between;gap:8px;font-weight:700"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i + 1}. ${esc(k)}</span><span class="num">▶ ${miles(n)}</span></div>
      <div class="progreso-carga" style="margin:3px 0;height:9px"><i style="width:${n / max * 100}%"></i></div></div>`).join('');
  }
  P.resumen = sub => {
    const tipo = PERIODOS.some(p => p[0] === sub) ? sub : 'mes';
    const [, nombre, anterior] = PERIODOS.find(p => p[0] === tipo);
    const desde = inicioPeriodo(tipo, 0), hasta = '9999';
    const r = estadisticas(desde, hasta);
    const a = tipo === 'todo' ? null : estadisticas(inicioPeriodo(tipo, 1), desde);
    const topCanciones = top(r.porCancion, 10);
    S._topResumen = topCanciones.map(x => x[0]).filter(id => S.canciones.has(id));
    const diaFav = r.escuchas ? r.porDia.indexOf(Math.max(...r.porDia)) : -1;
    const horaFav = r.escuchas ? r.porHora.indexOf(Math.max(...r.porHora)) : -1;
    const filtrarPor = (campo) => k => `data-accion="usarSugerencia" data-campo="${campo}" data-v="${esc(k)}" data-ir-bib="1"`;
    // Mes a mes (últimos 12 meses)
    const meses = [];
    for (let i = 0; i < 12; i++) {
      const ini = inicioPeriodo('mes', i), fin = i ? inicioPeriodo('mes', i - 1) : '9999';
      const s = estadisticas(ini, fin);
      if (!s.escuchas && !s.saltos && i > 0) continue;
      const tc = top(s.porCancion, 1)[0], ta = top(s.porArtista, 1)[0];
      meses.push(`<tr><td>${MESES[+ini.slice(5, 7) - 1]} ${ini.slice(0, 4)}</td><td class="num">${miles(s.escuchas)}</td><td class="num">${miles(Math.round(s.minutos))}</td>
        <td>${ta ? esc(ta[0]) : '—'}</td><td>${tc ? esc(datosCancion(tc[0]).titulo) : '—'}</td></tr>`);
    }
    return `<div class="desliza" style="margin:0 -16px 12px">${PERIODOS.map(([k, t]) => `<a class="chip${tipo === k ? ' on' : ''}" href="#/resumen/${k}" style="text-decoration:none;display:flex;align-items:center">${t}</a>`).join('')}</div>
      <h2 style="margin-top:4px">📈 ${nombre}</h2>
      <div class="tarjetas">
        <div class="tarjeta" style="cursor:default"><span class="t-et">▶ Escuchas</span><span class="t-val">${miles(r.escuchas)}</span><span class="t-sub">${a ? variacion(r.escuchas, a.escuchas) + ' vs ' + anterior : 'en total'}</span></div>
        <div class="tarjeta" style="cursor:default"><span class="t-et">⏱ Minutos escuchados</span><span class="t-val">${miles(Math.round(r.minutos))}</span><span class="t-sub">${a ? variacion(r.minutos, a.minutos) + ' vs ' + anterior : `${miles(Math.round(r.minutos / 60))} horas`}</span></div>
        <div class="tarjeta" style="cursor:default"><span class="t-et">🎵 Canciones distintas</span><span class="t-val">${miles(r.porCancion.size)}</span><span class="t-sub">${miles(r.porArtista.size)} artistas</span></div>
        <div class="tarjeta" style="cursor:default"><span class="t-et">⏭ Saltos</span><span class="t-val">${miles(r.saltos)}</span><span class="t-sub">${r.escuchas + r.saltos ? Math.round(r.saltos / (r.escuchas + r.saltos) * 100) : 0} % de lo que suena</span></div>
        <div class="tarjeta" style="cursor:default"><span class="t-et">📅 Días con música</span><span class="t-val">${miles(r.dias.size)}</span><span class="t-sub">${diaFav >= 0 ? 'más los ' + DIAS[diaFav] : ''}</span></div>
        <div class="tarjeta" style="cursor:default"><span class="t-et">🕐 Hora favorita</span><span class="t-val">${horaFav >= 0 ? `${horaFav}:00` : '—'}</span><span class="t-sub">${r.nuevas ? `${miles(r.nuevas)} canciones nuevas` : ''}${r.favMarcadas ? ` · ${r.favMarcadas} ❤ nuevas` : ''}</span></div>
      </div>
      <h2>🔥 Canciones más escuchadas</h2>
      ${topCanciones.length ? `<div class="lista">${topCanciones.map(([id, n], i) => { const c = S.canciones.get(id); return c ? filaCancion(c, i, { rank: i + 1, dato: '▶ ' + miles(n) }) : `<div class="cancion"><div class="rank">${i + 1}</div><div class="c-txt"><b>${esc(datosCancion(id).titulo)}</b><span>ya no está en el teléfono</span></div><div class="c-der">▶ ${miles(n)}</div></div>`; }).join('')}</div>
        <div class="botones dos"><button class="btn prim" data-accion="sonarTopResumen">▶ Sonar este top</button><button class="btn sec" data-accion="listaTopResumen" data-nombre="${esc('Top ' + nombre.toLowerCase())}">🗂️ Guardar como lista</button></div>` : '<p class="suave">Todavía no hay escuchas en este periodo. Cada canción que suene se cuenta aquí.</p>'}
      <h2>🎤 Artistas favoritos</h2><div class="caja">${barras(top(r.porArtista, 10), filtrarPor('artistas'))}</div>
      <h2>🏷️ Categorías favoritas</h2><div class="caja">${barras(top(r.porAlbum, 8), filtrarPor('categorias'))}</div>
      <h2>🎸 Géneros favoritos</h2><div class="caja">${barras(top(r.porGenero, 8), filtrarPor('generos'))}</div>
      <h2>📅 Cuándo escuchas</h2><div class="caja">${barras([1, 2, 3, 4, 5, 6, 0].map(d => [DIAS[d], r.porDia[d]]).filter(x => x[1]), null)}</div>
      <h2>📆 Mes a mes</h2>
      <div class="caja" style="overflow-x:auto"><table class="peq" style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left"><th>Mes</th><th>▶</th><th>Min</th><th>Artista top</th><th>Canción top</th></tr></thead>
        <tbody>${meses.join('') || '<tr><td colspan="5" class="suave">Sin datos todavía.</td></tr>'}</tbody></table></div>
      <p class="suave peq">Se cuenta como escucha lo que suena 30 s o más, la mitad de la canción o completa; lo demás es salto.</p>`;
  };

  // Búsqueda inteligente: además de las canciones, muestra los artistas, categorías, géneros, años y carpetas
  // cuyo nombre coincide (desde las primeras letras). Un toque y queda filtrado por eso.
  function sugerenciasBusqueda(q) {
    const partes = norm(q).split(/\s+/).filter(Boolean);
    if (!partes.length) return '';
    const coincide = t => { const n = norm(t); return partes.every(p => n.includes(p)); };
    const grupos = [['artistas', '🎤'], ['categorias', '🏷️'], ['generos', '🎸'], ['anios', '📆'], ['carpetas', '📁']];
    const html = grupos.map(([campo, ic]) => {
      const vals = valoresDe(campo).filter(([v]) => !String(v).startsWith('(sin') && coincide(v)).slice(0, 8);
      return vals.map(([v, n]) => `<button class="chip" data-accion="usarSugerencia" data-campo="${campo}" data-v="${esc(v)}">${ic} ${esc(v)} <small>${miles(n)}</small></button>`).join('');
    }).join('');
    return html ? `<p class="suave peq" style="margin:6px 2px">También coincide con (toca para filtrar):</p><div class="chips" style="margin-bottom:8px">${html}</div>` : '';
  }
  function cabTop(conteo, tot, modo) {
    return `<a class="btn prim" href="#/resumen/mes" style="margin-bottom:12px">📈 Mi resumen: semana, mes, trimestre y año</a>
      <div class="tarjetas">${conteo.slice(0, 4).map(([e, n]) => `<button class="tarjeta" data-accion="verEstatus" data-v="${e.clave}"><span class="t-et">${e.nombre}</span><span class="t-val">${miles(n)}</span><span class="t-sub">canciones</span></button>`).join('')}
      <button class="tarjeta" data-ir="#/top/escuchadas"><span class="t-et">▶ Escuchas</span><span class="t-val">${miles(tot.esc)}</span><span class="t-sub">en total</span></button>
      <button class="tarjeta" data-ir="#/top/saltadas"><span class="t-et">⏭ Saltos</span><span class="t-val">${miles(tot.sal)}</span><span class="t-sub">en total</span></button>
      <button class="tarjeta" data-accion="sonarFuente" data-f='${esc(JSON.stringify({ tipo: 'favoritas', nombre: '❤ Favoritas' }))}'><span class="t-et">❤ Favoritas</span><span class="t-val">${miles([...S.canciones.values()].filter(c => c.favorita).length)}</span><span class="t-sub">toca para sonar</span></button>
      <button class="tarjeta" data-ir="#/historial"><span class="t-et">🕘 Cambios</span><span class="t-val">${miles(S.cambios.length)}</span><span class="t-sub">en el historial</span></button></div>
      <p class="suave peq">Estatus = estrellas + ❤: 🥉 1-2 puntos · 🥈 3-4 · 🥇 5-6 · 💎 7 (6★ y ❤).</p>
      <div class="desliza" style="margin:12px -16px">${[['escuchadas', '▶ Más sonadas'], ['mes', '📅 Este mes'], ['saltadas', '⏭ Más saltadas'], ['categorias', '🏷️ Categorías'], ['generos', '🎸 Géneros'], ['anios', '📆 Décadas']].map(([k, t]) => `<a class="chip${modo === k ? ' on' : ''}" href="#/top/${k}" style="text-decoration:none;display:flex;align-items:center">${t}</a>`).join('')}</div>`;
  }

  P.historial = () => {
    const val = (r, v) => r.campo === 'favorita' ? (v ? '❤ Sí' : '♡ No') : r.campo === 'calificacion' ? (v ? v + '★' : 'sin ★') : esc(v === '' || v == null ? '—' : v);
    const grupos = [['todo', 'Todo'], ['estatus', '★ Estatus'], ['datos', '✏️ Datos'], ['biblioteca', '📚 Biblioteca'], ['lista', '🗂️ Listas'], ['respaldo', '💾 Respaldos']];
    const h = S.cambios.filter(r => S.histFiltro === 'todo' || r.tipo === S.histFiltro).slice().reverse().slice(0, 400);
    const det = d => {
      if (!d) return '';
      if (typeof d === 'string') return `<div class="d">${esc(d)}</div>`;
      const p = [];
      if (d.nuevas && d.nuevas.length) p.push(`<b>Nuevas (${d.nuevas.length}):</b> ${d.nuevas.slice(0, 200).map(esc).join(' · ')}`);
      if (d.recuperadas && d.recuperadas.length) p.push(`<b>Recuperaron su estatus:</b> ${d.recuperadas.map(esc).join(' · ')}`);
      if (d.yaEstaban) p.push(`${miles(d.yaEstaban)} ya estaban`);
      if (d.modificadas && d.modificadas.length) p.push(`<b>Modificadas (${d.modificadas.length}):</b> ${d.modificadas.slice(0, 200).map(esc).join(' · ')}`);
      if (d.movidas && d.movidas.length) p.push(`<b>Movidas de carpeta (${d.movidas.length}):</b> ${d.movidas.slice(0, 200).map(esc).join(' · ')}`);
      if (d.faltan && d.faltan.length) p.push(`<b>Ya no están en el teléfono (${d.faltan.length}):</b> ${d.faltan.slice(0, 200).map(esc).join(' · ')} <i>(su trayectoria quedó guardada)</i>`);
      if (d.quitadas) p.push(`${d.quitadas.slice(0, 200).map(esc).join(' · ')}`);
      if (d.motivo) p.push(esc(d.motivo));
      return `<details class="d"><summary>Ver detalle</summary>${p.map(x => `<p>${x}</p>`).join('')}</details>`;
    };
    return `<h2>🕘 Historial</h2><p class="suave peq">Todo lo que cambia en tu música queda aquí. «Deshacer» lo devuelve como estaba.</p>
      <div class="desliza" style="margin:0 -16px 10px">${grupos.map(([k, t]) => `<button class="chip${S.histFiltro === k ? ' on' : ''}" data-accion="histFiltro" data-v="${k}">${t}</button>`).join('')}</div>
      <div class="lista">${h.map(r => `<div class="hist${r.deshecho ? ' deshecho' : ''}"><div><b>${NOMBRE_CAMPO[r.campo] || esc(r.campo)}</b>${r.titulo ? ' · ' + esc(r.titulo) : ''}
        <div class="d">${r.antes !== '' || r.despues !== '' ? `${val(r, r.antes)} → ${val(r, r.despues)} · ` : ''}${fechaCorta(r.fecha)}${r.origen === 'deshacer' ? ' · por deshacer' : ''}${r.deshecho ? ' · deshecho' : ''}</div>${det(r.detalle)}</div>
        ${r.deshacible && !r.deshecho ? `<button class="btn chico sec" data-accion="deshacer" data-n="${r.n}">↩ Deshacer</button>` : '<span></span>'}</div>`).join('') || '<p class="suave">Todavía no hay cambios.</p>'}</div>
      <div class="botones"><button class="btn sec" data-accion="excel" data-tipo="historial">📊 Descargar historial en Excel</button></div>`;
  };

  P.mas = () => {
    const d = diasDesde(S.ultimoRespaldo), pend = cambiosSinRespaldo();
    return `<h2>💾 Respaldo</h2>
      <div class="caja${(pend && d >= (S.config.diasRespaldo || 7)) ? ' aviso-c' : ''}"><p>Último respaldo: <b>${S.ultimoRespaldo ? fechaCorta(S.ultimoRespaldo) : 'nunca'}</b></p>
      <p class="suave peq">${miles(pend)} cambios desde entonces. El respaldo guarda estatus, ❤, estrellas, escuchas, listas inteligentes, correcciones e historial (no las canciones).
      Guárdalo en Drive, OneDrive o envíatelo por WhatsApp.</p></div>
      <div class="botones">${navigator.canShare ? '<button class="btn prim" data-accion="respaldoCompartir">📲 Guardar respaldo (Drive, WhatsApp…)</button>' : ''}
      <div class="botones dos" style="margin:0"><button class="btn sec" data-accion="respaldoDescargar">⬇ Descargar respaldo</button><button class="btn sec" data-accion="restaurar">📂 Restaurar</button></div></div>
      ${NATIVO ? (() => { const t = [...S.canciones.values()], I = S.infoAndroid || {};
        return `<h2>🎵 Música del teléfono</h2><div class="caja">
        <p><b>${miles(t.filter(c => c.origen === 'android').length)}</b> canciones, del catálogo de música de Android.</p>
        <p class="suave peq">Con género: ${miles(t.filter(c => c.genero).length)} · con categoría (álbum): ${miles(t.filter(c => c.album).length)} · con año: ${miles(t.filter(c => anioDe(c)).length)}</p>
        <p class="suave peq">Última revisión: ${S.ultimoEscaneo ? fechaCorta(S.ultimoEscaneo) : 'nunca'}${I.noMusica ? ` · ${miles(I.noMusica)} audios que no son música (notas de voz, tonos) no se muestran` : ''}</p>
        <label class="opcion"><input type="checkbox" data-ajuste="autoEscaneo"${S.config.autoEscaneo ? ' checked' : ''}> Revisar sola al abrir la app (canciones nuevas o borradas)</label>
        <div class="botones"><button class="btn prim" data-accion="cargarAndroid">🔄 Actualizar mi música ahora</button>
        <button class="btn sec chico" data-accion="diagnostico" style="width:100%">📋 Diagnóstico (copiar para enviar a Claude)</button>
        <button class="btn sec chico" data-accion="nuevaVersion" style="width:100%">⬇ Buscar una versión nueva de la app</button></div>
        <p class="ayuda">Para que no se corte en el carro: Ajustes › Aplicaciones › Mi Música › Batería › <b>Sin restricciones</b>.</p></div>`; })() : ''}
      ${NATIVO ? '' : '<h2>📁 Mis carpetas de música</h2>'}
      ${NATIVO ? '' : puedeCarpeta() ? `<div class="caja">
        ${S.raices.length ? S.raices.map(r => { const n = [...S.canciones.values()].filter(c => c.origen === 'carpeta' && (c.raiz || 'r0') === r.id).length;
          return `<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="flex:1">📁 <b>${esc(r.h.name)}</b> · ${miles(n)} canciones${r.ok ? '' : ' <span class="aviso">(falta permiso)</span>'}</span>
            <button class="btn chico peligro" data-accion="quitarCarpeta" data-id="${esc(r.id)}" aria-label="Desconectar">✖</button></div>`; }).join('') : '<p>Ninguna carpeta conectada.</p>'}
        <button class="btn sec" data-accion="conectarCarpeta" style="margin-top:8px">➕ ${S.raices.length ? 'Agregar otra carpeta' : 'Conectar mi carpeta de música'}</button>
        <p class="ayuda">¿Tu música está en varias carpetas (Music, la memoria SD, otras)? Agrégalas todas: se escanean juntas. Android no deja elegir «Descargas» ni la memoria completa; si tienes canciones ahí, pásalas a la carpeta Music.</p>
        ${informeHtml()}
        <p class="suave peq">Último escaneo: ${S.ultimoEscaneo ? fechaCorta(S.ultimoEscaneo) : 'nunca'} · ${miles([...S.canciones.values()].filter(c => c.origen === 'carpeta').length)} canciones leídas de tus carpetas</p>
        ${(() => { const t = [...S.canciones.values()], pend = t.filter(c => c.pendienteDatos).length, gen = t.filter(c => c.genero).length, an = t.filter(c => anioDe(c)).length, cat = t.filter(c => categoriaDe(c)).length;
          return `<p class="peq">🏷️ Datos leídos de tus canciones: <b>${miles(t.length - pend)}</b> de ${miles(t.length)}${pend ? ' <span class="aviso">(completando…)</span>' : ' ✅'}</p>
          <p class="suave peq">Con categoría: ${miles(cat)} · con género: ${miles(gen)} · con año: ${miles(an)}. Las que no tienen ese dato dentro del archivo salen como «sin género» / «sin año»; puedes corregirlas con ✏️.</p>
          <button class="btn sec chico" data-accion="releerTodas" style="width:100%">🏷️ Volver a leer los datos de todas las canciones</button>
          <button class="btn sec chico" data-accion="diagnostico" style="width:100%;margin-top:8px">📋 Diagnóstico (copiar para enviar a Claude)</button>`; })()}
        <label class="opcion"><input type="checkbox" data-ajuste="autoEscaneo"${S.config.autoEscaneo ? ' checked' : ''}> Escanear sola al abrir la app</label></div>
        <div class="botones">${S.carpeta ? '<button class="btn prim" data-accion="escanear">🔍 Buscar canciones nuevas o borradas</button><button class="btn sec chico" data-accion="escanearCompleto" style="width:100%">🔬 Revisión completa (si editaste datos dentro de los archivos)</button>' : ''}
        </div>`
      : '<p class="suave peq">Este teléfono no deja conectar una carpeta. Las canciones se copian dentro de la app.</p>'}
      ${NATIVO ? '' : `<details class="sel"><summary><b>Copiar canciones dentro de la app</b> <span class="suave">(opción de respaldo)</span></summary><div class="botones">
      <button class="btn sec" data-accion="actualizarBiblioteca">🔄 Actualizar desde una carpeta (copiando)</button>
      <div class="botones dos" style="margin:0"><button class="btn sec" data-accion="agregarCarpeta">📁 Agregar carpeta</button><button class="btn sec" data-accion="agregar">➕ Canciones sueltas</button></div></div></details>
      <h2>🚗 Para el carro</h2><div class="caja peq">
      <p>• La música <b>sigue sonando</b> aunque abras el GPS u otra app. Los controles quedan en la <b>barra de notificaciones</b> y en la pantalla bloqueada; también funcionan los del volante y el Bluetooth.</p>
      <p>• 🪟 <b>Ventana flotante</b>: en «Sonando», toca 🪟 y luego sal a tu GPS. Queda una ventanita con la canción y ⏮ ⏯ ⏭.</p>
      <p>• Para que el teléfono no la cierre: Ajustes del teléfono › Aplicaciones › <b>Chrome</b> › Batería › <b>Sin restricciones</b>.</p></div>`}
      <h2>📊 Informes</h2><div class="botones dos">
      <button class="btn sec" data-ir="#/historial">🕘 Historial</button>
      <button class="btn sec" data-accion="excel" data-tipo="canciones">📊 Excel de estatus</button></div>
      <h2>⚙️ Ajustes</h2><div class="caja">
      <label class="opcion"><input type="checkbox" data-ajuste="noRepetirArtista"${S.config.noRepetirArtista ? ' checked' : ''}> No repetir artista seguido al azar</label>
      <label class="opcion"><input type="checkbox" data-ajuste="pantallaEncendida"${S.config.pantallaEncendida ? ' checked' : ''}> Pantalla siempre encendida en modo carro</label>
      <div class="campo"><label>Recordarme el respaldo cada</label><select data-ajuste-num="diasRespaldo">${[1, 3, 7, 15, 30].map(n => `<option value="${n}"${(S.config.diasRespaldo || 7) === n ? ' selected' : ''}>${n} ${n === 1 ? 'día' : 'días'}</option>`).join('')}</select></div>
      <button class="opcion" data-accion="tema"><span class="ic">🌓</span>Cambiar a modo ${document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro'}</button></div>
      <p class="suave peq" id="espacio"></p><p class="suave peq">Mi Música · versión 12 · ${miles(S.canciones.size)} canciones${S.memoria.size ? ` · ${miles(S.memoria.size)} recordadas fuera de la app` : ''}</p>`;
  };

  // ---------------------------------------------------------------- ventanas
  // ======== EXPLORAR: artistas, colaboraciones, álbumes y géneros ========
  // «A feat. B», «A ft B», «A & B», «A, B», «A x B», «A / B», «A + B», «A vs B» → [A, B]
  const SEP_ARTISTAS = /\s*(?:,|;|&|\/|\+|\bfeat\.?\s+|\bft\.?\s+|\bfeaturing\s+|\bwith\s+|\s+x\s+|\s+vs\.?\s+)\s*/i;
  function partesArtista(s) {
    s = (s || '').trim(); if (!s) return [];
    const p = [...new Set(s.split(SEP_ARTISTAS).map(x => x.trim()).filter(Boolean))];
    return p.some(x => x.length <= 2) ? [s] : p;   // «AC/DC», «Q + U2»… no se parten
  }
  // Invitados que vienen en el título: «Canción (feat. B)», «Canción ft. B», «Canción [con B]».
  // «con» y «with» solo cuentan DENTRO de paréntesis (así «Bailando con lobos» no es una colaboración).
  function invitadosTitulo(t) {
    t = t || '';
    const m = /[([]\s*(?:feat\.?|ft\.?|featuring|con|with)\s+([^)\]]+)[)\]]/i.exec(t) || /\b(?:feat\.?|ft\.?|featuring)\s+(.+)$/i.exec(t);
    return m ? partesArtista(m[1].replace(/[)\]]+$/, '')) : [];
  }
  const enlaceArtista = n => '#/artista/' + encodeURIComponent(n);
  const enlaceAlbum = n => '#/album/' + encodeURIComponent(n);
  // Canciones de un artista: las suyas (solo él) y las colaboraciones (con otros, o invitado en el título)
  function obraDeArtista(nombre) {
    return recordar('artista:' + nombre, () => {
      const n = norm(nombre), propias = [], colab = [];
      for (const c of S.canciones.values()) {
        const completo = norm(c.artista);
        const partes = partesArtista(c.artista).map(norm);
        const invitado = invitadosTitulo(c.titulo).map(norm).includes(n);
        if (completo === n && partes.length <= 1) propias.push(c);
        else if (completo === n || partes.includes(n) || invitado) colab.push(c);
      }
      return { propias, colab };
    });
  }
  const masEscuchadas = arr => arr.slice().sort((a, b) => total(b).esc - total(a).esc || puntos(b) - puntos(a) || COMPARAR(a.titulo || '', b.titulo || ''));
  const contar = (arr, f) => { const m = new Map(); arr.forEach(c => [].concat(f(c)).forEach(k => { if (k) m.set(k, (m.get(k) || 0) + 1); })); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  P.artista = (nombre, genero) => {
    const { propias, colab } = obraDeArtista(nombre);
    const todas = [...propias, ...colab];
    if (!todas.length) return `<h2>🎤 ${esc(nombre)}</h2><p class="suave">No encontré canciones de este artista en tu teléfono.</p>`;
    const g = genero || '';
    const filtro = arr => g ? arr.filter(c => (c.genero || '(sin género)') === g) : arr;
    const p = masEscuchadas(filtro(propias)), co = masEscuchadas(filtro(colab));
    S._vistaIds = [...p, ...co].map(c => c.id);
    const n = norm(nombre);
    const generos = contar(todas, c => c.genero || '(sin género)');
    const albumes = contar(todas, c => categoriaDe(c));
    const socios = contar(colab, c => [...partesArtista(c.artista), ...invitadosTitulo(c.titulo)].filter(x => norm(x) !== n));
    const esc_ = todas.reduce((s, c) => s + total(c).esc, 0), fav = todas.filter(c => c.favorita).length;
    const fuente = JSON.stringify({ tipo: 'ids', ids: S._vistaIds, nombre: '🎤 ' + nombre + (g ? ' · ' + g : '') });
    return `<h2 style="margin-top:4px">🎤 ${esc(nombre)}</h2>
      <p class="suave">${miles(propias.length)} canciones${colab.length ? ` · ${miles(colab.length)} colaboraciones` : ''} · ▶ ${miles(esc_)} escuchas${fav ? ` · ❤ ${fav}` : ''}</p>
      <div class="botones dos"><button class="btn prim" data-accion="sonarFuente" data-f='${esc(JSON.stringify({ tipo: 'ids', ids: S._vistaIds, nombre: '🎤 ' + nombre, enOrden: true }))}'>▶ Sonar (${miles(S._vistaIds.length)})</button>
        <button class="btn sec" data-accion="sonarFuente" data-f='${esc(fuente)}'>🔀 Al azar</button></div>
      <h3>🎸 Géneros${generos.length > 1 ? ` (toca varios estilos: ${generos.length})` : ''}</h3>
      <div class="chips">${g ? `<a class="chip on" href="${enlaceArtista(nombre)}" style="text-decoration:none">${esc(g)} ✖</a>` : ''}${generos.filter(([x]) => x !== g).map(([x, k]) => `<a class="chip" href="${enlaceArtista(nombre)}/${encodeURIComponent(x)}" style="text-decoration:none">${esc(x)} <small>${miles(k)}</small></a>`).join('')}</div>
      ${albumes.length ? `<h3>💿 Álbumes y categorías</h3><div class="chips">${albumes.map(([x, k]) => `<a class="chip" href="${enlaceAlbum(x)}" style="text-decoration:none">💿 ${esc(x)} <small>${miles(k)}</small></a>`).join('')}</div>` : ''}
      ${socios.length ? `<h3>🤝 Ha cantado con</h3><div class="chips">${socios.slice(0, 20).map(([x, k]) => `<a class="chip" href="${enlaceArtista(x)}" style="text-decoration:none">🎤 ${esc(x)} <small>${miles(k)}</small></a>`).join('')}</div>` : ''}
      <h2>🎵 Sus canciones${g ? ' de ' + esc(g) : ''} <small class="suave">(${miles(p.length)})</small></h2>
      <div class="lista">${p.slice(0, 200).map((c, i) => filaCancion(c, i)).join('') || '<p class="suave">—</p>'}</div>
      ${co.length ? `<h2>🤝 Colaboraciones <small class="suave">(${miles(co.length)})</small></h2><div class="lista">${co.slice(0, 200).map((c, i) => filaCancion(c, p.length + i)).join('')}</div>` : ''}`;
  };
  P.album = nombre => {
    const canciones = [...S.canciones.values()].filter(c => categoriaDe(c) === nombre).sort((a, b) => COMPARAR(a.titulo || '', b.titulo || ''));
    if (!canciones.length) return `<h2>💿 ${esc(nombre)}</h2><p class="suave">No hay canciones con este álbum.</p>`;
    S._vistaIds = canciones.map(c => c.id);
    const artistas = contar(canciones, c => partesArtista(c.artista));
    const generos = contar(canciones, c => c.genero);
    const anios = contar(canciones, c => anioDe(c)).map(x => x[0]).sort();
    return `<h2 style="margin-top:4px">💿 ${esc(nombre)}</h2>
      <p class="suave">${miles(canciones.length)} canciones${anios.length ? ` · ${anios[0]}${anios.length > 1 ? '–' + anios[anios.length - 1] : ''}` : ''} · ▶ ${miles(canciones.reduce((s, c) => s + total(c).esc, 0))} escuchas</p>
      <div class="botones dos"><button class="btn prim" data-accion="sonarFuente" data-f='${esc(JSON.stringify({ tipo: 'ids', ids: S._vistaIds, nombre: '💿 ' + nombre, enOrden: true }))}'>▶ Sonar en orden</button>
        <button class="btn sec" data-accion="sonarFuente" data-f='${esc(JSON.stringify({ tipo: 'ids', ids: S._vistaIds, nombre: '💿 ' + nombre }))}'>🔀 Al azar</button></div>
      <h3>🎤 Artistas</h3><div class="chips">${artistas.slice(0, 30).map(([x, k]) => `<a class="chip" href="${enlaceArtista(x)}" style="text-decoration:none">🎤 ${esc(x)} <small>${miles(k)}</small></a>`).join('')}</div>
      ${generos.length ? `<h3>🎸 Géneros</h3><div class="chips">${generos.map(([x, k]) => `<button class="chip" data-accion="irGenero" data-v="${esc(x)}">${esc(x)} <small>${miles(k)}</small></button>`).join('')}</div>` : ''}
      <div class="lista" style="margin-top:12px">${canciones.slice(0, 300).map((c, i) => filaCancion(c, i)).join('')}</div>`;
  };
  // Sección «Explorar» del menú ⋮: artista(s), álbum, género y año de la canción
  function explorarHtml(c) {
    const art = partesArtista(c.artista), inv = invitadosTitulo(c.titulo).filter(x => !art.map(norm).includes(norm(x)));
    const nombres = [...(art.length > 1 ? [c.artista.trim()] : []), ...art, ...inv];
    const cuenta = n => { const o = obraDeArtista(n); return o.propias.length + o.colab.length; };
    const b = (h, ic, t, n) => `<button class="opcion" data-accion="irA" data-h="${esc(h)}"><span class="ic">${ic}</span>${t} <small class="suave">${n != null ? miles(n) : ''}</small></button>`;
    const cat = categoriaDe(c), y = anioDe(c);
    return `<h3>🔎 Explorar</h3>
      ${nombres.map((n, i) => b(enlaceArtista(n), '🎤', `Ver artista: <b>${esc(n)}</b>${art.length > 1 && i === 0 ? ' (juntos)' : inv.includes(n) ? ' (invitado)' : ''}`, cuenta(n))).join('')}
      ${cat ? b(enlaceAlbum(cat), '💿', `Ver álbum / categoría: <b>${esc(cat)}</b>`, [...S.canciones.values()].filter(x => categoriaDe(x) === cat).length) : ''}
      ${c.genero ? `<button class="opcion" data-accion="irGenero" data-v="${esc(c.genero)}"><span class="ic">🎸</span>Más del género: <b>${esc(c.genero)}</b> <small class="suave">${miles([...S.canciones.values()].filter(x => x.genero === c.genero).length)}</small></button>` : ''}
      ${y ? `<button class="opcion" data-accion="irAnio" data-v="${esc(y)}"><span class="ic">📆</span>Más del año: <b>${y}</b></button>` : ''}`;
  }
  function menuCancion(id) {
    const c = S.canciones.get(id); if (!c) return;
    const normales = [...S.listas.values()].filter(l => !l.reglas);
    modal(`<h2>${esc(c.titulo || c.archivo)}</h2><p class="suave">${esc(c.artista || '')}${categoriaDe(c) ? ' · ' + esc(categoriaDe(c)) : ''} · ${estatusDe(c).nombre}</p>
      ${estrellasHtml(c, 'estrellasMenu')}
      <button class="opcion" data-accion="favoritaMenu" data-id="${esc(id)}"><span class="ic">${c.favorita ? '💔' : '❤'}</span>${c.favorita ? 'Quitar de favoritas' : 'Marcar como favorita'}</button>
      <button class="opcion" data-accion="sonarYa" data-id="${esc(id)}"><span class="ic">▶</span>Sonar ahora</button>
      <button class="opcion" data-accion="despues" data-id="${esc(id)}"><span class="ic">⏭</span>Reproducir a continuación</button>
      <button class="opcion" data-accion="alFinal" data-id="${esc(id)}"><span class="ic">➕</span>Agregar al final de la cola</button>
      <button class="opcion" data-accion="aListaMenu" data-id="${esc(id)}"><span class="ic">🗂️</span>Agregar a una lista (existente o nueva)</button>
      ${explorarHtml(c)}
      <h3>⚙️ Más</h3>
      <button class="opcion" data-accion="editarDatos" data-id="${esc(id)}"><span class="ic">✏️</span>Corregir datos (título, artista, categoría, género, año)</button>
      <button class="opcion" data-accion="historialCancion" data-id="${esc(id)}"><span class="ic">🕘</span>Historial de esta canción</button>
      <button class="opcion" data-accion="quitarApp" data-id="${esc(id)}" style="color:var(--mal)"><span class="ic">🗑</span>Quitar de la app (libera espacio)</button>
      <p class="suave peq">${esc(c.archivo)} · agregada ${fechaCorta(c.alta)}</p>
      <button class="btn sec" data-accion="cerrar">Cerrar</button>`);
  }
  function editarDatos(id) {
    const c = S.canciones.get(id);
    const lista = campo => [...new Set([...S.canciones.values()].map(x => x[campo]).filter(Boolean))].sort();
    modal(`<h2>✏️ Corregir datos</h2><p class="suave peq">Solo cambia en la app (el archivo no se toca). Queda en el historial con «Deshacer».</p>
      ${CAMPOS_DATOS.map(([k, t]) => `<div class="campo"><label>${t}</label><input id="ed-${k}" value="${esc(c[k] || '')}"${k === 'anio' ? ' inputmode="numeric" maxlength="4"' : ''}${['album', 'genero', 'artista'].includes(k) ? ` list="dl-${k}"` : ''} autocomplete="off"></div>`).join('')}
      ${['album', 'genero', 'artista'].map(k => `<datalist id="dl-${k}">${lista(k).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`).join('')}
      <div class="botones dos"><button class="btn sec" data-accion="cerrar">Cancelar</button><button class="btn prim" data-accion="guardarDatos" data-id="${esc(id)}">Guardar</button></div>`);
  }
  function elegirFuente() {
    const cats = valoresDe('categorias').filter(([v, n]) => esCategoria(v) && n >= 2);
    const f = (o, ic, t, n) => `<button class="opcion" data-accion="sonarFuente" data-f='${esc(JSON.stringify(o))}'><span class="ic">${ic}</span>${esc(t)} <small class="suave">${n != null ? miles(n) : ''}</small></button>`;
    modal(`<h2>🎚️ ¿Qué suena?</h2>
      ${f({ tipo: 'todo', nombre: 'Toda mi música' }, '🎵', 'Toda mi música', S.canciones.size)}
      ${f({ tipo: 'favoritas', nombre: '❤ Favoritas' }, '❤', 'Favoritas', [...S.canciones.values()].filter(c => c.favorita).length)}
      ${ESTATUS.slice(0, 3).map(e => f({ tipo: 'estatus', valor: e.clave, nombre: e.nombre }, '', e.nombre, [...S.canciones.values()].filter(c => estatusDe(c).clave === e.clave).length)).join('')}
      ${S.listas.size ? '<h3>🗂️ Mis listas</h3>' + [...S.listas.values()].map(l => f({ tipo: 'lista', valor: l.uid, nombre: l.nombre }, l.reglas ? '⚡' : '🗂️', l.nombre, idsDeLista(l).length)).join('') : ''}
      ${cats.length ? '<h3>🏷️ Categorías</h3>' + cats.map(([v, n]) => f({ tipo: 'categoria', valor: v, nombre: v }, '🏷️', v, n)).join('') : ''}
      <button class="btn sec" data-accion="cerrar">Cerrar</button>`);
  }
  // Ventana para agregar una canción a una lista existente (✔ = ya está; tocar la saca) o crear una nueva
  function menuListas(id) {
    const c = S.canciones.get(id); if (!c) return;
    const normales = [...S.listas.values()].filter(l => !l.reglas).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    modal(`<h2>🗂️ Agregar a una lista</h2><p class="suave">${esc(c.titulo || c.archivo)}</p>
      <div class="campo"><label>🆕 Lista nueva</label><div style="display:flex;gap:8px"><input id="nlCancion" placeholder="Nombre de la lista nueva" autocomplete="off">
      <button class="btn prim chico" data-accion="nuevaListaDesdeMenu" data-id="${esc(id)}">Crear</button></div></div>
      ${normales.length ? `<h3>Mis listas</h3>${normales.map(l => `<button class="opcion" data-accion="${l.ids.includes(id) ? 'deLista' : 'aLista'}" data-uid="${esc(l.uid)}" data-id="${esc(id)}"><span class="ic">${l.ids.includes(id) ? '✔' : '🗂️'}</span>${esc(l.nombre)} <small class="suave">${miles(idsDeLista(l).length)}${l.ids.includes(id) ? ' · ya está (toca para sacarla)' : ''}</small></button>`).join('')}` : '<p class="suave peq">Todavía no tienes listas normales. Crea una arriba.</p>'}
      <p class="ayuda">Las listas ⚡ inteligentes se llenan solas con sus reglas; por eso no aparecen aquí.</p>
      <button class="btn sec" data-accion="cerrar">Listo</button>`);
  }
  // Cola visible en «Sonando»: las próximas 20 canciones
  function colaHtml() {
    if (!S.cola.length || S.pos < 0) return '';
    const sig = S.cola.slice(S.pos + 1, S.pos + 21).map((id, k) => [S.pos + 1 + k, S.canciones.get(id)]).filter(x => x[1]);
    if (!sig.length) return '';
    return `<div class="cola solo-normal" id="colaSonando"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:8px 0">☰ A continuación</h3>
      <span class="suave peq">${miles(S.cola.length - S.pos - 1)} en cola</span></div>
      <div class="lista">${sig.map(([p, c], k) => `<div class="cancion" data-accion="sonarPos" data-p="${p}"><div class="rank">${k + 1}</div>
        <div class="c-txt"><b>${esc(c.titulo || c.archivo)}</b><span>${esc(c.artista || '')}${categoriaDe(c) ? ' · ' + esc(categoriaDe(c)) : ''}</span></div>
        <div class="c-der">${k ? `<button class="mas-btn" data-accion="subirCola" data-p="${p}" aria-label="Subir">⬆</button>` : ''}<button class="mas-btn" data-accion="quitarCola" data-p="${p}" aria-label="Quitar de la cola">✖</button></div></div>`).join('')}</div></div>`;
  }
  function refrescarCola() {
    const el = $('#colaSonando');
    if (el) el.outerHTML = colaHtml() || '<div id="colaSonando"></div>';
    else if ((location.hash || '#/sonando').startsWith('#/sonando')) pintar();
  }
  function verCola() {
    const sig = S.cola.slice(S.pos, S.pos + 60).map((id, k) => [S.pos + k, S.canciones.get(id)]).filter(x => x[1]);
    modal(`<h2>☰ A continuación</h2><p class="suave peq">${esc(S.fuente.nombre)} · ${miles(S.cola.length)} canciones</p>
      <div class="lista">${sig.map(([p, c]) => `<div class="cancion${p === S.pos ? ' sonando' : ''}" data-accion="sonarPos" data-p="${p}"><div class="rank">${p === S.pos ? '🔊' : p - S.pos}</div><div class="c-txt"><b>${esc(c.titulo || c.archivo)}</b><span>${esc(c.artista || '')}</span></div><div></div></div>`).join('')}</div>
      <button class="btn sec" data-accion="cerrar" style="margin-top:10px">Cerrar</button>`);
  }
  function elegirFiltro(campo) {
    const nombres = { categorias: 'Categoría', generos: 'Género', anios: 'Año', artistas: 'Artista', carpetas: 'Carpeta', estatus: 'Estatus' };
    const vals = valoresDe(campo), sel = S.filtros[campo];
    S._campoFiltro = campo;
    const conDato = vals.filter(([v]) => !String(v).startsWith('(sin')).length;
    const pend = [...S.canciones.values()].filter(c => c.pendienteDatos).length;
    const aviso = campo === 'estatus' || campo === 'carpetas' ? '' : !conDato
      ? `<div class="caja aviso-c peq">Todavía no hay ${nombres[campo].toLowerCase()} leídos de tus canciones.${pend ? ` Se están leyendo ahora (faltan ${miles(pend)}); vuelve a abrir este filtro en un momento.` : ' Puedes pedir que se lean otra vez en Más › «🏷️ Volver a leer los datos».'}</div>`
      : pend ? `<p class="aviso peq">Leyendo datos: faltan ${miles(pend)} canciones; la lista se completa sola.</p>` : '';
    modal(`<h2>${nombres[campo]}</h2><p class="suave peq">Toca una o varias: se aplica al instante.</p>${aviso}
      <input type="search" class="buscaSel" placeholder="🔎 Buscar…" style="margin-bottom:6px">
      <div class="sel-opc" id="opcFiltro" style="max-height:52vh;overflow:auto">${vals.map(([v, n, t]) => `<label class="opcion" data-t="${esc(norm(t))}"><input type="checkbox" class="filtroVivo" value="${esc(v)}"${sel.includes(v) ? ' checked' : ''}> ${esc(t)} <small class="suave">${miles(n)}</small></label>`).join('')}</div>
      <div class="botones dos"><button class="btn sec" data-accion="filtroNinguno">🧹 Limpiar ${nombres[campo].toLowerCase()}</button><button class="btn prim" data-accion="cerrar" id="filtroListo">✔ Ver ${miles(filtrar().length)}</button></div>`);
  }
  // Aplica el filtro mientras se marca (sin botón Aplicar)
  function filtroVivo() {
    const campo = S._campoFiltro; if (!campo) return;
    S.filtros[campo] = [...document.querySelectorAll('#opcFiltro input:checked')].map(i => i.value);
    S.limite = 150; pintar();
    const b = $('#filtroListo'); if (b) b.textContent = `✔ Ver ${miles(filtrar().length)}`;
  }
  // Crear lista con lo filtrado: inteligente (se actualiza sola con estos filtros) o fija (solo estas canciones)
  function reglasDeFiltros() {
    const F = S.filtros, R = {};
    for (const k of CAMPOS_FILTRO) if (F[k].length) R[k] = F[k].slice();
    if (F.q) R.texto = F.q;
    R.orden = F.orden === 'titulo' ? 'azar' : F.orden;
    return R;
  }
  function nombreSugerido() {
    const F = S.filtros, p = [];
    for (const k of ['categorias', 'generos', 'artistas', 'anios', 'carpetas']) if (F[k].length) p.push(F[k].slice(0, 2).join(' y ') + (F[k].length > 2 ? '…' : ''));
    if (F.estatus.length) p.push(F.estatus.map(k => (ESTATUS.find(e => e.clave === k) || {}).nombre).join(' y '));
    if (F.q) p.push(F.q);
    return p.join(' · ') || 'Mi lista';
  }
  function crearListaDeFiltros() {
    const n = (S._vistaIds || []).length;
    if (!n) return toast('No hay canciones con esos filtros', true);
    modal(`<h2>🗂️ Crear lista con lo filtrado</h2><p class="suave">${miles(n)} canciones · ${esc(describirReglas(reglasDeFiltros()))}</p>
      <div class="campo"><label>Nombre</label><input id="nlNombre" value="${esc(nombreSugerido())}" autocomplete="off"></div>
      <div class="botones">
        <button class="btn prim" data-accion="crearDeFiltros" data-tipo="inteligente">⚡ Inteligente<br><small style="font-weight:600">se actualiza sola con estos filtros (nuevas, estatus…)</small></button>
        <button class="btn sec" data-accion="crearDeFiltros" data-tipo="fija">📌 Fija<br><small style="font-weight:600">solo estas ${miles(n)} canciones</small></button>
        <button class="btn sec" data-accion="cerrar">Cancelar</button></div>`);
  }

  // Plantillas de listas inteligentes: un toque y queda armada; después se pueden cambiar las reglas
  function plantillas() {
    const anios = valoresDe('anios').map(x => x[0]).filter(a => /^\d{4}$/.test(a));
    const decadas = [...new Set(anios.map(a => a.slice(0, 3) + '0'))].sort().reverse();
    const P = [
      ['🔥 Top 50 más sonadas', { escuchasMin: 1, orden: 'escuchas', limite: 50 }],
      ['💎 Lo mejor (Oro y Diamante)', { estatus: ['diamante', 'oro'], orden: 'estatus' }],
      ['❤ Favoritas más sonadas', { soloFavoritas: true, orden: 'escuchas' }],
      ['🆕 Agregadas en los últimos 30 días', { agregadasDias: 30, orden: 'recientes' }],
      ['🙈 Nunca escuchadas', { nuncaEscuchadas: true, orden: 'azar' }],
      ['⏳ Buenas que tengo olvidadas', { estrellasMin: 3, sinOirDias: 60, orden: 'azar' }],
      ['🚫 Sin las que siempre salto', { excluirSaltadas: true, orden: 'azar' }],
      ...decadas.map(d => [`📆 Años ${d.slice(2)} (${d}-${+d + 9})`, { anioDesde: +d, anioHasta: +d + 9, orden: 'azar' }]),
    ];
    S._plantillas = P;
    return P;
  }
  function formularioInteligente(l, base) {
    const R = (l && l.reglas) || base || {};
    S._reglasExtra = { anios: R.anios, texto: R.texto };   // filtros que vienen de la Biblioteca y no tienen casilla aquí
    const nombre = l ? l.nombre : (base && base._nombre) || '';
    const n = k => R[k] || 0;
    modal(`<h2>⚡ ${l ? 'Cambiar reglas' : 'Lista inteligente'}</h2><p class="suave peq">Se arma sola cada vez con tus reglas. Deja en blanco lo que no importe.</p>
      ${!l && !base ? `<h3>Empezar rápido</h3><div class="chips">${plantillas().map(([t], i) => `<button class="chip" data-accion="usarPlantilla" data-i="${i}">${esc(t)}</button>`).join('')}</div><h3>O arma la tuya</h3>` : ''}
      <div class="campo"><label>Nombre</label><input id="liNombre" value="${esc(nombre)}" placeholder="Ej.: Despecho de los 90"></div>
      ${selector('🏷️ Categorías', 'categorias', R.categorias)}
      ${selector('🎸 Géneros', 'generos', R.generos)}
      ${selector('🎤 Artistas', 'artistas', R.artistas)}
      ${selector('🏆 Estatus', 'estatus', R.estatus)}
      ${selector('📁 Carpetas', 'carpetas', R.carpetas)}
      <div class="dos" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="campo"><label>📆 Año desde</label><input id="liDesde" type="number" inputmode="numeric" placeholder="1980" value="${n('anioDesde') || ''}"></div>
      <div class="campo"><label>📆 Año hasta</label><input id="liHasta" type="number" inputmode="numeric" placeholder="1989" value="${n('anioHasta') || ''}"></div>
      <div class="campo"><label>★ Estrellas mínimas</label><select id="liEst">${[0, 1, 2, 3, 4, 5, 6].map(k => `<option value="${k}"${n('estrellasMin') === k ? ' selected' : ''}>${k ? k + '★ o más' : 'Cualquiera'}</option>`).join('')}</select></div>
      <div class="campo"><label>▶ Escuchas mínimas</label><input id="liEsc" type="number" inputmode="numeric" min="0" value="${n('escuchasMin') || ''}" placeholder="0"></div>
      <div class="campo"><label>⏳ Sin oír hace (días)</label><input id="liDias" type="number" inputmode="numeric" min="0" value="${n('sinOirDias') || ''}" placeholder="0"></div>
      <div class="campo"><label>🆕 Agregadas hace (días)</label><input id="liAgr" type="number" inputmode="numeric" min="0" value="${n('agregadasDias') || ''}" placeholder="0"></div>
      <div class="campo"><label>🔢 Máximo de canciones</label><input id="liLim" type="number" inputmode="numeric" min="0" value="${n('limite') || ''}" placeholder="Sin límite"></div>
      <div class="campo"><label>↕ Orden</label><select id="liOrden">${[['azar', 'Al azar'], ['escuchas', 'Más sonadas primero'], ['estatus', 'Mejor estatus primero'], ['recientes', 'Recién agregadas primero'], ['anio', 'Más nuevas primero'], ['anioAsc', 'Más viejas primero'], ['titulo', 'Por título']].map(([v, t]) => `<option value="${v}"${(R.orden || 'azar') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <label class="opcion"><input type="checkbox" id="liFav"${R.soloFavoritas ? ' checked' : ''}> Solo favoritas ❤</label>
      <label class="opcion"><input type="checkbox" id="liNunca"${R.nuncaEscuchadas ? ' checked' : ''}> Solo las que nunca he escuchado</label>
      <label class="opcion"><input type="checkbox" id="liSalt"${R.excluirSaltadas ? ' checked' : ''}> Sin las que casi siempre salto</label>
      <p class="suave peq" id="liCuenta"></p>
      <div class="botones dos"><button class="btn sec" data-accion="cerrar">Cancelar</button><button class="btn prim" data-accion="guardarInteligente"${l ? ` data-uid="${esc(l.uid)}"` : ''}>Guardar</button></div>`);
    contarInteligente();
  }
  function leerReglas() {
    const v = k => [...document.querySelectorAll('.r-' + k + ':checked')].map(i => i.value);
    const num = id => +($(id).value || 0) || 0;
    const R = { categorias: v('categorias'), generos: v('generos'), artistas: v('artistas'), estatus: v('estatus'), carpetas: v('carpetas'),
      anioDesde: num('#liDesde'), anioHasta: num('#liHasta'), estrellasMin: +$('#liEst').value, escuchasMin: num('#liEsc'), sinOirDias: num('#liDias'),
      agregadasDias: num('#liAgr'), limite: num('#liLim'), orden: $('#liOrden').value, soloFavoritas: $('#liFav').checked, nuncaEscuchadas: $('#liNunca').checked, excluirSaltadas: $('#liSalt').checked };
    Object.assign(R, S._reglasExtra || {});
    for (const k of Object.keys(R)) if (!R[k] || (Array.isArray(R[k]) && !R[k].length)) delete R[k];
    R.orden = $('#liOrden').value;
    return R;
  }
  function contarInteligente() {
    const p = $('#liCuenta'); if (!p) return;
    const R = leerReglas();
    p.textContent = `Con estas reglas hoy salen ${miles(idsDeLista({ reglas: R }).length)} canciones · ${describirReglas(R)}`;
  }

  // ---------------------------------------------------------------- acciones (toques)
  const A = {
    playPausa, siguiente: () => siguiente(), anterior, cerrar: cerrarModal,
    async favorita(b) { const c = S.canciones.get(b.dataset.id); await ponerFavorita(c, !c.favorita); toast(c.favorita ? `❤ Favorita · ${estatusDe(c).nombre}` : '♡ Ya no es favorita'); pintar(); },
    async estrellas(b) { const c = S.canciones.get(b.dataset.id), v = +b.dataset.v; await ponerEstrellas(c, c.calificacion === v ? 0 : v); toast(`${c.calificacion}★ · ${estatusDe(c).nombre}`); pintar(); },
    async estrellasMenu(b) { await A.estrellas(b); menuCancion(b.dataset.id); },
    async favoritaMenu(b) { await A.favorita(b); menuCancion(b.dataset.id); },
    azar() { S.azar = !S.azar; if (S.azar && S.cola.length) { const act = S.cola[S.pos]; S.cola = [act, ...barajar(S.cola.filter((x, i) => i !== S.pos))]; S.pos = 0; } toast(S.azar ? '🔀 Al azar' : '➡ En orden'); guardarEstado(); pintar(); },
    repetir() { S.repetir = { todo: 'una', una: 'no', no: 'todo' }[S.repetir]; toast({ todo: '🔁 Repetir todo', una: '🔂 Repetir esta canción', no: '➡ Sin repetir' }[S.repetir]); guardarEstado(); pintar(); },
    verCola, elegirFuente,
    sonarPos(b) { cerrarModal(); sonar(+b.dataset.p); },
    sonarFuente(b) { cerrarModal(); sonarFuente(JSON.parse(b.dataset.f)); },
    sonarDeLista(b, e) {
      if (e.target.closest('.mas-btn')) return;
      const ids = S._vistaIds || [];
      const nombre = location.hash.startsWith('#/biblioteca') ? 'Biblioteca' : location.hash.startsWith('#/top') ? 'Ranking' : (document.querySelector('main h2') || {}).textContent || 'Selección';
      if (armarCola({ tipo: 'ids', ids, nombre, enOrden: !S.azar }, b.dataset.id)) sonar(0);
    },
    sonarVista() { sonarFuente({ tipo: 'ids', ids: (S._vistaIds || []).slice(), nombre: 'Biblioteca' }); },
    guardarVista() { crearListaDeFiltros(); },
    async crearDeFiltros(b) {
      const nombre = ($('#nlNombre').value || '').trim() || nombreSugerido();
      const l = b.dataset.tipo === 'inteligente' ? await crearLista(nombre, [], reglasDeFiltros()) : await crearLista(nombre, (S._vistaIds || []).slice());
      cerrarModal(); toast(`${l.reglas ? '⚡' : '📌'} Lista «${nombre}» creada`); location.hash = '#/lista/' + l.uid;
    },
    toqueCategoria(b) { const v = b.dataset.v, a = S.filtros.categorias; S.filtros.categorias = a.includes(v) ? a.filter(x => x !== v) : [...a, v]; S.limite = 150; pintar(); },
    quitarValor(b) { const k = b.dataset.campo; S.filtros[k] = S.filtros[k].filter(x => x !== b.dataset.v); S.limite = 150; pintar(); },
    quitarTexto() { S.filtros.q = ''; S.limite = 150; pintar(); },
    irA(b) { cerrarModal(); location.hash = b.dataset.h; },
    irGenero(b) { cerrarModal(); CAMPOS_FILTRO.forEach(x => S.filtros[x] = []); S.filtros.q = ''; S.filtros.generos = [b.dataset.v]; S.limite = 150; if (location.hash !== '#/biblioteca') location.hash = '#/biblioteca'; else pintar(); },
    irAnio(b) { cerrarModal(); CAMPOS_FILTRO.forEach(x => S.filtros[x] = []); S.filtros.q = ''; S.filtros.anios = [b.dataset.v]; S.limite = 150; if (location.hash !== '#/biblioteca') location.hash = '#/biblioteca'; else pintar(); },
    usarSugerencia(b) {
      const k = b.dataset.campo, v = b.dataset.v; S.filtros.q = '';
      if (b.dataset.irBib) CAMPOS_FILTRO.forEach(x => S.filtros[x] = []);   // desde Mi resumen: muestra solo eso
      if (!S.filtros[k].includes(v)) S.filtros[k] = [...S.filtros[k], v]; S.limite = 150;
      if (location.hash !== '#/biblioteca') location.hash = '#/biblioteca'; else pintar();
    },
    sonarTopResumen() { sonarFuente({ tipo: 'ids', ids: (S._topResumen || []).slice(), nombre: 'Top de mi resumen', enOrden: true }); },
    async listaTopResumen(b) { const l = await crearLista(b.dataset.nombre + ' ' + ahora().slice(0, 10), (S._topResumen || []).slice()); toast('🗂️ Lista guardada'); location.hash = '#/lista/' + l.uid; },
    // Cola de reproducción
    alFinal(b) {
      cerrarModal(); const id = b.dataset.id;
      if (!S.cola.length) return A.sonarYa(b);
      S.cola = S.cola.filter((x, i) => x !== id || i <= S.pos); S.cola.push(id); guardarEstado(); refrescarCola(); toast('➕ Agregada al final de la cola');
    },
    quitarCola(b) { const p = +b.dataset.p; if (p === S.pos) return; S.cola.splice(p, 1); if (p < S.pos) S.pos--; guardarEstado(); refrescarCola(); },
    subirCola(b) { const p = +b.dataset.p; if (p <= S.pos + 1) return; [S.cola[p - 1], S.cola[p]] = [S.cola[p], S.cola[p - 1]]; guardarEstado(); refrescarCola(); },
    aListaMenu(b) { menuListas(b.dataset.id); },
    async nuevaListaDesdeMenu(b) {
      const n = ($('#nlCancion') || {}).value; const nombre = (n || '').trim();
      if (!nombre) return toast('Escribe el nombre de la lista', true);
      await crearLista(nombre, [b.dataset.id]); toast(`🗂️ Lista «${nombre}» creada con la canción`); menuListas(b.dataset.id);
    },
    menuCancion(b) { menuCancion(b.dataset.id); },
    sonarYa(b) { cerrarModal(); const id = b.dataset.id; if (S.actual) { S.cola.splice(S.pos + 1, 0, id); sonar(S.pos + 1); } else sonarFuente({ tipo: 'ids', ids: [id], nombre: 'Una canción' }); },
    despues(b) {
      cerrarModal(); const id = b.dataset.id;
      if (!S.cola.length) return A.sonarYa(b);
      // Si ya estaba más adelante en la cola, se mueve (no queda repetida)
      S.cola = S.cola.filter((x, i) => x !== id || i <= S.pos); S.cola.splice(S.pos + 1, 0, id);
      guardarEstado(); refrescarCola(); toast('⏭ Suena a continuación');
    },
    async aLista(b) { await agregarALista(b.dataset.uid, b.dataset.id); menuListas(b.dataset.id); },
    async deLista(b) { await sacarDeLista(b.dataset.uid, b.dataset.id); toast('➖ Sacada de la lista'); menuListas(b.dataset.id); },
    async nuevaListaCon(b) { const n = prompt('Nombre de la lista nueva:'); if (!n) return; await crearLista(n.trim(), [b.dataset.id]); toast('🗂️ Lista creada'); menuCancion(b.dataset.id); },
    editarDatos(b) { editarDatos(b.dataset.id); },
    async guardarDatos(b) {
      const c = S.canciones.get(b.dataset.id); let n = 0;
      for (const [k] of CAMPOS_DATOS) { let v = $('#ed-' + k).value.trim(); if (k === 'anio') v = v.replace(/\D/g, '').slice(0, 4); if (k === 'titulo' && !v) continue; if (await ponerCampo(c, k, v)) n++; }
      cerrarModal(); toast(n ? `✏️ ${n} ${n === 1 ? 'dato corregido' : 'datos corregidos'}` : 'Sin cambios'); pintar();
    },
    historialCancion(b) {
      const c = S.canciones.get(b.dataset.id), h = S.cambios.filter(r => r.cancionId === c.id).reverse();
      modal(`<h2>🕘 ${esc(c.titulo)}</h2><div class="lista">${h.map(r => `<div class="hist${r.deshecho ? ' deshecho' : ''}"><div><b>${NOMBRE_CAMPO[r.campo] || esc(r.campo)}</b><div class="d">${esc(texto(r.antes))} → ${esc(texto(r.despues))} · ${fechaCorta(r.fecha)}</div></div>${r.deshacible && !r.deshecho ? `<button class="btn chico sec" data-accion="deshacerMenu" data-n="${r.n}" data-id="${esc(c.id)}">↩</button>` : '<span></span>'}</div>`).join('') || '<p class="suave">Sin cambios todavía.</p>'}</div>
        <p class="suave">▶ ${miles(total(c).esc)} escuchas · ⏭ ${miles(total(c).sal)} saltos · agregada ${fechaCorta(c.alta)}</p><button class="btn sec" data-accion="cerrar">Cerrar</button>`);
    },
    async deshacerMenu(b) { await deshacer(+b.dataset.n); A.historialCancion(b); },
    quitarApp(b) {
      const c = S.canciones.get(b.dataset.id);
      modal(`<h2>🗑 ¿Quitar de la app?</h2><p><b>${esc(c.titulo)}</b></p><p class="suave">Se borra la copia guardada en la app para liberar espacio. Su estatus, ❤, escuchas e historial se recuerdan: si la vuelves a agregar, los recupera. El archivo del teléfono no se toca.</p>
        <div class="botones dos"><button class="btn sec" data-accion="cerrar">Cancelar</button><button class="btn peligro" data-accion="quitarAppSi" data-id="${esc(c.id)}">Sí, quitar</button></div>`);
      setTimeout(() => { const x = document.querySelector('#modalHoja [data-accion="cerrar"]'); x && x.focus(); }, 50);
    },
    async quitarAppSi(b) { await quitarDeApp([b.dataset.id], 'Quitada a mano'); cerrarModal(); toast('🗑 Quitada de la app'); pintar(); },
    async quitarFaltantes() { const n = await quitarDeApp(S._faltan || [], 'Ya no estaban en la carpeta del teléfono'); S._faltan = []; cerrarModal(); toast(`🗑 ${miles(n)} quitadas (su estatus queda guardado)`); pintar(); },
    deshacer(b) { deshacer(+b.dataset.n); },
    histFiltro(b) { S.histFiltro = b.dataset.v; pintar(); },
    filtro(b) { elegirFiltro(b.dataset.campo); },
    filtroNinguno() { document.querySelectorAll('#opcFiltro input').forEach(i => i.checked = false); filtroVivo(); },
    filtroAplicar(b) { S.filtros[b.dataset.campo] = [...document.querySelectorAll('#opcFiltro input:checked')].map(i => i.value); S.limite = 150; cerrarModal(); pintar(); },
    limpiarFiltros() { Object.assign(S.filtros, { q: '', categorias: [], generos: [], anios: [], artistas: [], carpetas: [], estatus: [] }); pintar(); },
    verMas() { S.limite += 300; pintar(); },
    verEstatus(b) { Object.assign(S.filtros, { q: '', categorias: [], generos: [], anios: [], artistas: [], carpetas: [], estatus: [b.dataset.v], orden: 'escuchas' }); location.hash = '#/biblioteca'; },
    async nuevaLista() { const n = prompt('Nombre de la lista nueva:'); if (!n) return; const l = await crearLista(n.trim(), []); location.hash = '#/lista/' + l.uid; toast('Agrega canciones con ⋮ en cada canción'); },
    nuevaInteligente() { formularioInteligente(null); },
    usarPlantilla(b) { const [t, R] = S._plantillas[+b.dataset.i]; formularioInteligente(null, Object.assign({ _nombre: t.replace(/^\S+\s/, '') }, R)); },
    editarInteligente(b) { formularioInteligente(S.listas.get(b.dataset.uid)); },
    listaDesdeRanking(b) {
      const m = b.dataset.modo;
      const R = m === 'saltadas' ? { orden: 'escuchas', _nombre: 'Más saltadas' } : m === 'mes' ? { escuchasMin: 1, orden: 'escuchas', limite: 50, _nombre: 'Lo más sonado' } : { escuchasMin: 1, orden: 'escuchas', limite: 100, _nombre: 'Top 100 más sonadas' };
      formularioInteligente(null, R);
    },
    async guardarInteligente(b) {
      const nombre = $('#liNombre').value.trim(); if (!nombre) return toast('Ponle un nombre', true);
      const R = leerReglas();
      if (b.dataset.uid) {
        const l = S.listas.get(b.dataset.uid), antes = l.reglas, nomAntes = l.nombre;
        l.reglas = R; l.nombre = nombre; await DB.poner('listas', l);
        await anotar({ tipo: 'lista', campo: 'lista_reglas', antes: describirReglas(antes), despues: describirReglas(R), reglasAntes: JSON.stringify(antes), titulo: nombre, lista: l.uid, deshacible: true });
        if (nomAntes !== nombre) await anotar({ tipo: 'lista', campo: 'lista_nombre', antes: nomAntes, despues: nombre, lista: l.uid, deshacible: true });
        cerrarModal(); toast(`⚡ ${miles(idsDeLista(l).length)} canciones`); pintar();
      } else {
        const l = await crearLista(nombre, [], R); cerrarModal(); toast(`⚡ ${miles(idsDeLista(l).length)} canciones`); location.hash = '#/lista/' + l.uid;
      }
    },
    menuLista(b) {
      const l = S.listas.get(b.dataset.uid);
      modal(`<h2>${esc(l.nombre)}</h2>
        ${l.reglas ? `<button class="opcion" data-accion="editarInteligente" data-uid="${esc(l.uid)}"><span class="ic">⚙️</span>Cambiar reglas</button>
        <button class="opcion" data-accion="congelarLista" data-uid="${esc(l.uid)}"><span class="ic">📌</span>Guardar como lista normal (fija, ya no cambia sola)</button>` : ''}
        <button class="opcion" data-accion="renombrarLista" data-uid="${esc(l.uid)}"><span class="ic">✏️</span>Cambiar nombre</button>
        <button class="opcion" data-accion="borrarLista" data-uid="${esc(l.uid)}" style="color:var(--mal)"><span class="ic">🗑</span>Borrar lista (las canciones no se tocan)</button>
        <button class="btn sec" data-accion="cerrar">Cerrar</button>`);
    },
    async congelarLista(b) { const l = S.listas.get(b.dataset.uid); const nl = await crearLista(l.nombre + ' (fija ' + ahora().slice(0, 10) + ')', idsDeLista(l)); cerrarModal(); location.hash = '#/lista/' + nl.uid; toast('📌 Lista fija creada'); },
    async renombrarLista(b) {
      const l = S.listas.get(b.dataset.uid); const n = prompt('Nombre nuevo:', l.nombre); if (!n || n.trim() === l.nombre) return;
      const antes = l.nombre; l.nombre = n.trim(); await DB.poner('listas', l);
      await anotar({ tipo: 'lista', campo: 'lista_nombre', antes, despues: l.nombre, lista: l.uid, deshacible: true }); cerrarModal(); pintar();
    },
    borrarLista(b) {
      const l = S.listas.get(b.dataset.uid);
      modal(`<h2>🗑 ¿Borrar «${esc(l.nombre)}»?</h2><p class="suave">Solo se borra la lista. Las canciones siguen en la app. Queda anotado en el historial.</p><div class="botones dos"><button class="btn sec" data-accion="cerrar">Cancelar</button><button class="btn peligro" data-accion="borrarListaSi" data-uid="${esc(l.uid)}">Sí, borrar</button></div>`);
    },
    async borrarListaSi(b) {
      const l = S.listas.get(b.dataset.uid); await DB.borrar('listas', l.uid); S.listas.delete(l.uid);
      await anotar({ tipo: 'lista', campo: 'lista_borrada', antes: l.nombre, detalle: l.reglas ? describirReglas(l.reglas) : `${l.ids.length} canciones` });
      cerrarModal(); location.hash = '#/listas'; toast('Lista borrada');
    },
    agregar() { S._modo = 'agregar'; $('#elegirArchivos').click(); },
    agregarCarpeta() { S._modo = 'agregar'; $('#elegirCarpeta').click(); },
    actualizarBiblioteca() {
      modal(`<h2>🔄 Actualizar la biblioteca</h2><p>Elige la carpeta de música del teléfono (por ejemplo <b>Music</b>). La app:</p>
        <p>➕ agrega las canciones nuevas,<br>✔ deja quietas las que ya tiene,<br>⚠️ te avisa cuáles ya no están en esa carpeta para que decidas.</p>
        <p class="suave peq">Todo queda en el historial. Nada se borra sin que lo confirmes.</p>
        <div class="botones"><button class="btn prim" data-accion="actualizarSi">📁 Elegir la carpeta</button><button class="btn sec" data-accion="cerrar">Cancelar</button></div>`);
    },
    actualizarSi() { cerrarModal(); S._modo = 'actualizar'; $('#elegirCarpeta').click(); },
    conectarCarpeta, escanear() { escanear('manual'); }, escanearCompleto() { escanear('completo'); },
    releerTodas() { if (NATIVO) escanearAndroid('manual'); else releerTodas(); },
    async diagnostico() {
      const t = diagnosticoTexto();
      let copiado = false;
      try { await navigator.clipboard.writeText(t); copiado = true; } catch (e) {}
      modal(`<h2>📋 Diagnóstico</h2><p class="suave peq">${copiado ? '✅ Ya quedó copiado: pégalo en el chat con Claude.' : 'Mantén presionado el texto, «Seleccionar todo» y «Copiar», y pégalo en el chat con Claude.'}</p>
        <textarea readonly style="min-height:50vh;font-size:.8rem;font-family:monospace">${esc(t)}</textarea>
        <div class="botones">${navigator.share ? '<button class="btn sec" data-accion="diagnosticoCompartir">📲 Compartir (WhatsApp, correo…)</button>' : ''}<button class="btn sec" data-accion="cerrar">Cerrar</button></div>`);
    },
    async diagnosticoCompartir() { try { await navigator.share({ title: 'Diagnóstico Mi Música', text: diagnosticoTexto() }); } catch (e) {} },
    quitarCarpeta(b) { quitarCarpeta(b.dataset.id); },
    quitarCarpetaSi(b) { quitarCarpetaSi(b.dataset.id); },
    cancelarEscaneo() { S.cancelar = true; const x = $('#avTxt'); if (x) x.textContent = 'Cancelando…'; },
    escaneoAplicar() { if (S._dif && S._dif.android) aplicarAndroid(S._dif, 'manual'); else aplicarEscaneo(S._dif, 'manual'); },
    async escaneoRespaldo() { const d = S._dif; await guardarRespaldo('descargar'); if (d && d.android) await aplicarAndroid(d, 'manual'); else await aplicarEscaneo(d, 'manual'); },
    cargarAndroid() { escanearAndroid('manual'); },
    async nuevaVersion() { try { await Bib.abrir({ url: 'https://github.com/tabares022384-afk/mi-musica-app/releases/latest' }); } catch (e) { toast('⚠️ ' + e.message, true); } },
    async permisoCarpeta() { if (!(await pedirPermiso())) toast('Sin permiso no puedo leer tu carpeta', true); },
    flotante() { ventanaFlotante().catch(e => toast('⚠️ ' + e.message, true)); },
    respaldo() {
      modal(`<h2>💾 Guardar respaldo</h2><p class="suave">Guarda estatus, ❤, estrellas, escuchas, listas inteligentes, correcciones e historial. Las canciones no van dentro.</p>
        <div class="botones">${navigator.canShare ? '<button class="btn prim" data-accion="respaldoCompartir">📲 Guardar en Drive, WhatsApp…</button>' : ''}<button class="btn sec" data-accion="respaldoDescargar">⬇ Descargar al teléfono</button><button class="btn sec" data-accion="cerrar">Cancelar</button></div>`);
    },
    respaldoCompartir() { guardarRespaldo('compartir'); }, respaldoDescargar() { guardarRespaldo('descargar'); },
    restaurar() {
      modal(`<h2>📂 Restaurar respaldo</h2><p class="suave">Junta el respaldo con lo que ya tienes: no borra nada. Las canciones que todavía no estén en la app recuperan su estatus cuando las agregues.</p>
        <div class="botones"><button class="btn prim" data-accion="restaurarSi">📂 Elegir el archivo de respaldo</button><button class="btn sec" data-accion="cerrar">Cancelar</button></div>`);
    },
    restaurarSi() { $('#elegirRespaldo').click(); },
    excel(b) { excel(b.dataset.tipo).catch(e => toast('⚠️ ' + e.message, true)); },
    tema() { const t = document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro'; document.documentElement.dataset.tema = t; try { localStorage.setItem('mm-tema', t); } catch (e) {} pintar(); },
    modoCarro() {
      const on = document.body.classList.toggle('carro');
      if (on) { if (location.hash !== '#/sonando') location.hash = '#/sonando'; pedirPantalla(); toast('🚗 Modo carro'); }
      else if (S.wake) { S.wake.release().catch(() => {}); S.wake = null; }
      try { localStorage.setItem('mm-carro', on ? '1' : ''); } catch (e) {}
      pintar();
    },
    actualizarApp() { if (S.swEsperando) S.swEsperando.postMessage('actualizar'); },
  };

  document.addEventListener('click', e => {
    const ir = e.target.closest('[data-ir]');
    const b = e.target.closest('[data-accion]');
    if (b && (!ir || ir.contains(b))) { e.preventDefault(); const f = A[b.dataset.accion]; if (f) Promise.resolve(f(b, e)).catch(err => toast('⚠️ ' + err.message, true)); return; }
    if (ir) location.hash = ir.dataset.ir;
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'elegirArchivos' || t.id === 'elegirCarpeta') procesarArchivos(t.files, S._modo || 'agregar').catch(err => { cerrarModal(); toast('⚠️ ' + err.message, true); }).finally(() => { t.value = ''; });
    else if (t.id === 'elegirRespaldo') { if (t.files[0]) restaurar(t.files[0]).finally(() => { t.value = ''; }); }
    else if (t.id === 'orden') { S.filtros.orden = t.value; pintar(); }
    else if (t.classList.contains('filtroVivo')) filtroVivo();
    else if (t.dataset.ajuste) { S.config[t.dataset.ajuste] = t.checked; DB.guardarConfig('ajustes', S.config); }
    else if (t.dataset.ajusteNum) { S.config[t.dataset.ajusteNum] = +t.value; DB.guardarConfig('ajustes', S.config); }
    else if (t.id === 'barraTiempo') { audio.currentTime = +t.value; delete t.dataset.arrastrando; }
    if (t.closest && t.closest('#modalHoja') && $('#liCuenta')) contarInteligente();
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'buscar') { clearTimeout(A._b); A._b = setTimeout(() => { S.filtros.q = t.value; S.limite = 150; const pos = t.selectionStart; pintar(); const n = $('#buscar'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 150); }
    else if (t.id === 'barraTiempo') { t.dataset.arrastrando = '1'; const a = $('#tActual'); if (a) a.textContent = mmss(+t.value); }
    else if (t.classList.contains('buscaSel')) { const q = norm(t.value), cont = t.parentElement.querySelector('.sel-opc') || t.nextElementSibling; cont.querySelectorAll('.opcion').forEach(o => o.hidden = q && !o.dataset.t.includes(q)); }
    else if (t.closest && t.closest('#modalHoja') && $('#liCuenta')) { clearTimeout(A._c); A._c = setTimeout(contarInteligente, 300); }
  });
  document.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName || '')) return;
    if (e.code === 'Space') { e.preventDefault(); playPausa(); }
  });

  // ---------------------------------------------------------------- navegación
  const TITULOS = { sonando: 'Sonando', biblioteca: 'Biblioteca', listas: 'Listas', lista: 'Lista', top: 'Estatus y ranking', historial: 'Historial', mas: 'Más', resumen: 'Mi resumen', artista: 'Artista', album: 'Álbum' };
  const decodificar = s => { try { return decodeURIComponent(s || ''); } catch (e) { return s || ''; } };
  function pintar() {
    const partes = (location.hash || '#/sonando').slice(2).split('/');
    const r = P[partes[0]] ? partes[0] : 'sonando';
    const y = window.scrollY;
    vista.innerHTML = P[r](decodificar(partes[1]), decodificar(partes[2]));
    if (pintar._ruta === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
    pintar._ruta = location.hash;
    $('#titulo').textContent = TITULOS[r] || 'Mi Música';
    $('#atras').hidden = !['lista', 'historial', 'resumen', 'artista', 'album'].includes(r);
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('activo', a.dataset.r === r || (r === 'lista' && a.dataset.r === 'listas') || (r === 'historial' && a.dataset.r === 'mas') || (r === 'resumen' && a.dataset.r === 'top') || ((r === 'artista' || r === 'album') && a.dataset.r === 'biblioteca')));
    pintarMini(); actualizarProgreso();
    if (r === 'mas') DB.espacio().then(e => { const p = $('#espacio'); if (p && e) p.textContent = `Espacio usado por la app: ${(e.usage / 1073741824).toFixed(2)} GB de ${(e.quota / 1073741824).toFixed(0)} GB que el teléfono le permite.`; });
  }
  window.addEventListener('hashchange', () => { if (location.hash !== '#/biblioteca') S.limite = 150; pintar(); });

  // ---------------------------------------------------------------- arranque
  (async function () {
    try {
      await cargar();
      try { if (localStorage.getItem('mm-carro')) document.body.classList.add('carro'); } catch (e) {}
      if (!location.hash) location.hash = '#/sonando';
      pintar();
      if (NATIVO) {
        S.infoAndroid = await DB.leerConfig('infoAndroid', null);
        // App instalada: si ya tiene música, revisa sola lo nuevo o borrado (unos segundos, sin abrir archivos)
        if ([...S.canciones.values()].some(c => c.origen === 'android') && S.config.autoEscaneo) escanearAndroid('auto');
      }
      else if (S.carpeta && S.permiso) alConectar();   // carga ubicaciones, completa datos pendientes y revisa la carpeta
      else if (S.carpeta) cargarManijas();          // se dejan listas; el permiso llega con el primer toque
    } catch (e) { vista.innerHTML = `<p class="mal">No se pudo abrir la base de datos: ${esc(e.message)}</p>`; }
    if (!NATIVO && 'serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').then(reg => {
        const avisar = w => { S.swEsperando = w; $('#actualizar').classList.add('ver'); };
        if (reg.waiting && navigator.serviceWorker.controller) avisar(reg.waiting);
        reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) avisar(w); }); });
      }).catch(() => {});
      let recargado = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!recargado) { recargado = true; location.reload(); } });
    }
  })();
})();
