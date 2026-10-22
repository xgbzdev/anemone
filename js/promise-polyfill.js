/* Minimal Promise for old Gecko (Firefox OS 1.x has no/partial Promise). */
(function (global) {
  if (typeof global.Promise === 'function' && global.Promise.all &&
      global.Promise.resolve && global.Promise.reject) { return; }

  function P(executor) {
    var self = this;
    self._state = 0;            // 0 pending, 1 fulfilled, 2 rejected
    self._value = undefined;
    self._handlers = [];

    function settle(state, value) {
      if (self._state) { return; }
      self._state = state;
      self._value = value;
      setTimeout(flush, 0);
    }
    function resolve(x) {
      if (self._state) { return; }
      try {
        if (x === self) { throw new TypeError('cycle'); }
        var then = x && (typeof x === 'object' || typeof x === 'function') && x.then;
        if (typeof then === 'function') {
          var called = false;
          then.call(x,
            function (v) { if (!called) { called = true; resolve(v); } },
            function (e) { if (!called) { called = true; settle(2, e); } });
          return;
        }
      } catch (e) { settle(2, e); return; }
      settle(1, x);
    }
    function flush() {
      var hs = self._handlers; self._handlers = [];
      hs.forEach(run);
    }
    function run(h) {
      var cb = self._state === 1 ? h.ok : h.fail;
      if (typeof cb !== 'function') {
        (self._state === 1 ? h.res : h.rej)(self._value);
        return;
      }
      try { h.res(cb(self._value)); } catch (e) { h.rej(e); }
    }
    self._push = function (h) {
      self._handlers.push(h);
      if (self._state) { setTimeout(flush, 0); }
    };
    try { executor(resolve, function (e) { settle(2, e); }); }
    catch (e) { settle(2, e); }
  }

  P.prototype.then = function (ok, fail) {
    var self = this;
    return new P(function (res, rej) {
      self._push({ ok: ok, fail: fail, res: res, rej: rej });
    });
  };
  P.prototype['catch'] = function (fail) { return this.then(undefined, fail); };

  P.resolve = function (v) {
    return (v instanceof P) ? v : new P(function (res) { res(v); });
  };
  P.reject = function (e) { return new P(function (_, rej) { rej(e); }); };
  P.all = function (list) {
    return new P(function (res, rej) {
      var n = list.length, out = new Array(n), left = n;
      if (!n) { res(out); return; }
      list.forEach(function (p, i) {
        P.resolve(p).then(function (v) {
          out[i] = v;
          if (--left === 0) { res(out); }
        }, rej);
      });
    });
  };

  global.Promise = P;
})(window);
