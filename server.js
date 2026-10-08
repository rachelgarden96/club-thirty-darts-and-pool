#!/usr/bin/env node
// Club Thirty: local tournament server.
//   /           TV display + control panel (tabs)
//   /display    TV display only (for a second window on the TV)
//   /control    control panel only
//   /score      phone score keeper (the QR code points here)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const T = require('./lib/tournament');
const Store = require('./lib/store');
const Commentary = require('./public/js/commentary');
const Stats = require('./public/js/stats');

const PORT = Number(process.env.PORT) || 3030;
const PUBLIC = path.join(__dirname, 'public');
const store = new Store(process.env.DATA_DIR || path.join(__dirname, 'data'));

let state = store.load() || T.newState();
state.relationships = state.relationships || [];
state.stats = state.stats || {};
store.save(state);

// ---------------------------------------------------------------- helpers

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b));
}

function payload() {
  const lan = lanAddresses();
  const base = state.settings.publicUrl
    ? state.settings.publicUrl.replace(/\/+$/, '')
    : `http://${lan[0] || 'localhost'}:${PORT}`;
  return {
    state,
    derived: T.derive(state),
    server: { port: PORT, lan, scoreUrl: `${base}/score`, dataDir: store.dir },
  };
}

const clients = new Set();
function broadcast() {
  const msg = `data: ${JSON.stringify(payload())}\n\n`;
  for (const res of clients) res.write(msg);
}

function addFeed(lines, kind) {
  const ts = Date.now();
  for (const text of lines) {
    state.feed.push({ id: T.uid('f'), ts, kind, text });
  }
  state.feed = state.feed.slice(-200);
}

// Stats only count for matches that still have a result.
function dropStaleStats(e) {
  for (const k of Object.keys(state.stats)) {
    const [evId, mid] = k.split(':');
    if (evId !== e.id) continue;
    const m = T.getMatch(e, mid);
    if (!m || m.status !== 'done') delete state.stats[k];
  }
}

function ev(id) {
  const e = state.events[id];
  if (!e) throw new Error('Unknown event.');
  return e;
}

function cleanPlayers(list) {
  return (list || [])
    .filter((p) => p && String(p.name || '').trim())
    .map((p) => ({
      id: p.id || T.uid('p'),
      name: String(p.name).trim().slice(0, 40),
      country: String(p.country || '').slice(0, 10),
      seed: Number(p.seed) > 0 ? Math.floor(Number(p.seed)) : null,
      walkon: String(p.walkon || '').trim().slice(0, 80),
    }));
}

// ---------------------------------------------------------------- actions

