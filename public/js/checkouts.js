// Suggested checkouts ("T20 T20 BULL") for a remaining score, worked out once
// on load by searching every 1, 2 and 3 dart combination.
window.Checkouts = (function () {
  const trebles = [];
  const singles = [];
  const doubles = [];
  for (let n = 20; n >= 1; n--) {
    trebles.push({ label: `T${n}`, v: 3 * n });
    singles.push({ label: `${n}`, v: n });
    doubles.push({ label: `D${n}`, v: 2 * n });
  }
  const bull = { label: 'BULL', v: 50 };
  const outer = { label: '25', v: 25 };

  // Setup darts, most "natural" first.
  const setups = [...trebles.slice(0, 11), outer, bull, ...singles, ...trebles.slice(11)];
  // Favourite finishing doubles first.
  const favDoubles = [20, 16, 18, 8, 12, 10, 14, 19, 17, 15, 13, 11, 9, 6, 4, 2, 7, 5, 3, 1].map((n) => doubles.find((d) => d.v === 2 * n));

  function build(finishers) {
    const best = {};
    const offer = (t, darts, cost, route) => {
      const cur = best[t];
      if (!cur || darts < cur.darts || (darts === cur.darts && cost < cur.cost)) best[t] = { darts, cost, route };
    };
    finishers.forEach((f, fi) => offer(f.v, 1, fi, [f.label]));
    setups.forEach((a, ai) => finishers.forEach((f, fi) => offer(a.v + f.v, 2, ai + 3 * fi, [a.label, f.label])));
    setups.forEach((a, ai) => setups.forEach((b, bi) => {
      if (bi < ai) return; // order does not matter for setup darts
      finishers.forEach((f, fi) => offer(a.v + b.v + f.v, 3, ai + bi + 3 * fi, [a.label, b.label, f.label]));
    }));
    return best;
  }

  let doubleOut = null;
  let anyOut = null;

  // Returns e.g. "T20 T20 BULL" or '' if no finish with the darts left.
  function suggest(remaining, dartsLeft, mustDouble) {
    if (remaining > 180 || remaining < 1) return '';
    if (mustDouble) {
      if (!doubleOut) doubleOut = build([...favDoubles, bull]);
      const b = doubleOut[remaining];
      return b && b.darts <= dartsLeft ? b.route.join(' ') : '';
    }
    if (!anyOut) anyOut = build([...setups, ...favDoubles]);
    const b = anyOut[remaining];
    return b && b.darts <= dartsLeft ? b.route.join(' ') : '';
  }

  return { suggest };
})();
