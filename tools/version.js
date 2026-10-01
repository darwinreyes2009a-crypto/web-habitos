// ÚNICA FUENTE DE LA VERSIÓN DE LA CACHÉ.
//
// El service worker sirve con `cache.match(..., { ignoreSearch: true })`: el
// parámetro `?v=` de index.html y de los import de src/app.js no cambia nada
// en la caché. El botón real es `CACHE` en sw.js, porque al cambiar de nombre
// se crea una caché nueva y se vuelve a bajar todo.
//
// Sube este número cuando cambies un módulo. Después ejecuta:
//   node tools/sync-version.js
module.exports = { APP_VERSION: 37 };