const actions = {
  saveSettings(a) {
    const s = state.settings;
    for (const k of ['title', 'subtitle', 'hostName', 'homeCountry', 'publicUrl', 'theme', 'bracketView']) {
      if (typeof a.settings[k] === 'string') s[k] = a.settings[k].slice(0, 120);
    }
    if (a.settings.slideSeconds) s.slideSeconds = Math.min(120, Math.max(3, Number(a.settings.slideSeconds) || 10));
    if (typeof a.settings.autoAssign === 'boolean') s.autoAssign = a.settings.autoAssign;
    if (a.settings.slides) Object.assign(s.slides, a.settings.slides);
  },

  setPlayers(a) {
    const e = ev(a.eventId);
    const players = cleanPlayers(a.players);
    if (e.generated) {
      // After the draw, only names/countries/seeds of existing players may change.
      for (const p of players) {
        const cur = e.players.find((x) => x.id === p.id);
        if (cur) Object.assign(cur, { name: p.name, country: p.country, seed: p.seed, walkon: p.walkon });
      }
      return;
    }
    e.players = players;
  },

  setVenues(a) {
    const e = ev(a.eventId);
    const venues = (a.venues || [])
      .filter((v) => v && String(v.name || '').trim())
      .map((v) => ({ id: v.id || T.uid('v'), name: String(v.name).trim().slice(0, 30) }));
    if (!venues.length) throw new Error(`Keep at least one ${e.venueLabel.toLowerCase()}.`);
    e.venues = venues;
    for (const m of e.matches) {
      if (m.status === 'playing' && !venues.some((v) => v.id === m.venueId)) {
        m.status = 'ready';
        m.venueId = null;
      }
    }
  },

  generate(a) {
    const e = ev(a.eventId);
    T.generate(e);
    dropStaleStats(e);
    for (const k of Object.keys(state.live)) if (k.startsWith(`${e.id}:`)) delete state.live[k];
    const n = e.players.length;
    addFeed([`THE DRAW IS MADE: ${n} players go into the ${e.name}. ${Commentary.PUNDITS[n % Commentary.PUNDITS.length]}: "Some very tasty ties in there."`], 'draw');
  },

  resetEvent(a) {
    const e = ev(a.eventId);
    e.generated = false;
    e.matches = [];
    e.rounds = 0;
    for (const k of Object.keys(state.live)) if (k.startsWith(`${e.id}:`)) delete state.live[k];
    dropStaleStats(e);
  },

  result(a) {
    const e = ev(a.eventId);
    const key = `${e.id}:${a.matchId}`;
    // Stats from the phone that scored it (or the last live update if the
    // result was entered in the Control Room while a phone was scoring).
    const live = state.live[key];
    const stats = Stats.fromGame(a.game || (live && live.data));
    const m = T.setResult(state, e, a.matchId, a.winnerId, a.score, a.how);
    const match = T.getMatch(e, a.matchId);
    if (stats && stats.players.every((p) => p.id === match.p1 || p.id === match.p2)) state.stats[key] = { ...stats, at: Date.now() };
    if (m) addFeed(Commentary.resultLines(state, e, T.derive(state)[e.id], m), 'result');
  },

  resetMatch(a) {
    const e = ev(a.eventId);
    T.resetMatch(state, e, a.matchId);
    dropStaleStats(e);
  },

  startMatch(a) {
    T.startMatch(state, ev(a.eventId), a.matchId, a.venueId);
  },

  holdMatch(a) {
    T.holdMatch(state, ev(a.eventId), a.matchId, a.hold);
  },

  live(a) {
    const e = ev(a.eventId);
    const m = T.getMatch(e, a.matchId);
    if (!m || m.status === 'done') throw new Error('That match has already finished.');
    if (a.data === null) delete state.live[`${e.id}:${m.id}`];
    else {
      const summary = a.summary && typeof a.summary === 'object'
        ? {
          text: String(a.summary.text || '').slice(0, 80),
          p1: String(a.summary.p1 || '').slice(0, 12),
          p2: String(a.summary.p2 || '').slice(0, 12),
          turn: a.summary.turn === 0 || a.summary.turn === 1 ? a.summary.turn : null,
          endsAt: Number(a.summary.endsAt) > 0 ? Number(a.summary.endsAt) : null,
        }
        : null;
      state.live[`${e.id}:${m.id}`] = { data: a.data, summary, updatedAt: Date.now() };
    }
  },

  // Post-match interview from the phone scorer.
  quote(a) {
    const e = ev(a.eventId);
    const m = T.getMatch(e, a.matchId);
    if (!m || m.status !== 'done') throw new Error('That match has not finished yet.');
    const ts = Date.now();
    for (const q of (a.quotes || []).slice(0, 2)) {
      const text = String(q.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      if (!text || (q.playerId !== m.p1 && q.playerId !== m.p2)) continue;
      const p = T.playerById(e, q.playerId);
      const role = q.playerId === m.winner ? 'winner' : 'loser';
      const opp = T.playerById(e, q.playerId === m.p1 ? m.p2 : m.p1);
      state.feed.push({
        id: T.uid('f'), ts, kind: 'quote', role, eventId: e.id, playerId: p.id, quote: text,
        text: role === 'winner' ? `🎤 ${p.name} after beating ${opp.name}: "${text}"` : `🧂 ${p.name} after losing to ${opp.name}: "${text}"`,
      });
      state.feed.push({ id: T.uid('f'), ts, kind: 'reaction', text: Commentary.quoteReaction(p.name, role) });
    }
    state.feed = state.feed.slice(-200);
  },

  setRelationships(a) {
    state.relationships = (a.relationships || [])
      .filter((r) => r && r.a && r.b && r.type && String(r.a).toLowerCase() !== String(r.b).toLowerCase())
      .slice(0, 100)
      .map((r) => ({ id: r.id || T.uid('r'), a: String(r.a).slice(0, 40), b: String(r.b).slice(0, 40), type: String(r.type).slice(0, 20) }));
  },

  addFeed(a) {
    const text = String(a.text || '').trim().slice(0, 280);
    if (text) addFeed([text], 'custom');
  },

  deleteFeed(a) {
    state.feed = state.feed.filter((f) => f.id !== a.id);
  },

  importState(a) {
    const s = a.state;
    if (!s || !s.events || !s.events.pool || !s.events.darts || !s.settings) throw new Error('That does not look like a Club Thirty backup.');
    state = s;
    state.live = state.live || {};
    state.feed = state.feed || [];
    state.relationships = state.relationships || [];
    state.stats = state.stats || {};
  },

  newTournament() {
    state = T.newState();
  },
};

function runAction(a) {
  const fn = actions[a && a.type];
  if (!fn) throw new Error('Unknown action.');
  fn(a);
  if (state.settings.autoAssign) T.autoAssign(state);
  state.updatedAt = Date.now();
  if (a.type === 'live') store.saveSoon(state);
  else store.save(state);
  broadcast();
}

// ---------------------------------------------------------------- http

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
};
const ROUTES = { '/': 'index.html', '/display': 'index.html', '/control': 'index.html', '/score': 'score.html' };

