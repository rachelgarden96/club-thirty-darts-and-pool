// Phone scorer. Pick a bracket match (or a free game), keep score dart by
// dart (or frame by frame for pool) and send the winner to the bracket.
// Bracket matches are set up automatically from the house rules (rules.js).
(function () {
  const { esc, flag, player, act, toast } = App;
  const app = document.getElementById('app');
  const SAVE_KEY = 'c30-game';
  let data = null;
  let screen = 'home'; // home | setup | game | over
  let g = null; // current game
  let setup = null; // setup choices before a game starts
  let mult = 1;
  let liveTimer = null;
  const quoteDraft = ['', ''];

  try { g = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { g = null; }
  if (g) screen = g.winner !== null && g.winner !== undefined ? 'over' : 'game';

  document.getElementById('home-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (screen === 'game' && !confirm('Leave this game? It stays saved on this phone so you can come back to it.')) return;
    screen = 'home';
    render();
  });

  App.onUpdate((p) => {
    data = p;
    // Never redraw under somebody typing their post-match quote.
    const a = document.activeElement;
    if (a && a.matches('textarea, input')) return;
    if (screen === 'home' || screen === 'over' || screen === 'game') render();
  });
  App.connect();
  render();
  setInterval(tickClock, 1000);

  // ------------------------------------------------------------ persistence
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(g)); } catch (e) { /* ignore */ }
    if (g && g.link) {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(pushLive, 250);
    }
  }

  function pushLive() {
    if (!g || !g.link || !linkedMatch() || linkedMatch().status === 'done') return;
    const { history, ...lean } = g;
    // Quiet on purpose: a late tick after the result is in is harmless.
    fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'live', eventId: g.link.eventId, matchId: g.link.matchId, data: lean, summary: summary() }),
    }).catch(() => {});
  }

  function summary() {
    if (g.kind === 'darts') {
      const rem = [0, 1].map((i) => (i === g.turn && g.winner == null ? Math.max(0, g.scores[i] - turnSum()) : g.scores[i]));
      const legs = g.legsTo > 1 ? `Legs ${g.legs[0]}-${g.legs[1]} · ` : '';
      return { p1: String(rem[0]), p2: String(rem[1]), turn: g.winner == null ? g.turn : null, text: `${legs}${g.label || g.start}` };
    }
    if (g.mode === 'single') {
      return {
        p1: g.endsAt ? String(g.balls[0]) : '', p2: g.endsAt ? String(g.balls[1]) : '', turn: null,
        text: g.endsAt ? 'Balls potted · 15-minute limit' : 'One frame · winner takes all', endsAt: g.endsAt || null,
      };
    }
    return { p1: String(g.frames[0]), p2: String(g.frames[1]), turn: null, text: `Frames · race to ${g.raceTo}` };
  }

  function linkedMatch() {
    if (!g || !g.link || !data) return null;
    const ev = data.state.events[g.link.eventId];
    return ev ? ev.matches.find((m) => m.id === g.link.matchId) : null;
  }

  // ------------------------------------------------------------ render
  function render() {
    if (screen === 'home') return renderHome();
    if (screen === 'setup') return renderSetup();
    if (screen === 'game') return g.kind === 'darts' ? renderDarts() : g.mode === 'single' ? renderPoolSingle() : renderPool();
    if (screen === 'over') return renderOver();
  }

  function renderHome() {
    if (!data) {
      app.innerHTML = '<div class="pad muted">Connecting to the tournament…</div>';
      return;
    }
    const sections = ['darts', 'pool'].map((k) => {
      const ev = data.state.events[k];
      if (!ev.generated) return '';
      const ms = ev.matches
        .filter((m) => (m.status === 'playing' || m.status === 'ready') && m.p1 && m.p2)
        .sort((a, b) => (a.status === 'playing' ? 0 : 1) - (b.status === 'playing' ? 0 : 1) || a.round - b.round || a.slot - b.slot);
      const d = data.derived[k];
      const items = ms.map((m) => {
        const v = ev.venues.find((x) => x.id === m.venueId);
        const live = data.state.live[`${k}:${m.id}`];
        const p1 = player(ev, m.p1);
        const p2 = player(ev, m.p2);
        return `<button class="mpick" data-ev="${k}" data-mid="${m.id}">
          <span class="mp-top">${m.status === 'playing' ? `<b class="lv">● ${esc(v ? v.name : 'LIVE')}</b>` : '<b class="rdy">READY</b>'} ${esc(d.roundNames[m.round])} · ${esc(Rules.forMatch(ev, m).short)}${live ? ' · <b class="lv">being scored</b>' : ''}</span>
          <span class="mp-n">${flag(p1.country)} ${esc(p1.name)}</span>
          <span class="mp-v">vs</span>
          <span class="mp-n">${flag(p2.country)} ${esc(p2.name)}</span>
        </button>`;
      }).join('');
      return `<h2>${k === 'darts' ? '🎯' : '🎱'} ${esc(ev.name)}</h2>${items || '<p class="muted">No matches waiting right now.</p>'}`;
    }).join('');
    const free = [];
    for (const k of ['pool', 'darts']) {
      const ev = data.state.events[k];
      if (!ev.generated) continue;
      for (const vid of data.derived[k].freePlay || []) {
        const v = ev.venues.find((x) => x.id === vid);
        if (v) free.push(v.name);
      }
    }
    const freeBanner = free.length
      ? `<div class="freeplay">🎉 <b>${esc(free.join(' & '))}</b> ${free.length > 1 ? 'are' : 'is'} open for free play. Grab a cue or some darts and have a knock-about!</div>` : '';
    const resume = g && (g.winner == null) ? `<button class="btn-wide yellow" data-go="resume">↩ Back to your game: ${esc(g.names[0])} v ${esc(g.names[1])}</button>` : '';
    app.innerHTML = `<div class="pad">
      ${resume}
      ${freeBanner}
      <p class="lead">Pick your match. The rules are set up for you, the score shows live on the TV, and the winner goes straight into the bracket.</p>
      ${sections || '<p class="muted">The draw hasn\'t been made yet. You can still play a free game.</p>'}
      <h2>🎲 Just for fun</h2>
      <button class="btn-wide" data-go="free-darts">🎯 Free darts game</button>
      <button class="btn-wide" data-go="free-pool">🎱 Free pool frame counter</button>
    </div>`;
    app.querySelectorAll('.mpick').forEach((b) => b.addEventListener('click', () => pickMatch(b.dataset.ev, b.dataset.mid)));
    app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const go = b.dataset.go;
      if (go === 'resume') { screen = 'game'; return render(); }
      setup = { kind: go === 'free-darts' ? 'darts' : 'pool', link: null, names: ['', ''], ids: [null, null], start: 501, legsTo: 1, finish: 'bust', raceTo: 3, first: 0 };
      screen = 'setup';
      render();
    }));
  }

  function pickMatch(evId, mid) {
    const ev = data.state.events[evId];
    const m = ev.matches.find((x) => x.id === mid);
    const live = data.state.live[`${evId}:${mid}`];
    if (live && live.data && live.data.kind && confirm('Somebody is already scoring this match. Carry on from their score?')) {
      g = { ...live.data, history: [] };
      screen = live.data.winner != null ? 'over' : 'game';
      save();
      return render();
    }
    setup = {
      kind: evId === 'darts' ? 'darts' : 'pool',
      link: { eventId: evId, matchId: mid },
      round: data.derived[evId].roundNames[m.round],
      rules: Rules.forMatch(ev, m),
      names: [player(ev, m.p1).name, player(ev, m.p2).name],
      ids: [m.p1, m.p2],
      first: 0,
    };
    screen = 'setup';
    render();
  }

  function seg(name, options, value) {
    return `<div class="seg" data-name="${name}">${options.map(([v, l]) => `<button class="${String(v) === String(value) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }

  function rulesCard(s) {
    const r = s.rules;
    if (s.kind === 'darts') {
      const lines = r.noBust
        ? ['Count down from <b>180</b>', 'Finish on <b>anything</b>', '<b>No bust</b>: go past zero and you\'ve won']
        : r.doubleOut
          ? ['Count down from <b>501</b>', 'You must <b>finish on a double</b> (or the bull)', 'Go past zero, or leave 1, and it\'s a <b>bust</b>']
          : ['Count down from <b>301</b>', 'Finish on <b>anything</b>', 'Go past zero and it\'s a <b>bust</b>: your score goes back to where it was'];
      return `<div class="rules"><div class="rules-h">${esc(s.round)} rules</div><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`;
    }
    const lines = r.minutes
      ? ['<b>One frame</b>, winner takes all', `<b>${r.minutes}-minute limit</b>: if nobody has won by then, whoever has <b>potted the most balls wins</b>`, 'Keep the ball count on this phone as you play']
      : ['<b>One frame</b>, winner takes all', 'No time limit at this stage: play it out!'];
    return `<div class="rules"><div class="rules-h">${esc(s.round)} rules</div><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></div>`;
  }

  function renderSetup() {
    const s = setup;
    let body;
    if (s.link) {
      const names = `<div class="vsbig">${esc(s.names[0])}<i>vs</i>${esc(s.names[1])}</div>`;
      if (s.kind === 'darts') {
        body = `${names}${rulesCard(s)}
          <h3>Who throws first?</h3>${seg('first', [[0, esc(s.names[0])], [1, esc(s.names[1])]], s.first)}
          <button class="btn-wide red" id="go">Game on! ▶</button>`;
      } else {
        body = `${names}${rulesCard(s)}
          <button class="btn-wide red" id="go">${s.rules.minutes ? `✅ We agree: start the ${s.rules.minutes}-minute clock` : 'Break off! ▶'}</button>`;
      }
    } else {
      const names = `<label>Player 1<input id="n0" value="${esc(s.names[0])}" placeholder="Name"></label><label>Player 2<input id="n1" value="${esc(s.names[1])}" placeholder="Name"></label>`;
      const opts = s.kind === 'darts' ? `
        <h3>Game</h3>${seg('start', [[180, '180'], [301, '301'], [501, '501']], s.start)}
        <h3>Finish</h3>${seg('finish', [['nobust', 'Any, no bust'], ['bust', 'Any, with bust'], ['double', 'On a double']], s.finish)}
        <h3>Legs</h3>${seg('legsTo', [[1, 'Single leg'], [2, 'First to 2'], [3, 'First to 3']], s.legsTo)}
        <h3>Throws first</h3>${seg('first', [[0, esc(s.names[0] || 'Player 1')], [1, esc(s.names[1] || 'Player 2')]], s.first)}`
        : `<h3>Race to</h3>${seg('raceTo', [[1, '1 frame'], [2, '2'], [3, '3'], [5, '5']], s.raceTo)}`;
      body = `${names}${opts}<button class="btn-wide red" id="go">Game on! ▶</button>`;
    }
    app.innerHTML = `<div class="pad">
      <h2>${s.kind === 'darts' ? '🎯 Darts' : '🎱 Pool'}${s.link ? '' : ' (free game)'}</h2>
      ${body}
      <button class="btn-wide ghost" id="back">← Back</button>
    </div>`;
    app.querySelectorAll('.seg').forEach((el) => el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      readNames();
      const v = b.dataset.v;
      setup[el.dataset.name] = /^\d+$/.test(v) ? Number(v) : v;
      renderSetup();
    }));
    document.getElementById('back').onclick = () => { screen = 'home'; render(); };
    document.getElementById('go').onclick = () => {
      readNames();
      if (!setup.names[0].trim() || !setup.names[1].trim()) return toast('Enter both names', true);
      startGame();
    };
  }

  function readNames() {
    if (setup.link) return;
    setup.names = [0, 1].map((i) => (document.getElementById(`n${i}`) || { value: setup.names[i] }).value);
  }

  function startGame() {
    const s = setup;
    const base = { link: s.link, names: s.names.map((n) => n.trim()), ids: s.ids, winner: null, history: [], startedAt: Date.now() };
    if (s.kind === 'darts') {
      const r = s.link ? s.rules : {
        start: s.start, doubleOut: s.finish === 'double', noBust: s.finish === 'nobust',
        label: `${s.start} · ${s.finish === 'double' ? 'double out' : s.finish === 'nobust' ? 'any finish, no bust' : 'any finish'}`,
      };
      g = {
        ...base, kind: 'darts',
        start: r.start, doubleOut: r.doubleOut, noBust: r.noBust, label: r.label, legsTo: s.link ? 1 : s.legsTo,
        legs: [0, 0], scores: [r.start, r.start], turn: s.first, legStarter: s.first, cur: [],
        stats: [0, 1].map(() => ({ pts: 0, darts: 0, best: 0, tons: 0, n180: 0, busts: 0, checkout: 0 })), last: ['', ''],
      };
    } else if (s.link) {
      g = {
        ...base, kind: 'pool', mode: 'single', balls: [0, 0],
        endsAt: s.rules.minutes ? Date.now() + s.rules.minutes * 60000 : null,
      };
    } else {
      g = { ...base, kind: 'pool', mode: 'frames', raceTo: s.raceTo, frames: [0, 0] };
    }
    mult = 1;
    screen = 'game';
    save();
    render();
  }

  // ------------------------------------------------------------ darts
  function turnSum() {
    return g.cur.reduce((t, d) => t + d.v, 0);
  }
  function dartLabel(d) {
    if (d.v === 0) return 'MISS';
    if (d.n === 25) return d.m === 2 ? 'BULL' : '25';
    return (d.m === 3 ? 'T' : d.m === 2 ? 'D' : '') + d.n;
  }
  function avg(i) {
    const s = g.stats[i];
    return s.darts ? ((s.pts / s.darts) * 3).toFixed(1) : '–';
  }

  function snapshot() {
    const { history, ...rest } = g;
    g.history.push(JSON.stringify(rest));
    if (g.history.length > 80) g.history.shift();
  }

  function throwDart(m, n) {
    if (g.winner != null) return;
    snapshot();
    const p = g.turn;
    const d = { m, n, v: m * n };
    g.cur.push(d);
    const sum = turnSum();
    const rem = g.scores[p] - sum;
    // "No bust" games: going past zero still wins.
    const out = rem === 0 ? (!g.doubleOut || m === 2) : (rem < 0 && g.noBust);
    const bust = !out && (rem < 0 || (g.doubleOut && rem <= 1));
    const ended = bust || out || g.cur.length === 3;
    const st = g.stats[p];
    if (ended) st.darts += g.cur.length;
    // Visit stats for the Stats Centre.
    const visit = (pts) => {
      st.best = Math.max(st.best || 0, pts);
      if (pts >= 100) st.tons = (st.tons || 0) + 1;
      if (pts === 180) st.n180 = (st.n180 || 0) + 1;
    };
    if (bust) {
      st.busts = (st.busts || 0) + 1;
      g.last[p] = 'BUST';
      bigFlash('BUST!', 'red');
      endTurn();
    } else if (out) {
      const scored = Math.min(sum, g.scores[p]);
      st.pts += scored;
      st.checkout = Math.max(st.checkout || 0, scored);
      visit(scored);
      g.scores[p] = 0;
      g.legs[p]++;
      g.last[p] = `Out on ${dartLabel(d)}`;
      if (g.legs[p] >= g.legsTo) {
        g.winner = p;
        g.endedAt = Date.now();
        g.cur = [];
        bigFlash('GAME SHOT!', 'yellow');
        screen = 'over';
      } else {
        bigFlash(`LEG TO ${g.names[p].toUpperCase()}!`, 'yellow');
        g.scores = [g.start, g.start];
        g.legStarter = 1 - g.legStarter;
        g.turn = g.legStarter;
        g.cur = [];
        g.last = ['', ''];
      }
    } else if (g.cur.length === 3) {
      g.scores[p] = rem;
      st.pts += sum;
      visit(sum);
      g.last[p] = String(sum);
      if (sum === 180) bigFlash('ONE HUNDRED AND EIGHTYYYY!', 'yellow');
      else if (sum >= 140) bigFlash(`${sum}!`, 'yellow');
      else if (sum === 26) g.last[p] = '26 (bed & breakfast)';
      endTurn();
    }
    mult = 1;
    save();
    render();
  }

  function endTurn() {
    g.cur = [];
    g.turn = 1 - g.turn;
  }

  function undo() {
    if (!g.history.length) return toast('Nothing to undo');
    const prev = JSON.parse(g.history.pop());
    const history = g.history;
    g = { ...prev, history };
    screen = 'game';
    save();
    render();
  }

  function renderDarts() {
    const p = g.turn;
    const rem = g.scores[p] - turnSum();
    let hint = '';
    if (g.noBust) hint = rem <= 60 ? `🎯 Anything ${rem > 1 ? `${rem} or more` : ''} wins it!` : '';
    else {
      const route = window.Checkouts.suggest(rem, 3 - g.cur.length, g.doubleOut);
      hint = route ? `🎯 Checkout: <b>${route}</b>` : '';
    }
    const panel = (i) => `
      <div class="pl ${i === p ? 'on' : ''}">
        <div class="pl-name">${esc(g.names[i])}</div>
        <div class="pl-rem">${i === p ? Math.max(rem, 0) : g.scores[i]}</div>
        <div class="pl-meta">${g.legsTo > 1 ? `Legs <b>${g.legs[i]}</b> · ` : ''}Avg <b>${avg(i)}</b>${g.last[i] ? ` · Last <b>${esc(g.last[i])}</b>` : ''}</div>
      </div>`;
    const slots = [0, 1, 2].map((i) => `<span class="slot ${g.cur[i] ? 'f' : ''}">${g.cur[i] ? dartLabel(g.cur[i]) : '·'}</span>`).join('');
    const nums = [];
    for (let n = 1; n <= 20; n++) nums.push(`<button class="num" data-n="${n}">${mult === 3 ? 'T' : mult === 2 ? 'D' : ''}${n}<small>${n * mult}</small></button>`);
    app.innerHTML = `<div class="game">
      <div class="fmt">${esc(g.label || `${g.start}`)}</div>
      <div class="pls">${panel(0)}${panel(1)}</div>
      <div class="turn">
        <span class="who">▶ ${esc(g.names[p])}</span>
        <span class="slots">${slots}</span>
        <span class="tsum">${turnSum()}</span>
      </div>
      <div class="hint">${hint || '&nbsp;'}</div>
      <div class="mults">
        <button data-m="1" class="${mult === 1 ? 'on' : ''}">Single</button>
        <button data-m="2" class="${mult === 2 ? 'on' : ''}">Double</button>
        <button data-m="3" class="${mult === 3 ? 'on' : ''}">Treble</button>
      </div>
      <div class="pad-grid">${nums.join('')}</div>
      <div class="pad-extra">
        <button class="ex outer" data-b="25">25<small>outer bull</small></button>
        <button class="ex bull" data-b="50">BULL<small>50</small></button>
        <button class="ex miss" data-b="0">MISS<small>0</small></button>
        <button class="ex undo" id="undo">↶ UNDO</button>
      </div>
    </div>`;
    app.querySelectorAll('.mults button').forEach((b) => b.addEventListener('click', () => {
      mult = Number(b.dataset.m);
      render();
    }));
    app.querySelectorAll('.num').forEach((b) => b.addEventListener('click', () => throwDart(mult, Number(b.dataset.n))));
    app.querySelectorAll('.ex[data-b]').forEach((b) => b.addEventListener('click', () => {
      const v = Number(b.dataset.b);
      if (v === 0) throwDart(1, 0);
      else throwDart(v === 50 ? 2 : 1, 25);
    }));
    document.getElementById('undo').addEventListener('click', undo);
  }

  // ------------------------------------------------------------ pool: bracket match (one frame, maybe timed)
  function clockText(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function tickClock() {
    if (screen !== 'game' || !g || g.kind !== 'pool' || g.mode !== 'single' || !g.endsAt || g.winner != null) return;
    const left = g.endsAt - Date.now();
    const el = document.getElementById('clock');
    if (el) {
      el.textContent = clockText(left);
      el.classList.toggle('low', left < 120000);
    }
    if (left <= 0 && !g.timeUp) timeUp();
  }

  function timeUp() {
    g.timeUp = true;
    if (g.balls[0] !== g.balls[1]) {
      const w = g.balls[0] > g.balls[1] ? 0 : 1;
      g.winner = w;
      g.endedAt = Date.now();
      g.how = 'time';
      bigFlash(`TIME! ${g.names[w].toUpperCase()} WINS ON BALLS`, 'yellow');
      screen = 'over';
    } else {
      bigFlash('TIME! LEVEL ON BALLS', 'red');
    }
    save();
    render();
  }

  function renderPoolSingle() {
    const timed = !!g.endsAt;
    const left = timed ? g.endsAt - Date.now() : 0;
    const panel = (i) => `
      <div class="pp">
        <div class="pl-name">${esc(g.names[i])}</div>
        ${timed ? `<div class="balls"><button class="bm-btn" data-ball="${i}" data-d="-1">−</button><span class="bn">${g.balls[i]}</span><button class="bm-btn plus" data-ball="${i}" data-d="1">+</button></div><div class="bl">balls potted</div>` : ''}
        <button class="won" data-won="${i}">🏆 ${esc(g.names[i].split(' ')[0])} won</button>
      </div>`;
    app.innerHTML = `<div class="game pool">
      ${timed ? `<div class="clockbox"><div class="cl-l">${g.timeUp ? 'Time\'s up!' : 'Time left'}</div><div id="clock" class="clock ${left < 120000 ? 'low' : ''}">${clockText(left)}</div>
        <div class="cl-h">${g.timeUp ? '<b>Level on balls: next ball potted wins!</b> Tap whoever pots it.' : 'Tap + every time someone pots one of their balls'}</div></div>`
        : '<div class="race">One frame, no time limit. Tap the winner when it\'s over.</div>'}
      <div class="pps">${panel(0)}${panel(1)}</div>
    </div>`;
    app.querySelectorAll('.bm-btn').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.ball);
      g.balls[i] = Math.max(0, Math.min(7, g.balls[i] + Number(b.dataset.d)));
      save();
      render();
    }));
    app.querySelectorAll('.won').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.won);
      if (!confirm(`${g.names[i]} won the frame?`)) return;
      snapshot();
      g.winner = i;
      g.endedAt = Date.now();
      g.how = g.timeUp ? 'time' : null;
      bigFlash('FRAME AND MATCH!', 'yellow');
      screen = 'over';
      save();
      render();
    }));
  }

  // ------------------------------------------------------------ pool: free frame counter
  function renderPool() {
    const panel = (i) => `
      <button class="fr" data-i="${i}">
        <span class="pl-name">${esc(g.names[i])}</span>
        <span class="fr-n">${g.frames[i]}</span>
        <span class="fr-add">+1 frame</span>
      </button>`;
    app.innerHTML = `<div class="game pool">
      <div class="race">Race to ${g.raceTo} frame${g.raceTo > 1 ? 's' : ''}. Tap the player who won the frame.</div>
      <div class="frs">${panel(0)}${panel(1)}</div>
      <button class="btn-wide ghost" id="undo">↶ Undo last frame</button>
    </div>`;
    app.querySelectorAll('.fr').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      snapshot();
      g.frames[i]++;
      if (g.frames[i] >= g.raceTo) {
        g.winner = i;
        screen = 'over';
        bigFlash('FRAME AND MATCH!', 'yellow');
      } else bigFlash(`FRAME TO ${g.names[i].toUpperCase()}`, 'yellow');
      save();
      render();
    }));
    document.getElementById('undo').addEventListener('click', undo);
  }

  // ------------------------------------------------------------ game over
  function resultScore() {
    if (g.kind === 'darts') return `${g.legs[0]}-${g.legs[1]}`;
    if (g.mode === 'single') return g.how === 'time' ? `${g.balls[0]}-${g.balls[1]}` : (g.winner === 0 ? '1-0' : '0-1');
    return `${g.frames[0]}-${g.frames[1]}`;
  }

  function sideName(ev, m, side) {
    const p = player(ev, m[side]);
    if (p) return `${flag(p.country)} ${esc(p.name)}`;
    const feeders = data.derived[ev.id].feeders[m.id];
    const f = ev.matches.find((x) => x.id === feeders[side === 'p1' ? 0 : 1]);
    const a = f && player(ev, f.p1);
    const b = f && player(ev, f.p2);
    return `<span class="muted">Winner of ${a ? esc(a.name) : 'TBC'} v ${b ? esc(b.name) : 'TBC'}</span>`;
  }

  // Who's on next at the table this game was played on, so the players can go and fetch them.
  function nextUpCard(lm) {
    if (!lm || !lm.venueId || !data) return '';
    const ev = data.state.events[g.link.eventId];
    const v = ev.venues.find((x) => x.id === lm.venueId);
    if (!v) return '';
    const now = ev.matches.find((m) => m.status === 'playing' && m.venueId === v.id);
    const u = data.derived[ev.id].upNext.find((x) => x.venueId === v.id);
    const nx = now || (u && u.nextId ? ev.matches.find((m) => m.id === u.nextId) : null);
    if (nx) {
      const ready = nx.p1 && nx.p2;
      return `<div class="nextup">
        <div class="nu-h">📣 Next up on ${esc(v.name)}</div>
        <div class="nu-p">${sideName(ev, nx, 'p1')}</div><div class="nu-v">vs</div><div class="nu-p">${sideName(ev, nx, 'p2')}</div>
        <p>${ready ? `Please go and find them and send them to <b>${esc(v.name)}</b>!` : 'Still waiting on another game to finish. Keep an eye on the TV.'}</p>
      </div>`;
    }
    if (u && u.freePlay) {
      return `<div class="nextup free"><div class="nu-h">🎉 ${esc(v.name)} is now open for free play</div><p>No tournament games waiting for it. Fancy a knock-about?</p></div>`;
    }
    return '';
  }

  function quoteBox(lm) {
    if (g.quoted) return '<div class="ok-box">🎤 Interview sent: watch the TV!</div>';
    const w = lm && lm.winner ? g.ids.indexOf(lm.winner) : g.winner;
    const l = 1 - w;
    return `<div class="quotes">
      <h2>🎤 Post-match interview</h2>
      <p class="muted">Say a few words for the cameras. They'll go up on the big screen. Both optional.</p>
      <label>${esc(g.names[w])}: winner's words<textarea id="q${w}" maxlength="140" rows="2" placeholder="e.g. I'd like to thank my cue, my mum and my lucky socks">${esc(quoteDraft[w])}</textarea></label>
      <label>${esc(g.names[l])}: any excuses? 🧂<textarea id="q${l}" maxlength="140" rows="2" placeholder="e.g. The lights were in my eyes. All of them.">${esc(quoteDraft[l])}</textarea></label>
      <button class="btn-wide red" id="sendq">📺 Put it on the big screen</button>
    </div>`;
  }

  function renderOver() {
    const w = g.winner;
    const lm = linkedMatch();
    const score = resultScore();
    let linkPart = '';
    const recorded = g.link && (g.sent || (lm && lm.status === 'done'));
    if (g.link) {
      if (g.sent) linkPart = '<div class="ok-box">✅ Result sent. Check the TV!</div>';
      else if (lm && lm.status === 'done') linkPart = '<div class="ok-box">This match has already been recorded in the bracket.</div>';
      else linkPart = `<button class="btn-wide red" id="send">📺 Send result to the bracket</button>`;
    }
    let sub;
    if (g.kind === 'darts') sub = `<p class="muted">3-dart averages: ${esc(g.names[0])} ${avg(0)} · ${esc(g.names[1])} ${avg(1)}</p>`;
    else if (g.mode === 'single') sub = g.how === 'time' ? `<p class="muted">Won on balls potted after the time limit (${g.balls[w]}–${g.balls[1 - w]})</p>` : '';
    else sub = `<div class="sc">${esc(g.names[0])} ${score.replace('-', ' – ')} ${esc(g.names[1])}</div>`;
    const undoLabel = g.kind === 'darts' ? 'dart' : g.mode === 'single' ? 'result' : 'frame';
    app.innerHTML = `<div class="pad over">
      <div class="cup">🏆</div>
      <div class="wn">${esc(g.names[w])} wins!</div>
      ${sub}
      ${linkPart}
      ${recorded ? nextUpCard(lm) : ''}
      ${recorded ? quoteBox(lm) : ''}
      ${recorded || !g.history.length ? '' : `<button class="btn-wide ghost" id="undo">↶ Oops, undo the last ${undoLabel}</button>`}
      ${g.link ? '' : '<button class="btn-wide" id="again">🔁 Rematch</button>'}
      <button class="btn-wide" id="home">← Back to matches</button>
    </div>`;
    const send = document.getElementById('send');
    if (send) send.onclick = async () => {
      send.disabled = true;
      if (!g.endedAt) g.endedAt = Date.now();
      const { history, ...lean } = g;
      const ok = await act('result', { eventId: g.link.eventId, matchId: g.link.matchId, winnerId: g.ids[w], score, how: g.how || null, game: lean });
      if (ok) {
        g.sent = true;
        save();
        bigFlash('IN THE BRACKET!', 'yellow');
      }
      send.disabled = false;
      render();
    };
    app.querySelectorAll('.quotes textarea').forEach((t) => t.addEventListener('input', () => { quoteDraft[Number(t.id.slice(1))] = t.value; }));
    const sendq = document.getElementById('sendq');
    if (sendq) sendq.onclick = async () => {
      const quotes = [0, 1].map((i) => ({ playerId: g.ids[i], text: quoteDraft[i].trim() })).filter((q) => q.text);
      if (!quotes.length) return toast('Type a quote first', true);
      sendq.disabled = true;
      if (await act('quote', { eventId: g.link.eventId, matchId: g.link.matchId, quotes })) {
        g.quoted = true;
        quoteDraft[0] = quoteDraft[1] = '';
        save();
        bigFlash('ON THE BIG SCREEN!', 'yellow');
      }
      sendq.disabled = false;
      render();
    };
    const u = document.getElementById('undo');
    if (u) u.onclick = undo;
    const again = document.getElementById('again');
    if (again) again.onclick = () => {
      setup = {
        kind: g.kind, link: null, names: g.names, ids: [null, null], start: g.start || 501, legsTo: g.legsTo || 1,
        finish: g.doubleOut ? 'double' : g.noBust ? 'nobust' : 'bust', raceTo: g.raceTo || 3, first: 0,
      };
      startGame();
    };
    document.getElementById('home').onclick = () => {
      if (g.link && !recorded && !confirm('You haven\'t sent the result to the bracket yet. Leave anyway?')) return;
      g = null;
      quoteDraft[0] = quoteDraft[1] = '';
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      screen = 'home';
      render();
    };
  }

  // ------------------------------------------------------------ fx
  function bigFlash(text, colour) {
    const el = document.getElementById('bigflash');
    el.textContent = text;
    el.className = `show ${colour}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => (el.className = ''), 1600);
    if (navigator.vibrate) navigator.vibrate(60);
  }
})();
