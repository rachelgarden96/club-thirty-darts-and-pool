// Tournament engine: bracket generation, results, scheduling and "up next".
// Everything here is pure data manipulation on the state object so it is easy
// to persist (see lib/store.js) and to reason about.

const EVENT_DEFAULTS = {
  pool: { name: 'Pool', venueLabel: 'Table' },
  darts: { name: 'Darts', venueLabel: 'Oche' },
};

function uid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 9);
}

function newEvent(id) {
  const d = EVENT_DEFAULTS[id];
  return {
    id,
    name: d.name,
    venueLabel: d.venueLabel,
    players: [],
    venues: [
      { id: uid('v'), name: `${d.venueLabel} 1` },
    ],
    generated: false,
    rounds: 0,
    matches: [],
  };
}

function newState() {
  return {
    schema: 1,
    settings: {
      title: 'Club Thirty',
      subtitle: 'Darts & Pool Championship',
      theme: 'light',
      bracketView: 'auto',
      hostName: '',
      homeCountry: 'gb-eng',
      slideSeconds: 10,
      publicUrl: '',
      autoAssign: true,
      slides: {
        poolBracket: true,
        dartsBracket: true,
        nowPlaying: true,
        upNext: true,
        qr: true,
        pundits: true,
        quotes: true,
      },
    },
    events: { pool: newEvent('pool'), darts: newEvent('darts') },
    feed: [],
    live: {},
    relationships: [],
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Bracket generation

// Standard seeding order, e.g. for 8: [1, 8, 4, 5, 2, 7, 3, 6]. Adjacent pairs
// are first-round matches, and seeds 1 and 2 can only meet in the final.
function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function roundName(rounds, r) {
  const fromEnd = rounds - r;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  return `Last ${2 ** (fromEnd + 1)}`;
}

function matchId(r, slot) {
  return `R${r}M${slot + 1}`;
}

function getMatch(ev, id) {
  return ev.matches.find((m) => m.id === id);
}

function matchAt(ev, r, slot) {
  return getMatch(ev, matchId(r, slot));
}

function nextOf(ev, m) {
  if (m.round >= ev.rounds) return null;
  return { match: matchAt(ev, m.round + 1, Math.floor(m.slot / 2)), side: m.slot % 2 === 0 ? 'p1' : 'p2' };
}

function feedersOf(ev, m) {
  if (m.round <= 1) return [null, null];
  return [matchAt(ev, m.round - 1, m.slot * 2), matchAt(ev, m.round - 1, m.slot * 2 + 1)];
}

function generate(ev) {
  const players = ev.players.filter((p) => p.name && p.name.trim());
  if (players.length < 2) throw new Error(`Add at least 2 players to ${ev.name} first.`);
  const seeded = players
    .filter((p) => Number(p.seed) > 0)
    .sort((a, b) => Number(a.seed) - Number(b.seed));
  const ranked = seeded.concat(shuffle(players.filter((p) => !(Number(p.seed) > 0))));

  let size = 2;
  while (size < ranked.length) size *= 2;
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  const matches = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let slot = 0; slot < count; slot++) {
      matches.push({
        id: matchId(r, slot), round: r, slot,
        p1: null, p2: null, bye: false, winner: null, score: '',
        status: 'pending', venueId: null, hold: false, startedAt: null, finishedAt: null,
      });
    }
  }
  ev.matches = matches;
  ev.rounds = rounds;
  for (let slot = 0; slot < size / 2; slot++) {
    const m = matchAt(ev, 1, slot);
    const a = ranked[order[slot * 2] - 1];
    const b = ranked[order[slot * 2 + 1] - 1];
    m.p1 = a ? a.id : null;
    m.p2 = b ? b.id : null;
    if (!a || !b) {
      m.bye = true;
      m.winner = (a || b).id;
      m.status = 'done';
      advance(ev, m);
    }
  }
  ev.generated = true;
  refreshStatuses(ev);
}

function advance(ev, m) {
  const nx = nextOf(ev, m);
  if (!nx) return;
  nx.match[nx.side] = m.winner;
}

