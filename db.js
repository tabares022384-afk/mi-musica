// Mi Música Móvil — base de datos en el teléfono (IndexedDB). Nada sale del teléfono salvo el respaldo que Edwin guarda.
// Almacenes:
//   canciones  {id = «archivo|tamaño», archivo, tamano, ruta, carpeta, titulo, artista, album (= categoría), genero, anio,
//               duracion, favorita, calificacion, editados {campo: valor}, alta}
//   archivos   {id, blob}                 la canción copiada dentro de la app
//   escuchas   {uuid, cancionId, fecha, segundos, clase 'escucha'|'salto'}
//   cambios    {n, fecha, tipo 'estatus'|'datos'|'biblioteca'|'lista'|'respaldo', cancionId, titulo, artista, campo,
//               antes, despues, detalle, deshacible, deshecho, origen}          ← historial de modificaciones
//   listas     {uid, nombre, ids[], reglas|null, creada}
//   memoria    {id, favorita, calificacion, editados, alta}   lo que se recuerda de una canción que no está en la app
//              (quitada o venida de un respaldo): al volver a agregarla recupera su estatus
//   config     {clave, valor}
(function () {
  const NOMBRE = 'mi-musica-movil', VER = 3;   // v3: almacén «manijas» = dónde está cada canción en la carpeta (arranque rápido)
  let _db = null;

  function abrir() {
    if (_db) return Promise.resolve(_db);
    return new Promise((ok, mal) => {
      const r = indexedDB.open(NOMBRE, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('canciones')) d.createObjectStore('canciones', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('archivos')) d.createObjectStore('archivos', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('escuchas')) d.createObjectStore('escuchas', { keyPath: 'uuid' }).createIndex('cancion', 'cancionId');
        if (!d.objectStoreNames.contains('cambios')) d.createObjectStore('cambios', { keyPath: 'n', autoIncrement: true });
        if (!d.objectStoreNames.contains('listas')) d.createObjectStore('listas', { keyPath: 'uid' });
        if (!d.objectStoreNames.contains('memoria')) d.createObjectStore('memoria', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('manijas')) d.createObjectStore('manijas', { keyPath: 'k' });
        if (d.objectStoreNames.contains('eventos')) d.deleteObjectStore('eventos');   // era para el PC (versión 1)
        if (!d.objectStoreNames.contains('config')) d.createObjectStore('config', { keyPath: 'clave' });
      };
      r.onsuccess = () => { _db = r.result; ok(_db); };
      r.onerror = () => mal(r.error);
    });
  }

  const prom = req => new Promise((ok, mal) => { req.onsuccess = () => ok(req.result); req.onerror = () => mal(req.error); });

  async function todos(almacen) {
    const d = await abrir();
    return prom(d.transaction(almacen).objectStore(almacen).getAll());
  }
  async function uno(almacen, clave) {
    const d = await abrir();
    return prom(d.transaction(almacen).objectStore(almacen).get(clave));
  }
  async function poner(almacen, valor) {
    const d = await abrir();
    const tx = d.transaction(almacen, 'readwrite');
    const r = prom(tx.objectStore(almacen).put(valor));
    await new Promise((ok, mal) => { tx.oncomplete = ok; tx.onerror = () => mal(tx.error); tx.onabort = () => mal(tx.error); });
    return r;
  }
  async function varios(almacen, valores) {
    const d = await abrir();
    const tx = d.transaction(almacen, 'readwrite');
    const s = tx.objectStore(almacen);
    valores.forEach(v => s.put(v));
    return new Promise((ok, mal) => { tx.oncomplete = ok; tx.onerror = () => mal(tx.error); tx.onabort = () => mal(tx.error); });
  }
  async function borrar(almacen, clave) {
    const d = await abrir();
    const tx = d.transaction(almacen, 'readwrite');
    tx.objectStore(almacen).delete(clave);
    return new Promise((ok, mal) => { tx.oncomplete = ok; tx.onerror = () => mal(tx.error); });
  }
  async function vaciar(almacen) {
    const d = await abrir();
    const tx = d.transaction(almacen, 'readwrite');
    tx.objectStore(almacen).clear();
    return new Promise((ok, mal) => { tx.oncomplete = ok; tx.onerror = () => mal(tx.error); });
  }
  async function leerConfig(clave, def) {
    const r = await uno('config', clave);
    return r ? r.valor : def;
  }
  const guardarConfig = (clave, valor) => poner('config', { clave, valor });

  // Pide al teléfono que no borre la música guardada en la app cuando le falte espacio
  async function persistir() {
    try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; }
  }
  async function espacio() {
    try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { return null; }
  }

  window.DB = { abrir, todos, uno, poner, varios, borrar, vaciar, leerConfig, guardarConfig, persistir, espacio };
})();
