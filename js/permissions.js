/* Permission popup + OS permission triggers */
var Perms = (function () {
  var popup = document.getElementById('perm-popup');

  function granted() { return localStorage.getItem('anemone.perms') === '1'; }

  // Shows the popup; resolves true if the user taps Enable and the OS accepts.
  function ensure() {
    return new Promise(function (resolve) {
      if (granted()) { return resolve(true); }
      popup.hidden = false;
      document.getElementById('perm-deny').onclick = function () {
        popup.hidden = true; resolve(false);
      };
      document.getElementById('perm-allow').onclick = function () {
        popup.hidden = true;
        requestOS().then(function (ok) {
          if (ok) { localStorage.setItem('anemone.perms', '1'); }
          resolve(ok);
        });
      };
    });
  }

  // Touching each API makes the OS raise its own permission prompt if needed.
  function requestOS() {
    var checks = [];

    var sd = navigator.getDeviceStorage && navigator.getDeviceStorage('sdcard');
    if (sd) {
      checks.push(new Promise(function (res) {
        var r = sd.available();
        r.onsuccess = function () { res(this.result !== 'unavailable'); };
        r.onerror = function () { res(false); };
      }));
    } else { checks.push(Promise.resolve(false)); }

    if (navigator.mozSettings) {
      checks.push(new Promise(function (res) {
        var r = navigator.mozSettings.createLock().get('wallpaper.image');
        r.onsuccess = function () { res(true); };
        r.onerror = function () { res(false); };
      }));
    } else { checks.push(Promise.resolve(false)); }

    if (navigator.mozApps && navigator.mozApps.mgmt) {
      checks.push(new Promise(function (res) {
        var r = navigator.mozApps.mgmt.getAll();
        r.onsuccess = function () { res(true); };
        r.onerror = function () { res(false); };
      }));
    } else { checks.push(Promise.resolve(false)); }

    return Promise.all(checks).then(function (r) {
      return r.every(Boolean);
    });
  }

  return { ensure: ensure, granted: granted };
})();
