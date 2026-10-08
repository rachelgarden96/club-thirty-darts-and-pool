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
    'Sir Trevor Doubletop',
    'Auntie Pat (no relation)',
    'Gaz "The Gaffer" Gilchrist',
    'Dr Jen Cushionsworth',
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
    'NOVELTY MARKET: A treble 20 followed immediately by three 1s, {o:Evens}',
    'NOVELTY MARKET: A pool ball leaves the table and lands in a drink, {o:9/2}',
    'NOVELTY MARKET: Somebody claims they "used to play for the county", {o:1/4}',
    'NOVELTY MARKET: A heckle about somebody\'s walk-on music, {o:1/3}',
    'NOVELTY MARKET: Somebody tries a trick shot "for the cameras", {o:2/5}',
    'NOVELTY MARKET: A dart bounces out and the thrower claims it counts, {o:1/6}',
    'NOVELTY MARKET: The 15-minute pool clock is described as "a conspiracy", {o:4/6}',
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
    '"The key to darts is three things: aim, throw, and then blame the board."',
    '"Pool is just snooker for people with somewhere to be."',
    '"Pressure? Pressure is for tyres. This is a party with a scoreboard."',
    '"Form is temporary. Class is permanent. Neither is on show tonight."',
    '"The trick is to hit the ball you meant to hit. Revolutionary, I know."',
    '"Never trust anyone who chalks their cue between every shot. They are stalling. Or hiding something."',
    '"Some of these players have the throwing action of someone feeding ducks."',
    '"Darts is a simple game. Throw the pointy end at the board. Somehow, people are still getting this wrong."',
    '"I\'ve got a good feeling about this round. I had a good feeling about the last round too. I was wrong."',
    '"Statistically, someone has to win. That\'s the only stat I\'m confident in."',
    '"The pool table is a cruel mistress. And the cushions are her henchmen."',
    '"You don\'t win a game like this with your arm. You win it with your soul. And your arm, to be fair."',
    '"I would never say someone is out of form. I would, however, say they have never been in it."',
    '"Some of tonight\'s technique has been described as experimental. By me. Just now."',
    '"Confidence is everything. That\'s why I always throw after three pints and never before."',
    '"Big night for the sport. Small night for the dartboard\'s self-esteem."',
  ];

  const HOUSE_RULES = [
    'HOUSE RULES: Darts early rounds are 180, any finish, no bust. Quarters and semis go to 301 with busts. The final is 501, double out.',
    'HOUSE RULES: Pool is one frame. Before the semis there\'s a 15-minute limit, and if time runs out, most balls potted wins. No dawdling.',
  ];

  // Relationships between players (set in the Control Room) for extra banter.
  const RELATIONSHIPS = {
    partners: {
      label: 'Partners 💕',
      result: [
        'DOMESTIC INCIDENT on {V}: {W} beats partner {L}{Sx}. The sofa has been made up for tonight.',
        'Relationship status: complicated. {W} shows their other half {L} absolutely no mercy.',
        '"Till death do us part" does not apply on the {E} {VL}. {W} knocks out partner {L}.',
        '{W} beats {L}{Sx}. Couples therapist on standby. Couples therapist also knocked out earlier.',
        '{L} has been beaten by their other half. Expect to hear about this at every family gathering until 2050.',
        '{W} wins the domestic derby. {L} is reportedly "absolutely fine about it". {L} is not fine about it.',
      ],
      preview: [
        'COUPLES COUNSELLING on {V}: {A} v {B}. Separate taxis home have been booked as a precaution.',
        '{A} v {B} on {V}. Whoever loses is doing the dishes until Christmas.',
        'LOVE IS IN THE AIR on {V}: {A} v {B}. So is tension. Mostly tension.',
        '{A} v {B} on {V}. One of them is getting the silent treatment in the taxi.',
      ],
      collision: [
        'COLLISION COURSE: {A} and {B} are both still in the {E}. If they meet, someone is sleeping in the spare room.',
        'DOMESTIC DISPUTE BREWING: {A} and {B} are on course to meet in the {E}. The pundits have booked them separate taxis home.',
        '{P}: "If {Af} and {Bf} meet in the {E}, I want it on pay-per-view."',
      ],
    },
    siblings: {
      label: 'Siblings',
      result: [
        'Sibling rivalry settled: {W} beats {L}{Sx}. Mum\'s phone is already ringing.',
        '{W} finally gets one over on their sibling {L}. Family WhatsApp is in meltdown.',
        '{W} beats sibling {L}{Sx}. This is going straight in the family Christmas card.',
        'Sibling rivalry update: {W} 1, {L} 0. {L} has demanded a rematch "at Mum and Dad\'s".',
      ],
      preview: [
        'SIBLING SHOWDOWN on {V}: {A} v {B}. Decades of "they started it" settled tonight.',
        '{A} v {B}. Blood is thicker than water, but is it thicker than a pint of lager? We\'re about to find out.',
        'THE FAMILY BUSINESS on {V}: {A} v {B}. Somebody\'s getting told about it at Sunday lunch.',
      ],
      collision: [
        'FAMILY FEUD ALERT: {A} and {B} are both still in the {E}. Mum has been warned to stay out of it.',
        '{A} and {B} are on a sibling collision course in the {E}. Thirty years of "that\'s not fair" could be settled tonight.',
        '{P}: "Shared a bedroom, shared a bath, about to share a {E} table. Brutal."',
      ],
    },
    mates: {
      label: 'Best mates',
      result: [
        '{W} knocks out best mate {L}{Sx}. Friendship status: under review.',
        '"It\'s only a game," says {L}, lying, after losing to best mate {W}.',
        '{W} beats best mate {L}{Sx}. They\'ll still be mates. Probably. Give it a week.',
        'Friendship tested: {W} knocks out {L}. The group chat has gone suspiciously quiet.',
      ],
      preview: [
        'BEST MATES COLLIDE on {V}: {A} v {B}. Friendship bracelets have been removed for the duration.',
        '{A} v {B}. Best mates. Not for the next fifteen minutes.',
        '{A} v {B} on {V}. Best mates for years, enemies for one game.',
      ],
      collision: [
        'BROMANCE OR BLOODBATH? {A} and {B} are both still in the {E} and heading for each other.',
        '{A} and {B} are both through. If they meet in the {E}, the group chat will never recover.',
        '{P}: "Best mates on a collision course in the {E}. I\'ve seen friendships end over less. Much less. A sausage roll once."',
      ],
    },
    housemates: {
      label: 'Housemates',
      result: [
        '{W} beats housemate {L}{Sx}. The washing-up rota has been renegotiated accordingly.',
        'Awkward breakfast incoming: {W} sends housemate {L} packing.',
        '{W} beats housemate {L}{Sx}. The TV remote now belongs to {Wf}.',
      ],
      preview: [
        'HOUSEMATE DERBY on {V}: {A} v {B}. Loser buys the next loo roll.',
        '{A} v {B} on {V}. Loser takes the bins out for a month.',
      ],
      collision: [
        'HOUSEMATE HOSTILITIES: {A} and {B} are both still in the {E}. The fridge shelf allocation is at stake.',
        '{A} and {B} live together and could meet in the {E}. One of them is getting the small bedroom.',
      ],
    },
    workmates: {
      label: 'Work colleagues',
      result: [
        '{W} beats colleague {L}{Sx}. Monday\'s team meeting just got very awkward.',
        '{L} will be "working from home" on Monday after losing to workmate {W}.',
        '{W} beats colleague {L}{Sx}. This will be mentioned in every meeting until retirement.',
      ],
      preview: [
        'OFFICE DERBY on {V}: {A} v {B}. HR are monitoring the situation.',
        '{A} v {B}. Somebody\'s getting a passive-aggressive email on Monday.',
        '{A} v {B} on {V}. Whoever loses makes the tea for the rest of the year.',
      ],
      collision: [
        'OFFICE POLITICS: colleagues {A} and {B} are both still in the {E}. Somebody\'s annual review just got interesting.',
        '{A} and {B} could meet in the {E}. HR have prepared a statement.',
      ],
    },
    family: {
      label: 'Parent & child',
      result: [
        'Generational warfare: {W} beats {L}{Sx}. Inheritance plans are being reviewed.',
        '{W} beats family member {L}. Christmas seating plan updated.',
        '{W} beats {L}{Sx}. The family trophy cabinet has been rearranged.',
      ],
      preview: [
        'FAMILY FEUD on {V}: {A} v {B}. Pocket money is on the line.',
        '{A} v {B} on {V}. Generations collide. Respect your elders? Not tonight.',
      ],
      collision: [
        'FAMILY TIES: {A} and {B} are both still in the {E}. Somebody\'s getting written out of the will.',
        '{A} and {B} could meet in the {E}. Family gatherings will never be the same.',
      ],
    },
    rivals: {
      label: 'Sworn rivals',
      result: [
        'GRUDGE MATCH settled: {W} beats sworn rival {L}{Sx}. Mic drop.',
        'The feud continues: {W} takes this round against {L}. The sequel is already in development.',
        '{W} beats sworn rival {L}{Sx}. Petty? Yes. Satisfying? Enormously.',
      ],
      preview: [
        'GRUDGE MATCH on {V}: {A} v {B}. This one is personal.',
        '{A} v {B}. They say they\'re "fine". They are not fine.',
        '{A} v {B} on {V}. Pistols at dawn. Well, cues and darts at 9pm.',
      ],
      collision: [
        'GRUDGE MATCH LOOMING: sworn rivals {A} and {B} are both still in the {E}. Fasten your seatbelts.',
        '{A} and {B} are on course to meet in the {E}. They\'ve been avoiding eye contact all night.',
        '{P}: "{Af} v {Bf} in the {E} would be the biggest rivalry since cats and Hoovers."',
      ],
    },
  };

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
  function relation(state, a, b) {
    const x = (a || '').trim().toLowerCase();
    const y = (b || '').trim().toLowerCase();
    return (state.relationships || []).find((r) => {
      const ra = r.a.trim().toLowerCase();
      const rb = r.b.trim().toLowerCase();
      return RELATIONSHIPS[r.type] && ((ra === x && rb === y) || (ra === y && rb === x));
    }) || null;
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

  // Post-match "analysis": {W} winner, {L} loser, {Wf}/{Lf} first names, {P} pundit.
  const ROASTS = [
    'Taxi for {L}! Taxi for {L}!',
    '{P}: "{Wf} looked sharp there. Very sharp. Possibly too sharp."',
    '{L} will be hoping nobody filmed that. Somebody filmed that.',
    'ANALYSIS: {P} on {W} v {L}: "{Wf} wanted it more. {Lf} wanted a kebab more."',
    'STAT ATTACK: {W} beat {L}. Our data team describes the performance as "yes".',
    '{P} on {L}: "The technique was there. Just not at the same time as the result."',
    '{P} on {W}: "Composure. Poise. A suspiciously full pint they never seemed to drink."',
    'POST-MATCH: {L} insists they "let {Wf} win". {Wf} insists otherwise. The footage is inconclusive.',
    '{P}: "{Wf} looked like they\'d been practising. {Lf} looked like they\'d been told about it this morning."',
    'TACTICS BOARD: {W}\'s game plan against {L} was simple: hit the thing. Revolutionary stuff.',
    '{L} has requested a VAR review. There is no VAR. There never was.',
    '{L} is out but remains the bookies\' favourite for "Best Excuse of the Night".',
    '{P}: "{Lf} brought the vibes. Unfortunately, not the skill."',
    'EXPERT VERDICT on {L}: a bold performance. Bold in the sense that nothing went to plan.',
    '{P}: "{Wf} played the percentages. {Lf} played the lottery."',
    '{W} beats {L}. Our analysts have reviewed the footage and filed it under "comedy".',
    '{P}: "I\'ve seen {Lf} play better. I can\'t remember when, but I\'m sure I have."',
    '{L} goes out swinging. Mostly swinging at air.',
    'MAN OF THE MATCH, WOMAN OF THE MATCH, PERSON OF THE MATCH: {W}. Sorry {Lf}.',
  ];
  const ROASTS_DARTS = [
    '{P} on {L}: "Some of those darts were in the right postcode. Just not on the right board."',
    '{L}\'s darts were last seen heading for the fruit bowl.',
    '{P}: "{Lf} throws darts like they\'re trying to get them back to a pet shop."',
  ];
  const ROASTS_POOL = [
    '{P} on {L}: "That cue action was less Ronnie O\'Sullivan, more reversing a caravan."',
    '{L} has filed a formal complaint about the cushions. The cushions have declined to comment.',
    '{P}: "{Lf} potted the white more times than their own balls. Commitment to the bit."',
  ];
  const ROASTS_OUT = [
    'WHERE ARE THEY NOW: {L} (knocked out of the {E}) has been spotted at the bar explaining what "really" happened.',
    '{L} has asked for a recount in the {E}. There is nothing to recount.',
    '{L} says they were "just warming up". The {E} has ended for them.',
    'REPLAY CORNER: {L}\'s worst {E} shot has been nominated for the Turner Prize.',
    'BREAKING: {L} has announced their retirement from {E}. Again. Third time this year.',
    '{L}\'s {E} coaching team has resigned with immediate effect. It was one person and they\'ve gone for a smoke.',
    'SPOTTED: {L} practising in the corner. Too late, {Lf}. Far too late.',
    '{L} is out of the {E} but has been offered a role as "chief cheerleader". Pay is zero. Snacks are free.',
    '{L}\'s {E} campaign: brief, brave, baffling.',
    'LOST & FOUND: one {E} campaign belonging to {L}. Last seen in the first round.',
    '{L} has been seen staring wistfully at the {E} bracket. Let it go, {Lf}. Let it go.',
  ];

  const GENERIC_RESULTS = {
    darts: [
      '{W} checks out against {L}{Sx}. {L} left staring at the board like it owes them money.',
      '{L} is OUT of the {E}. That is the oche equivalent of a Sunday league own goal.',
      '{W} wins. {L} hit everything tonight except the numbers they were aiming for.',
      '{L} exits the {E}. The dartboard has asked for a restraining order.',
      '{W} gets the job done against {L}. Not pretty. Not clever. Extremely effective.',
      '{W} beats {L}{Sx}. {L} was last seen blaming the flights, the lighting and the moon.',
      '{L} is out. Their throwing action has been referred to the health and safety team.',
      '{W} through to the {NR}. {L} through to the bar.',
    ],
    pool: [
      '{W} clears up against {L}{Sx}. {L} left chalking a cue for absolutely no reason.',
      'Scenes on {V}! {W} wins, {L} blames the cushions.',
      '{W} sees off {L}. {L}\'s safety play was neither safe nor play.',
      '{W} through. {L} spent more time chalking the cue than potting balls.',
      '{W} wins it. {L} insists the table has a slope. The table does not have a slope.',
      '{W} beats {L}. {L}\'s break was less "power" and more "polite suggestion".',
      '{L} is out. The black ball has been sent for counselling after what it witnessed.',
      '{W} through to the {NR}. {L} through to "telling everyone they were robbed".',
    ],
  };

  // Reaction to a post-match interview.
  function quoteReaction(name, role) {
    const vars = { F: (name || '').trim().split(/\s+/)[0], P: pick(PUNDITS) };
    return fill(pick(role === 'winner' ? [
      '{P} on {F}\'s interview: "Classy. Humble. Slightly delusional."',
      '{P}: "Lovely words from {F}. Not rehearsed at all. Definitely not in the toilets."',
      '{P}: "That\'s a champion\'s mindset, that. Or a fourth pint. Hard to tell."',
      '{P}: "{F} speaks like they\'ve already got the trophy. They have not got the trophy."',
    ] : [
      '{P}: "Classic {F}. Never lost a game in their life, just been unlucky four hundred times."',
      '{P} on {F}\'s excuse: "I\'ve heard better excuses from a dog that ate homework."',
      'FACT CHECK: {F}\'s excuse has been reviewed by our team. Verdict: absolute nonsense.',
      '{P}: "Dignified in defeat. Well, defeated, anyway."',
    ]), vars);
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
      P: pick(PUNDITS), VL: ev.venueLabel.toLowerCase(),
    };
    vars.Sx = vars.S && m.how !== 'time' ? ` ${vars.S}` : '';
    const rel = relation(state, W.name, L.name);
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
      if (rel) lines.push(fill(pick(RELATIONSHIPS[rel.type].result), vars));
      return lines;
    }

    let main;
    if (m.how === 'time') {
      lines.push(fill(pick([
        'BUZZER BEATER! {W} beats {L} on balls potted after the 15-minute limit. {L} ran down the clock and still lost.',
        'TIME! {W} edges past {L} on balls potted. {P}: "Slow and steady. Mostly slow."',
        'The clock wins again: {W} goes through on balls potted, {L} goes to the bar.',
      ]), vars));
    }
    if (rel) {
      main = pick(RELATIONSHIPS[rel.type].result);
    } else if (isHost(s, W)) {
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
    } else if (W.country && L.country && Math.random() < 0.45) {
      // Plenty of the time, skip the flag-waving and go straight for the roast.
      main = pick(GENERIC_RESULTS[ev.id]);
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
        '{WC} 1, {LC} 0. {W} gets past {L} and the {WC} national anthem is being hummed, badly, at the bar.',
        'Passport control for {L}: the {LC} challenge is over. {W} marches on for {WC}.',
        '{W} puts {WC} on the map. Well, further on the map. {L} and {LC} go home.',
      ]);
    } else {
      main = pick(GENERIC_RESULTS[ev.id]);
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
    } else if (Math.random() < 0.75) {
      lines.push(fill(pick(ROASTS.concat(ev.id === 'darts' ? ROASTS_DARTS : ROASTS_POOL)), vars));
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
        const nx = ev.matches.find((m) => m.id === u.nextId);
        for (const pid of nx ? [nx.p1, nx.p2] : []) {
          const p = player(ev, pid);
          if (p && p.walkon) {
            lines.push(fill(pick([
              'WALK-ON WATCH: {N} will be entering the {V} arena to "{S}". Bold choice.',
              'WALK-ON WATCH: "{S}" means {N} is on next at {V}. The crowd is warming up its vocal cords.',
              '{P}: "When "{S}" comes on, that\'s {F} saying: I am here and I am ready."',
            ]), { N: p.name, F: firstName(p), S: p.walkon, V: venue.name, P: pick(PUNDITS) }));
          }
        }
        for (const mm of [cur, nx]) {
          const A = mm && player(ev, mm.p1);
          const B = mm && player(ev, mm.p2);
          const rel = A && B && relation(state, A.name, B.name);
          if (rel) lines.push(fill(pick(RELATIONSHIPS[rel.type].preview), { A: A.name, B: B.name, V: venue.name }));
        }
        if (cur) {
          const live = state.live[`${ev.id}:${cur.id}`];
          let extra = '';
          if (live && live.summary) extra = ` (${live.summary.text})`;
          lines.push(`LIVE on ${venue.name}: ${nameOf(ev, cur.p1)} v ${nameOf(ev, cur.p2)}${extra}.`);
        }
      }
    }
    // Post-match analysis of the latest results, and a roast or two for the fallen.
    const recent = [];
    for (const ev of evs) {
      for (const m of ev.matches) if (m.status === 'done' && !m.bye) recent.push({ ev, m });
    }
    recent.sort((a, b) => (b.m.finishedAt || 0) - (a.m.finishedAt || 0));
    for (const { ev, m } of recent.slice(0, 3)) {
      const W = player(ev, m.winner);
      const L = player(ev, m.winner === m.p1 ? m.p2 : m.p1);
      if (!W || !L) continue;
      const v = { W: W.name, L: L.name, Wf: firstName(W), Lf: firstName(L), P: pick(PUNDITS), E: ev.name };
      lines.push(fill(pick(ROASTS.concat(ev.id === 'darts' ? ROASTS_DARTS : ROASTS_POOL)), v));
    }
    for (const { ev, m } of recent.slice(0, 8).sort(() => Math.random() - 0.5).slice(0, 2)) {
      const L = player(ev, m.winner === m.p1 ? m.p2 : m.p1);
      if (L) lines.push(fill(pick(ROASTS_OUT), { L: L.name, Lf: firstName(L), E: ev.name }));
    }
    // Pairs with a relationship who are both still in the same event.
    for (const r of state.relationships || []) {
      for (const ev of evs) {
        const d = derived[ev.id];
        if (d.champion) continue;
        const out = new Set(d.eliminated);
        const A = ev.players.find((p) => p.name.trim().toLowerCase() === r.a.trim().toLowerCase());
        const B = ev.players.find((p) => p.name.trim().toLowerCase() === r.b.trim().toLowerCase());
        if (A && B && !out.has(A.id) && !out.has(B.id) && RELATIONSHIPS[r.type]) {
          lines.push(fill(pick(RELATIONSHIPS[r.type].collision), { A: A.name, B: B.name, Af: firstName(A), Bf: firstName(B), E: ev.name, P: pick(PUNDITS) }));
        }
      }
    }
    if (evs.length) lines.push(pick(HOUSE_RULES));
    for (const ev of evs) {
      const names = (derived[ev.id].freePlay || []).map((id) => (ev.venues.find((v) => v.id === id) || {}).name).filter(Boolean);
      if (!names.length) continue;
      const V = names.join(' & ');
      lines.push(fill(pick([
        'FREE PLAY: {V} {is} open. Grab {kit}, no pressure. (Everybody\'s watching.)',
        '🎉 {V} {is} open for free play. Perfect time to practise that "lucky" shot you keep talking about.',
        'FREE PLAY on {V}. {P}: "This is where legends are made. Or where people knock over drinks."',
      ]), { V, is: names.length > 1 ? 'are' : 'is', kit: ev.id === 'pool' ? 'a cue' : 'some darts', P: pick(PUNDITS) }));
    }

    const top = Object.entries(countriesAlive).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) lines.push(`${country(top[0]).toUpperCase()} has ${top[1]} players still in it. The ambassador has been informed.`);

    if (s.hostName) lines.push(`HAPPY 30TH ${s.hostName.toUpperCase()}! Odds on feeling 30 tomorrow morning: 1/1000.`);
    lines.push(`${pick(PUNDITS)}: ${pick(GENERIC_QUOTES)}`);
    lines.push(`${pick(PUNDITS)}: ${pick(GENERIC_QUOTES)}`);
    const novelty = NOVELTY.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    for (const n of novelty) lines.push(n.replace(/\{o:([^}]+)\}/, '$1'));
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
          `"${firstName(fav.player)} is the one they all fear. I fear them. My family fears them."`,
          `"If you're not backing ${firstName(fav.player)} at ${fav.odds}, frankly, why are you even here?"`,
          '"Hands like a surgeon. Temperament like a surgeon. Possibly is a surgeon."',
          `"I've seen ${firstName(fav.player)} warm up. I had to sit down afterwards."`,
          '"Ice in the veins. Lager in the glass. A deadly combination."',
          `"${firstName(fav.player)} doesn't play the game. The game plays along with ${firstName(fav.player)}."`,
          `"Every time ${firstName(fav.player)} walks up, the room goes quiet. Partly respect, partly fear, partly the toilet queue."`,
          '"The favourite for a reason. The reason is mostly confidence, but still."',
          `"I've put my house on ${firstName(fav.player)}. Not literally. I rent."`,
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
            `"${firstName(dark.player)} has the look of somebody who practised in secret. In a shed. For years."`,
            '"Long odds, short memory. That\'s what you need. Ask me how I know."',
            `"Don't sleep on ${firstName(dark.player)}. I did, earlier, on a sofa. Missed a cracking game."`,
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
            `"${firstName(prom.player)} is peaking at exactly the right time. About forty-five minutes ago."`,
            '"Building momentum. Building confidence. Building a slightly concerning tab at the bar."',
          ], seed + 2),
          pundit: pick(PUNDITS, seed + 5),
        });
      }
    }
    return cards;
  }

  const RELATIONSHIP_TYPES = Object.entries(RELATIONSHIPS).map(([k, v]) => [k, v.label]);
  const api = { resultLines, fillerLines, punditCards, oddsBoard, quoteReaction, PUNDITS, NOVELTY, RELATIONSHIP_TYPES };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Commentary = api;
})(this);
