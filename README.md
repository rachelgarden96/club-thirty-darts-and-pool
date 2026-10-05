# 🎯🎱 Club Thirty: Darts & Pool Championship

A live tournament system for the Club Thirty darts and pool championships. It runs on one laptop plugged into the TV:

- **📺 TV Display**: slides that rotate every 10 seconds, styled like a Sky Sports parody, in the Club Thirty colours, with a scrolling ticker of commentary, results and fake odds.
- **🎛️ Control Room**: add players (with flags and seeds), tables and oches, make the draw, and enter who won.
- **📱 Phone Scorer**: guests scan a QR code on the TV to keep score. It's a darts counter for 180, 301 and 501 (singles, doubles, trebles and bulls) plus a pool frame counter. When the game ends, the winner goes straight into the bracket.

Everything is saved to disk the moment it changes, so nothing is lost if the browser or the laptop crashes.

---

## Getting started

1. Install **Node.js** (the "LTS" version) from <https://nodejs.org>. You only do this once.
2. Download this folder to the laptop that will drive the TV.
3. Double-click:
   - **Mac:** `start-mac.command` (the first time, right-click it and choose *Open*)
   - **Windows:** `start-windows.bat`. If Windows Firewall asks, tick **Private networks** and click **Allow**, or phones won't be able to connect.
   - Or run `npm start` in a terminal.
4. Your browser opens at <http://localhost:3030>. Keep the black terminal window open all night, because that window is the server.

> No internet is needed on the night. Flags, fonts and the QR code are all bundled. Phones only need to be on the **same Wi-Fi** as the laptop.

## Setting up (before guests arrive)

In **🎛️ Control Room → 1. Players & tables**, for both Pool and Darts:

1. **Add players** with their full name, country and an optional seed (1 = top seed). Seeds 1 and 2 can only meet in the final, and the top seeds get any byes.
   - Add their **walk-on song** too, if they've chosen one. It appears under their name on the *Up Next* and *Now Playing* slides, gets a "WALK-ON WATCH" ticker line, and shows in the Control Room so whoever's on music duty can cue it. (No sound is played by the app.)
   - **📋 Paste a list** accepts one player per line, e.g. `Jamie Smith, Scotland, 1, Mr Brightside` (seed and song are optional)
   - **⇄ Copy players** copies the players from the other event.
2. **Add tables and oches**, and rename them however you like ("The Big Table", "Oche by the Bar"…).
3. Click **🎲 Make the draw**. Any player count works; odd numbers get byes automatically.

In **⚙️ Settings & backup**, pick the **TV colour theme** (*Light*: cream and blush like the logo, or *Dark*: deep wine for a dim room), set the **birthday star's name** (for special commentary) and the **home nation** (for "wins in front of a home crowd!" lines).

## On the night

- Put the laptop on the TV and click **⛶ Full screen** (or press **F**).
  - Tip: if the TV is a second screen, open <http://localhost:3030/display> in a separate window on the TV and keep the Control Room on the laptop screen.
- **Matches are put on tables automatically.** When a table or oche frees up, the next match in the queue goes on it. Somebody entered in both pool and darts is never called to two places at once.
- **Entering results:** go to **Control Room → 2. Run the night**, optionally type the score, and click **🏆 the winner**. You can also enter results from a phone at `http://<laptop>:3030/control`.
- **Mistakes:** click **↶ Undo** on any match. If later rounds depended on it, those are undone too.
- **Not ready?** Use **⏸ send back to queue** and the next match takes the table instead.
- **📣 Ticker:** post your own messages ("Pizza's here!"). They scroll along the bottom and pop up as a BREAKING banner.

### TV slides

| Slide | What's on it |
|---|---|
| Pool bracket | Bracket with live and up-next tags, plus a "still standing" board with fake odds |
| Now playing | Every table and oche, with live darts scores from phones |
| Darts bracket | As above, for darts |
| Up next | Who's on next at each table and oche, names flashing |
| Pundits' verdict | Player to watch, dark horse, and who's showing promise, with "expert" quotes |
| QR code | Scan to keep score on your phone |
| Champion | Confetti, flag, glory (appears when a final is won) |

Turn slides on or off and change the 10-second timing in **Settings**. On the display, **← →** changes slide and **Space** pauses.