function serveStatic(req, res, pathname) {
  const rel = ROUTES[pathname] || decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const cache = file.includes(`${path.sep}flags${path.sep}`) || file.includes(`${path.sep}fonts${path.sep}`) ? 'max-age=86400' : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    res.end(buf);
  });
}

function send(res, code, body, type = 'text/plain') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 5e6) reject(new Error('Too large'));
    });
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/state') return send(res, 200, payload(), 'application/json');
    if (url.pathname === '/api/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify(payload())}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clients.delete(res); clearInterval(ping); });
      return;
    }
    if (url.pathname === '/api/action' && req.method === 'POST') {
      let action;
      try { action = JSON.parse(await readBody(req)); } catch { return send(res, 400, { ok: false, error: 'Bad request' }, 'application/json'); }
      try {
        runAction(action);
        return send(res, 200, { ok: true }, 'application/json');
      } catch (e) {
        return send(res, 400, { ok: false, error: e.message }, 'application/json');
      }
    }
    if (url.pathname === '/api/backup') {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="club-thirty-backup-${stamp}.json"`,
      });
      return res.end(JSON.stringify(state, null, 1));
    }
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    send(res, 500, 'Server error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const lan = lanAddresses();
  console.log('\n  🎯🎱  CLUB THIRTY is live!\n');
  console.log(`  On this computer:   http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  On the Wi-Fi:       http://${ip}:${PORT}   (phones: http://${ip}:${PORT}/score)`);
  console.log(`  Saving to:          ${store.file}\n`);
  console.log('  Keep this window open during the party. Close it (or Ctrl+C) to stop.\n');
  if (!process.env.NO_OPEN) openBrowser(`http://localhost:${PORT}`);
});

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch { /* no browser available: fine */ }
}

// Make sure the last live-score tick hits the disk on shutdown.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    store.save(state, { backup: false });
    process.exit(0);
  });
}
