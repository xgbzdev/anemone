/* Permission popup + OS permission triggers */
var Perms = (function () {
  var popup = document.getElementById('perm-popup');

  function granted() { return localStorage.getItem('anemone.perms') === '1'; }

  // Shows the popup; resolves true if the user taps Enable and the SD card is reachable.
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

  // What this install is actually allowed to do (settings/apps are certified-only).
  function caps() {
    return {
      sdcard: !!navigator.getDeviceStorage,
      settings: !!navigator.mozSettings,
      apps: !!(navigator.mozApps && navigator.mozApps.mgmt)
    };
  }

  // Only the SD card is required. Settings and apps are optional extras:
  // when this build is installed as privileged they simply aren't there.
  function requestOS() {
    var sd = navigator.getDeviceStorage && navigator.getDeviceStorage('sdcard');
    if (!sd) { return Promise.resolve(false); }
    return new Promise(function (res) {
      var r = sd.available();
      r.onsuccess = function () { res(this.result !== 'unavailable'); };
      r.onerror = function () { res(false); };
    });
  }

  return { ensure: ensure, granted: granted, caps: caps };
})();