### Phone scorer

Guests scan the QR code, then:

1. Pick their match from the list (or start a free game).
2. Choose **180 / 301 / 501**, the number of legs, and whether you must finish on a double.
3. Tap **Single / Double / Treble** and then the number, or **25 / BULL / MISS**. **Undo** fixes mis-taps, busts are detected automatically, and checkout suggestions appear (e.g. "T20 T20 BULL").
4. At the end, tap **📺 Send result to the bracket**.

The remaining scores show live on the TV's *Now Playing* slide. If a phone dies, someone else can pick the same match and carry on from the live score.

## House rules (set up automatically on the phones)

| Round | Darts | Pool |
|---|---|---|
| Up to and including the Last 16 | 180, finish on anything, no bust (going past zero wins) | One frame, 15-minute limit |
| Quarter-finals | 301, finish on anything, bust rule | One frame, 15-minute limit |
| Semi-finals | 301, finish on anything, bust rule | One frame, no time limit |
| Final | 501, must finish on a double | One frame, no time limit |

When players pick their match on the phone, the right rules are already set: they just see a summary and press start. For timed pool frames, they agree to the 15-minute limit before the clock starts, keep count of balls potted, and if nobody has won when the time runs out, whoever has potted the most balls wins automatically. The countdown also shows on the TV. The rules live in `public/js/rules.js` if you ever want to change them.

After a match, both players can give a **post-match interview** from the phone. Their quotes pop up on the TV, scroll on the ticker (with a pundit's reaction) and appear on a *Post-match interviews* slide.

**Relationships and rivalries:** at the bottom of *Players & tables* you can tell the pundits who's a couple, siblings, best mates, housemates, workmates, family or sworn rivals. The commentary picks up on it when they play each other (or could meet later).

**Bracket zoom:** by default the bracket hides rounds once they're finished, so the rest of the tournament gets bigger on the TV. To always show the whole bracket, change *Bracket view* in **Settings**.

## Never lose the standings

- Every change is written to `data/state.json` using a crash-safe write, and a timestamped copy goes into `data/backups/` (the last 300 are kept).
- If the laptop restarts, just double-click the start file again. Everything picks up where it left off.
- If the main file is ever damaged, the newest good backup is loaded automatically.
- **Settings → ⬇ Download a backup** saves a copy anywhere (USB stick, phone). **Restore** loads one back.
- Do a practice run beforehand, then **Settings → Start a brand new tournament** to clear it (the old one stays in backups).

## Troubleshooting

| Problem | Fix |
|---|---|
| QR code doesn't open on phones | Make sure the phone is on the same Wi-Fi. On Windows, allow Node through the firewall. Some venue or guest Wi-Fi blocks devices from seeing each other; use a phone hotspot or home router instead. |
| QR shows the wrong address | The laptop might have several network connections. Set **Settings → Override address**, e.g. `http://192.168.1.20:3030`. The terminal window lists the addresses. |
| Port 3030 is in use | Start with a different port: `PORT=4000 npm start` (Mac) or `set PORT=4000 && node server.js` (Windows). |
| Laptop goes to sleep | The display asks the browser to keep the screen awake, but it's also worth turning off sleep in your power settings for the night. |

## Branding

The Club Thirty logos and palette (deep rose `#A84D68`, deep sage `#5E7A55`, blush `#F2B8C6`, rose `#D98A9E`, sage `#A7C4A0`, gold `#CDA85A`) are used throughout. The original logo files are in `branding/`. The transparent versions in `public/img/` (one set for light backgrounds, one for dark) were cut from them. The colours are defined once at the top of `public/css/base.css`.

## For developers

- No dependencies: `node server.js` and that's it. Requires Node 18+.
- `npm test` runs the bracket engine tests.
- `lib/tournament.js` handles bracket generation, seeding, results, undo and scheduling. `lib/store.js` handles persistence. `public/js/commentary.js` holds the commentary lines and odds.
- Third-party assets: [flag-icons](https://github.com/lipis/flag-icons) (MIT), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), plus [Montserrat](https://fonts.google.com/specimen/Montserrat) and [Barlow Condensed](https://fonts.google.com/specimen/Barlow+Condensed) (OFL).
