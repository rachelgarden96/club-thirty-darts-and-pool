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
          <div class="club">${logo('club-thirty')}</div>
          <div class="sports-bug">SPORTS</div>
          <div class="tv-title"><div class="t"></div></div>
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

  function clockText(ms) {
    if (ms <= 0) return 'TIME!';
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function tickClock() {
    root.querySelectorAll('.timer[data-ends]').forEach((el) => {
      const left = Number(el.dataset.ends) - Date.now();
      el.textContent = `⏱ ${clockText(left)}`;
      el.classList.toggle('low', left < 120000);
    });
    if (data) updateTickerLabel();
    const d = new Date();
    root.querySelector('.clock').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ------------------------------------------------------------ update
  function update(p) {
    data = p;
    const s = p.state.settings;
    root.querySelector('.tv-title .t').textContent = s.subtitle || '';
    stage.classList.toggle('theme-dark', s.theme === 'dark');
    document.title = `${s.title || 'Club Thirty'} — Live`;

    // New headlines → lower-third flash.
    for (const f of p.state.feed) {
      if (seenFeed.has(f.id)) continue;
      seenFeed.add(f.id);
      if (!firstLoad && ['result', 'custom', 'draw', 'quote'].includes(f.kind)) flashQueue.push(f);
      if (!firstLoad) tickerNews.push(f.text);
    }
    firstLoad = false;
    tickerStale = true;
    updateTickerLabel();
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
    if (on.quotes !== false && st.feed.some((f) => f.kind === 'quote')) list.push('quotes');
    if (on.stats !== false && Stats.cards(st).length) list.push('stats');
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
    const fn = { bracket: slideBracket, now: slideNow, next: slideNext, qr: slideQr, pundits: slidePundits, quotes: slideQuotes, stats: slideStats, welcome: slideWelcome, champion: slideChampion }[kind];
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
  function who(ev, id, withSong) {
    const p = player(ev, id);
    if (!p) return '<span class="nm tbc">TBC</span>';
    const tune = withSong && p.walkon ? `<span class="song-in">🎵 ${esc(p.walkon)}</span>` : '';
    return `${flag(p.country)}<span class="nm">${esc(p.name)}</span>${tune}`;
  }
  function venueName(ev, vid) {
    const v = ev.venues.find((x) => x.id === vid);
    return v ? esc(v.name) : '';
  }
  // Brand artwork comes in an ink version (light theme) and a light version (dark theme).
  function logo(name) {
    return `<img class="logo-ink" src="/img/${name}.png" alt=""><img class="logo-light" src="/img/${name}-light.png" alt="">`;
  }
  function eventLogo(ev) {
    return `<span class="event-logo">${logo(`${ev.id}-championship`)}</span>`;
  }
  function head(title, chips) {
    if (title.startsWith('<span class="event-logo"')) return `<div class="slide-head">${title}${(chips || []).join('')}</div>`;
    return `<div class="slide-head"><h1>${title}</h1>${(chips || []).join('')}</div>`;
  }
  function liveFor(ev, m) {
    return data.state.live[`${ev.id}:${m.id}`] || null;
  }

  // ------------------------------------------------------------ bracket
  function slideBracket(evId) {
    const ev = data.state.events[evId];
    const d = data.derived[evId];
    // Auto-zoom: once early rounds are finished, leave them off so the rest is bigger.
    // Always keep at least the semi-finals and final on screen.
    const zoom = data.state.settings.bracketView !== 'full' && !d.champion;
    const start = zoom ? Math.max(1, Math.min(d.currentRound, ev.rounds - 1)) : 1;
    const chips = [`<span class="chip">${esc(d.champion ? 'Complete' : d.currentRoundName)}</span>`,
      `<span class="chip ghost">${d.remaining} of ${ev.players.length} still standing</span>`];
    if (start > 1) chips.push('<span class="chip sage">🔍 Zoomed in</span>');
    return head(eventLogo(ev), chips) + `
      <div class="slide-body"><div class="bracket-wrap">
        <div class="bracket-area"><div class="bracket-fit">${bracketHtml(ev, d, false, start)}</div><div class="bracket-fit alt" style="display:none">${bracketHtml(ev, d, true, start)}</div></div>
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

  function bracketHtml(ev, d, mirrored, start) {
    const R = ev.rounds;
    const S = start || 1;
    const byRound = (r) => ev.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
    const final = byRound(R)[0];
    const finalCol = (cls) => `<div class="bcol final-col ${cls}"><div class="bhead">${esc(d.roundNames[R])}</div><div class="bbody"><div class="pair"><div class="mslot"><div class="trophy">🏆</div>${matchBox(ev, d, final)}</div></div></div></div>`;
    const cols = [];
    if (mirrored && R - S >= 1) {
      for (let r = S; r < R; r++) {
        const ms = byRound(r);
        cols.push(`<div class="bcol left ${r === S ? 'no-in' : ''}"><div class="bhead">${esc(d.roundNames[r])}</div>${columnHtml(ev, d, ms.slice(0, ms.length / 2))}</div>`);
      }
      cols.push(finalCol(''));
      for (let r = R - 1; r >= S; r--) {
        const ms = byRound(r);
        cols.push(`<div class="bcol right ${r === S ? 'no-in' : ''}"><div class="bhead">${esc(d.roundNames[r])}</div>${columnHtml(ev, d, ms.slice(ms.length / 2))}</div>`);
      }
    } else {
      for (let r = S; r < R; r++) {
        cols.push(`<div class="bcol left ${r === S ? 'no-in' : ''}"><div class="bhead">${esc(d.roundNames[r])}</div>${columnHtml(ev, d, byRound(r))}</div>`);
      }
      cols.push(finalCol(R === S ? 'solo' : 'end'));
    }
    const perCol = mirrored && R - S >= 1 ? 2 ** (R - S - 1) : 2 ** (R - S);
    const h = 40 + perCol * 98 + (R === S ? 70 : 0);
    return `<div class="bracket ${mirrored ? 'mirrored' : 'plain'}" style="--bh:${h}px">${cols.join('')}</div>`;
  }

  // Long names get a smaller font rather than being cut off.
  function shrinkNames(scope, selector = '.bp .nm') {
    for (const el of scope.querySelectorAll(selector)) {
      el.style.fontSize = '';
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 1 && size > 14) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    }
  }

  // Pick whichever layout (straight or mirrored) fills the screen best.
  function fitBracket(slide) {
    const area = slide.querySelector('.bracket-area');
    const fits = [...area.querySelectorAll('.bracket-fit')];
    const W = area.clientWidth;
    const H = area.clientHeight;
    if (!W || !H) return; // display tab hidden; refitted when shown
    shrinkNames(slide, '.standings .row .nm');
    let best = null;
    for (const f of fits) {
      f.style.display = 'block';
      f.style.transform = 'none';
      shrinkNames(f);
      const b = f.firstElementChild;
      const s = Math.min(W / b.scrollWidth, H / b.offsetHeight, 2);
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
  // Three or more rows of cards: use the tighter layout so nothing is cut off.
  function compact(n) {
    return Math.ceil(n / (n > 3 ? 2 : 1)) >= 3 ? 'compact' : '';
  }

  function slideNow() {
    const panels = liveEvents().map((ev) => {
      const d = data.derived[ev.id];
      const cards = ev.venues.map((v) => {
        const m = ev.matches.find((x) => x.status === 'playing' && x.venueId === v.id);
        if (!m) {
          const fp = (d.freePlay || []).includes(v.id);
          return `<div class="vcard free ${fp ? 'freeplay' : ''}"><div class="vh"><span class="vn">${esc(v.name)}</span></div><div class="free-msg">${fp ? '🎉 Open for free play: help yourselves!' : 'Free · waiting for players'}</div></div>`;
        }
        const live = liveFor(ev, m);
        const s = live && live.summary;
        const sc = (i) => (s ? `<span class="ls ${s.turn === i ? 'thrower' : ''}">${esc(i === 0 ? s.p1 : s.p2)}</span>` : '');
        return `<div class="vcard ${compact(ev.venues.length)}">
          <div class="vh"><span class="vn">${esc(v.name)}</span><span class="vr">${esc(d.roundNames[m.round])} · ${esc(Rules.forMatch(ev, m).short)}</span>${s && s.endsAt ? `<span class="vl timer" data-ends="${s.endsAt}">⏱ ${clockText(s.endsAt - Date.now())}</span>` : s ? '<span class="vl">LIVE SCORE</span>' : ''}</div>
          <div class="vs-line">${who(ev, m.p1, true)}${sc(0)}</div>
          <div class="vs-sep">VS</div>
          <div class="vs-line">${who(ev, m.p2, true)}${sc(1)}</div>
          ${s && s.text ? `<div class="lsum">${esc(s.text)}</div>` : ''}
        </div>`;
      }).join('');
      return `<div class="panel"><div class="panel-h">${eventLogo(ev)}<span class="rd">${esc(d.champion ? 'Complete' : d.currentRoundName)}</span></div>
        <div class="vgrid" style="${gridStyle(ev.venues.length)}">${cards}</div></div>`;
    }).join('');
    return head('Now <em>Playing</em>', ['<span class="chip">Live</span>']) + `<div class="slide-body"><div class="two-up">${panels}</div></div>`;
  }

  // ------------------------------------------------------------ up next
  function sideLabel(ev, m, side) {
    const pid = m[side];
    if (pid) return who(ev, pid, true);
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
          return `<div class="vcard free upcard ${u.freePlay ? 'freeplay' : ''}"><div class="vh"><span class="vn">${esc(v.name)}</span></div><div class="free-msg">${u.freePlay ? '🎉 Open for free play: help yourselves!' : 'Nothing queued yet'}</div></div>`;
        }
        shown.add(m.id);
        return `<div class="vcard upcard ${compact(ev.venues.length)}">
          <div class="vh"><span class="vn">${esc(v.name)} · Next up</span><span class="vr">${esc(d.roundNames[m.round])} · ${esc(Rules.forMatch(ev, m).short)}</span></div>
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
      return `<div class="panel"><div class="panel-h">${eventLogo(ev)}<span class="rd">${ev.id === 'pool' ? 'Get chalked up!' : 'Warm up those arms!'}</span></div>
        <div class="vgrid" style="${gridStyle(ev.venues.length)}">${cards}</div>
        ${later.length ? `<div class="later">Then: ${later.join(' · ')}</div>` : ''}</div>`;
    }).join('');
    return head('Up <em>Next</em>', ['<span class="chip y">You\'re on soon!</span>', '<span class="chip ghost">🎵 Cue the walk-on music</span>']) + `<div class="slide-body"><div class="two-up">${panels}</div></div>`;
  }

  // ------------------------------------------------------------ qr
  function qrSvg(text) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: 10, margin: 0, scalable: true });
    } catch (e) {
      return '<div style="color:#000;font-size:30px;padding:40px">QR error</div>';
    }
  }

  function slideQr() {
    const url = data.server.scoreUrl;
    return head('Keep <em>Score</em>', ['<span class="chip">On your phone</span>']) + `
      <div class="slide-body"><div class="qr-wrap">
        <div class="qr-box">${qrSvg(url)}</div>
        <div class="qr-text">
          <h2>Scan me to be<br>the <em>scorer</em></h2>
          <ol>
            <li>Connect to the guest Wi-Fi</li>
            <li>Scan with your phone camera</li>
            <li>Pick your match: the rules are set up for you</li>
            <li>Finish the game and the bracket updates itself</li>
          </ol>
          <div class="url">${esc(url)}</div>
        </div>
      </div></div>`;
  }

  // ------------------------------------------------------------ stats centre
  function slideStats() {
    const cards = Stats.cards(data.state).slice(0, 8);
    const html = cards.map((c) => `
      <div class="scard ${c.key === 'worstAvg' || c.key === 'mostBusts' ? 'spoon' : ''}">
        <div class="stitle">${esc(c.title)}</div>
        <div class="sval">${esc(String(c.value))}</div>
        <div class="swho">${flag(c.player.country)}<span>${esc(c.player.name)}</span></div>
        <div class="squip">${esc(c.quip)}</div>
      </div>`).join('');
    return head('Stats <em>Centre</em>', ['<span class="chip">From the phone scorers</span>', '<span class="chip ghost">Numbers don\'t lie. People do.</span>']) +
      `<div class="slide-body"><div class="sgrid n${cards.length}">${html}</div></div>`;
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

  // ------------------------------------------------------------ post-match interviews
  function slideQuotes() {
    const quotes = data.state.feed.filter((f) => f.kind === 'quote').slice(-6).reverse();
    const html = quotes.map((q) => {
      const ev = data.state.events[q.eventId];
      const p = ev && player(ev, q.playerId);
      return `<div class="qcard ${q.role}">
        <div class="qtag">${q.role === 'winner' ? '🎤 Winner' : '🧂 Beaten'} · ${esc(ev ? ev.name : '')}</div>
        <div class="qq"><span>\u201C${esc(q.quote)}\u201D</span></div>
        <div class="qwho">${p ? flag(p.country) : ''}<span>${esc(p ? p.name : '')}</span></div>
      </div>`;
    }).join('');
    return head('Post-match <em>interviews</em>', ['<span class="chip">Straight from the players</span>']) +
      `<div class="slide-body"><div class="qgrid n${quotes.length}">${html}</div></div>`;
  }

  // ------------------------------------------------------------ welcome / champion
  function slideWelcome() {
    const s = data.state.settings;
    return `<div class="slide-body"><div class="centre welcome">
      <div class="club">${logo('club-thirty')}</div>
      <div class="lines"><span>${logo('pool-championship')}</span><i class="dot">◆</i><span>${logo('darts-championship')}</span></div>
      ${s.hostName ? `<div class="small host">Happy 30th ${esc(s.hostName)}</div>` : ''}
      <div class="small">The draw is being made · Stay tuned</div>
    </div></div>`;
  }

  function slideChampion(evId) {
    const ev = data.state.events[evId];
    const d = data.derived[evId];
    const c = player(ev, d.champion);
    const r = player(ev, d.runnerUp);
    const colours = ['#a84d68', '#5e7a55', '#f2b8c6', '#d98a9e', '#a7c4a0', '#cda85a'];
    const conf = Array.from({ length: 70 }, (_, i) => `<i style="left:${(i * 137) % 100}%;animation-duration:${3 + (i % 7) * 0.6}s;background:${colours[i % 6]};animation-delay:${-(i % 11) * 0.5}s"></i>`).join('');
    return `<div class="slide-body"><div class="confetti">${conf}</div><div class="centre champ">
      <div class="cup">🏆</div>
      <div class="ev">${logo(`${ev.id}-championship`)}</div>
      <div class="ttl">Champion</div>
      <div class="who">${flag(c.country)}<span>${esc(c.name)}</span></div>
      <div class="small">Beat ${r ? esc(r.name) : ''} in the final · ${esc(Countries.name(c.country) || '')} goes wild</div>
    </div></div>`;
  }

  // ------------------------------------------------------------ result flash
  function runFlash() {
    if (flashing || !flashQueue.length) return;
    const f = flashQueue.shift();
    flashing = true;
    flashEl.querySelector('.k').textContent = f.kind === 'result' ? (f.text.startsWith('🏆') ? 'CHAMPION' : 'RESULT') : f.kind === 'draw' ? 'THE DRAW' : f.kind === 'quote' ? 'POST-MATCH' : 'BREAKING';
    flashEl.querySelector('.v').textContent = f.text;
    flashEl.classList.add('show');
    setTimeout(() => {
      flashEl.classList.remove('show');
      setTimeout(() => { flashing = false; runFlash(); }, 600);
    }, 7000);
  }

  // ------------------------------------------------------------ ticker
  // Each line is written just before it scrolls on, so it is always current
  // ("LIVE on Table 2…" is only ever about games that are actually on).
  // Brand-new headlines jump the queue.
  let tickerX = null;
  let lastFrame = 0;
  let tickerQueue = [];
  let tickerStale = true;
  const tickerNews = [];
  const recentlyShown = [];
  const SPEED = 150; // stage px per second

  function buildTickerQueue() {
    const st = data.state;
    const recent = st.feed.slice(-8).reverse().map((f) => f.text);
    const fillers = Commentary.fillerLines(st, data.derived).concat(window.Stats ? Stats.tickerLines(st) : [])
      .sort(() => Math.random() - 0.5);
    const items = [];
    const n = Math.max(recent.length, fillers.length);
    for (let i = 0; i < n; i++) {
      if (fillers[i]) items.push(fillers[i]);
      if (recent[i] && i % 2 === 0) items.push(recent[i]);
    }
    const fresh = items.filter((t) => !recentlyShown.includes(t));
    return fresh.length ? fresh : items;
  }

  function nextTickerItem() {
    let text = tickerNews.shift();
    if (!text) {
      if (tickerStale || !tickerQueue.length) {
        tickerQueue = buildTickerQueue();
        tickerStale = false;
      }
      text = tickerQueue.shift() || 'Club Thirty';
    }
    recentlyShown.push(text);
    if (recentlyShown.length > 14) recentlyShown.shift();
    const el = document.createElement('span');
    el.className = 'ti';
    el.innerHTML = `${esc(text)}<span class="sep">◆</span>`;
    return el;
  }

  function tickerFrame(t) {
    const dt = lastFrame ? Math.min((t - lastFrame) / 1000, 0.1) : 0;
    lastFrame = t;
    const track = tickerText.parentElement.clientWidth;
    // Only run while the TV is actually showing (it has no size when hidden).
    if (data && track > 0) {
      if (tickerX === null) tickerX = track;
      tickerX -= SPEED * dt;
      // Drop lines that have scrolled off the left…
      let first = tickerText.firstElementChild;
      while (first && tickerX + first.offsetWidth < 0) {
        tickerX += first.offsetWidth;
        first.remove();
        first = tickerText.firstElementChild;
      }
      // …and write new ones just before they appear on the right.
      for (let i = 0; i < 20 && tickerX + tickerText.scrollWidth < track + 40; i++) tickerText.appendChild(nextTickerItem());
      tickerText.style.transform = `translateX(${tickerX}px)`;
    }
    requestAnimationFrame(tickerFrame);
  }

  function updateTickerLabel() {
    const st = data.state;
    const newest = st.feed[st.feed.length - 1];
    const breaking = newest && Date.now() - newest.ts < 3 * 60 * 1000;
    tickerLabel.textContent = breaking ? 'BREAKING' : 'LATEST';
    tickerLabel.classList.toggle('breaking', !!breaking);
  }

  return { init, resize };
})();
