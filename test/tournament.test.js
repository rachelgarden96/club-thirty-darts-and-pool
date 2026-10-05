const test = require('node:test');
const assert = require('node:assert');
const T = require('../lib/tournament');
const Commentary = require('../public/js/commentary');

function setup(n, { seeds = 0, venues = 2, event = 'pool' } = {}) {
  const s = T.newState();
  const ev = s.events[event];
  ev.players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, country: 'gb-eng', seed: i < seeds ? i + 1 : null }));
  ev.venues = Array.from({ length: venues }, (_, i) => ({ id: `v${i + 1}`, name: `Table ${i + 1}` }));
  T.generate(ev);
  return { s, ev };
}

function playAll(s) {
  for (let guard = 0; guard < 500; guard++) {
    T.autoAssign(s);
    let played = false;
    for (const ev of Object.values(s.events)) {
      const m = ev.matches.find((x) => x.status === 'playing');
      if (m) {
        const r = T.setResult(s, ev, m.id, m.p1, '2-1');
        Commentary.resultLines(s, ev, T.derive(s)[ev.id], r);
        played = true;
      }
    }
    if (!played) return;
  }
  throw new Error('did not finish');
}

test('bracket sizes and byes', () => {
  for (const n of [2, 3, 5, 8, 11, 16, 17, 32]) {
    const { ev } = setup(n);
    const size = 2 ** ev.rounds;
    assert.ok(size >= n && size / 2 < n, `size for ${n}`);
    const byes = ev.matches.filter((m) => m.bye).length;
    assert.strictEqual(byes, size - n, `byes for ${n}`);
    // A bye never pairs two empty slots.
    assert.ok(ev.matches.filter((m) => m.round === 1).every((m) => m.p1 || m.p2));
  }
});

test('top seeds get the byes and are kept apart', () => {
  const { ev } = setup(6, { seeds: 2 });
  const r1 = ev.matches.filter((m) => m.round === 1);
  const byeWinners = r1.filter((m) => m.bye).map((m) => m.winner).sort();
  assert.deepStrictEqual(byeWinners, ['p1', 'p2']);
  const top = r1.find((m) => m.p1 === 'p1' || m.p2 === 'p1');
  const second = r1.find((m) => m.p1 === 'p2' || m.p2 === 'p2');
  assert.notStrictEqual(Math.floor(top.slot / 2), Math.floor(second.slot / 2), 'seeds 1 and 2 in different halves');
});

test('a full tournament runs to a champion', () => {
  const { s, ev } = setup(11, { seeds: 4, venues: 3 });
  playAll(s);
  const d = T.derive(s).pool;
  assert.ok(d.champion);
  assert.strictEqual(d.remaining, 1);
  assert.ok(ev.matches.every((m) => m.status === 'done'));
});

test('never more matches playing than venues, never a venue double-booked', () => {
  const { s, ev } = setup(16, { venues: 3 });
  T.autoAssign(s);
  const playing = ev.matches.filter((m) => m.status === 'playing');
  assert.strictEqual(playing.length, 3);
  assert.strictEqual(new Set(playing.map((m) => m.venueId)).size, 3);
});

test('a player in both events is not called to two places at once', () => {
  const s = T.newState();
  for (const k of ['pool', 'darts']) {
    const ev = s.events[k];
    ev.players = [{ id: 'a', name: 'Sam', country: '' }, { id: 'b', name: `${k} B`, country: '' }];
    ev.venues = [{ id: 'v', name: 'One' }];
    T.generate(ev);
  }
  T.autoAssign(s);
  const playing = Object.values(s.events).flatMap((e) => e.matches.filter((m) => m.status === 'playing'));
  assert.strictEqual(playing.length, 1);
});

test('undo cascades through later rounds', () => {
  const { s, ev } = setup(4, { venues: 2 });
  playAll(s);
  const semi = ev.matches.find((m) => m.round === 1 && m.slot === 0);
  const final = ev.matches.find((m) => m.round === 2);
  T.resetMatch(s, ev, semi.id);
  assert.strictEqual(final.status, 'pending');
  assert.strictEqual(final.winner, null);
  assert.strictEqual(final.p1, null);
  assert.strictEqual(T.derive(s).pool.champion, null);
  assert.notStrictEqual(semi.status, 'done');
});

test('changing a winner re-routes the bracket', () => {
  const { s, ev } = setup(4, { venues: 2 });
  T.autoAssign(s);
  const m = ev.matches.find((x) => x.round === 1 && x.slot === 0);
  T.setResult(s, ev, m.id, m.p1, '');
  T.setResult(s, ev, m.id, m.p2, '');
  const final = ev.matches.find((x) => x.round === 2);
  assert.strictEqual(final.p1, m.p2);
});

test('up next suggests one match per venue without clashes', () => {
  const { s, ev } = setup(16, { venues: 2 });
  T.autoAssign(s);
  const up = T.derive(s).pool.upNext;
  assert.strictEqual(up.length, 2);
  const ids = up.map((u) => u.nextId).filter(Boolean);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const id of ids) assert.strictEqual(T.getMatch(ev, id).status, 'ready');
});

test('odds board covers everybody still in', () => {
  const { s, ev } = setup(8, { seeds: 2 });
  const board = Commentary.oddsBoard(ev, T.derive(s).pool);
  assert.strictEqual(board.length, 8);
  assert.ok(board.every((b) => /^(\d+\/\d+|Evens)$/.test(b.odds)));
});

test('house rules by round', () => {
  const Rules = require('../public/js/rules');
  // 32-player bracket: 5 rounds (Last 32, Last 16, QF, SF, Final)
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((r) => Rules.darts(5, r).start), [180, 180, 301, 301, 501]);
  assert.ok(Rules.darts(5, 2).noBust && !Rules.darts(5, 3).noBust);
  assert.ok(Rules.darts(5, 5).doubleOut && !Rules.darts(5, 4).doubleOut);
  // Pool: timed before the semi-finals only
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((r) => Rules.pool(5, r).minutes), [15, 15, 15, null, null]);
});

test('a pool win on time is recorded and undone cleanly', () => {
  const { s, ev } = setup(4, { venues: 1 });
  T.autoAssign(s);
  const m = ev.matches.find((x) => x.status === 'playing');
  T.setResult(s, ev, m.id, m.p2, '3-5', 'time');
  assert.strictEqual(m.how, 'time');
  const lines = Commentary.resultLines(s, ev, T.derive(s).pool, m);
  assert.ok(lines.some((l) => /balls potted|clock/i.test(l)), lines.join(' | '));
  T.resetMatch(s, ev, m.id);
  assert.strictEqual(m.how, null);
});

test('relationship banter kicks in when a couple meet', () => {
  const { s, ev } = setup(2, { venues: 1 });
  s.relationships = [{ id: 'r1', a: 'Player 1', b: 'player 2', type: 'partners' }];
  T.autoAssign(s);
  const m = ev.matches[0];
  T.setResult(s, ev, m.id, m.p1, '');
  const lines = Commentary.resultLines(s, ev, T.derive(s).pool, m);
  assert.ok(lines.some((l) => /partner|other half/i.test(l)), lines.join(' | '));
});