function refreshStatuses(ev) {
  for (const m of ev.matches) {
    if (m.status === 'done' || m.status === 'playing') continue;
    m.status = m.p1 && m.p2 ? 'ready' : 'pending';
  }
}

// ---------------------------------------------------------------------------
// Results

function setResult(state, ev, id, winnerId, score, how) {
  let m = getMatch(ev, id);
  if (!m) throw new Error('Match not found.');
  if (!m.p1 || !m.p2) throw new Error('Both players are not known yet for that match.');
  if (winnerId !== m.p1 && winnerId !== m.p2) throw new Error('Winner is not in that match.');
  if (m.status === 'done' && m.winner === winnerId) {
    m.score = score || m.score;
    return null;
  }
  if (m.status === 'done') resetMatch(state, ev, id);
  m = getMatch(ev, id);
  m.winner = winnerId;
  m.score = (score || '').trim();
  m.how = how === 'time' ? 'time' : null;
  m.status = 'done';
  m.hold = false;
  m.finishedAt = Date.now();
  if (!m.startedAt) m.startedAt = m.finishedAt;
  advance(ev, m);
  delete state.live[`${ev.id}:${id}`];
  refreshStatuses(ev);
  return m;
}

// Undo a result. Anything downstream that depended on the winner is undone too.
function resetMatch(state, ev, id) {
  const m = getMatch(ev, id);
  if (!m) throw new Error('Match not found.');
  if (m.bye) throw new Error('That was a bye, nothing to undo.');
  const nx = nextOf(ev, m);
  if (m.status === 'done' && nx) {
    const n = nx.match;
    if (n.status === 'done' || n.status === 'playing') {
      if (n.status === 'done') resetMatch(state, ev, n.id);
      n.status = 'pending';
      n.venueId = null;
      n.startedAt = null;
      delete state.live[`${ev.id}:${n.id}`];
    }
    n[nx.side] = null;
  }
  const wasDone = m.status === 'done';
  m.winner = null;
  m.score = '';
  m.how = null;
  m.finishedAt = null;
  m.status = 'ready';
  // Put it back on the table it was played on, if that is free.
  if (wasDone && m.venueId && !ev.matches.some((x) => x.status === 'playing' && x.venueId === m.venueId)
    && ev.venues.some((v) => v.id === m.venueId)) {
    m.status = 'playing';
  } else {
    m.venueId = null;
  }
  refreshStatuses(ev);
}

function startMatch(state, ev, id, venueId) {
  const m = getMatch(ev, id);
  if (!m || !m.p1 || !m.p2 || m.status === 'done') throw new Error('That match cannot be started.');
  if (!ev.venues.some((v) => v.id === venueId)) throw new Error('Unknown table/oche.');
  for (const other of ev.matches) {
    if (other !== m && other.status === 'playing' && other.venueId === venueId) {
      other.status = 'ready';
      other.venueId = null;
      other.hold = true;
    }
  }
  m.status = 'playing';
  m.venueId = venueId;
  m.hold = false;
  m.startedAt = Date.now();
}

function holdMatch(state, ev, id, hold) {
  const m = getMatch(ev, id);
  if (!m || m.status === 'done') throw new Error('That match cannot be changed.');
  m.hold = !!hold;
  if (hold && m.status === 'playing') {
    m.status = 'ready';
    m.venueId = null;
    m.startedAt = null;
  }
}

// ---------------------------------------------------------------------------
// Scheduling

function playerById(ev, id) {
  return ev.players.find((p) => p.id === id) || null;
}

function key(name) {
  return (name || '').trim().toLowerCase();
}

// Names (lower case) of everybody currently playing in either event, so that
// somebody entered in both pool and darts is never called to two places.
function busyNames(state) {
  const busy = new Set();
  for (const ev of Object.values(state.events)) {
    for (const m of ev.matches) {
      if (m.status !== 'playing') continue;
      for (const pid of [m.p1, m.p2]) {
        const p = playerById(ev, pid);
        if (p) busy.add(key(p.name));
      }
    }
  }
  return busy;
}

function queueOf(ev) {
  return ev.matches
    .filter((m) => m.status === 'ready')
    .sort((a, b) => a.round - b.round || a.slot - b.slot);
}

