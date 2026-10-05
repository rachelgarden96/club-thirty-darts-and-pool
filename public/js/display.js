// The TV display: rotating slides, a scrolling ticker and result flashes.
window.Display = (function () {
  const { esc, flag, player, parseScore } = App;
  let root, stage, slidesEl, tickerText, tickerLabel, flashEl, progressBar, dotsEl;
  let data = null;
  let slides = [];
  let current = null; // key of slide on screen
  let timer = null;
  let paused = false;
  const seenFeed = new Set();
  let firstLoad = true;
  const flashQueue = [];
  let flashing = false;

  function init(el) {
    root = el;
    root.innerHTML = `
      <div class="stage">
        <header class="tv-top">
          <div class="logo"><span class="c30">CLUB<b>30</b></span><span class="sports">SPORTS</span></div>
          <div class="tv-title"><div class="t"></div><div class="s"></div></div>
          <div class="live-bug"><i></i>LIVE</div>
          <div class="clock"></div>
        </header>
        <div class="slides"></div>
        <div class="dots"></div>
        <div class="progress"><div class="bar"></div></div>
        <div class="flash"><div class="k">FULL TIME</div><div class="v"></div></div>
        <footer class="ticker">
          <div class="ticker-label">LATEST</div>
          <div class="ticker-track"><div class="ticker-text"></div></div>
        </footer>
      </div>`;
    stage = root.querySelector('.stage');
    slidesEl = root.querySelector('.slides');
    tickerText = root.querySelector('.ticker-text');
    tickerLabel = root.querySelector('.ticker-label');
    flashEl = root.querySelector('.flash');
    progressBar = root.querySelector('.progress .bar');
    dotsEl = root.querySelector('.dots');

    window.addEventListener('resize', resize);
    resize();
    setInterval(tickClock, 1000);
    tickClock();
    requestAnimationFrame(tickerFrame);

    document.addEventListener('keydown', (e) => {
      if (document.body.dataset.tab !== 'display' || e.target.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === ' ') { paused = !paused; App.toast(paused ? 'Slides paused (space to resume)' : 'Slides resumed'); if (!paused) go(0); e.preventDefault(); }
    });

    App.onUpdate(update);
  }

  function resize() {
    if (!root || !stage) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!w || !h) return;
    const s = Math.min(w / 1920, h / 1080);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
    const slide = slidesEl.querySelector('.slide');
    if (slide && slide.querySelector('.bracket-area')) fitBracket(slide);
  }

  function tickClock() {
    const d = new Date();
    root.querySelector('.clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ------------------------------------------------------------ update
  function update(p) {
    data = p;
    const s = p.state.settings;
    root.querySelector('.tv-title .t').textContent = s.title || 'Club Thirty';
    root.querySelector('.tv-title .s').textContent = s.subtitle || '';
    document.title = `${s.title || 'Club Thirty'} — Live`;

    // New headlines → lower-third flash.
    for (const f of p.state.feed) {
      if (seenFeed.has(f.id)) continue;
      seenFeed.add(f.id);
      if (!firstLoad && (f.kind === 'result' || f.kind === 'custom' || f.kind === 'draw')) flashQueue.push(f);
    }
    firstLoad = false;
    runFlash();

    slides = buildSlideList();
    renderDots();
    if (!current || !slides.includes(current)) show(slides[0], true);
    else renderSlide(current, false);
  }

  function buildSlideList() {
    const st = data.state;
    const on = st.settings.slides;
    const list = [];
    const evs = ['pool', 'darts'].map((k) => st.events[k]);
    for (const ev of evs) if (ev.generated && data.derived[ev.id].champion) list.push(`champion:${ev.id}`);
    const anyLive = evs.some((e) => e.generated);
    if (!anyLive) list.push('welcome');
    if (on.poolBracket && st.events.pool.generated) list.push('bracket:pool');
    if (on.nowPlaying && anyLive) list.push('now');
    if (on.dartsBracket && st.events.darts.generated) list.push('bracket:darts');
    if (on.upNext && anyLive) list.push('next');
    if (on.pundits && anyLive && Commentary.punditCards(st, data.derived).length) list.push('pundits');
    if (on.qr) list.push('qr');
    if (!list.length) list.push('welcome');
    return list;
  }

  function renderDots() {
    dotsEl.innerHTML = slides.map((k) => `<i class="${k === current ? 'on' : ''}"></i>`).join('');
  }

  function go(dir) {
    if (!slides.length) return;
    const i = slides.indexOf(current);
    show(slides[(i + dir + slides.length) % slides.length], true);
  }

  function show(key, animate) {
    current = key;
    renderSlide(key, animate);
    renderDots();
    clearTimeout(timer);
    const secs = (data && data.state.settings.slideSeconds) || 10;
    progressBar.style.transition = 'none';
    progressBar.style.width = '0';
    if (paused) return;
    void progressBar.offsetWidth;
    progressBar.style.transition = `width ${secs}s linear`;
    progressBar.style.width = '100%';
    timer = setTimeout(() => go(1), secs * 1000);
  }

  function renderSlide(key, animate) {
    const [kind, arg] = key.split(':');
    const fn = { bracket: slideBracket, now: slideNow, next: slideNext, qr: slideQr, pundits: slidePundits, welcome: slideWelcome, champion: slideChampion }[kind];
    let el = slidesEl.querySelector('.slide');
    if (animate || !el) {
      slidesEl.innerHTML = '<div class="slide"></div>';
      el = slidesEl.querySelector('.slide');
    } else {
      el.style.animation = 'none';
    }
    el.innerHTML = fn(arg);
    el.dataset.key = key;
    if (kind === 'bracket') fitBracket(el);
  }

  // ------------------------------------------------------------ helpers
  function nm(ev, id) {
    const p = player(ev, id);
    return p ? esc(p.name) : 'TBC';
  }
  function who(ev, id) {
    const p = player(ev, id);
    return p ? `${flag(p.country)}<span class="nm">${esc(p.name)}</span>` : '<span class="nm tbc">TBC</span>';
  }
  function venueName(ev, vid) {
    const v = ev.venues.find((x) => x.id === vid);
    return v ? esc(v.name) : '';
  }
  function head(title, chips) {
    return `<div class="slide-head"><h1>${title}</h1>${(chips || []).join('')}</div>`;
  }
  function liveFor(ev, m) {
    return data.state.live[`${ev.id}:${m.id}`] || null;
  }
  function icon(ev) {
    return ev.id === 'pool' ? '🎱' : '🎯';
  }

  // ------------------------------------------------------------ bracket
  function slideBracket(evId) {
    const ev = data.state.events[evId];
    const d = data.derived[evId];
    const chips = [`<span class="chip">${esc(d.champion ? 'Complete' : d.currentRoundName)}</span>`,
      `<span class="chip ghost">${d.remaining} of ${ev.players.length} still standing</span>`];
    return head(`${icon(ev)} ${esc(ev.name)} <em>Bracket</em>`, chips) + `
      <div class="slide-body"><div class="bracket-wrap">
        <div class="bracket-area"><div class="bracket-fit">${bracketHtml(ev, d, false)}</div><div class="bracket-fit alt" style="display:none">${bracketHtml(ev, d, true)}</div></div>
        ${standingsHtml(ev, d)}
      </div></div>`;
  }

  function matchBox(ev, d, m) {
    const tags = {};
    for (const u of d.upNext) if (u.nextId) tags[u.nextId] = u.venueId;
    let cls = 'bm';
    let tag = '';
    if (m.bye) cls += ' bye';
    if (m.status === 'playing') { cls += ' live'; tag = `<span class="tag">LIVE · ${venueName(ev, m.venueId)}</span>`; }
    else if (tags[m.id]) { cls += ' next'; tag = `<span class="tag">NEXT · ${venueName(ev, tags[m.id])}</span>`; }
    const sc = parseScore(m.score);
    const live = m.status === 'playing' ? liveFor(ev, m) : null;
    const row = (pid, i) => {
      const p = player(ev, pid);
      let rc = 'bp';
      if (m.status === 'done' && !m.bye) rc += m.winner === pid ? ' win' : ' lose';
      if (m.bye && pid && m.winner === pid) rc += ' win';
      if (!p) {
        const label = m.bye && m.round === 1 ? 'BYE' : 'TBC';
        return `<div class="${rc} tbc"><span class="seed"></span><span class="flag noflag" style="visibility:hidden"></span><span class="nm">${label}</span><span class="sc"></span></div>`;
      }
      let score = '';
      if (sc) score = sc[i];
      else if (m.status === 'done' && !m.bye && m.winner === pid) score = '✓';
      if (live && live.summary) score = esc(i === 0 ? live.summary.p1 : live.summary.p2);
      return `<div class="${rc}"><span class="seed">${p.seed || ''}</span>${flag(p.country)}<span class="nm">${esc(p.name)}</span><span class="sc">${score}</span></div>`;
    };
    return `<div class="${cls}">${tag}${row(m.p1, 0)}${row(m.p2, 1)}</div>`;
  }

  function columnHtml(ev, d, matches) {
    const groups = [];
    if (matches.length >= 2) for (let i = 0; i < matches.length; i += 2) groups.push(matches.slice(i, i + 2));
    else groups.push(matches);
    return `<div class="bbody">${groups.map((g) => `<div class="pair ${g.length === 2 ? 'two' : ''}">${g.map((m) => `<div class="mslot">${matchBox(ev, d, m)}</div>`).join('')}</div>`).join('')}</div>`;
  }

  function bracketHtml(ev, d, mirrored) {
    const R = ev.rounds;
    const byRound = (r) => ev.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
    const final = byRound(R)[0];
    const finalCol = (cls) => `<div class="bcol final-col ${cls}"><div class="bhead">${esc(d.roundNames[R])}</div><div class="bbody"><div class="pair"><div class="mslot"><div class="trophy">🏆</div>${matchBox(ev, d, final)}</div></div></div></div>`;
    const cols = [];
    if (mirrored && R >= 2) {
      for (let r = 1; r < R; r++) {
        const ms = byRound(r);
        cols.push(`<div class="bcol left ${r === 1 ? 'no-in' : ''}"><div class="bhead">${esc(d.roundNames[r])}</div>${columnHtml(ev, d, ms.slice(0, ms.length / 2))}</div>`);
      }
      cols.push(finalCol(''));
      for (let r = R - 1; r >= 1; r--) {
        const ms = byRound(r);
        cols.push(`<div class="bcol right ${r === 1 ? 'no-in' : ''}"><div class="bhead">${esc(d.roundNames[r])}</div>${columnHtml(ev, d, ms.slice(ms.length / 2))}</div>`);
      }
    } else {
      for (let r = 1; r < R; r++) {
        cols.push(`<div class="bcol left ${r === 1 ? 'no-in' : ''}"><div class="bhead">${esc(d.roundNames[r])}</div>${columnHtml(ev, d, byRound(r))}</div>`);
      }
      cols.push(finalCol(R === 1 ? 'solo' : 'end'));
    }
    const perCol = mirrored && R >= 2 ? 2 ** (R - 2) : 2 ** (R - 1);
    const h = 40 + perCol * 98 + (R === 1 ? 70 : 0);
    return `<div class="bracket ${mirrored ? 'mirrored' : 'plain'}" style="--bh:${h}px">${cols.join('')}</div>`;
  }

  // Pick whichever layout (straight or mirrored) fills the screen best.
  function fitBracket(slide) {
    const area = slide.querySelector('.bracket-area');
    const fits = [...area.querySelectorAll('.bracket-fit')];
    const W = area.clientWidth;
    const H = area.clientHeight;
    if (!W || !H) return; // display tab hidden; refitted when shown
    let best = null;
    for (const f of fits) {
      f.style.display = 'block';
      f.style.transform = 'none';
      const b = f.firstElementChild;
      const s = Math.min(W / b.scrollWidth, H / b.offsetHeight, 1.45);
      if (!best || s > best.s + 0.02) best = { f, s, w: b.scrollWidth * s, h: b.offsetHeight * s };
    }
    for (const f of fits) f.style.display = f === best.f ? 'block' : 'none';
    best.f.style.transform = `translate(${(W - best.w) / 2}px, ${(H - best.h) / 2}px) scale(${best.s})`;
  }

  function standingsHtml(ev, d) {
    if (d.champion) {
      const c = player(ev, d.champion);
      const r = player(ev, d.runnerUp);
      return `<aside class="standings"><h3>🏆 Champion</h3><div class="row fav">${flag(c.country)}<span class="nm">${esc(c.name)}</span></div>
        <div class="sub" style="margin-top:14px">Runner-up</div><div class="row">${flag(r.country)}<span class="nm">${esc(r.name)}</span></div></aside>`;
    }
    const board = Commentary.oddsBoard(ev, d);
    const max = 13;
    const rows = board.slice(0, max).map((b, i) => `<div class="row ${i === 0 ? 'fav' : ''}">${flag(b.player.country)}<span class="nm">${esc(b.player.name)}</span><span class="w">${d.wins[b.player.id] ? `${d.wins[b.player.id]}W` : ''}</span><span class="od">${b.odds}</span></div>`).join('');
    const more = board.length > max ? `<div class="more">+ ${board.length - max} more still in</div>` : '';
    const outIds = d.eliminated.slice(-3).reverse();
    const out = d.eliminated.length
      ? `<div class="out">❌ Knocked out: ${d.eliminated.length}<br>${outIds.map((id) => `<s>${nm(ev, id)}</s>`).join(', ')}</div>` : '';
    return `<aside class="standings"><h3>Still standing</h3><div class="sub">To win · Odds by Paddy Powerless</div>${rows}${more}${out}</aside>`;
  }

  // ------------------------------------------------------------ now playing
  function liveEvents() {
    return ['pool', 'darts'].map((k) => data.state.events[k]).filter((e) => e.generated);
  }
  function gridStyle(n) {
    const cols = n > 3 ? 2 : 1;
    return `grid-template-columns:repeat(${cols},1fr)`;
  }

  function slideNow() {
    const panels = liveEvents().map((ev) => {
      const d = data.derived[ev.id];
      const cards = ev.venues.map((v) => {
        const m = ev.matches.find((x) => x.status === 'playing' && x.venueId === v.id);
        if (!m) {
          return `<div class="vcard free"><div class="vh"><span class="vn">${esc(v.name)}</span></div><div class="free-msg">${d.champion ? 'Tournament complete' : 'Free · waiting for players'}</div></div>`;
        }
        const live = liveFor(ev, m);
        const s = live && live.summary;
        const sc = (i) => (s ? `<span class="ls ${s.turn === i ? 'thrower' : ''}">${esc(i === 0 ? s.p1 : s.p2)}</span>` : '');
        return `<div class="vcard ${ev.venues.length > 3 ? 'compact' : ''}">
          <div class="vh"><span class="vn">${esc(v.name)}</span><span class="vr">${esc(d.roundNames[m.round])}</span>${s ? '<span class="vl">LIVE SCORE</span>' : ''}</div>
          <div class="vs-line">${who(ev, m.p1)}${sc(0)}</div>
          <div class="vs-sep">VS</div>
          <div class="vs-line">${who(ev, m.p2)}${sc(1)}</div>
          ${s && s.text ? `<div class="lsum">${esc(s.text)}</div>` : ''}
        </div>`;
      }).join('');
      return `<div class="panel"><div class="panel-h">${icon(ev)} ${esc(ev.name)}<span class="rd">${esc(d.champion ? 'Complete' : d.currentRoundName)}</span></div>
        <div class="vgrid" style="${gridStyle(ev.venues.length)}">${cards}</div></div>`;
    }).join('');
    return head('Now <em>Playing</em>', ['<span class="chip">Live</span>']) + `<div class="slide-body"><div class="two-up">${panels}</div></div>`;
  }

  // ------------------------------------------------------------ up next
  function sideLabel(ev, m, side) {
    const pid = m[side];
    if (pid) return who(ev, pid);
    const feeders = data.derived[ev.id].feeders[m.id];
    const f = ev.matches.find((x) => x.id === feeders[side === 'p1' ? 0 : 1]);
    if (f && f.p1 && f.p2) return `<span class="nm tbc">Winner of ${nm(ev, f.p1)} v ${nm(ev, f.p2)}</span>`;
    return '<span class="nm tbc">TBC</span>';
  }

  function slideNext() {
    const panels = liveEvents().map((ev) => {
      const d = data.derived[ev.id];
      const shown = new Set();
      const cards = d.upNext.map((u) => {
        const v = ev.venues.find((x) => x.id === u.venueId);
        const m = ev.matches.find((x) => x.id === u.nextId);
        const cur = ev.matches.find((x) => x.id === u.currentId);
        if (!m) {
          return `<div class="vcard free upcard"><div class="vh"><span class="vn">${esc(v.name)}</span></div><div class="free-msg">Nothing queued yet</div></div>`;
        }
        shown.add(m.id);
        return `<div class="vcard upcard ${ev.venues.length > 3 ? 'compact' : ''}">
          <div class="vh"><span class="vn">${esc(v.name)} · Next up</span><span class="vr">${esc(d.roundNames[m.round])}</span></div>
          <div class="vs-line">${sideLabel(ev, m, 'p1')}</div>
          <div class="vs-sep">VS</div>
          <div class="vs-line">${sideLabel(ev, m, 'p2')}</div>
          <div class="after">${cur ? `After ${nm(ev, cur.p1)} v ${nm(ev, cur.p2)}` : 'Head to the ' + esc(ev.venueLabel.toLowerCase()) + ' now!'}</div>
        </div>`;
      }).join('');
      const later = d.queue.filter((id) => !shown.has(id)).slice(0, 4).map((id) => {
        const m = ev.matches.find((x) => x.id === id);
        return `<b>${nm(ev, m.p1)}</b> v <b>${nm(ev, m.p2)}</b>`;
      });
      return `<div class="panel"><div class="panel-h">${icon(ev)} ${esc(ev.name)}<span class="rd">Get chalked up!</span></div>
        <div class="vgrid" style="${gridStyle(ev.venues.length)}">${cards}</div>
        ${later.length ? `<div class="later">Then: ${later.join(' · ')}</div>` : ''}</div>`;
    }).join('');
    return head('Up <em>Next</em>', ['<span class="chip y">You\'re on soon!</span>']) + `<div class="slide-body"><div class="two-up">${panels}</div></div>`;
  }

  // ------------------------------------------------------------ qr
  function slideQr() {
    const url = data.server.scoreUrl;
    let svg = '';
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      svg = qr.createSvgTag({ cellSize: 10, margin: 0, scalable: true });
    } catch (e) {
      svg = '<div style="color:#000;font-size:30px;padding:40px">QR error</div>';
    }
    return head('Keep <em>Score</em>', ['<span class="chip">On your phone</span>']) + `
      <div class="slide-body"><div class="qr-wrap">
        <div class="qr-box">${svg}</div>
        <div class="qr-text">
          <h2>Scan me to be<br>the <em>scorer</em></h2>
          <ol>
            <li>Scan with your phone camera (same Wi-Fi!)</li>
            <li>Pick your match, or start a free game</li>
            <li>Darts: tap singles, doubles, trebles &amp; bulls</li>
            <li>Finish the game and the bracket updates itself</li>
          </ol>
          <div class="url">${esc(url)}</div>
        </div>
      </div></div>`;
  }

  // ------------------------------------------------------------ pundits
  function slidePundits() {
    const cards = Commentary.punditCards(data.state, data.derived).slice(0, 6);
    const html = cards.map((c) => `
      <div class="pcard">
        <div class="ptag">${esc(c.tag)}</div>
        <div class="pname">${flag(c.player.country)}<span>${esc(c.player.name)}</span><span class="od">${c.odds}</span></div>
        <q>${esc(c.quote)}</q>
        <div class="by">${esc(c.pundit)}</div>
      </div>`).join('');
    return head('The Pundits\' <em>Verdict</em>', ['<span class="chip">Expert analysis*</span>', '<span class="chip ghost">*not expert</span>']) +
      `<div class="slide-body"><div class="pgrid n${cards.length}">${html}</div></div>`;
  }

  // ------------------------------------------------------------ welcome / champion
  function slideWelcome() {
    const s = data.state.settings;
    return `<div class="slide-body"><div class="centre">
      <div class="big">${esc(s.title || 'Club Thirty')}</div>
      <div class="mid">${esc(s.subtitle || '')}</div>
      ${s.hostName ? `<div class="small">🎉 Happy 30th ${esc(s.hostName)} 🎉</div>` : ''}
      <div class="small">The draw is being made. Stay tuned.</div>
    </div></div>`;
  }

  function slideChampion(evId) {
    const ev = data.state.events[evId];
    const d = data.derived[evId];
    const c = player(ev, d.champion);
    const r = player(ev, d.runnerUp);
    const colours = ['#e4002b', '#ffd400', '#ffffff', '#3d7bff', '#19c37d'];
    const conf = Array.from({ length: 70 }, (_, i) => `<i style="left:${(i * 137) % 100}%;background:${colours[i % 5]};animation-duration:${3 + (i % 7) * 0.6}s;animation-delay:${-(i % 11) * 0.5}s"></i>`).join('');
    return `<div class="slide-body"><div class="confetti">${conf}</div><div class="centre champ">
      <div class="cup">🏆</div>
      <div class="ttl">${esc(ev.name)} Champion</div>
      <div class="who">${flag(c.country)}<span>${esc(c.name)}</span></div>
      <div class="small">Beat ${r ? esc(r.name) : ''} in the final · ${esc(Countries.name(c.country) || '')} goes wild</div>
    </div></div>`;
  }

  // ------------------------------------------------------------ result flash
  function runFlash() {
    if (flashing || !flashQueue.length) return;
    const f = flashQueue.shift();
    flashing = true;
    flashEl.querySelector('.k').textContent = f.kind === 'result' ? (f.text.startsWith('🏆') ? 'CHAMPION' : 'RESULT') : f.kind === 'draw' ? 'THE DRAW' : 'BREAKING';
    flashEl.querySelector('.v').textContent = f.text;
    flashEl.classList.add('show');
    setTimeout(() => {
      flashEl.classList.remove('show');
      setTimeout(() => { flashing = false; runFlash(); }, 600);
    }, 7000);
  }

  // ------------------------------------------------------------ ticker
  let tickerX = 0;
  let tickerW = 0;
  let lastFrame = 0;
  const SPEED = 150; // stage px per second

  function buildTicker() {
    if (!data) return '';
    const st = data.state;
    const recent = st.feed.slice(-10).reverse().map((f) => f.text);
    const fillers = Commentary.fillerLines(st, data.derived).sort(() => Math.random() - 0.5);
    const items = [];
    // Interleave latest news with filler so results keep coming round.
    const n = Math.max(recent.length, fillers.length);
    for (let i = 0; i < n; i++) {
      if (recent[i]) items.push(recent[i]);
      if (fillers[i]) items.push(fillers[i]);
    }
    const newest = st.feed[st.feed.length - 1];
    const breaking = newest && Date.now() - newest.ts < 3 * 60 * 1000;
    tickerLabel.textContent = breaking ? 'BREAKING' : 'LATEST';
    tickerLabel.classList.toggle('breaking', !!breaking);
    return items.map((t) => `<span>${esc(t)}</span>`).join('<span class="sep">◆</span>') + '<span class="sep">◆</span>';
  }

  function tickerFrame(t) {
    const dt = lastFrame ? Math.min((t - lastFrame) / 1000, 0.1) : 0;
    lastFrame = t;
    if (data) {
      if (!tickerW || tickerX < -tickerW) {
        tickerText.innerHTML = buildTicker();
        tickerW = tickerText.scrollWidth;
        tickerX = tickerText.parentElement.clientWidth;
      }
      tickerX -= SPEED * dt;
      tickerText.style.transform = `translateX(${tickerX}px)`;
    }
    requestAnimationFrame(tickerFrame);
  }

  return { init, resize };
})();
