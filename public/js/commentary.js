// Parody sports commentary + entirely made-up odds.
// Used by the server (to write headlines when a result comes in) and by the
// display (for ticker filler, odds boards and the pundits' slide).
(function (root) {
  const Countries = typeof module !== 'undefined' ? require('./countries.js') : root.Countries;

  const PUNDITS = [
    'Clive "The Calculator" Bunting',
    'Bev "Bottom Pocket" McAllister',
    'Professor Tungsten',
    'Dazza "The Oracle" Pemberton',
    'Mystic Maureen',
    'Ron Sixty-Seven',
    'Big Kev Chalkley',
  ];
  const BOOKIES = ['Paddy Powerless', 'BetFrayed', 'William Hillbilly', 'Ladbrokes-ish', 'Coral Reefer'];

  const NOVELTY = [
    'NOVELTY MARKET: Someone pots the white on the break, {o:1/5}',
    'NOVELTY MARKET: A dart hits the light fitting before midnight, {o:7/2}',
    'NOVELTY MARKET: Somebody blames the chalk, {o:1/10}',
    'NOVELTY MARKET: A player asks "what am I on?" at the oche, {o:1/50}',
    'NOVELTY MARKET: Somebody claims "that one was going in" when it was not, {o:1/100}',
    'NOVELTY MARKET: A pint is spilt on the pool table, {o:5/1}',
    'NOVELTY MARKET: The Macarena breaks out spontaneously, {o:12/1}',
    'NOVELTY MARKET: A nine-dart finish tonight, {o:5000/1}',
    'NOVELTY MARKET: Somebody asks if bullseye is worth 100, {o:3/1}',
  ];

  const GENERIC_QUOTES = [
    '"Pool is a game of angles. I am a creature of angles. Mostly obtuse."',
    '"Darts is ninety percent mental. The other half is also mental."',
    '"You cannot win a tournament in the first round. But you can certainly lose it."',
    '"The board does not lie. Unless it is a cheap board. This is a cheap board."',
    '"Treble twenty? I would have gone treble nineteen. Then I would have missed both."',
    '"In my day we played with a broom handle and a tangerine."',
    '"Momentum is everything. Unless you have the tactics. Then tactics are everything."',
    '"I have seen a lot of pool in my time. That was some of it."',
  ];

  // ---------------------------------------------------------------- helpers
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function pick(arr, seed) {
    return arr[(seed === undefined ? Math.floor(Math.random() * arr.length) : seed % arr.length)];
  }
  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
  }
  function country(code) {
    return code ? Countries.name(code) : 'Parts Unknown';
  }
  function player(ev, id) {
    return ev.players.find((p) => p.id === id) || null;
  }
  function firstName(p) {
    return (p && p.name ? p.name.trim().split(/\s+/)[0] : '');
  }
  // Scores are stored "p1-p2"; headlines read better winner-first.
  function winnerFirst(m) {
    const sc = /^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/.exec(m.score || '');
    if (!sc) return m.score || '';
    const [a, b] = [Number(sc[1]), Number(sc[2])];
    return m.winner === m.p1 ? `${a}-${b}` : `${b}-${a}`;
  }
  function isHost(settings, p) {
    const h = (settings.hostName || '').trim().toLowerCase();
    if (!h || !p) return false;
    const n = p.name.trim().toLowerCase();
    return n === h || n.split(/\s+/)[0] === h;
  }

  // ---------------------------------------------------------------- odds
  const LADDER = [
    [1, 10], [1, 8], [1, 6], [1, 5], [1, 4], [2, 7], [1, 3], [2, 5], [1, 2], [4, 7], [8, 13], [4, 6], [8, 11],
    [4, 5], [10, 11], [1, 1], [11, 10], [6, 5], [5, 4], [11, 8], [6, 4], [13, 8], [7, 4], [15, 8], [2, 1],
    [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1], [9, 2], [5, 1], [11, 2], [6, 1], [13, 2], [7, 1],
    [15, 2], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [14, 1], [16, 1], [20, 1], [25, 1], [33, 1], [40, 1],
    [50, 1], [66, 1], [80, 1], [100, 1], [150, 1], [250, 1], [500, 1],
  ];
  function fractional(prob) {
    const dec = (1 - prob) / Math.max(prob, 0.001);
    let best = LADDER[0];
    for (const l of LADDER) if (Math.abs(l[0] / l[1] - dec) < Math.abs(best[0] / best[1] - dec)) best = l;
    return best[0] === best[1] ? 'Evens' : `${best[0]}/${best[1]}`;
  }

  // Returns alive players sorted favourite-first: [{player, prob, odds}]
  function oddsBoard(ev, d) {
    if (!ev.generated || !d || d.champion) return [];
    const out = new Set(d.eliminated);
    const alive = ev.players.filter((p) => !out.has(p.id));
    const seeds = ev.players.filter((p) => Number(p.seed) > 0).length || 1;
    const strength = (p) => {
      const s = Number(p.seed) > 0 ? 1 + ((seeds + 1 - Number(p.seed)) / seeds) * 1.5 : 1;
      const jitter = 0.8 + (hash(p.name + ev.id) % 45) / 100;
      return s * Math.pow(1.8, d.wins[p.id] || 0) * jitter;
    };
    const total = alive.reduce((t, p) => t + strength(p), 0);
    return alive
      .map((p) => ({ player: p, prob: strength(p) / total }))
      .sort((a, b) => b.prob - a.prob)
      .map((x) => ({ ...x, odds: fractional(x.prob) }));
  }

  // ---------------------------------------------------------------- results
  // Builds 1-2 headlines for a finished match.
  function resultLines(state, ev, d, m) {
    const s = state.settings;
    const W = player(ev, m.winner);
    const L = player(ev, m.winner === m.p1 ? m.p2 : m.p1);
    if (!W || !L) return [];
    const rounds = ev.rounds;
    const vars = {
      W: W.name, L: L.name, Wf: firstName(W), Lf: firstName(L),
      WC: country(W.country), LC: country(L.country),
      S: winnerFirst(m),
      E: ev.name, EU: ev.name.toUpperCase(), R: d.roundNames[m.round] || '', NR: d.roundNames[m.round + 1] || 'next round',
      V: (ev.venues.find((v) => v.id === m.venueId) || {}).name || `the ${ev.venueLabel.toLowerCase()}`,
      P: pick(PUNDITS),
    };
    vars.Sx = vars.S ? ` ${vars.S}` : '';
    const lines = [];
    const ws = Number(W.seed) || 0;
    const ls = Number(L.seed) || 0;
    const upset = ls > 0 && (ws === 0 || ws > ls);
    const home = s.homeCountry;

    if (m.round === rounds) {
      lines.push(fill(pick([
        '🏆 {W} IS THE {EU} CHAMPION! Beats {L}{Sx} in the final. {WC} will be declaring a bank holiday.',
        '🏆 SCENES! {W} lifts the {E} title after beating {L}{Sx}. Absolutely unbelievable. Well, quite believable.',
        '🏆 {W} WINS THE {EU}! {P}: "I said this would happen. I did not say it out loud, but I said it."',
      ]), vars));
      if (isHost(s, W)) lines.push(fill('The birthday legend wins their own tournament. Nobody is suspicious. Nobody at all.', vars));
      return lines;
    }

    let main;
    if (isHost(s, W)) {
      main = pick([
        'The birthday legend {W} beats {L}{Sx}! The referee has been thanked for their... impartiality.',
        'BIRTHDAY WIN: {W} sees off {L}. {L} reportedly "let them win, it is their birthday". Sure.',
      ]);
    } else if (isHost(s, L)) {
      main = pick([
        'Birthday heartbreak: {L} is knocked out by {W}{Sx}. Nobody has the heart to tell them.',
        '{W} knocks out the BIRTHDAY HOST {L}! Bold move. Very bold. Probably uninvited next year.',
      ]);
    } else if (upset) {
      main = pick([
        'SHOCK! {W} dumps out No.{ls} seed {L}{Sx}! The bookies are sweating.',
        'UPSET ALERT: {W} stuns seeded {L}. The form book has been set on fire and thrown in the canal.',
        'GIANT KILLING in the {E}! {W} sends No.{ls} seed {L} packing{Sx}.',
      ]);
    } else if (W.country && W.country === L.country) {
      main = pick([
        'A {WC} civil war goes the way of {W}{Sx}. Christmas dinner will be awkward for {L}.',
        'All-{WC} affair settled: {W} beats {L}. Bragging rights secured until the end of time.',
      ]);
    } else if (home && W.country === home && L.country !== home) {
      main = pick([
        '{W} wins in front of a home crowd! The {WC} fans are absolutely bouncing.',
        'Home advantage tells: {W} flies the flag for {WC} past {L}{Sx}.',
      ]);
    } else if (home && L.country === home && W.country !== home) {
      main = pick([
        'Silence in the home end as {WC}\'s {W} knocks out local favourite {L}{Sx}.',
        '{W} silences the {LC} crowd. {L} is out and the away end is going wild.',
      ]);
    } else if (W.country && L.country && W.country !== L.country) {
      main = pick([
        '{WC} beats {LC}! {W} wins the battle of the nations against {L}{Sx}.',
        'International incident: {W} of {WC} sends {LC}\'s {L} home. Diplomats are monitoring the situation.',
      ]);
    } else {
      main = pick(ev.id === 'darts' ? [
        '{W} checks out against {L}{Sx}. {L} left staring at the board like it owes them money.',
        '{L} is OUT of the {E}. That is the oche equivalent of a Sunday league own goal.',
      ] : [
        '{W} clears up against {L}{Sx}. {L} left chalking a cue for absolutely no reason.',
        'Scenes on {V}! {W} wins, {L} blames the cushions.',
      ]);
    }
    vars.ls = ls;
    lines.push(fill(main, vars));

    if (m.round === rounds - 1) {
      // Semi just finished: is the final now set?
      const final = ev.matches.find((x) => x.round === rounds);
      const A = player(ev, final.p1);
      const B = player(ev, final.p2);
      if (A && B) {
        const v2 = { A: A.name, B: B.name, AC: country(A.country), BC: country(B.country), E: ev.name };
        lines.push(fill(A.country && A.country === B.country
          ? 'IT\'S SET: An all-{AC} {E} final! {A} vs {B}. Whoever wins, {AC} wins.'
          : 'IT\'S SET: It\'s a {AC} vs {BC} {E} final between {A} and {B}!', v2));
      } else {
        lines.push(fill('{W} is into the {E} FINAL. One more win from immortality.', vars));
      }
    } else if (m.round === rounds - 2) {
      lines.push(fill('{W} books a place in the {E} semi-finals. {P} has already ordered the open-top bus.', vars));
    } else if (Math.random() < 0.4) {
      lines.push(fill(pick([
        'Taxi for {L}! Taxi for {L}!',
        '{P}: "{Wf} looked sharp there. Very sharp. Possibly too sharp."',
        '{L} will be hoping nobody filmed that.',
      ]), vars));
    }
    return lines;
  }

  // ---------------------------------------------------------------- fillers
  function nameOf(ev, id) {
    const p = player(ev, id);
    return p ? p.name : 'TBC';
  }

  function fillerLines(state, derived) {
    const s = state.settings;
    const lines = [];
    const evs = Object.values(state.events).filter((e) => e.generated);
    const countriesAlive = {};

    for (const ev of evs) {
      const d = derived[ev.id];
      if (d.champion) {
        const c = player(ev, d.champion);
        lines.push(`🏆 ${ev.name.toUpperCase()} CHAMPION: ${c.name} (${country(c.country)}). Bow down.`);
        continue;
      }
      const board = oddsBoard(ev, d);
      if (board.length) {
        lines.push(`${pick(BOOKIES).toUpperCase()} ${ev.name.toUpperCase()} ODDS: ` +
          board.slice(0, 4).map((b, i) => `${b.player.name} ${b.odds}${i === 0 ? ' fav' : ''}`).join('  ·  '));
        const fav = board[0].player;
        lines.push(`${pick(PUNDITS)}: "Keep an eye on ${fav.name} in the ${ev.name}. The arm action. The focus. The pint management."`);
        const dark = board.find((b) => !(Number(b.player.seed) > 0) && b !== board[0]);
        if (dark) lines.push(`DARK HORSE: ${dark.player.name} (${country(dark.player.country)}) drifting at ${dark.odds} in the ${ev.name}. Don't say we didn't warn you.`);
        const streak = board.filter((b) => (d.wins[b.player.id] || 0) >= 2).sort((a, b) => (d.wins[b.player.id] || 0) - (d.wins[a.player.id] || 0))[0];
        if (streak) lines.push(`ONE TO WATCH: ${streak.player.name} has won ${d.wins[streak.player.id]} on the bounce in the ${ev.name}. A star is born. Possibly.`);
        for (const b of board) if (b.player.country) countriesAlive[b.player.country] = (countriesAlive[b.player.country] || 0) + 1;
      }
      lines.push(`${ev.name.toUpperCase()}: ${d.currentRoundName} underway. ${d.remaining} players still standing.`);
      for (const u of d.upNext) {
        const cur = ev.matches.find((m) => m.id === u.currentId);
        const venue = ev.venues.find((v) => v.id === u.venueId);
        if (cur) {
          const live = state.live[`${ev.id}:${cur.id}`];
          let extra = '';
          if (live && live.summary) extra = ` (${live.summary.text})`;
          lines.push(`LIVE on ${venue.name}: ${nameOf(ev, cur.p1)} v ${nameOf(ev, cur.p2)}${extra}.`);
        }
      }
    }
    const top = Object.entries(countriesAlive).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) lines.push(`${country(top[0]).toUpperCase()} has ${top[1]} players still in it. The ambassador has been informed.`);

    if (s.hostName) lines.push(`HAPPY 30TH ${s.hostName.toUpperCase()}! Odds on feeling 30 tomorrow morning: 1/1000.`);
    lines.push(`${pick(PUNDITS)}: ${pick(GENERIC_QUOTES)}`);
    lines.push(pick(NOVELTY).replace(/\{o:([^}]+)\}/, '$1'));
    lines.push('KEEP SCORE ON YOUR PHONE: Scan the QR code on screen, pick your match and the bracket updates itself.');
    return lines;
  }

  // Cards for the pundits' slide.
  function punditCards(state, derived) {
    const cards = [];
    for (const ev of Object.values(state.events)) {
      if (!ev.generated) continue;
      const d = derived[ev.id];
      const board = oddsBoard(ev, d);
      if (!board.length) continue;
      // Changes every couple of minutes so the slide doesn't go stale.
      const seed = hash(ev.id + d.remaining + Math.floor(Date.now() / 120000));
      const fav = board[0];
      cards.push({
        tag: `${ev.name}: Player to watch`, player: fav.player, odds: fav.odds,
        quote: pick([
          `"${firstName(fav.player)} is the one they all fear. I fear them. My wife fears them."`,
          `"If you're not backing ${firstName(fav.player)} at ${fav.odds}, frankly, why are you even here?"`,
          '"Hands like a surgeon. Temperament like a surgeon. Possibly is a surgeon."',
          `"I've seen ${firstName(fav.player)} warm up. I had to sit down afterwards."`,
          '"Ice in the veins. Lager in the glass. A deadly combination."',
        ], seed),
        pundit: pick(PUNDITS, seed),
      });
      const dark = board.find((b, i) => i > 0 && !(Number(b.player.seed) > 0)) || board[board.length - 1];
      if (dark && dark !== fav) {
        cards.push({
          tag: `${ev.name}: Dark horse`, player: dark.player, odds: dark.odds,
          quote: pick([
            `"Nobody is talking about ${firstName(dark.player)}. That is exactly how ${firstName(dark.player)} likes it."`,
            `"${dark.odds}? I've had a cheeky fiver on that. Don't tell the producer."`,
            '"Unseeded, unfancied, unbothered. Dangerous combination."',
            `"Write ${firstName(dark.player)} off at your peril. I did once. Never again."`,
            '"Quiet. Too quiet. That\'s the quiet of somebody about to win a tournament."',
          ], seed + 1),
          pundit: pick(PUNDITS, seed + 3),
        });
      }
      const prom = board.filter((b) => (d.wins[b.player.id] || 0) > 0 && b !== fav && b !== dark)
        .sort((a, b) => (d.wins[b.player.id] || 0) - (d.wins[a.player.id] || 0))[0];
      if (prom) {
        cards.push({
          tag: `${ev.name}: Showing promise`, player: prom.player, odds: prom.odds,
          quote: pick([
            `"${d.wins[prom.player.id]} win${d.wins[prom.player.id] > 1 ? 's' : ''} and counting. The confidence is growing. So is the swagger."`,
            '"Raw talent. Very raw. Needs a bit more time in the oven, but the ingredients are there."',
            `"${firstName(prom.player)} is playing like someone who has had exactly the right number of drinks."`,
            '"You can\'t teach that. Well, you can, but it takes ages and nobody here has the patience."',
          ], seed + 2),
          pundit: pick(PUNDITS, seed + 5),
        });
      }
    }
    return cards;
  }

  const api = { resultLines, fillerLines, punditCards, oddsBoard, PUNDITS, NOVELTY };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Commentary = api;
})(this);
