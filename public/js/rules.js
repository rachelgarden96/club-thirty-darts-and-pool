// House rules for each round. One place so the phone scorer, TV and server
// always agree.
//   Darts: up to the last 16 -> 180, any finish, no bust
//          quarter- and semi-finals -> 301, any finish, bust rule
//          final -> 501, must finish on a double
//   Pool:  one frame. Before the semi-finals there's a 15-minute limit:
//          if nobody has won by then, most balls potted wins.
(function (root) {
  const POOL_MINUTES = 15;

  function darts(rounds, round) {
    const fromEnd = rounds - round;
    if (fromEnd === 0) return { start: 501, doubleOut: true, noBust: false, short: '501 · double out', label: '501 · must finish on a double' };
    if (fromEnd <= 2) return { start: 301, doubleOut: false, noBust: false, short: '301', label: '301 · any finish · bust rule applies' };
    return { start: 180, doubleOut: false, noBust: true, short: '180', label: '180 · any finish · no bust' };
  }

  function pool(rounds, round) {
    const timed = rounds - round >= 2;
    return {
      frames: 1,
      minutes: timed ? POOL_MINUTES : null,
      short: timed ? '15 min' : 'No time limit',
      label: timed ? `One frame · ${POOL_MINUTES}-minute limit` : 'One frame · no time limit',
    };
  }

  function forMatch(ev, m) {
    return ev.id === 'darts' ? darts(ev.rounds, m.round) : pool(ev.rounds, m.round);
  }

  const api = { darts, pool, forMatch, POOL_MINUTES };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Rules = api;
})(this);
