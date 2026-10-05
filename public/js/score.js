// Phone scorer. Pick a bracket match (or a free game), keep score dart by
// dart (or frame by frame for pool) and send the winner to the bracket.
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
    if (screen === 'home' || screen === 'over' || screen === 'game') render();
  });
  App.connect();
  render();

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
      const rem = [0, 1].map((i) => (i === g.turn && g.winner == null ? g.scores[i] - turnSum() : g.scores[i]));
      const legs = g.legsTo > 1 ? `Legs ${g.legs[0]}-${g.legs[1]} · ` : '';
      return { p1: String(rem[0]), p2: String(rem[1]), turn: g.winner == null ? g.turn : null, text: `${legs}${g.start}${g.doubleOut ? ' · double out' : ''}` };
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
    if (screen === 'game') return g.kind === 'darts' ? renderDarts() : renderPool();
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
          <span class="mp-top">${m.status === 'playing' ? `<b class="lv">● ${esc(v ? v.name : 'LIVE')}</b>` : '<b class="rdy">READY</b>'} ${esc(d.roundNames[m.round])}${live ? ' · <b class="lv">being scored</b>' : ''}</span>
          <span class="mp-n">${flag(p1.country)} ${esc(p1.name)}</span>
          <span class="mp-v">vs</span>
          <span class="mp-n">${flag(p2.country)} ${esc(p2.name)}</span>
        </button>`;
      }).join('');
      return `<h2>${k === 'darts' ? '🎯' : '🎱'} ${esc(ev.name)}</h2>${items || '<p class="muted">No matches waiting right now.</p>'}`;
    }).join('');
    const resume = g && (g.winner == null) ? `<button class="btn-wide yellow" data-go="resume">↩ Back to your game: ${esc(g.names[0])} v ${esc(g.names[1])}</button>` : '';
    app.innerHTML = `<div class="pad">
      ${resume}
      <p class="lead">Pick your match. The score shows live on the TV, and the winner goes straight into the bracket.</p>
      ${sections || '<p class="muted">The draw hasn\'t been made yet. You can still play a free game.</p>'}
      <h2>🎲 Just for fun</h2>
      <button class="btn-wide" data-go="free-darts">🎯 Free darts game</button>
      <button class="btn-wide" data-go="free-pool">🎱 Free pool frame counter</button>
    </div>`;
    app.querySelectorAll('.mpick').forEach((b) => b.addEventListener('click', () => pickMatch(b.dataset.ev, b.dataset.mid)));
    app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
      const go = b.dataset.go;
      if (go === 'resume') { screen = 'game'; return render(); }
      setup = { kind: go === 'free-darts' ? 'darts' : 'pool', link: null, names: ['', ''], ids: [null, null], start: 501, legsTo: 1, doubleOut: false, raceTo: 3, first: 0 };
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
      screen = 'game';
      save();
      return render();
    }
    setup = {
      kind: evId === 'darts' ? 'darts' : 'pool',
      link: { eventId: evId, matchId: mid },
      names: [player(ev, m.p1).name, player(ev, m.p2).name],
      ids: [m.p1, m.p2],
      start: 501, legsTo: 1, doubleOut: false, raceTo: 1, first: 0,
    };
    screen = 'setup';
    render();
  }

  function seg(name, options, value) {
    return `<div class="seg" data-name="${name}">${options.map(([v, l]) => `<button class="${String(v) === String(value) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }

  function renderSetup() {
    const s = setup;
    const names = s.link
      ? `<div class="vsbig">${esc(s.names[0])}<i>vs</i>${esc(s.names[1])}</div>`
      : `<label>Player 1<input id="n0" value="${esc(s.names[0])}" placeholder="Name"></label><label>Player 2<input id="n1" value="${esc(s.names[1])}" placeholder="Name"></label>`;
    const opts = s.kind === 'darts' ? `
      <h3>Game</h3>${seg('start', [[180, '180'], [301, '301'], [501, '501']], s.start)}
      <h3>Legs</h3>${seg('legsTo', [[1, 'Single leg'], [2, 'First to 2'], [3, 'First to 3']], s.legsTo)}
      <h3>Finish</h3>${seg('doubleOut', [['false', 'Any finish'], ['true', 'Must finish on a double']], s.doubleOut)}
      <h3>Throws first</h3>${seg('first', [[0, esc(s.names[0] || 'Player 1')], [1, esc(s.names[1] || 'Player 2')]], s.first)}`
      : `<h3>Race to</h3>${seg('raceTo', [[1, '1 frame'], [2, '2'], [3, '3'], [5, '5']], s.raceTo)}`;
    app.innerHTML = `<div class="pad">
      <h2>${s.kind === 'darts' ? '🎯 Darts' : '🎱 Pool'} setup</h2>
      ${names}${opts}
      <button class="btn-wide red" id="go">Game on! ▶</button>
      <button class="btn-wide ghost" id="back">← Back</button>
    </div>`;
    app.querySelectorAll('.seg').forEach((el) => el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      readNames();
      const v = b.dataset.v;
      setup[el.dataset.name] = v === 'true' ? true : v === 'false' ? false : Number(v);
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
    if (s.kind === 'darts') {
      g = {
        kind: 'darts', link: s.link, names: s.names.map((n) => n.trim()), ids: s.ids,
        start: s.start, legsTo: s.legsTo, doubleOut: s.doubleOut,
        legs: [0, 0], scores: [s.start, s.start], turn: s.first, legStarter: s.first, cur: [],
        stats: [{ pts: 0, darts: 0 }, { pts: 0, darts: 0 }], last: ['', ''], winner: null, history: [],
      };
    } else {
      g = { kind: 'pool', link: s.link, names: s.names.map((n) => n.trim()), ids: s.ids, raceTo: s.raceTo, frames: [0, 0], winner: null, history: [] };
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
    const bust = rem < 0 || (g.doubleOut && rem === 1) || (rem === 0 && g.doubleOut && m !== 2);
    const ended = bust || rem === 0 || g.cur.length === 3;
    if (ended) g.stats[p].darts += g.cur.length;
    if (bust) {
      g.last[p] = 'BUST';
      bigFlash('BUST!', 'red');
      endTurn();
    } else if (rem === 0) {
      g.stats[p].pts += sum;
      g.legs[p]++;
      g.last[p] = `Out on ${dartLabel(d)}`;
      if (g.legs[p] >= g.legsTo) {
        g.winner = p;
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
      g.stats[p].pts += sum;
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
    const hint = window.Checkouts.suggest(rem, 3 - g.cur.length, g.doubleOut);
    const panel = (i) => `
      <div class="pl ${i === p ? 'on' : ''}">
        <div class="pl-name">${esc(g.names[i])}</div>
        <div class="pl-rem">${i === p ? rem : g.scores[i]}</div>
        <div class="pl-meta">${g.legsTo > 1 ? `Legs <b>${g.legs[i]}</b> · ` : ''}Avg <b>${avg(i)}</b>${g.last[i] ? ` · Last <b>${esc(g.last[i])}</b>` : ''}</div>
      </div>`;
    const slots = [0, 1, 2].map((i) => `<span class="slot ${g.cur[i] ? 'f' : ''}">${g.cur[i] ? dartLabel(g.cur[i]) : '·'}</span>`).join('');
    const nums = [];
    for (let n = 1; n <= 20; n++) nums.push(`<button class="num" data-n="${n}">${mult === 3 ? 'T' : mult === 2 ? 'D' : ''}${n}<small>${n * mult}</small></button>`);
    app.innerHTML = `<div class="game">
      <div class="pls">${panel(0)}${panel(1)}</div>
      <div class="turn">
        <span class="who">▶ ${esc(g.names[p])}</span>
        <span class="slots">${slots}</span>
        <span class="tsum">${turnSum()}</span>
      </div>
      <div class="hint">${hint ? `🎯 Checkout: <b>${hint}</b>` : '&nbsp;'}</div>
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

  // ------------------------------------------------------------ pool
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
  function renderOver() {
    const w = g.winner;
    const lm = linkedMatch();
    const score = g.kind === 'darts' ? `${g.legs[0]}-${g.legs[1]}` : `${g.frames[0]}-${g.frames[1]}`;
    let linkPart = '';
    if (g.link) {
      if (g.sent) linkPart = '<div class="ok-box">✅ Result sent. Check the TV!</div>';
      else if (lm && lm.status === 'done') linkPart = '<div class="ok-box">This match has already been recorded in the bracket.</div>';
      else linkPart = `<button class="btn-wide red" id="send">📺 Send result to the bracket</button>`;
    }
    const stats = g.kind === 'darts' ? `<p class="muted">3-dart averages: ${esc(g.names[0])} ${avg(0)} · ${esc(g.names[1])} ${avg(1)}</p>` : '';
    app.innerHTML = `<div class="pad over">
      <div class="cup">🏆</div>
      <div class="wn">${esc(g.names[w])} wins!</div>
      <div class="sc">${esc(g.names[0])} ${score.replace('-', ' – ')} ${esc(g.names[1])}</div>
      ${stats}
      ${linkPart}
      ${g.sent ? '' : '<button class="btn-wide ghost" id="undo">↶ Oops, undo the last ' + (g.kind === 'darts' ? 'dart' : 'frame') + '</button>'}
      ${g.link ? '' : '<button class="btn-wide" id="again">🔁 Rematch</button>'}
      <button class="btn-wide" id="home">← Back to matches</button>
    </div>`;
    const send = document.getElementById('send');
    if (send) send.onclick = async () => {
      send.disabled = true;
      const ok = await act('result', { eventId: g.link.eventId, matchId: g.link.matchId, winnerId: g.ids[w], score });
      if (ok) {
        g.sent = true;
        save();
        bigFlash('IN THE BRACKET!', 'yellow');
      }
      send.disabled = false;
      render();
    };
    const u = document.getElementById('undo');
    if (u) u.onclick = undo;
    const again = document.getElementById('again');
    if (again) again.onclick = () => {
      setup = { kind: g.kind, link: null, names: g.names, ids: [null, null], start: g.start || 501, legsTo: g.legsTo || 1, doubleOut: !!g.doubleOut, raceTo: g.raceTo || 3, first: 0 };
      startGame();
    };
    document.getElementById('home').onclick = () => {
      if (g.link && !g.sent && !(lm && lm.status === 'done') && !confirm('You haven\'t sent the result to the bracket yet. Leave anyway?')) return;
      g = null;
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
    el._t = setTimeout(() => (el.className = ''), 1300);
    if (navigator.vibrate) navigator.vibrate(60);
  }
})();
