/* App controller */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var themes = [];
  var current = null;
  var previewUrls = [];

  function status(msg) { $('status').textContent = msg; }

  function renderList() {
    var ul = $('theme-list');
    ul.innerHTML = '';
    themes.forEach(function (t) {
      var li = document.createElement('li');
      li.innerHTML = '<b></b><small></small>';
      li.firstChild.textContent = t.name || t.dir;
      li.lastChild.textContent = (t.author ? 'by ' + t.author : 'Unknown author');
      li.onclick = function () { openDetail(t); };
      ul.appendChild(li);
    });
    status(themes.length
      ? themes.length + ' theme(s) found'
      : 'No themes found. Put packs in /sdcard/Anemone/<name>/ with a theme.json.');
  }

  function openDetail(t) {
    current = t;
    $('d-name').textContent = t.name || t.dir;
    $('d-author').textContent = t.author ? 'by ' + t.author : '';
    $('d-icons').innerHTML = '';
    $('d-fonts').textContent = '';
    $('d-wallpaper').removeAttribute('src');
    $('detail').hidden = false;
    $('main').hidden = true;
    Themer.preview(t).then(function (p) {
      previewUrls = p.urls;
      if (p.wallpaper) { $('d-wallpaper').src = p.wallpaper; }
      p.icons.forEach(function (u) {
        var img = document.createElement('img');
        img.src = u;
        $('d-icons').appendChild(img);
      });
      $('d-fonts').textContent = p.fonts.length ? 'Fonts: ' + p.fonts.join(', ') : 'No fonts in this pack';
    }).catch(function () {
      $('d-fonts').textContent = 'Could not read this pack\'s files.';
    });
  }

  function closeDetail() {
    Themer.release(previewUrls); previewUrls = [];
    $('detail').hidden = true;
    $('main').hidden = false;
  }

  function scan() {
    status('Scanning SD card…');
    SD.scan().then(function (found) {
      themes = found;
      renderList();
    }).catch(function () {
      status('Could not read the SD card. Is it inserted?');
    });
  }

  function start() {
    SD.state().then(function (st) {
      if (st === 'shared') {
        status('The SD card is in use by USB storage. Unplug the cable and tap refresh.');
        return;
      }
      if (st === 'unavailable') {
        status('No SD card found. Insert one and tap refresh.');
        return;
      }
      if (st !== 'available') { startPicker(); return; }   // no SD access: use the file picker
      Perms.ensure().then(function (allowed) {
        if (!allowed) { startPicker(); return; }
        scan();
      });
    });
  }

  function refreshStockButton() {
    if (!navigator.mozSettings) { return; }
    Themer.hasBackup().then(function (has) { $('btn-stock').hidden = !has; });
  }

  $('btn-stock').onclick = function () {
    if (!confirm('Put back the original wallpaper, icons and font?')) { return; }
    Themer.restore().then(function (ok) {
      alert(ok ? 'Stock theme restored. Restart the phone if icons or fonts look unchanged.'
               : 'Nothing to restore.');
      refreshStockButton();
    }).catch(function () { alert('Could not restore the stock theme.'); });
  };

  $('btn-rescan').onclick = start;
  $('btn-back').onclick = closeDetail;
  $('btn-apply').onclick = function () {
    if (!current) { return; }
    $('btn-apply').disabled = true;
    Themer.apply(current, {
      wallpaper: $('c-wall').checked,
      icons: $('c-icons').checked,
      fonts: $('c-fonts').checked
    }).then(function (results) {
      alert('Applied: ' + results.join(', '));
    }).catch(function (e) {
      alert('Could not apply theme: ' + (e && e.name ? e.name : 'unknown error'));
    }).then(function () {
      $('btn-apply').disabled = false;
      refreshStockButton();
    });
  };

  // ---- Picker mode (plain web install: no SD card API) ----
  function startPicker() {
    status('This phone does not let Anemone browse the SD card, so choose files below.');
    $('theme-list').innerHTML = '';
    $('picker').hidden = false;
    var fontUrl = null, wallUrl = null;

    $('p-wall').onchange = function () {
      var f = this.files && this.files[0];
      if (!f) { return; }
      if (wallUrl) { URL.revokeObjectURL(wallUrl); }
      wallUrl = URL.createObjectURL(f);
      $('p-wall-prev').src = wallUrl;
      document.body.style.backgroundImage = 'url(' + wallUrl + ')';
      document.body.style.backgroundSize = 'cover';
    };

    $('p-font').onchange = function () {
      var f = this.files && this.files[0];
      if (!f) { return; }
      if (fontUrl) { URL.revokeObjectURL(fontUrl); }
      fontUrl = URL.createObjectURL(f);
      var style = document.getElementById('anemone-fonts') || document.createElement('style');
      style.id = 'anemone-fonts';
      style.textContent = '@font-face{font-family:"AnemonePick";src:url(' + fontUrl + ');}';
      document.head.appendChild(style);
      document.documentElement.style.setProperty('--anemone-font', '"AnemonePick", sans-serif');
    };

    $('p-reset').onclick = function () {
      document.body.style.backgroundImage = '';
      document.documentElement.style.removeProperty('--anemone-font');
      $('p-wall-prev').removeAttribute('src');
      $('p-wall').value = '';
      $('p-font').value = '';
    };
  }

  start();
  refreshStockButton();
})();
