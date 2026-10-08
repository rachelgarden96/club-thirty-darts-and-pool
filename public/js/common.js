// Shared browser helpers: live connection to the server, actions, little bits
// of formatting used by the display, control panel and phone scorer.
(function () {
  const listeners = [];
  let last = null;

  function connect() {
    const status = document.getElementById('conn');
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      last = JSON.parse(e.data);
      if (status) status.classList.remove('down');
      listeners.forEach((fn) => fn(last));
    };
    es.onerror = () => {
      if (status) status.classList.add('down');
      // EventSource retries by itself; nothing else to do.
    };
  }

  async function act(type, data) {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...data }),
    }).catch(() => null);
    if (!res) {
      toast('Could not reach the tournament computer. Is it still running?', true);
      return false;
    }
    const out = await res.json().catch(() => ({ ok: false, error: 'Unexpected reply' }));
    if (!out.ok) toast(out.error || 'Something went wrong', true);
    return out.ok;
  }

  function toast(msg, bad) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = bad ? 'show bad' : 'show';
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.className = ''), 3500);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function flag(code, cls) {
    if (!code) return `<span class="flag noflag ${cls || ''}"></span>`;
    return `<img class="flag ${cls || ''}" src="/flags/${esc(code)}.svg" alt="${esc(Countries.name(code))}">`;
  }

  function player(ev, id) {
    return ev.players.find((p) => p.id === id) || null;
  }

  // Scores are stored as "p1-p2". Returns [a, b] or null for free text.
  function parseScore(score) {
    const m = /^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/.exec(score || '');
    return m ? [Number(m[1]), Number(m[2])] : null;
  }

  function countryOptions(selected) {
    return '<option value="">— Country —</option>' + Countries.COUNTRIES
      .map(([c, n]) => `<option value="${c}"${c === selected ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }

  // Text for a "join this Wi-Fi" QR code (understood by iPhone and Android cameras).
  function wifiQrText(name, password) {
    const e = (v) => String(v || '').replace(/([\\;,:"])/g, '\\$1');
    return password ? `WIFI:T:WPA;S:${e(name)};P:${e(password)};;` : `WIFI:T:nopass;S:${e(name)};;`;
  }

  window.App = {
    connect, act, toast, esc, flag, player, parseScore, countryOptions, wifiQrText,
    onUpdate: (fn) => { listeners.push(fn); if (last) fn(last); },
    get last() { return last; },
  };
})();
