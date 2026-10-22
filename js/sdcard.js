/* SD card access: scans /sdcard/Anemone/<theme>/ for theme.json + assets.
 *
 * Expected pack layout:
 *   Anemone/<ThemeName>/theme.json
 *   Anemone/<ThemeName>/wallpaper.jpg
 *   Anemone/<ThemeName>/icons/<app-manifest-name>.png
 *   Anemone/<ThemeName>/fonts/<font>.ttf|woff|woff2
 */
var SD = (function () {
  var ROOT = 'Anemone/';

  function storage() {
    return navigator.getDeviceStorage && navigator.getDeviceStorage('sdcard');
  }

  // "/sdcard/Anemone/x" or "/sdcard1/Anemone/x" -> "Anemone/x"
  function rel(name) {
    return name.replace(/^\/?(?:sdcard\d*\/)?/, '');
  }

  // 'available' | 'unavailable' | 'shared' | 'none' (no API / no permission)
  function state() {
    return new Promise(function (res) {
      var done = false;
      function finish(v) { if (!done) { done = true; res(v); } }
      try {
        var s = storage();
        if (!s) { return finish('none'); }
        var r = s.available();
        r.onsuccess = function () { finish(this.result); };
        r.onerror = function () { finish('none'); };
        setTimeout(function () { finish('none'); }, 3000);
      } catch (e) { finish('none'); }
    });
  }

  function readFile(path) {
    return new Promise(function (res, rej) {
      var r = storage().get(path);
      r.onsuccess = function () { res(this.result); };
      r.onerror = function () { rej(this.error); };
    });
  }

  function readJSON(path) {
    return readFile(path).then(function (file) {
      return new Promise(function (res, rej) {
        var fr = new FileReader();
        fr.onload = function () {
          try { res(JSON.parse(fr.result)); } catch (e) { rej(e); }
        };
        fr.onerror = function () { rej(fr.error); };
        fr.readAsText(file);
      });
    });
  }

  // Enumerate all files under a prefix and return their names.
  function list(prefix) {
    return new Promise(function (res, rej) {
      var names = [];
      var cursor = storage().enumerate(prefix);
      cursor.onsuccess = function () {
        var f = this.result;
        if (f) { names.push(f.name); this['continue'](); } else { res(names); }
      };
      cursor.onerror = function () { rej(this.error); };
    });
  }

  // Find theme folders by locating every theme.json under Anemone/.
  function scan() {
    return list(ROOT).then(function (names) {
      var manifests = names.filter(function (n) { return /\/theme\.json$/.test(n); });
      return Promise.all(manifests.map(function (m) {
        var dir = rel(m).replace(/theme\.json$/, '');
        return readJSON(rel(m)).then(function (meta) {
          meta.dir = dir;
          // keep every path in the same relative form ("Anemone/<Theme>/...")
          meta.files = names.map(rel).filter(function (n) { return n.indexOf(dir) === 0; });
          return meta;
        }).catch(function () { return null; });
      }));
    }).then(function (themes) {
      return themes.filter(Boolean);
    });
  }

  return {
    available: !!(navigator.getDeviceStorage),
    state: state, scan: scan, rel: rel,
    readFile: readFile, readJSON: readJSON, list: list
  };
})();
