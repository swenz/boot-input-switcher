/* Boot Input Switcher - config UI.
 * All privileged work is done by boot/switcher.sh, executed as root through
 * the Homebrew Channel service (luna://org.webosbrew.hbchannel.service/exec). */
(function () {
  'use strict';

  var APP_ID = 'io.github.swenz.bootinputswitcher';
  var SCRIPT = '/media/developer/apps/usr/palm/applications/' + APP_ID + '/boot/switcher.sh';
  var EXEC = 'luna://org.webosbrew.hbchannel.service/exec';
  var MAX_DELAY = 120;

  var de = (navigator.language || '').toLowerCase().indexOf('de') === 0;
  var T = de ? {
    subtitle: 'Wechselt beim Einschalten des TVs automatisch auf eine feste Quelle.',
    source: 'Quelle beim Einschalten',
    delay: 'Zusätzliche Verzögerung',
    wake: 'Auch beim Aufwachen aus Standby',
    on: 'Ein', off: 'Aus',
    save: 'Speichern', test: 'Jetzt testen',
    disabled: 'Deaktiviert (nichts tun)',
    gInputs: 'Eingänge', gApps: 'Apps', gOther: 'Sonstiges',
    liveTv: 'Live TV',
    loading: 'Lade …',
    saved: 'Gespeichert. Wird beim nächsten Einschalten angewendet.',
    savedOff: 'Deaktiviert. Der Autostart-Hook wurde entfernt.',
    testing: 'Wechsle Quelle …',
    noTarget: 'Bitte zuerst eine Quelle wählen und speichern.',
    error: 'Fehler: ',
    noRoot: 'Der Homebrew-Channel-Service läuft nicht als root. Bitte TV rooten bzw. Homebrew Channel neu starten.',
    noHb: 'Homebrew Channel wurde nicht gefunden. Diese App benötigt einen gerooteten TV mit Homebrew Channel.',
    active: 'Aktiv', inactive: 'Inaktiv',
    unsaved: 'Ungespeicherte Änderungen.',
    notInstalled: 'nicht mehr installiert'
  } : {
    subtitle: 'Automatically switches to a fixed source whenever the TV turns on.',
    source: 'Source at power-on',
    delay: 'Extra delay',
    wake: 'Also on wake from standby',
    on: 'On', off: 'Off',
    save: 'Save', test: 'Test now',
    disabled: 'Disabled (do nothing)',
    gInputs: 'Inputs', gApps: 'Apps', gOther: 'Other',
    liveTv: 'Live TV',
    loading: 'Loading …',
    saved: 'Saved. Applied the next time the TV turns on.',
    savedOff: 'Disabled. The autostart hook has been removed.',
    testing: 'Switching source …',
    noTarget: 'Choose a source and save first.',
    error: 'Error: ',
    noRoot: 'The Homebrew Channel service is not running as root. Root the TV or restart Homebrew Channel.',
    noHb: 'Homebrew Channel was not found. This app needs a rooted TV with Homebrew Channel.',
    active: 'Active', inactive: 'Inactive',
    unsaved: 'Unsaved changes.',
    notInstalled: 'no longer installed'
  };

  var state = { target: '', delay: 0, onWake: true };
  var options = []; // {id, title, group} ; id '' = disabled
  var bridges = [];

  function $(id) { return document.getElementById(id); }

  function luna(uri, params, cb) {
    var Bridge = window.WebOSServiceBridge || window.PalmServiceBridge;
    if (!Bridge) { cb({ returnValue: false, errorText: 'no service bridge' }); return; }
    var b = new Bridge();
    bridges.push(b);
    b.onservicecallback = function (msg) {
      var i = bridges.indexOf(b);
      if (i >= 0) { bridges.splice(i, 1); }
      var res;
      try { res = JSON.parse(msg); } catch (e) { res = { returnValue: false, errorText: String(msg) }; }
      cb(res);
    };
    b.call(uri, JSON.stringify(params));
  }

  function exec(command, cb) {
    luna(EXEC, { command: command }, cb);
  }

  function sw(args) { return "sh '" + SCRIPT + "' " + args; }

  function validId(id) { return /^[A-Za-z0-9._-]+$/.test(id); }

  function setStatus(text, cls) {
    var el = $('status');
    el.textContent = text;
    el.className = cls || '';
  }

  function titleOf(id) {
    for (var i = 0; i < options.length; i++) {
      if (options[i].id === id) { return options[i].title; }
    }
    return id + ' (' + T.notInstalled + ')';
  }

  function render() {
    $('source-value').textContent = state.target ? titleOf(state.target) : T.disabled;
    $('delay-value').textContent = state.delay + ' s';
    $('wake-value').textContent = state.onWake ? T.on : T.off;
  }

  // ---- data loading -------------------------------------------------------

  function parseJsonLine(line) {
    try { return JSON.parse(line); } catch (e) { return null; }
  }

  function section(out, name) {
    var start = out.indexOf('---' + name + '---\n');
    if (start < 0) { return ''; }
    start += name.length + 7;
    var end = out.indexOf('\n---', start);
    return (end < 0 ? out.substring(start) : out.substring(start, end)).trim();
  }

  function buildOptions(out) {
    var seen = {};
    options = [{ id: '', title: T.disabled, group: '' }];
    function add(id, title, group) {
      if (!id || seen[id] || !validId(id)) { return; }
      seen[id] = true;
      options.push({ id: id, title: title, group: group });
    }

    var inputs = parseJsonLine(section(out, 'inputs'));
    if (inputs && inputs.devices) {
      inputs.devices.forEach(function (d) {
        var name = String(d.id || '').replace('_', ' ');
        var title = d.label && d.label !== name ? name + ' – ' + d.label : name;
        add(d.appId, title, T.gInputs);
      });
    }
    var sys = section(out, 'sys').split('\n');
    var extra = {
      'com.webos.app.hdmi1': 'HDMI 1', 'com.webos.app.hdmi2': 'HDMI 2',
      'com.webos.app.hdmi3': 'HDMI 3', 'com.webos.app.hdmi4': 'HDMI 4',
      'com.webos.app.externalinput.av1': 'AV', 'com.webos.app.externalinput.av2': 'AV 2',
      'com.webos.app.externalinput.component': 'Component',
      'com.webos.app.externalinput.scart': 'SCART'
    };
    Object.keys(extra).forEach(function (id) {
      if (sys.indexOf(id) >= 0) { add(id, extra[id], T.gInputs); }
    });
    if (sys.indexOf('com.webos.app.livetv') >= 0) { add('com.webos.app.livetv', T.liveTv, T.gInputs); }

    var lp = parseJsonLine(section(out, 'apps'));
    if (lp && lp.launchPoints) {
      lp.launchPoints
        .filter(function (p) { return p.id !== APP_ID && p.title; })
        .sort(function (a, b) { return a.title.localeCompare(b.title); })
        .forEach(function (p) { add(p.id, p.title, T.gApps); });
    }
  }

  function applyStatus(text) {
    var parts = text.split('---log---');
    var kv = {};
    parts[0].split('\n').forEach(function (l) {
      var i = l.indexOf('=');
      if (i > 0) { kv[l.substring(0, i)] = l.substring(i + 1); }
    });
    $('log').textContent = (parts[1] || '').trim();
    return kv;
  }

  function load() {
    setStatus(T.loading);
    var cmd = sw('status') +
      "; echo '---inputs---'; luna-send -n 1 luna://com.webos.service.eim/getAllInputStatus '{}'" +
      "; echo '---apps---'; luna-send -n 1 luna://com.webos.applicationManager/listLaunchPoints '{}'" +
      "; echo '---sys---'; ls /usr/palm/applications | grep -E 'hdmi[0-9]$|externalinput|livetv$'; true";
    exec(cmd, function (res) {
      if (!res.returnValue && !res.stdoutString) {
        $('warning').textContent = T.noHb + ' (' + (res.errorText || '') + ')';
        $('warning').className = '';
        setStatus('');
        return;
      }
      var out = res.stdoutString || '';
      var kv = applyStatus(out.split('---inputs---')[0]);
      if (kv.uid !== '0') {
        $('warning').textContent = T.noRoot;
        $('warning').className = '';
      }
      buildOptions(out);
      state.target = kv.enabled === '1' ? (kv.target || '') : '';
      state.delay = parseInt(kv.delay, 10) || 0;
      state.onWake = kv.on_wake !== '0';
      render();
      setStatus(kv.enabled === '1' && kv.target ? T.active + ': ' + titleOf(kv.target) : T.inactive);
    });
  }

  function refreshLog() {
    exec(sw('status'), function (res) {
      if (res.stdoutString) { applyStatus(res.stdoutString); }
    });
  }

  // ---- actions ------------------------------------------------------------

  function save() {
    var cmd;
    if (state.target) {
      if (!validId(state.target)) { return; }
      cmd = sw("set '" + state.target + "' " + state.delay + ' ' + (state.onWake ? 1 : 0));
    } else {
      cmd = sw('disable');
    }
    exec(cmd, function (res) {
      if (res.returnValue) {
        setStatus(state.target ? T.saved : T.savedOff, 'ok');
      } else {
        setStatus(T.error + (res.stderrString || res.errorText || '?'), 'err');
      }
      refreshLog();
    });
  }

  function test() {
    if (!state.target) { setStatus(T.noTarget, 'err'); return; }
    setStatus(T.testing);
    luna('luna://org.webosbrew.hbchannel.service/exec', {
      command: "luna-send -n 1 luna://com.webos.applicationManager/launch '{\"id\":\"" + state.target + "\"}'"
    }, function (res) {
      if (!res.returnValue) {
        setStatus(T.error + (res.stderrString || res.errorText || '?'), 'err');
      }
    });
  }

  // ---- dropdown overlay ---------------------------------------------------

  var listOpen = false;

  function openList() {
    var list = $('list');
    list.innerHTML = '';
    var group = null;
    var current = null;
    options.forEach(function (o) {
      if (o.group && o.group !== group) {
        group = o.group;
        var g = document.createElement('div');
        g.className = 'group';
        g.textContent = group;
        list.appendChild(g);
      }
      var el = document.createElement('div');
      el.className = 'item focusable' + (o.id === state.target ? ' selected' : '');
      el.tabIndex = 0;
      el.textContent = o.title;
      el.addEventListener('click', function () { choose(o.id); });
      el.addEventListener('mouseenter', function () { el.focus(); });
      el.dataset.id = o.id;
      list.appendChild(el);
      if (o.id === state.target) { current = el; }
    });
    $('overlay').className = '';
    listOpen = true;
    (current || list.querySelector('.item')).focus();
  }

  function closeList() {
    $('overlay').className = 'hidden';
    listOpen = false;
    $('source').focus();
  }

  function choose(id) {
    state.target = id;
    render();
    setStatus(T.unsaved);
    closeList();
  }

  // ---- remote control navigation ------------------------------------------

  var ORDER = ['source', 'delay', 'wake', 'save'];

  function changeDelay(d) {
    state.delay = Math.max(0, Math.min(MAX_DELAY, state.delay + d));
    render();
    setStatus(T.unsaved);
  }

  function toggleWake() {
    state.onWake = !state.onWake;
    render();
    setStatus(T.unsaved);
  }

  function activate(id) {
    if (id === 'source') { openList(); }
    else if (id === 'wake') { toggleWake(); }
    else if (id === 'save') { save(); }
    else if (id === 'test') { test(); }
  }

  function onKey(e) {
    var k = e.keyCode;
    var a = document.activeElement;
    var isBack = k === 461 || k === 27 || k === 8;

    if (listOpen) {
      var items = Array.prototype.slice.call(document.querySelectorAll('#list .item'));
      var i = items.indexOf(a);
      if (k === 38) { items[Math.max(0, i - 1)].focus(); }
      else if (k === 40) { items[Math.min(items.length - 1, i + 1)].focus(); }
      else if (k === 13 && i >= 0) { choose(a.dataset.id); }
      else if (isBack) { closeList(); }
      else { return; }
      e.preventDefault();
      return;
    }

    var id = a && a.id;
    var idx = ORDER.indexOf(id === 'test' ? 'save' : id);
    if (idx < 0) { $('source').focus(); return; }

    if (k === 38) { $(ORDER[Math.max(0, idx - 1)]).focus(); }
    else if (k === 40) { $(ORDER[Math.min(ORDER.length - 1, idx + 1)]).focus(); }
    else if (k === 37) {
      if (id === 'delay') { changeDelay(-1); }
      else if (id === 'test') { $('save').focus(); }
      else if (id === 'wake') { toggleWake(); }
    }
    else if (k === 39) {
      if (id === 'delay') { changeDelay(1); }
      else if (id === 'save') { $('test').focus(); }
      else if (id === 'wake') { toggleWake(); }
    }
    else if (k === 13) { activate(id); }
    else if (isBack) {
      if (window.webOSSystem && window.webOSSystem.platformBack) { window.webOSSystem.platformBack(); }
      else { window.close(); }
    }
    else { return; }
    e.preventDefault();
  }

  // ---- init ---------------------------------------------------------------

  function init() {
    $('subtitle').textContent = T.subtitle;
    $('lbl-source').textContent = T.source;
    $('lbl-delay').textContent = T.delay;
    $('lbl-wake').textContent = T.wake;
    $('save').textContent = T.save;
    $('test').textContent = T.test;
    render();

    ['source', 'wake', 'save', 'test'].forEach(function (id) {
      $(id).addEventListener('click', function () { activate(id); });
    });
    var arrows = $('delay').querySelectorAll('.arrow');
    arrows[0].addEventListener('click', function () { changeDelay(-1); });
    arrows[1].addEventListener('click', function () { changeDelay(1); });
    Array.prototype.forEach.call(document.querySelectorAll('#main .focusable'), function (el) {
      el.addEventListener('mouseenter', function () { el.focus(); });
    });
    $('overlay').addEventListener('click', function (e) {
      if (e.target === $('overlay')) { closeList(); }
    });

    document.addEventListener('keydown', onKey);
    $('source').focus();
    load();
  }

  window.addEventListener('load', init);
})();
