// Crash-safe persistence. Every change is written to data/state.json via a temp
// file + rename (so a power cut mid-write can never leave a half-written file),
// and a timestamped copy goes into data/backups/ so any moment of the night can
// be restored.
const fs = require('fs');
const path = require('path');

const MAX_BACKUPS = 300;

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'state.json');
    this.backupDir = path.join(dir, 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.liveTimer = null;
  }

  load() {
    const tryRead = (f) => {
      try {
        const s = JSON.parse(fs.readFileSync(f, 'utf8'));
        return s && s.events && s.settings ? s : null;
      } catch {
        return null;
      }
    };
    const main = tryRead(this.file);
    if (main) return main;
    // Main file missing or damaged: fall back to the newest good backup.
    for (const f of this.backups().reverse()) {
      const s = tryRead(path.join(this.backupDir, f));
      if (s) {
        console.warn(`state.json unreadable, restored from backup ${f}`);
        return s;
      }
    }
    return null;
  }

  backups() {
    return fs.readdirSync(this.backupDir).filter((f) => f.endsWith('.json')).sort();
  }

  writeAtomic(file, data) {
    const tmp = `${file}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    try {
      fs.renameSync(tmp, file);
    } catch (e) {
      // Windows can briefly lock files (antivirus, indexer). Fall back to a direct write.
      fs.writeFileSync(file, data);
      fs.rmSync(tmp, { force: true });
    }
  }

  save(state, { backup = true } = {}) {
    const data = JSON.stringify(state, null, 1);
    this.writeAtomic(this.file, data);
    if (!backup) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.writeAtomic(path.join(this.backupDir, `state-${stamp}.json`), data);
    const all = this.backups();
    for (const f of all.slice(0, Math.max(0, all.length - MAX_BACKUPS))) {
      fs.rmSync(path.join(this.backupDir, f), { force: true });
    }
  }

  // Live score ticks (every dart) are frequent; batch them into one write.
  saveSoon(state) {
    clearTimeout(this.liveTimer);
    this.liveTimer = setTimeout(() => this.save(state, { backup: false }), 1000);
  }
}

module.exports = Store;
