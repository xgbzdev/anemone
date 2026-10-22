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
    return new Promise(function (res) {
      var names = [];
      var cursor = storage().enumerate(prefix);
      cursor.onsuccess = function () {
        var f = this.result;
        if (f) { names.push(f.name); this.continue(); } else { res(names); }
      };
      cursor.onerror = function () { res(names); };
    });
  }

  // Find theme folders by locating every theme.json under Anemone/.
  function scan() {
    return list(ROOT).then(function (names) {
      var manifests = names.filter(function (n) { return /\/theme\.json$/.test(n); });
      return Promise.all(manifests.map(function (m) {
        var dir = m.replace(/theme\.json$/, '');
        var rel = dir.replace(/^\/?(?:sdcard\/)?/, '');
        return readJSON(rel + 'theme.json').then(function (meta) {
          meta.dir = rel;
          meta.files = names.filter(function (n) { return n.indexOf(dir) === 0; });
          return meta;
        }).catch(function () { return null; });
      }));
    }).then(function (themes) {
      return themes.filter(Boolean);
    });
  }

  return { available: !!(navigator.getDeviceStorage), scan: scan, readFile: readFile, readJSON: readJSON, list: list };
})();