function autoAssign(state) {
  const busy = busyNames(state);
  for (const ev of Object.values(state.events)) {
    if (!ev.generated) continue;
    for (const v of ev.venues) {
      if (ev.matches.some((m) => m.status === 'playing' && m.venueId === v.id)) continue;
      const next = queueOf(ev).find((m) => !m.hold && [m.p1, m.p2].every((pid) => !busy.has(key((playerById(ev, pid) || {}).name))));
      if (!next) continue;
      next.status = 'playing';
      next.venueId = v.id;
      next.startedAt = Date.now();
      for (const pid of [next.p1, next.p2]) busy.add(key((playerById(ev, pid) || {}).name));
    }
  }
}

// Predict what will be played next on each venue. Venues that have been busy
// the longest are assumed to free up first. Matches still waiting on a game in
// progress are included as "Winner of A v B".
function upNext(state, ev) {
  if (!ev.generated) return [];
  const playingAt = (vid) => ev.matches.find((m) => m.status === 'playing' && m.venueId === vid) || null;
  const venues = ev.venues
    .map((v) => ({ venue: v, current: playingAt(v.id) }))
    .sort((a, b) => (a.current ? a.current.startedAt : 0) - (b.current ? b.current.startedAt : 0));

  const ready = queueOf(ev);
  const waiting = ev.matches
    .filter((m) => m.status === 'pending' && !m.bye)
    .filter((m) => feedersOf(ev, m).every((f) => !f || f.status === 'done' || f.status === 'playing'))
    .sort((a, b) => a.round - b.round || a.slot - b.slot);
  const candidates = ready.filter((m) => !m.hold).concat(waiting);

  const taken = new Set();
  const picked = new Set();
  const out = new Map();
  for (const { venue, current } of venues) {
    const cand = candidates.find((m) => !picked.has(m.id) && [m.p1, m.p2].every((pid) => !pid || !taken.has(pid)));
    if (cand) {
      picked.add(cand.id);
      [cand.p1, cand.p2].forEach((pid) => pid && taken.add(pid));
    }
    out.set(venue.id, { venueId: venue.id, currentId: current ? current.id : null, nextId: cand ? cand.id : null });
  }
  return ev.venues.map((v) => out.get(v.id));
}

// ---------------------------------------------------------------------------
// Derived info for the screens

function derive(state) {
  const out = {};
  for (const ev of Object.values(state.events)) {
    const final = ev.generated ? matchAt(ev, ev.rounds, 0) : null;
    const eliminated = new Set();
    const wins = {};
    for (const m of ev.matches) {
      if (m.status !== 'done' || m.bye) continue;
      wins[m.winner] = (wins[m.winner] || 0) + 1;
      eliminated.add(m.winner === m.p1 ? m.p2 : m.p1);
    }
    const remaining = ev.generated ? ev.players.filter((p) => !eliminated.has(p.id)).length : ev.players.length;
    const open = ev.matches.filter((m) => m.status !== 'done');
    const currentRound = open.length ? Math.min(...open.map((m) => m.round)) : ev.rounds;
    const nameFor = {};
    for (let r = 1; r <= ev.rounds; r++) nameFor[r] = roundName(ev.rounds, r);
    out[ev.id] = {
      roundNames: nameFor,
      currentRound,
      currentRoundName: ev.generated ? nameFor[currentRound] : '',
      champion: final && final.status === 'done' ? final.winner : null,
      runnerUp: final && final.status === 'done' ? (final.winner === final.p1 ? final.p2 : final.p1) : null,
      eliminated: [...eliminated],
      wins,
      remaining,
      upNext: upNext(state, ev),
      queue: queueOf(ev).map((m) => m.id),
      feeders: Object.fromEntries(ev.matches.map((m) => [m.id, feedersOf(ev, m).map((f) => (f ? f.id : null))])),
    };
  }
  return out;
}

module.exports = {
  newState, newEvent, generate, setResult, resetMatch, startMatch, holdMatch,
  autoAssign, derive, getMatch, nextOf, playerById, roundName, uid, seedOrder,
};
