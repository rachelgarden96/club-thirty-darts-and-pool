// Match stats from the phone scorer, and the leaderboards built from them.
// Used by the phone (to package a finished game), the server (to store it with
// the result) and the TV (Stats Centre slide + ticker lines).
(function (root) {
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

  // Turn a phone game object into a small stats record for a match.
  function fromGame(g) {
    if (!g || !Array.isArray(g.ids)) return null;
    const durationMs = g.startedAt ? Math.max(0, num(g.endedAt || Date.now()) - num(g.startedAt)) : null;
    if (g.kind === 'darts' && Array.isArray(g.stats)) {
      return {
        kind: 'darts',
        start: num(g.start),
        durationMs,
        players: [0, 1].map((i) => {
          const s = g.stats[i] || {};
          return {
            id: g.ids[i], pts: num(s.pts), darts: num(s.darts), best: num(s.best), tons: num(s.tons),
            n180: num(s.n180), busts: num(s.busts), checkout: num(s.checkout),
          };
        }),
      };
    }
    if (g.kind === 'pool' && g.mode === 'single') {
      return {
        kind: 'pool',
        timed: !!g.endsAt,
        durationMs,
        players: [0, 1].map((i) => ({ id: g.ids[i], balls: num((g.balls || [])[i]) })),
      };
    }
    return null;
  }

  function avg(p) {
    return p.darts ? (p.pts / p.darts) * 3 : 0;
  }

  // Leaderboards across the whole tournament.
  function aggregate(state) {
    const darts = {};
    const pool = {};
    const frames = [];
    const playerOf = (evId, id) => {
      const ev = state.events[evId];
      return ev ? ev.players.find((p) => p.id === id) : null;
    };
    for (const [key, s] of Object.entries(state.stats || {})) {
      const [evId, mid] = key.split(':');
      const ev = state.events[evId];
      const m = ev && ev.matches.find((x) => x.id === mid);
      if (!m || m.status !== 'done' || !s) continue;
      if (s.kind === 'darts') {
        for (const p of s.players) {
          const pl = playerOf(evId, p.id);
          if (!pl) continue;
          const t = darts[p.id] || (darts[p.id] = { player: pl, pts: 0, darts: 0, best: 0, tons: 0, n180: 0, busts: 0, checkout: 0, games: 0 });
          t.pts += p.pts; t.darts += p.darts; t.tons += p.tons; t.n180 += p.n180; t.busts += p.busts; t.games++;
          t.best = Math.max(t.best, p.best);
          if (p.id === m.winner) t.checkout = Math.max(t.checkout, p.checkout);
        }
      } else if (s.kind === 'pool') {
        for (const p of s.players) {
          const pl = playerOf(evId, p.id);
          if (!pl) continue;
          const t = pool[p.id] || (pool[p.id] = { player: pl, balls: 0, games: 0 });
          t.balls += p.balls; t.games++;
        }
        if (s.durationMs) frames.push({ ms: s.durationMs, winner: playerOf(evId, m.winner), loser: playerOf(evId, m.winner === m.p1 ? m.p2 : m.p1), how: m.how });
      }
    }
    const d = Object.values(darts);
    const qualified = d.filter((t) => t.darts >= 6);
    const by = (arr, f, dir = -1) => arr.slice().sort((a, b) => dir * (f(a) - f(b)))[0] || null;
    const out = {};
    const top = by(qualified, avg);
    if (top) out.bestAvg = { player: top.player, value: avg(top).toFixed(1) };
    const low = by(qualified, avg, 1);
    if (low && qualified.length > 1 && low !== top) out.worstAvg = { player: low.player, value: avg(low).toFixed(1) };
    const best = by(d.filter((t) => t.best > 0), (t) => t.best);
    if (best) out.bestVisit = { player: best.player, value: best.best };
    const n180 = by(d.filter((t) => t.n180 > 0), (t) => t.n180);
    if (n180) out.most180 = { player: n180.player, value: n180.n180 };
    const tons = by(d.filter((t) => t.tons > 0), (t) => t.tons);
    if (tons) out.mostTons = { player: tons.player, value: tons.tons };
    const co = by(d.filter((t) => t.checkout > 0), (t) => t.checkout);
    if (co) out.bestCheckout = { player: co.player, value: co.checkout };
    const busts = by(d.filter((t) => t.busts > 0), (t) => t.busts);
    if (busts) out.mostBusts = { player: busts.player, value: busts.busts };
    const balls = by(Object.values(pool).filter((t) => t.balls > 0), (t) => t.balls);
    if (balls) out.mostBalls = { player: balls.player, value: balls.balls };
    const quick = by(frames.filter((f) => f.winner && f.ms > 30000), (f) => f.ms, 1);
    if (quick) out.quickestFrame = { player: quick.winner, value: clock(quick.ms) };
    const slow = by(frames.filter((f) => f.winner && f.loser), (f) => f.ms);
    if (slow && slow !== quick) out.longestFrame = { player: slow.winner, other: slow.loser, value: clock(slow.ms) };
    return out;
  }

  function clock(ms) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  }

  // Cards for the Stats Centre slide (most impressive first, roasts last).
  const CARDS = [
    ['bestAvg', 'Best 3-dart average', (s) => s.value, ['Proper darts. Somebody check their flights for engines.', 'The rest of the field is taking notes. Badly.']],
    ['bestVisit', 'Highest visit', (s) => s.value, ['Big arm. Bigger ego. Fair enough.', 'The board is still recovering.']],
    ['most180', 'Most 180s', (s) => s.value, ['ONE HUNDRED AND EIGHTYYY!', 'Somebody give this person a walk-on.']],
    ['bestCheckout', 'Highest checkout', (s) => s.value, ['Ice cold. Possibly just cold. Close the window.', 'Finished in style. Then did a little dance.']],
    ['mostTons', 'Most 100+ visits', (s) => s.value, ['Consistency is key. So is snacking.', 'Ton machine.']],
    ['mostBalls', 'Most balls potted', (s) => s.value, ['Clearing tables like it\'s closing time.', 'The pockets have filed a noise complaint.']],
    ['quickestFrame', 'Quickest frame win', (s) => s.value, ['Blink and you missed it. Their opponent did.', 'In, out, back to the buffet.']],
    ['longestFrame', 'Longest frame', (s) => s.value, ['We aged visibly watching this.', 'Bring a packed lunch next time.']],
    ['mostBusts', 'Most busts', (s) => s.value, ['Maths is hard. Darts maths is harder.', 'Overachiever. Just in the wrong direction.']],
    ['worstAvg', 'Wooden spoon: lowest average', (s) => s.value, ['It\'s the taking part that counts. Thank goodness.', 'Every dart a surprise. Mostly to them.']],
  ];

  function cards(state) {
    const a = aggregate(state);
    return CARDS.filter(([k]) => a[k]).map(([k, title, val, quips]) => ({
      key: k, title, player: a[k].player, value: val(a[k]), quip: quips[(a[k].player.name.length + k.length) % quips.length],
    }));
  }

  function tickerLines(state) {
    const a = aggregate(state);
    const lines = [];
    const n = (s) => s.player.name;
    if (a.bestAvg) lines.push(`STAT ATTACK: Best 3-dart average so far belongs to ${n(a.bestAvg)} (${a.bestAvg.value}). Frankly showing off.`);
    if (a.worstAvg) lines.push(`WOODEN SPOON WATCH: ${n(a.worstAvg)} is averaging ${a.worstAvg.value} per visit. It's not about the winning. Clearly.`);
    if (a.bestVisit) lines.push(`HIGHEST VISIT OF THE NIGHT: ${a.bestVisit.value} from ${n(a.bestVisit)}. The oche is still shaking.`);
    if (a.most180) lines.push(`MAXIMUM WATCH: ${n(a.most180)} has hit ${a.most180.value} x 180${a.most180.value > 1 ? 's' : ''} tonight. Somebody frame that dartboard.`);
    if (a.bestCheckout) lines.push(`BIGGEST CHECKOUT: ${n(a.bestCheckout)} took out ${a.bestCheckout.value}. Cooler than the ice-cream freezer.`);
    if (a.mostBusts) lines.push(`BUST LEADERBOARD: ${n(a.mostBusts)} has bust ${a.mostBusts.value} time${a.mostBusts.value > 1 ? 's' : ''}. Counting is optional, apparently.`);
    if (a.mostBalls) lines.push(`POOL STATS: ${n(a.mostBalls)} has potted ${a.mostBalls.value} balls in timed frames. A menace on the baize.`);
    if (a.quickestFrame) lines.push(`QUICKEST FRAME: ${n(a.quickestFrame)} won in ${a.quickestFrame.value}. Didn't even let their cup of tea go cold.`);
    if (a.longestFrame) lines.push(`LONGEST FRAME: ${n(a.longestFrame)} v ${a.longestFrame.other.name} took ${a.longestFrame.value}. Seasons changed.`);
    return lines;
  }

  const api = { fromGame, aggregate, cards, tickerLines };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Stats = api;
})(this);
