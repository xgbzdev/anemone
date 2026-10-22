/* Theme engine: wallpaper, icons, fonts */
var Themer = (function () {

  var BLOCKED = 'blocked: needs a certified install';

  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  function makeURL(blob) {
    var U = window.URL || window.webkitURL || window.mozURL;
    return U.createObjectURL(blob);
  }

  function setSetting(key, value) {
    return new Promise(function (res, rej) {
      if (!navigator.mozSettings) { return rej(new Error('not-allowed')); }
      var obj = {}; obj[key] = value;
      var r = navigator.mozSettings.createLock().set(obj);
      r.onsuccess = function () { res(); };
      r.onerror = function () { rej(this.error); };
    });
  }

  function getSetting(key) {
    return new Promise(function (res) {
      if (!navigator.mozSettings) { return res(null); }
      var r = navigator.mozSettings.createLock().get(key);
      r.onsuccess = function () {
        var v = this.result[key];
        res(v === undefined ? null : v);
      };
      r.onerror = function () { res(null); };
    });
  }

  // Keys Anemone may change. Originals are saved once, before the first apply.
  // Each original lives in its own top-level key ("anemone.bak.<key>") because
  // a Blob (the wallpaper on newer Gaia) can't be stored nested inside an object.
  var KEYS = ['wallpaper.image', 'lockscreen.wallpaper', 'anemone.icons',
              'anemone.fonts', 'anemone.theme.name', 'font.family'];
  var MARK = 'anemone.backup';
  var BAK = function (k) { return 'anemone.bak.' + k; };

  function hasBackup() {
    return getSetting(MARK).then(function (b) { return !!b; });
  }

  function seq(items, fn) {          // run promises one after another
    return items.reduce(function (p, it) {
      return p.then(function () { return fn(it); });
    }, Promise.resolve());
  }

  function backup() {
    return hasBackup().then(function (exists) {
      if (exists) { return; }        // never overwrite the true stock values
      return seq(KEYS, function (k) {
        return getSetting(k).then(function (v) { return setSetting(BAK(k), v); });
      }).then(function () { return setSetting(MARK, true); });
    });
  }

  function restore() {
    return hasBackup().then(function (has) {
      if (!has) { return null; }
      return seq(KEYS, function (k) {
        return getSetting(BAK(k)).then(function (v) { return setSetting(k, v); });
      }).then(function () {
        // Drop fonts/CSS injected into Anemone itself
        var style = document.getElementById('anemone-fonts');
        if (style) { style.parentNode.removeChild(style); }
        document.documentElement.style.removeProperty('--anemone-font');
        return seq(KEYS, function (k) { return setSetting(BAK(k), null); });
      }).then(function () { return setSetting(MARK, null); })
        .then(function () { return true; });
    });
  }

  function baseName(path) {
    return path.split('/').pop();
  }

  // theme.files are already "Anemone/<Theme>/..." (see sdcard.js)
  function findFile(theme, relPath) {
    var want = theme.dir + relPath;
    return theme.files.indexOf(want) !== -1 ? want : null;
  }

  // Wallpaper -> system settings. Newer Gaia stores a Blob, older a data: URL;
  // write whichever kind the phone already uses.
  function applyWallpaper(theme) {
    var path = findFile(theme, theme.wallpaper || 'wallpaper.jpg');
    if (!path) { return Promise.resolve('no wallpaper'); }
    return Promise.all([SD.readFile(path), getSetting('wallpaper.image')]).then(function (r) {
      var file = r[0], cur = r[1];
      var useBlob = (typeof Blob !== 'undefined') && (cur instanceof Blob);
      return useBlob ? file : blobToDataURL(file);
    }).then(function (value) {
      return setSetting('wallpaper.image', value).then(function () {
        return setSetting('lockscreen.wallpaper', value);
      });
    }).then(function () { return 'wallpaper'; });
  }

  // Icons -> stored per app manifest name for a launcher that reads 'anemone.icons'
  function applyIcons(theme) {
    var files = theme.files.filter(function (f) {
      return /\/icons\/[^\/]+\.(png|jpg|svg)$/i.test(f);
    });
    if (!files.length) { return Promise.resolve('no icons'); }
    var map = {};
    return Promise.all(files.map(function (f) {
      var key = baseName(f).replace(/\.[^.]+$/, '');
      return SD.readFile(f).then(blobToDataURL).then(function (url) {
        map[key] = url;
      });
    })).then(function () {
      return setSetting('anemone.icons', map);
    }).then(function () {
      return setSetting('anemone.theme.name', theme.name || theme.dir);
    }).then(function () { return files.length + ' icons saved'; });
  }

  // Fonts -> @font-face inside Anemone (always) + stored for system UI (if allowed)
  function applyFonts(theme) {
    var files = theme.files.filter(function (f) {
      return /\/fonts\/[^\/]+\.(ttf|otf|woff2?)$/i.test(f);
    });
    if (!files.length) { return Promise.resolve('no fonts'); }
    var fonts = {}, blobs = {};
    return Promise.all(files.map(function (f) {
      var family = baseName(f).replace(/\.[^.]+$/, '');
      return SD.readFile(f).then(function (blob) {
        blobs[family] = blob;
        return blobToDataURL(blob);
      }).then(function (url) { fonts[family] = url; });
    })).then(function () {
      var names = Object.keys(fonts);
      var primary = (theme.font && fonts[theme.font]) ? theme.font : names[0];
      // blob: URLs for the in-app CSS (works under the strict app CSP)
      var css = names.map(function (n) {
        return '@font-face{font-family:"' + n + '";src:url(' + makeURL(blobs[n]) + ');}';
      }).join('\n');
      var style = document.getElementById('anemone-fonts') || document.createElement('style');
      style.id = 'anemone-fonts';
      style.textContent = css;
      document.head.appendChild(style);
      document.documentElement.style.setProperty('--anemone-font', '"' + primary + '", sans-serif');
      return setSetting('anemone.fonts', fonts).then(function () {
        return setSetting('font.family', primary);
      }).then(function () {
        return files.length + ' fonts saved';
      }, function () {
        return files.length + ' fonts (this app only)';
      });
    });
  }

  function apply(theme, opts) {
    var plan = [];
    if (opts.wallpaper) { plan.push(['wallpaper', applyWallpaper]); }
    if (opts.icons) { plan.push(['icons', applyIcons]); }
    if (opts.fonts) { plan.push(['fonts', applyFonts]); }
    var canSystem = !!navigator.mozSettings;

    // Back up the stock look FIRST and wait for it; only then change anything.
    var ready = canSystem ? backup() : Promise.resolve();
    return ready.then(function () {
      // Each job reports its own outcome so one denial doesn't hide the rest.
      return Promise.all(plan.map(function (p) {
        return p[1](theme).then(function (r) { return r; }, function () {
          return p[0] + ' (' + BLOCKED + ')';
        });
      }));
    }, function () {
      return ['nothing changed: could not back up your current look first'];
    }).then(function (results) {
      if (!canSystem) {
        results.push('note: system settings are unavailable in this install; fonts apply inside Anemone only');
      }
      return results;
    });
  }

  // Preview helpers for the detail screen
  function preview(theme) {
    var out = { wallpaper: null, icons: [], fonts: [], urls: [] };
    var jobs = [];
    function url(b) { var u = makeURL(b); out.urls.push(u); return u; }
    var wp = findFile(theme, theme.wallpaper || 'wallpaper.jpg');
    if (wp) {
      jobs.push(SD.readFile(wp).then(function (b) { out.wallpaper = url(b); }));
    }
    theme.files.filter(function (f) { return /\/icons\/[^\/]+\.(png|jpg|svg)$/i.test(f); })
      .slice(0, 12).forEach(function (f) {
        jobs.push(SD.readFile(f).then(function (b) { out.icons.push(url(b)); }));
      });
    out.fonts = theme.files.filter(function (f) { return /\/fonts\//i.test(f); }).map(baseName);
    return Promise.all(jobs).then(function () { return out; });
  }

  function release(urls) {
    var U = window.URL || window.webkitURL || window.mozURL;
    (urls || []).forEach(function (u) { try { U.revokeObjectURL(u); } catch (e) {} });
  }

  return { apply: apply, preview: preview, release: release, restore: restore, hasBackup: hasBackup };
})();
