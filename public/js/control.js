// Control Room: set up players/tables, draw brackets, enter results, manage
// the ticker and settings. Every change is saved on the server immediately.
window.Control = (function () {
  const { esc, flag, player, act, toast, countryOptions, parseScore } = App;
  let root;
  let data = null;
  let view = null;
  let pending = false;
  let pointerDown = false;
  let lastKey = 0;
  const scoreDraft = {}; // "ev:match" -> ['2', '1'] typed but not yet submitted
  const pasteOpen = {};
  const collapsed = new Set(); // rounds folded away in "Run the night"

  function init(el) {
    root = el;
    try { view = localStorage.getItem('c30-view'); } catch (e) { /* ignore */ }
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('input', onInput);
    root.addEventListener('toggle', (e) => {
      const k = e.target.dataset && e.target.dataset.round;
      if (!k) return;
      if (e.target.open) collapsed.delete(k);
      else collapsed.add(k);
    }, true);
    root.addEventListener('focusout', () => setTimeout(flush, 0));
    root.addEventListener('keydown', () => { lastKey = Date.now(); });
    root.addEventListener('focusin', () => { lastKey = Date.now(); });
    setInterval(flush, 1000);
    document.addEventListener('mousedown', () => { pointerDown = true; });
    document.addEventListener('mouseup', () => setTimeout(() => { pointerDown = false; flush(); }, 50));
    App.onUpdate((p) => {
      data = p;
      pending = true;
      flush();
    });
  }

  // Don't redraw under somebody's cursor: live score ticks from phones arrive
  // constantly and would otherwise wipe what's being typed.
  function isTyping() {
    const a = document.activeElement;
    if (!a || !root.contains(a) || !a.matches('input:not([type=checkbox]):not([type=file]), textarea')) return false;
    return a.value !== a.defaultValue || Date.now() - lastKey < 4000;
  }

  function flush() {
    if (!pending || !data || pointerDown || isTyping()) return;
    pending = false;
    render();
  }

  // ------------------------------------------------------------ render
  function render() {
    const a = document.activeElement;
    const focusId = a && root.contains(a) ? a.id : null;
    let sel = null;
    try { sel = a && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; } catch (e) { sel = null; }
    const st = data.state;
    const anyDrawn = st.events.pool.generated || st.events.darts.generated;
    if (!view) view = anyDrawn ? 'run' : 'setup';
    const tabs = [['setup', '1. Players & tables'], ['run', '2. Run the night'], ['ticker', '📣 Ticker'], ['settings', '⚙️ Settings & backup']];
    const scrollY = window.scrollY;
    root.innerHTML = `
      <div class="ctl">
        <div class="subnav">${tabs.map(([k, l]) => `<button data-action="view" data-view="${k}" class="${view === k ? 'on' : ''}">${l}</button>`).join('')}
          <span class="saved">💾 Saved automatically</span></div>
        ${{ setup: renderSetup, run: renderRun, ticker: renderTicker, settings: renderSettings }[view]()}
      </div>`;
    window.scrollTo(0, scrollY);
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus();
        try { if (sel) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs */ }
      }
    }
  }

  // ------------------------------------------------------------ setup
  function renderSetup() {
    return `<div class="cols">${['pool', 'darts'].map((k) => setupEvent(data.state.events[k])).join('')}</div>${relationshipsCard()}`;
  }

  // Couples, siblings, best mates… used by the commentary for extra banter.
  function relationshipsCard() {
    const names = [];
    const seen = new Set();
    for (const ev of Object.values(data.state.events)) {
      for (const p of ev.players) {
        const k = p.name.trim().toLowerCase();
        if (!seen.has(k)) { seen.add(k); names.push(p.name.trim()); }
      }
    }
    names.sort((a, b) => a.localeCompare(b));
    const rels = data.state.relationships || [];
    const label = Object.fromEntries(Commentary.RELATIONSHIP_TYPES);
    const opts = (id) => `<select id="${id}"><option value="">— Player —</option>${names.map((n) => `<option>${esc(n)}</option>`).join('')}</select>`;
    return `<div class="card rel-card">
      <h2>💞 Relationships &amp; rivalries <span class="count">optional, for the commentary</span></h2>
      <p class="muted">Tell the pundits who's who. When these players meet (or are on a collision course) the ticker will make the most of it. Very respectfully. Mostly.</p>
      ${names.length < 2 ? '<p class="muted">Add some players first.</p>' : `
      <div class="relrow">${opts('rel-a')}
        <select id="rel-type">${Commentary.RELATIONSHIP_TYPES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        ${opts('rel-b')}<button class="btn primary" data-action="addRel">+ Add</button></div>`}
      ${rels.length ? `<div class="rels">${rels.map((r) => `<span class="rel">${esc(r.a)} <i>${esc(label[r.type] || r.type)}</i> ${esc(r.b)}<button class="x" data-action="delRel" data-id="${r.id}" title="Remove">✕</button></span>`).join('')}</div>` : ''}
    </div>`;
  }

  function setupEvent(ev) {
    const other = ev.id === 'pool' ? data.state.events.darts : data.state.events.pool;
    const seeds = ev.players.map((p) => p.seed).filter(Boolean);
    const dupSeeds = seeds.length !== new Set(seeds).size;
    const locked = ev.generated;
    const icon = ev.id === 'pool' ? '🎱' : '🎯';
    const rows = ev.players.map((p, i) => `
      <tr>
        <td class="n">${i + 1}</td>
        <td>${flag(p.country)}</td>
        <td><input type="text" id="pn-${p.id}" data-ev="${ev.id}" data-pid="${p.id}" data-field="name" value="${esc(p.name)}"></td>
        <td><select id="pc-${p.id}" data-ev="${ev.id}" data-pid="${p.id}" data-field="country">${countryOptions(p.country)}</select></td>
        <td><input type="number" min="1" class="seed" id="ps-${p.id}" data-ev="${ev.id}" data-pid="${p.id}" data-field="seed" value="${p.seed || ''}" placeholder="–"></td>
        <td><input type="text" id="pw-${p.id}" data-ev="${ev.id}" data-pid="${p.id}" data-field="walkon" value="${esc(p.walkon || '')}" placeholder="🎵 optional"></td>
        <td>${locked ? '' : `<button class="x" data-action="removePlayer" data-ev="${ev.id}" data-pid="${p.id}" title="Remove">✕</button>`}</td>
      </tr>`).join('');
    const venues = ev.venues.map((v) => `
      <div class="venue-row">
        <input type="text" id="vn-${v.id}" data-ev="${ev.id}" data-vid="${v.id}" data-field="venue" value="${esc(v.name)}">
        <button class="x" data-action="removeVenue" data-ev="${ev.id}" data-vid="${v.id}" title="Remove">✕</button>
      </div>`).join('');

    return `<div class="card">
      <h2>${icon} ${esc(ev.name)} <span class="count">${ev.players.length} player${ev.players.length === 1 ? '' : 's'}</span></h2>
      ${locked ? `<div class="note ok">✅ Bracket drawn. You can still fix names, countries and seeds. To add or remove players you'll need to redraw.</div>` : ''}
      ${locked ? '' : `
      <form class="addp" data-ev="${ev.id}">
        <input type="text" id="add-name-${ev.id}" placeholder="Full name" autocomplete="off">
        <select id="add-country-${ev.id}">${countryOptions(data.state.settings.homeCountry)}</select>
        <input type="number" min="1" id="add-seed-${ev.id}" class="seed" placeholder="Seed">
        <input type="text" id="add-song-${ev.id}" class="song-in" placeholder="🎵 Walk-on song" autocomplete="off">
        <button class="btn primary">+ Add</button>
      </form>
      <div class="tools">
        <button class="btn small" data-action="togglePaste" data-ev="${ev.id}">📋 Paste a list</button>
        ${other.players.length ? `<button class="btn small" data-action="copyPlayers" data-ev="${ev.id}">⇄ Copy ${other.players.length} players from ${esc(other.name)}</button>` : ''}
      </div>
      ${pasteOpen[ev.id] ? `<div class="paste">
        <textarea id="paste-${ev.id}" rows="6" placeholder="One player per line: name, country, seed, walk-on song&#10;Jamie Smith, Scotland, 1, Mr Brightside&#10;Alex Jones, Wales, , Delilah&#10;Sam Taylor"></textarea>
        <button class="btn primary small" data-action="pastePlayers" data-ev="${ev.id}">Add these players</button>
      </div>` : ''}`}
      ${ev.players.length ? `<table class="ptable"><thead><tr><th></th><th></th><th>Name</th><th>Country</th><th title="1 = top seed. Leave blank for unseeded.">Seed</th><th>Walk-on song</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No players yet. Add them above.</p>'}
      ${dupSeeds ? '<div class="note warn">⚠️ Two players have the same seed number.</div>' : ''}
      <p class="hint">Seeds are optional: 1 is the top seed. Seeds 1 and 2 can only meet in the final, and top seeds get any byes.</p>

      <h3>${esc(ev.venueLabel)}s</h3>
      ${venues}
      <button class="btn small" data-action="addVenue" data-ev="${ev.id}">+ Add ${esc(ev.venueLabel.toLowerCase())}</button>

      <div class="gen">
        ${locked
          ? `<button class="btn danger" data-action="redraw" data-ev="${ev.id}">↺ Redraw ${esc(ev.name)} bracket (wipes its results)</button>`
          : `<button class="btn big primary" data-action="generate" data-ev="${ev.id}" ${ev.players.length < 2 ? 'disabled' : ''}>🎲 Make the ${esc(ev.name)} draw</button>`}
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ run
  function renderRun() {
    const evs = ['pool', 'darts'].map((k) => data.state.events[k]).filter((e) => e.generated);
    if (!evs.length) return '<div class="card"><h2>Nothing drawn yet</h2><p>Add players and tables in <b>1. Players &amp; tables</b>, then make the draw.</p></div>';
    return `<div class="cols">${evs.map(runEvent).join('')}</div>`;
  }

  function pname(ev, id) {
    const p = player(ev, id);
    return p ? esc(p.name) : 'TBC';
  }

  function songsLine(ev, m) {
    const songs = [m.p1, m.p2].map((id) => player(ev, id)).filter((p) => p && p.walkon)
      .map((p) => `${esc(p.name.split(' ')[0])}: <b>${esc(p.walkon)}</b>`);
    return songs.length ? `<div class="songs">🎵 ${songs.join(' · ')}</div>` : '';
  }

  function scoreInputs(ev, m) {
    const k = `${ev.id}:${m.id}`;
    const d = scoreDraft[k] || parseScore(m.score) || ['', ''];
    return `<span class="score-in"><input type="number" min="0" id="s1-${k}" data-score="${k}" data-i="0" value="${esc(d[0])}" placeholder="–">
      <span>-</span><input type="number" min="0" id="s2-${k}" data-score="${k}" data-i="1" value="${esc(d[1])}" placeholder="–"></span>`;
  }

  function winButtons(ev, m) {
    return `<button class="btn win" data-action="win" data-ev="${ev.id}" data-mid="${m.id}" data-pid="${m.p1}">🏆 ${pname(ev, m.p1)}</button>
      ${scoreInputs(ev, m)}
      <button class="btn win" data-action="win" data-ev="${ev.id}" data-mid="${m.id}" data-pid="${m.p2}">🏆 ${pname(ev, m.p2)}</button>`;
  }

  function runEvent(ev) {
    const d = data.derived[ev.id];
    const icon = ev.id === 'pool' ? '🎱' : '🎯';
    const ready = ev.matches.filter((m) => m.status === 'ready');
    const venueCards = ev.venues.map((v) => {
      const m = ev.matches.find((x) => x.status === 'playing' && x.venueId === v.id);
      const u = d.upNext.find((x) => x.venueId === v.id);
      const nx = u && u.nextId ? ev.matches.find((x) => x.id === u.nextId) : null;
      const nextLine = nx ? `<div class="vnext">Next: ${pname(ev, nx.p1)} v ${pname(ev, nx.p2)}${songsLine(ev, nx)}</div>` : '';
      if (!m) {
        return `<div class="vbox free"><div class="vtitle">${esc(v.name)} ${(d.freePlay || []).includes(v.id) ? '<span class="badge done">OPEN FOR FREE PLAY</span>' : '<span class="badge">FREE</span>'}</div>
          ${ready.length ? `<div class="startrow"><select id="start-${v.id}">${ready.map((r) => `<option value="${r.id}">${pname(ev, r.p1)} v ${pname(ev, r.p2)}${r.hold ? ' (on hold)' : ''}</option>`).join('')}</select>
          <button class="btn small" data-action="startHere" data-ev="${ev.id}" data-vid="${v.id}">▶ Start here</button></div>` : '<div class="muted">Nobody ready to play yet.</div>'}
          ${nextLine}</div>`;
      }
      const live = data.state.live[`${ev.id}:${m.id}`];
      return `<div class="vbox">
        <div class="vtitle">${esc(v.name)} <span class="badge live">LIVE</span> <span class="rd">${esc(d.roundNames[m.round])} · ${esc(Rules.forMatch(ev, m).short)}</span></div>
        <div class="vplayers">${flag((player(ev, m.p1) || {}).country)} ${pname(ev, m.p1)} <i>v</i> ${flag((player(ev, m.p2) || {}).country)} ${pname(ev, m.p2)}</div>
        ${songsLine(ev, m)}
        ${live && live.summary ? `<div class="livesum">📱 Phone scoring: ${esc(live.summary.p1)} – ${esc(live.summary.p2)} ${esc(live.summary.text || '')}</div>` : ''}
        <div class="who-won">Who won? ${winButtons(ev, m)}</div>
        <div class="vfoot"><button class="link" data-action="hold" data-ev="${ev.id}" data-mid="${m.id}">⏸ Not ready, send back to queue</button></div>
        ${nextLine}
      </div>`;
    }).join('');

    const rounds = [];
    for (let r = 1; r <= ev.rounds; r++) {
      const ms = ev.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
      const rows = ms.map((m) => matchRow(ev, m)).join('');
      rounds.push(`<details data-round="${ev.id}:${r}" ${collapsed.has(`${ev.id}:${r}`) ? '' : 'open'}><summary>${esc(d.roundNames[r])} <span class="muted">${ms.filter((m) => m.status === 'done').length}/${ms.length} done</span></summary><div class="mrows">${rows}</div></details>`);
    }

    return `<div class="card">
      <h2>${icon} ${esc(ev.name)} <span class="count">${d.champion ? `🏆 ${pname(ev, d.champion)}` : `${esc(d.currentRoundName)} · ${d.remaining} left`}</span></h2>
      <h3>On the ${esc(ev.venueLabel.toLowerCase())}s</h3>
      <div class="vboxes">${venueCards}</div>
      <h3>All matches</h3>
      ${rounds.join('')}
    </div>`;
  }

  function matchRow(ev, m) {
    let status;
    let actions = '';
    if (m.bye) {
      status = '<span class="badge">BYE</span>';
    } else if (m.status === 'done') {
      const sc = parseScore(m.score);
      const shown = sc ? (m.winner === m.p1 ? `${sc[0]}-${sc[1]}` : `${sc[1]}-${sc[0]}`) : m.score;
      status = `<span class="badge done">✓ ${pname(ev, m.winner)}${shown ? ` (${esc(shown)})` : ''}</span>`;
      actions = `<button class="btn small" data-action="undo" data-ev="${ev.id}" data-mid="${m.id}">↶ Undo</button>`;
    } else if (m.status === 'playing') {
      const v = ev.venues.find((x) => x.id === m.venueId);
      status = `<span class="badge live">LIVE · ${esc(v ? v.name : '')}</span>`;
    } else if (m.status === 'ready') {
      status = m.hold ? '<span class="badge hold">ON HOLD</span>' : '<span class="badge ready">READY</span>';
      actions = (m.hold ? `<button class="btn small" data-action="release" data-ev="${ev.id}" data-mid="${m.id}">Release</button>` : '') +
        `<button class="btn small" data-action="quickWin" data-ev="${ev.id}" data-mid="${m.id}" data-pid="${m.p1}">${pname(ev, m.p1)} won</button>
         <button class="btn small" data-action="quickWin" data-ev="${ev.id}" data-mid="${m.id}" data-pid="${m.p2}">${pname(ev, m.p2)} won</button>`;
    } else {
      status = '<span class="badge">WAITING</span>';
    }
    const side = (pid) => {
      const p = player(ev, pid);
      if (!p) return `<span class="muted">${m.bye && m.round === 1 ? 'bye' : 'TBC'}</span>`;
      const cls = m.status === 'done' && !m.bye ? (m.winner === pid ? 'w' : 'l') : '';
      return `<span class="${cls}">${flag(p.country)} ${esc(p.name)}</span>`;
    };
    return `<div class="mrow"><span class="mid">${m.id}</span><span class="mp">${side(m.p1)} <i>v</i> ${side(m.p2)}</span>${status}<span class="mact">${actions}</span></div>`;
  }

  // ------------------------------------------------------------ ticker
  function renderTicker() {
    const feed = data.state.feed.slice().reverse();
    return `<div class="card">
      <h2>📣 Post to the ticker</h2>
      <p class="muted">Your message scrolls along the bottom of the TV and pops up as a "BREAKING" banner.</p>
      <form class="tickform"><textarea id="tick-text" rows="2" maxlength="280" placeholder="e.g. Taxi for Dave! Rumours of a comeback are greatly exaggerated…"></textarea>
      <button class="btn primary">Post it</button></form>
      <div class="tools">${QUICK.map((q, i) => `<button class="btn small" data-action="quickTick" data-i="${i}">${esc(q.slice(0, 26))}…</button>`).join('')}</div>
      <h3>Headlines so far (${feed.length})</h3>
      <div class="feed">${feed.map((f) => `<div class="frow"><span class="ft">${new Date(f.ts).toTimeString().slice(0, 5)}</span><span class="fx">${esc(f.text)}</span><button class="x" data-action="delFeed" data-id="${f.id}" title="Delete">✕</button></div>`).join('') || '<p class="muted">Results will appear here automatically.</p>'}</div>
    </div>`;
  }
  const QUICK = ['🍕 FOOD IS SERVED. Pundits agree: get in there before the darts players.', '🎂 CAKE ALERT: Birthday cake in 5 minutes. Attendance is mandatory.',
    '🏁 LAST CALL: if your match is up, please head to your table or oche now.', '📸 Group photo in 10 minutes. Wear your best tournament face.', '🎤 SPEECHES incoming. Odds on it running long: 1/5.'];

  // ------------------------------------------------------------ settings
  function renderSettings() {
    const s = data.state.settings;
    const sv = data.server;
    const slideNames = { poolBracket: 'Pool bracket + standings', dartsBracket: 'Darts bracket + standings', nowPlaying: 'Now playing', upNext: 'Up next (flashing names)', pundits: 'Pundits\' verdict & odds', quotes: 'Post-match interviews (once there are some)', stats: 'Stats Centre (from phone-scored games)', qr: 'QR code for phone scoring' };
    return `<div class="cols">
      <div class="card">
        <h2>📺 The show</h2>
        <label>Strapline on the TV<input type="text" id="set-subtitle" data-set="subtitle" value="${esc(s.subtitle)}"></label>
        <label>Birthday star's name <small>(gets special commentary)</small><input type="text" id="set-host" data-set="hostName" value="${esc(s.hostName)}" placeholder="e.g. Rachel"></label>
        <label>Home nation <small>(for "wins in front of a home crowd")</small><select id="set-home" data-set="homeCountry">${countryOptions(s.homeCountry)}</select></label>
        <label>TV colour theme<select id="set-theme" data-set="theme">
          <option value="light" ${s.theme !== 'dark' ? 'selected' : ''}>Light: cream &amp; blush, like the logo</option>
          <option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark: deep plum, for a dim room</option>
        </select></label>
        <label>Seconds per slide<input type="number" min="3" max="120" id="set-secs" data-set="slideSeconds" value="${s.slideSeconds}"></label>
        <h3>Slides to show</h3>
        ${Object.entries(slideNames).map(([k, l]) => `<label class="check"><input type="checkbox" data-slide="${k}" ${s.slides[k] !== false ? 'checked' : ''}> ${l}</label>`).join('')}
        <label>Bracket view<select id="set-bview" data-set="bracketView">
          <option value="auto" ${s.bracketView !== 'full' ? 'selected' : ''}>Auto-zoom: hide finished rounds so the rest is bigger</option>
          <option value="full" ${s.bracketView === 'full' ? 'selected' : ''}>Always show the whole bracket</option>
        </select></label>
        <h3>Scheduling</h3>
        <label class="check"><input type="checkbox" id="set-auto" data-set="autoAssign" ${s.autoAssign ? 'checked' : ''}> Automatically put the next match on a table/oche as soon as it's free</label>
      </div>
      <div class="card">
        <h2>📱 Phone scoring link</h2>
        <p>The QR code sends phones to:</p>
        <p class="url"><a href="${esc(sv.scoreUrl)}" target="_blank">${esc(sv.scoreUrl)}</a></p>
        <p class="muted">Phones must be on the <b>same Wi-Fi</b> as this computer. Detected addresses: ${sv.lan.map((ip) => `<code>${esc(ip)}</code>`).join(', ') || '<b>none found, are you on Wi-Fi?</b>'}</p>
        <label>Override address <small>(only if the QR code doesn't work, e.g. http://192.168.1.20:${sv.port})</small>
          <input type="text" id="set-url" data-set="publicUrl" value="${esc(s.publicUrl)}" placeholder="Automatic"></label>
        <p><button class="btn primary" data-action="poster">⬇ Download QR poster (JPEG)</button></p>
        <p class="hint">Make the poster on the night, once the laptop is on the party Wi-Fi: the scorer address depends on the network.</p>

        <h2>💾 Backup &amp; restore</h2>
        <p class="muted">Everything is saved to disk the moment it changes, with a timestamped backup of every change in<br><code>${esc(sv.dataDir)}</code></p>
        <p><a class="btn" href="/api/backup">⬇ Download a backup file</a></p>
        <label>Restore from a backup file<input type="file" id="restore" accept=".json,application/json"></label>
        <h3 class="danger-h">Danger zone</h3>
        <button class="btn danger" data-action="newTournament">🗑 Start a brand new tournament</button>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------ events
  function evOf(el) {
    return data.state.events[el.dataset.ev];
  }

  function savePlayers(ev, players) {
    return act('setPlayers', { eventId: ev.id, players });
  }

  function parsePaste(text) {
    const byName = {};
    for (const [c, n] of Countries.COUNTRIES) byName[n.toLowerCase()] = c;
    Object.assign(byName, { scotland: 'gb-sct', england: 'gb-eng', wales: 'gb-wls', 'northern ireland': 'gb-nir', uk: 'gb', usa: 'us', america: 'us' });
    return text.split(/\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const parts = line.split(/[,\t]/).map((x) => x.trim());
      let country = '';
      let seed = null;
      const song = [];
      for (const part of parts.slice(1)) {
        if (!part) continue;
        if (/^\d+$/.test(part) && seed === null && !song.length) seed = Number(part);
        else if (!country && !song.length && byName[part.toLowerCase()]) country = byName[part.toLowerCase()];
        else if (!country && !song.length && Countries.COUNTRIES.some((c) => c[0] === part.toLowerCase())) country = part.toLowerCase();
        else song.push(part);
      }
      // Anything that isn't a country or seed is the walk-on song (commas allowed).
      return { name: parts[0], country: country || data.state.settings.homeCountry, seed, walkon: song.join(', ') };
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    const f = e.target;
    if (f.classList.contains('addp')) {
      const ev = evOf(f);
      const nameEl = document.getElementById(`add-name-${ev.id}`);
      const name = nameEl.value.trim();
      if (!name) return nameEl.focus();
      if (ev.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast(`${name} is already in the ${ev.name}.`, true);
      const country = document.getElementById(`add-country-${ev.id}`).value;
      const seedEl = document.getElementById(`add-seed-${ev.id}`);
      const songEl = document.getElementById(`add-song-${ev.id}`);
      const ok = await savePlayers(ev, ev.players.concat([{ name, country, seed: seedEl.value, walkon: songEl.value }]));
      if (ok) {
        nameEl.value = '';
        seedEl.value = '';
        songEl.value = '';
        nameEl.focus();
        // Show the new player straight away even though the name box keeps focus.
        if (pending) { pending = false; render(); }
      }
    } else if (f.classList.contains('tickform')) {
      const t = document.getElementById('tick-text');
      if (t.value.trim() && await act('addFeed', { text: t.value })) {
        t.value = '';
        toast('Posted to the ticker');
      }
    }
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset.score) {
      const k = el.dataset.score;
      scoreDraft[k] = scoreDraft[k] || ['', ''];
      scoreDraft[k][Number(el.dataset.i)] = el.value;
    }
  }

  async function onChange(e) {
    const el = e.target;
    if (el.dataset.field && el.dataset.pid) {
      const ev = evOf(el);
      const players = ev.players.map((p) => (p.id === el.dataset.pid ? { ...p, [el.dataset.field]: el.value } : p));
      await savePlayers(ev, players);
    } else if (el.dataset.field === 'venue') {
      const ev = evOf(el);
      await act('setVenues', { eventId: ev.id, venues: ev.venues.map((v) => (v.id === el.dataset.vid ? { ...v, name: el.value } : v)) });
    } else if (el.dataset.set) {
      const k = el.dataset.set;
      const val = el.type === 'checkbox' ? el.checked : el.value;
      if (await act('saveSettings', { settings: { [k]: val } })) toast('Saved');
    } else if (el.dataset.slide) {
      await act('saveSettings', { settings: { slides: { [el.dataset.slide]: el.checked } } });
    } else if (el.id === 'restore' && el.files[0]) {
      const text = await el.files[0].text();
      let st;
      try { st = JSON.parse(text); } catch (err) { return toast('That file is not a backup.', true); }
      if (confirm('Replace EVERYTHING with this backup?')) {
        if (await act('importState', { state: st })) toast('Backup restored');
      }
      el.value = '';
    }
  }

  async function onClick(e) {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    const ev = b.dataset.ev ? evOf(b) : null;
    if (a === 'view') {
      view = b.dataset.view;
      try { localStorage.setItem('c30-view', view); } catch (err) { /* ignore */ }
      render();
    } else if (a === 'removePlayer') {
      await savePlayers(ev, ev.players.filter((p) => p.id !== b.dataset.pid));
    } else if (a === 'togglePaste') {
      pasteOpen[ev.id] = !pasteOpen[ev.id];
      render();
    } else if (a === 'pastePlayers') {
      const list = parsePaste(document.getElementById(`paste-${ev.id}`).value);
      const have = new Set(ev.players.map((p) => p.name.toLowerCase()));
      const add = list.filter((p) => !have.has(p.name.toLowerCase()));
      if (await savePlayers(ev, ev.players.concat(add))) {
        pasteOpen[ev.id] = false;
        toast(`Added ${add.length} player${add.length === 1 ? '' : 's'}`);
        render();
      }
    } else if (a === 'copyPlayers') {
      const other = ev.id === 'pool' ? data.state.events.darts : data.state.events.pool;
      const have = new Set(ev.players.map((p) => p.name.toLowerCase()));
      const add = other.players.filter((p) => !have.has(p.name.toLowerCase())).map((p) => ({ name: p.name, country: p.country, seed: null, walkon: p.walkon || '' }));
      if (await savePlayers(ev, ev.players.concat(add))) toast(`Copied ${add.length} players (seeds not copied)`);
    } else if (a === 'addVenue') {
      await act('setVenues', { eventId: ev.id, venues: ev.venues.concat([{ name: `${ev.venueLabel} ${ev.venues.length + 1}` }]) });
    } else if (a === 'removeVenue') {
      if (ev.venues.length <= 1) return toast(`You need at least one ${ev.venueLabel.toLowerCase()}.`, true);
      await act('setVenues', { eventId: ev.id, venues: ev.venues.filter((v) => v.id !== b.dataset.vid) });
    } else if (a === 'generate') {
      if (confirm(`Make the ${ev.name} draw with ${ev.players.length} players?\n\nYou can still fix names and countries afterwards.`)) {
        if (await act('generate', { eventId: ev.id })) {
          toast(`${ev.name} draw made! 🎉`);
        }
      }
    } else if (a === 'redraw') {
      const done = ev.matches.filter((m) => m.status === 'done' && !m.bye).length;
      if (!confirm(`Redraw the ${ev.name} bracket?${done ? `\n\n⚠️ This wipes ${done} result(s) already entered.` : ''}`)) return;
      if (done && prompt(`Type REDRAW to confirm wiping ${done} result(s)`) !== 'REDRAW') return;
      await act('resetEvent', { eventId: ev.id });
    } else if (a === 'win' || a === 'quickWin') {
      const m = ev.matches.find((x) => x.id === b.dataset.mid);
      const k = `${ev.id}:${m.id}`;
      const d = scoreDraft[k] || ['', ''];
      const score = d[0] !== '' && d[1] !== '' ? `${d[0]}-${d[1]}` : '';
      const w = player(ev, b.dataset.pid);
      const l = player(ev, b.dataset.pid === m.p1 ? m.p2 : m.p1);
      if (!confirm(`${w.name} beat ${l.name}${score ? ` (${score})` : ''}?`)) return;
      if (await act('result', { eventId: ev.id, matchId: m.id, winnerId: w.id, score })) {
        delete scoreDraft[k];
        toast(`${w.name} goes through!`);
      }
    } else if (a === 'undo') {
      const m = ev.matches.find((x) => x.id === b.dataset.mid);
      const later = ev.matches.find((x) => x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2));
      const warn = later && later.status === 'done' ? '\n\n⚠️ The next-round match has already been played. That result will be undone too.' : '';
      if (confirm(`Undo the result of ${pname(ev, m.p1)} v ${pname(ev, m.p2)}?${warn}`)) await act('resetMatch', { eventId: ev.id, matchId: m.id });
    } else if (a === 'hold') {
      await act('holdMatch', { eventId: ev.id, matchId: b.dataset.mid, hold: true });
    } else if (a === 'release') {
      await act('holdMatch', { eventId: ev.id, matchId: b.dataset.mid, hold: false });
    } else if (a === 'startHere') {
      const sel = document.getElementById(`start-${b.dataset.vid}`);
      await act('startMatch', { eventId: ev.id, matchId: sel.value, venueId: b.dataset.vid });
    } else if (a === 'quickTick') {
      if (await act('addFeed', { text: QUICK[Number(b.dataset.i)] })) toast('Posted to the ticker');
    } else if (a === 'poster') {
      const url = await posterDataUrl();
      const link = document.createElement('a');
      link.href = url;
      link.download = 'club-thirty-scorer-qr.jpg';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else if (a === 'addRel') {
      const A = document.getElementById('rel-a').value;
      const B = document.getElementById('rel-b').value;
      const type = document.getElementById('rel-type').value;
      if (!A || !B || A === B) return toast('Pick two different players', true);
      const rels = (data.state.relationships || []).filter((r) => !((r.a === A && r.b === B) || (r.a === B && r.b === A)));
      if (await act('setRelationships', { relationships: rels.concat([{ a: A, b: B, type }]) })) toast('Added. The pundits have been briefed.');
    } else if (a === 'delRel') {
      await act('setRelationships', { relationships: (data.state.relationships || []).filter((r) => r.id !== b.dataset.id) });
    } else if (a === 'delFeed') {
      await act('deleteFeed', { id: b.dataset.id });
    } else if (a === 'newTournament') {
      if (confirm('Start a brand new tournament? All players, brackets and results will be cleared.') &&
        prompt('Type NEW to confirm. (A backup of the current tournament is kept in the backups folder.)') === 'NEW') {
        await act('newTournament', {});
        view = 'setup';
      }
    }
  }

  // ------------------------------------------------------------ printable QR poster
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function drawQr(ctx, text, x, y, size) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    const cell = size / (n + quiet * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  // A4 portrait poster (150 dpi): logo, instructions and the scorer code.
  async function posterDataUrl(opts = {}) {
    const url = opts.url || data.server.scoreUrl;
    const W = 1240;
    const H = 1754;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    try { await Promise.all(['700 60px Montserrat', '600 40px Montserrat', '700 60px "Barlow Condensed"'].map((f) => document.fonts.load(f))); } catch (e) { /* fall back */ }
    ctx.fillStyle = '#fbf4f1';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#a84d68';
    ctx.fillRect(0, 0, W, 18);
    ctx.fillRect(0, H - 18, W, 18);
    const logo = await loadImage('/img/club-thirty.png');
    if (logo) {
      const lh = 280;
      const lw = (logo.width / logo.height) * lh;
      ctx.drawImage(logo, (W - lw) / 2, 70, lw, lh);
    }
    const centre = (text, y, font, colour) => {
      ctx.font = font;
      ctx.fillStyle = colour;
      ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, y);
    };
    centre('KEEP SCORE ON YOUR PHONE', 430, '700 54px Montserrat, Arial', '#5e7a55');
    let y = 490;
    const step = (num, title, sub) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#a84d68';
      ctx.beginPath();
      ctx.arc(150, y + 30, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '700 40px Montserrat, Arial';
      ctx.textAlign = 'center';
      ctx.fillText(String(num), 150, y + 44);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#4a2232';
      ctx.font = '700 42px Montserrat, Arial';
      ctx.fillText(title, 210, y + 30);
      if (sub) {
        ctx.font = '600 32px Montserrat, Arial';
        ctx.fillStyle = '#8d6170';
        ctx.fillText(sub, 210, y + 76);
      }
    };
    step(1, 'Connect to the guest Wi-Fi', 'You need to be on it to use the scorer');
    y += 150;
    step(2, 'Scan to open the scorer', 'Pick your match: the rules are set up for you');
    const qs = 640;
    drawQr(ctx, url, (W - qs) / 2, y + 110, qs);
    y += 110 + qs + 60;
    centre(url, y, '600 34px Montserrat, Arial', '#a84d68');
    centre('Darts & Pool Championship', H - 60, '600 30px Montserrat, Arial', '#5e7a55');
    return c.toDataURL('image/jpeg', 0.92);
  }

  return { init, posterDataUrl };
})();
