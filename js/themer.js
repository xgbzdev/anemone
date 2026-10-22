/* Theme engine: wallpaper, icons, fonts */
var Themer = (function () {

  function blobToDataURL(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
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
  var KEYS = ['wallpaper.image', 'lockscreen.wallpaper', 'anemone.icons',
              'anemone.fonts', 'anemone.theme.name', 'font.family'];

  function hasBackup() {
    return getSetting('anemone.backup').then(function (b) { return !!b; });
  }

  function backup() {
    return hasBackup().then(function (exists) {
      if (exists) { return; }          // never overwrite the true stock values
      return Promise.all(KEYS.map(getSetting)).then(function (vals) {
        var saved = {};
        KEYS.forEach(function (k, i) { saved[k] = vals[i]; });
        return setSetting('anemone.backup', saved);
      });
    });
  }

  function restore() {
    return getSetting('anemone.backup').then(function (saved) {
      if (!saved) { return null; }
      return Promise.all(KEYS.map(function (k) {
        return setSetting(k, saved[k] === undefined ? null : saved[k]);
      })).then(function () {
        // Drop fonts/CSS injected into Anemone itself
        var style = document.getElementById('anemone-fonts');
        if (style) { style.parentNode.removeChild(style); }
        document.documentElement.style.removeProperty('--anemone-font');
        return setSetting('anemone.backup', null);
      }).then(function () { return true; });
    });
  }

  function baseName(path) {
    return path.split('/').pop();
  }

  function findFile(theme, rel) {
    var want = theme.dir + rel;
    for (var i = 0; i < theme.files.length; i++) {
      if (theme.files[i].replace(/^\/?(?:sdcard\/)?/, '') === want) { return want; }
    }
    return null;
  }

  // Wallpaper -> system settings
  function applyWallpaper(theme) {
    var rel = theme.wallpaper || 'wallpaper.jpg';
    var path = findFile(theme, rel);
    if (!path) { return Promise.resolve('no wallpaper'); }
    return SD.readFile(path).then(blobToDataURL).then(function (url) {
      return Promise.all([
        setSetting('wallpaper.image', url),
        setSetting('lockscreen.wallpaper', url)
      ]);
    }).then(function () { return 'wallpaper'; });
  }

  // Icons -> stored per app manifest URL, read by the launcher override
  function applyIcons(theme) {
    var files = theme.files.filter(function (f) {
      return /\/icons\/[^\/]+\.(png|jpg|svg)$/i.test(f);
    });
    if (!files.length) { return Promise.resolve('no icons'); }
    var map = {};
    return Promise.all(files.map(function (f) {
      var key = baseName(f).replace(/\.[^.]+$/, '');
      return SD.readFile(f.replace(/^\/?(?:sdcard\/)?/, '')).then(blobToDataURL).then(function (url) {
        map[key] = url;
      });
    })).then(function () {
      return setSetting('anemone.icons', map);
    }).then(function () {
      return setSetting('anemone.theme.name', theme.name);
    }).then(function () { return files.length + ' icons'; });
  }

  // Fonts -> @font-face injected in app + stored for system UI
  function applyFonts(theme) {
    var files = theme.files.filter(function (f) {
      return /\/fonts\/[^\/]+\.(ttf|otf|woff2?)$/i.test(f);
    });
    if (!files.length) { return Promise.resolve('no fonts'); }
    var fonts = {};
    return Promise.all(files.map(function (f) {
      var family = baseName(f).replace(/\.[^.]+$/, '');
      return SD.readFile(f.replace(/^\/?(?:sdcard\/)?/, '')).then(blobToDataURL).then(function (url) {
        fonts[family] = url;
      });
    })).then(function () {
      var css = Object.keys(fonts).map(function (name) {
        return '@font-face{font-family:"' + name + '";src:url(' + fonts[name] + ');}';
      }).join('\n');
      var style = document.getElementById('anemone-fonts') || document.createElement('style');
      style.id = 'anemone-fonts';
      style.textContent = css;
      document.head.appendChild(style);
      var primary = theme.font || Object.keys(fonts)[0];
      document.documentElement.style.setProperty('--anemone-font', '"' + primary + '", sans-serif');
      return setSetting('anemone.fonts', fonts);
    }).then(function () {
      return setSetting('font.family', theme.font || Object.keys({})[0] || '');
    }).then(function () { return files.length + ' fonts'; });
  }

  function apply(theme, opts) {
    var jobs = [];
    if (opts.wallpaper) { jobs.push(applyWallpaper(theme)); }
    if (opts.icons) { jobs.push(applyIcons(theme)); }
    if (opts.fonts) { jobs.push(applyFonts(theme)); }
    var names = [];
    if (opts.wallpaper) { names.push('wallpaper'); }
    if (opts.icons) { names.push('icons'); }
    if (opts.fonts) { names.push('fonts'); }
    var canSystem = !!navigator.mozSettings;
    return backup().catch(function () {}).then(function () {
      // Each job reports its own outcome so one denial doesn't hide the rest.
      return Promise.all(jobs.map(function (job, i) {
        return job.then(function (r) { return r; }, function () {
          return names[i] + ' (blocked: needs a certified install)';
        });
      }));
    }).then(function (results) {
      if (!canSystem) {
        results.push('note: system settings are unavailable in this install; fonts apply inside Anemone only');
      }
      return results;
    });
  }

  // Preview helpers for the detail screen
  function preview(theme) {
    var out = { wallpaper: null, icons: [], fonts: [] };
    var jobs = [];
    var wp = findFile(theme, theme.wallpaper || 'wallpaper.jpg');
    if (wp) {
      jobs.push(SD.readFile(wp).then(function (b) { out.wallpaper = URL.createObjectURL(b); }));
    }
    theme.files.filter(function (f) { return /\/icons\//i.test(f); }).slice(0, 12).forEach(function (f) {
      jobs.push(SD.readFile(f.replace(/^\/?(?:sdcard\/)?/, '')).then(function (b) {
        out.icons.push(URL.createObjectURL(b));
      }));
    });
    out.fonts = theme.files.filter(function (f) { return /\/fonts\//i.test(f); }).map(baseName);
    return Promise.all(jobs).then(function () { return out; });
  }

  return { apply: apply, preview: preview, restore: restore, hasBackup: hasBackup };
})();
