// =====================================================================
//  GAME FEEL CONSTANTS  —  change these to tune how the game feels.
//  (The level itself lives in level.js.)
// =====================================================================
const TILE            = 32;    // size of one map character, in pixels
const GRAVITY         = 1500;  // px/s²  — higher = heavier, faster falls
const JUMP_VELOCITY   = 700;   // px/s   — jump strength (~5.1 tiles high)
const JUMP_CUT        = 0.45;  // releasing jump early keeps this much upward speed (short hop)
const MAX_FALL_SPEED  = 900;   // px/s   — terminal velocity
const RUN_SPEED       = 230;   // px/s   — top horizontal speed
const RUN_ACCEL       = 1800;  // px/s²  — how fast you reach top speed on the ground
const AIR_ACCEL       = 1700;  // px/s²  — steering while in the air
const GROUND_FRICTION = 2200;  // px/s²  — how fast you stop when no key is held
const COYOTE_MS       = 100;   // ms you can still jump after walking off a ledge
const JUMP_BUFFER_MS  = 120;   // ms a jump press is remembered before landing
const STOMP_BOUNCE    = 480;   // px/s   — bounce after landing on a bat
const BAT_SPEED       = 1.2;   // rad/s  — how fast bats move back and forth
const BAT_RANGE       = 2;     // tiles  — how far bats fly from their start
const CAMERA_LOOKAHEAD= 170;   // px     — camera shows this much more space ahead of you
const CAMERA_LERP     = 0.12;  // 0..1   — camera smoothing (1 = rigid)
const RESTART_DELAY_MS= 350;   // ms     — time from death to respawn (< 1 s)
const VIEW_W = 960, VIEW_H = 512;

// =====================================================================
//  LEVEL PARSING
// =====================================================================
const ROWS = LEVEL_MAP.trim().split('\n').map(r => r.trim());
const MAP_W = ROWS[0].length, MAP_H = ROWS.length;
ROWS.forEach((r, i) => { if (r.length !== MAP_W) console.warn(`level.js row ${i} has length ${r.length}, expected ${MAP_W}`); });
const cell = (c, r) => (r >= 0 && r < MAP_H && c >= 0 && c < MAP_W) ? ROWS[r][c] : '.';
const each = (ch, fn) => ROWS.forEach((row, r) => [...row].forEach((v, c) => { if (v === ch) fn(c, r); }));
const center = (c, r) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });

let TOTAL_COINS = 0; each('o', () => TOTAL_COINS++); each('?', () => TOTAL_COINS++);
const START = (() => { let p = { c: 2, r: 11 }; each('P', (c, r) => p = { c, r }); return p; })();
const CHECKPOINTS = []; each('C', (c, r) => CHECKPOINTS.push({ c, r })); CHECKPOINTS.sort((a, b) => a.c - b.c);

const PARAMS = new URLSearchParams(location.search);
const VIEW = PARAMS.get('view');          // ?view=all | 1 | 2 | 3  -> static screenshots
const START_AT = parseInt(PARAMS.get('start') || '1', 10); // ?start=2 -> begin at checkpoint 1

// Run state that survives a respawn.
const run = {
  reset() {
    const cp = START_AT > 1 ? CHECKPOINTS[START_AT - 2] : null;
    this.spawn = cp ? { ...cp } : { ...START };
    this.cpIndex = cp ? START_AT - 2 : -1;
    this.collected = new Set(); this.coins = 0; this.star = false;
    this.saved = { collected: new Set(), coins: 0, star: false };
    this.deaths = 0; this.startTime = performance.now(); this.endTime = 0;
  },
  checkpoint(i, c, r) {
    if (i <= this.cpIndex) return false;
    this.cpIndex = i; this.spawn = { c, r };
    this.saved = { collected: new Set(this.collected), coins: this.coins, star: this.star };
    return true;
  },
  restore() {
    this.collected = new Set(this.saved.collected); this.coins = this.saved.coins; this.star = this.saved.star;
  },
};

// =====================================================================
//  SOUND  (tiny synth, no audio files)
// =====================================================================
const Sfx = {
  ctx: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state !== 'running') this.ctx.resume();
    } catch (e) {}
  },
  tone(f0, f1, dur, type = 'square', vol = 0.12, delay = 0) {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') { this.ctx.resume(); } // browser may pause audio (tab switch, headphones…)
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur);
  },
  jump()  { this.tone(380, 700, 0.12, 'square', 0.07); },
  coin()  { this.tone(988, 988, 0.06, 'square', 0.08); this.tone(1319, 1319, 0.12, 'square', 0.08, 0.06); },
  star()  { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.14, i * 0.07)); },
  bump()  { this.tone(180, 120, 0.08, 'square', 0.1); },
  stomp() { this.tone(500, 140, 0.14, 'square', 0.1); },
  hurt()  { this.tone(300, 60, 0.32, 'sawtooth', 0.12); },
  check() { this.tone(660, 660, 0.08, 'triangle', 0.12); this.tone(880, 880, 0.14, 'triangle', 0.12, 0.08); },
  win()   { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, f, 0.16, 'triangle', 0.14, i * 0.11)); },
};
// Chrome only lets audio start/resume inside a real key press or click,
// so wake the sound on every one (not just on the title screen).
['keydown', 'pointerdown', 'touchstart'].forEach(ev => window.addEventListener(ev, () => Sfx.init(), true));
document.addEventListener('visibilitychange', () => { if (!document.hidden && Sfx.ctx) Sfx.ctx.resume(); });

// =====================================================================
//  BOOT: draw every texture in code (no image files needed)
// =====================================================================
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() {
    const T = TILE;
    // Tileset strip: 0 grass, 1 dirt, 2 stone block, 3 crate
    const tiles = this.textures.createCanvas('tiles', T * 4, T), x = tiles.getContext();
    // dirt base
    for (const i of [0, 1]) {
      x.fillStyle = '#8a5a33'; x.fillRect(i * T, 0, T, T);
      x.fillStyle = '#74492a';
      [[5, 9], [19, 5], [24, 21], [9, 25], [15, 15]].forEach(([a, b]) => x.fillRect(i * T + a, b, 4, 3));
    }
    x.fillStyle = '#5cc15a'; x.fillRect(0, 0, T, 9);
    x.fillStyle = '#3f9a40'; x.fillRect(0, 9, T, 3);
    x.fillStyle = '#7ad877'; x.fillRect(0, 0, T, 3);
    // stone block
    x.fillStyle = '#9aa3ad'; x.fillRect(2 * T, 0, T, T);
    x.fillStyle = '#c3cad1'; x.fillRect(2 * T, 0, T, 3); x.fillRect(2 * T, 0, 3, T);
    x.fillStyle = '#6c7680'; x.fillRect(2 * T, T - 3, T, 3); x.fillRect(3 * T - 3, 0, 3, T);
    x.fillStyle = '#7f8993'; x.fillRect(2 * T + 8, 14, 16, 2);
    // crate
    x.fillStyle = '#c9893d'; x.fillRect(3 * T, 0, T, T);
    x.strokeStyle = '#7a4d1c'; x.lineWidth = 3; x.strokeRect(3 * T + 1.5, 1.5, T - 3, T - 3);
    x.beginPath(); x.moveTo(3 * T + 3, 3); x.lineTo(4 * T - 3, T - 3); x.moveTo(4 * T - 3, 3); x.lineTo(3 * T + 3, T - 3); x.stroke();
    tiles.refresh();

    const g = this.make.graphics({ add: false });
    const tex = (key, w, h, draw) => { g.clear(); draw(g); g.generateTexture(key, w, h); };

    // Player: a ball (the circle from the paper prototype)
    tex('player', 28, 28, g => {
      g.fillStyle(0x222233); g.fillCircle(14, 14, 14);
      g.fillStyle(0xff7a3d); g.fillCircle(14, 14, 12);
      g.fillStyle(0xffb07a); g.fillCircle(10, 9, 4);
      g.fillStyle(0xffffff); g.fillEllipse(17, 12, 6, 8); g.fillEllipse(23, 12, 5, 8);
      g.fillStyle(0x222233); g.fillCircle(18, 13, 2); g.fillCircle(23.5, 13, 2);
    });
    tex('coin', 20, 20, g => {
      g.fillStyle(0xb8860b); g.fillCircle(10, 10, 10);
      g.fillStyle(0xffd23f); g.fillCircle(10, 10, 8);
      g.fillStyle(0xfff1a8); g.fillRect(8, 4, 3, 12);
    });
    tex('glow', 64, 64, g => {
      for (let i = 16; i > 0; i--) { g.fillStyle(0xfff1a8, 0.035 * (17 - i) / 3); g.fillCircle(32, 32, i * 2); }
    });
    tex('star', 36, 36, g => {
      const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 7.5 : 17; pts.push({ x: 18 + Math.cos(a) * rr, y: 18 + Math.sin(a) * rr }); }
      g.fillStyle(0xb8860b); g.fillPoints(pts, true);
      g.fillStyle(0xffe34d); g.fillPoints(pts.map(p => ({ x: 18 + (p.x - 18) * 0.82, y: 18 + (p.y - 18) * 0.82 })), true);
      g.fillStyle(0x222233); g.fillRect(14, 15, 2, 5); g.fillRect(20, 15, 2, 5);
    });
    tex('starslot', 36, 36, g => {
      const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 7.5 : 17; pts.push({ x: 18 + Math.cos(a) * rr, y: 18 + Math.sin(a) * rr }); }
      g.lineStyle(2, 0xffffff, 0.7); g.strokePoints(pts, true);
    });
    tex('spike', T, T, g => {
      g.fillStyle(0x7a1010); for (let i = 0; i < 3; i++) g.fillTriangle(i * 11 - 1, T, i * 11 + 5, 10, i * 11 + 12, T);
      g.fillStyle(0xff3b3b); for (let i = 0; i < 3; i++) g.fillTriangle(i * 11 + 1, T, i * 11 + 5, 13, i * 11 + 10, T);
      g.fillStyle(0xffffff); for (let i = 0; i < 3; i++) g.fillRect(i * 11 + 4, 13, 2, 3);
    });
    for (const [key, up] of [['bat0', true], ['bat1', false]]) {
      tex(key, 40, 28, g => {
        g.fillStyle(0x7a0f2a);
        if (up) { g.fillTriangle(20, 15, 0, 2, 8, 20); g.fillTriangle(20, 15, 40, 2, 32, 20); }
        else { g.fillTriangle(20, 13, 0, 24, 9, 10); g.fillTriangle(20, 13, 40, 24, 31, 10); }
        g.fillStyle(0xe0284f); g.fillCircle(20, 15, 9);
        g.fillTriangle(13, 9, 15, 2, 18, 8); g.fillTriangle(27, 9, 25, 2, 22, 8);
        g.fillStyle(0xffe14d); g.fillCircle(16.5, 14, 2.5); g.fillCircle(23.5, 14, 2.5);
        g.fillStyle(0xffffff); g.fillTriangle(17, 19, 19, 19, 18, 22); g.fillTriangle(21, 19, 23, 19, 22, 22);
      });
    }
    tex('qblock', T, T, g => {
      g.fillStyle(0x8a5a00); g.fillRect(0, 0, T, T);
      g.fillStyle(0xffb627); g.fillRect(2, 2, T - 4, T - 4);
      g.fillStyle(0xffe08a); g.fillRect(2, 2, T - 4, 3);
      g.fillStyle(0x8a5a00); g.fillRect(12, 8, 8, 3); g.fillRect(18, 8, 3, 8); g.fillRect(14, 15, 6, 3); g.fillRect(14, 15, 3, 4); g.fillRect(14, 22, 3, 3);
    });
    tex('qused', T, T, g => {
      g.fillStyle(0x4a3a2a); g.fillRect(0, 0, T, T); g.fillStyle(0x7a6450); g.fillRect(2, 2, T - 4, T - 4);
    });
    tex('platform', T, 12, g => {
      g.fillStyle(0x5b3a1e); g.fillRect(0, 0, T, 12);
      g.fillStyle(0xd9a066); g.fillRect(0, 0, T, 8); g.fillStyle(0xf2c28d); g.fillRect(0, 0, T, 2);
      g.fillStyle(0x5b3a1e); g.fillRect(T - 2, 0, 2, 12);
    });
    for (const [key, col] of [['cpoff', 0x9aa3ad], ['cpon', 0x3ddc84]]) {
      tex(key, T, T * 2, g => {
        g.fillStyle(0x444455); g.fillRect(14, 4, 4, T * 2 - 4); g.fillRect(8, T * 2 - 4, 16, 4);
        g.fillStyle(col); g.fillTriangle(18, 5, 18, 23, 31, 14);
      });
    }
    tex('flag', T * 2, T * 5, g => {
      g.fillStyle(0xeeeeee); g.fillRect(14, 6, 5, T * 5 - 6);
      g.fillStyle(0xffd23f); g.fillCircle(16.5, 6, 6);
      g.fillStyle(0x3ddc84); g.fillTriangle(19, 12, 19, 46, 62, 29);
      g.fillStyle(0x444455); g.fillRect(6, T * 5 - 8, 22, 8);
    });
    tex('dot', 8, 8, g => { g.fillStyle(0xffffff); g.fillCircle(4, 4, 4); });
    tex('hills', 800, 220, g => {
      g.fillStyle(0xffffff, 0.55);
      [[80, 230, 170], [330, 250, 210], [560, 240, 150], [740, 260, 180]].forEach(([cx, cy, r]) => g.fillCircle(cx, cy, r));
      g.fillStyle(0xffffff, 1);
      [[0, 260, 130], [200, 270, 140], [450, 280, 160], [690, 265, 120], [800, 260, 130]].forEach(([cx, cy, r]) => g.fillCircle(cx, cy, r));
    });
    tex('cloud', 600, 160, g => {
      g.fillStyle(0xffffff, 0.8);
      [[90, 60], [430, 40]].forEach(([cx, cy]) => { g.fillEllipse(cx, cy, 90, 34); g.fillEllipse(cx + 30, cy - 12, 60, 34); g.fillEllipse(cx - 28, cy + 2, 54, 26); });
    });
    run.reset();
    this.scene.start(VIEW ? 'Game' : 'Title');
  }
}

// =====================================================================
//  TITLE SCREEN (text allowed here)
// =====================================================================
const FONT = '"Trebuchet MS", "Arial Rounded MT Bold", sans-serif';
class Title extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    this.cameras.main.setBackgroundColor(SECTIONS[0].sky);
    this.add.tileSprite(0, VIEW_H - 220, VIEW_W, 220, 'hills').setOrigin(0).setTint(SECTIONS[0].hills);
    this.add.text(VIEW_W / 2, 120, 'BOING!', { fontFamily: FONT, fontSize: '96px', color: '#ff7a3d', stroke: '#222233', strokeThickness: 10 }).setOrigin(0.5);
    this.add.text(VIEW_W / 2, 200, 'Level 1', { fontFamily: FONT, fontSize: '28px', color: '#222233' }).setOrigin(0.5);
    const ball = this.add.image(VIEW_W / 2, 300, 'player').setScale(2);
    this.tweens.add({ targets: ball, y: 250, duration: 380, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
    this.add.text(VIEW_W / 2, 380, '←  →  move        SPACE  jump', { fontFamily: FONT, fontSize: '24px', color: '#222233' }).setOrigin(0.5);
    const go = this.add.text(VIEW_W / 2, 440, 'Press SPACE to start', { fontFamily: FONT, fontSize: '30px', color: '#ffffff', stroke: '#222233', strokeThickness: 6 }).setOrigin(0.5);
    this.tweens.add({ targets: go, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    let started = false;
    const start = () => { if (started) return; started = true; Sfx.init(); Sfx.coin(); run.reset(); this.scene.start('Game'); };
    this.input.keyboard.once('keydown-SPACE', start);
    this.input.keyboard.once('keydown-ENTER', start);
    this.input.once('pointerdown', start);
  }
}

// =====================================================================
//  GAME
// =====================================================================
class Game extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    const T = TILE, W = MAP_W * T, H = MAP_H * T;
    this.dead = false; this.won = false;
    run.restore();

    // --- background (colour changes per section) ---
    this.skyCol = Phaser.Display.Color.ValueToColor(this.sectionAt(run.spawn.c).sky);
    this.hillCol = Phaser.Display.Color.ValueToColor(this.sectionAt(run.spawn.c).hills);
    this.clouds = this.add.tileSprite(0, 20, VIEW_W, 160, 'cloud').setOrigin(0).setScrollFactor(0);
    this.hills = this.add.tileSprite(0, H - 300, VIEW_W, 220, 'hills').setOrigin(0).setScrollFactor(0);
    // dark void at the bottom: a pit you can fall into looks deep and dangerous
    this.voidG = this.add.graphics().setScrollFactor(0);
    this.voidG.fillGradientStyle(0x0d0f1c, 0x0d0f1c, 0x0d0f1c, 0x0d0f1c, 0.0, 0.0, 1, 1);
    this.voidG.fillRect(0, H - 76, MAP_W * T, 28);
    this.voidG.fillStyle(0x0d0f1c, 1); this.voidG.fillRect(0, H - 48, MAP_W * T, 48);

    // --- solid tiles from the text map ---
    const data = ROWS.map((row, r) => [...row].map((ch, c) => {
      if (ch === '#') return cell(c, r - 1) === '#' ? 1 : 0;
      if (ch === 'B') return 2;
      if (ch === 'X') return 3;
      return -1;
    }));
    const map = this.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const tileset = map.addTilesetImage('tiles', 'tiles', T, T, 0, 0);
    this.layer = map.createLayer(0, tileset, 0, 0);
    this.layer.setCollision([0, 1, 2, 3]);

    // --- one-way platforms ("=" runs merged into one body) ---
    this.platforms = this.physics.add.staticGroup();
    ROWS.forEach((row, r) => {
      for (let c = 0; c < MAP_W; c++) {
        if (row[c] !== '=') continue;
        let e = c; while (row[e + 1] === '=') e++;
        const p = this.add.tileSprite(c * T, r * T, (e - c + 1) * T, 12, 'platform').setOrigin(0);
        this.physics.add.existing(p, true);
        Object.assign(p.body.checkCollision, { down: false, left: false, right: false });
        this.platforms.add(p); c = e;
      }
    });

    // --- question blocks ---
    this.qblocks = this.physics.add.staticGroup();
    each('?', (c, r) => {
      const { x, y } = center(c, r), key = `${c},${r}`;
      const q = this.qblocks.create(x, y, run.collected.has(key) ? 'qused' : 'qblock');
      q.key = key; q.used = run.collected.has(key);
    });

    // --- coins & star (glow + motion = "this is good, get it") ---
    this.coins = this.physics.add.staticGroup();
    each('o', (c, r) => {
      const key = `${c},${r}`; if (run.collected.has(key)) return;
      const { x, y } = center(c, r);
      const glow = this.add.image(x, y, 'glow').setScale(0.7).setBlendMode('ADD').setAlpha(0.6);
      const coin = this.coins.create(x, y, 'coin'); coin.key = key; coin.glow = glow;
      coin.body.setCircle(10);
      this.tweens.add({ targets: coin, scaleX: 0.35, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (c * 70) % 900 });
      this.tweens.add({ targets: glow, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
    });
    this.stars = this.physics.add.staticGroup();
    each('*', (c, r) => {
      const key = `${c},${r}`; if (run.collected.has(key)) return;
      const { x, y } = center(c, r);
      const glow = this.add.image(x, y, 'glow').setScale(1.6).setBlendMode('ADD');
      const s = this.stars.create(x, y, 'star'); s.key = key; s.glow = glow;
      s.body.setCircle(16, 2, 2);
      this.tweens.add({ targets: s, angle: { from: -12, to: 12 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: glow, scale: 2.1, alpha: 0.5, duration: 600, yoyo: true, repeat: -1 });
      this.time.addEvent({ delay: 180, loop: true, callback: () => {
        if (!s.active) return;
        const d = this.add.image(x + Phaser.Math.Between(-18, 18), y + Phaser.Math.Between(-18, 18), 'dot').setScale(0.5).setTint(0xfff1a8);
        this.tweens.add({ targets: d, y: d.y - 14, alpha: 0, scale: 0.1, duration: 600, onComplete: () => d.destroy() });
      } });
    });

    // --- hazards: spikes (red = hurts) ---
    this.spikes = this.physics.add.staticGroup();
    each('^', (c, r) => {
      const { x, y } = center(c, r); const s = this.spikes.create(x, y, 'spike');
      s.body.setSize(T - 8, 14).setOffset(4, T - 14);
    });

    // --- enemies: bats move all the time, so you see the threat before you reach it ---
    this.bats = this.physics.add.group({ allowGravity: false, immovable: true });
    for (const type of ['b', 'v']) each(type, (c, r) => {
      const { x, y } = center(c, r);
      const b = this.bats.create(x, y, 'bat0');
      b.type = type; b.bx = x; b.by = y; b.phase = c; b.alive = true;
      b.body.setSize(26, 16).setOffset(7, 7);
    });

    // --- checkpoints & goal ---
    this.cps = this.physics.add.staticGroup();
    CHECKPOINTS.forEach((cp, i) => {
      const s = this.cps.create(cp.c * T + T / 2, cp.r * T + T - T, i <= run.cpIndex ? 'cpon' : 'cpoff');
      s.index = i; s.cp = cp;
    });
    this.goal = this.physics.add.staticGroup();
    each('F', (c, r) => {
      const f = this.goal.create(c * T + T / 2 + 16, (r + 1) * T - (T * 5) / 2, 'flag');
      f.body.setSize(16, T * 5).setOffset(10, 0);
      this.flag = f;
    });

    // --- player ---
    const sp = center(run.spawn.c, run.spawn.r);
    this.player = this.physics.add.sprite(sp.x, sp.y + 2, 'player');
    this.player.body.setCircle(12, 2, 2);
    this.player.setMaxVelocity(RUN_SPEED * 2, MAX_FALL_SPEED);
    this.player.setCollideWorldBounds(true);
    this.physics.world.gravity.y = GRAVITY;
    this.physics.world.setBounds(0, 0, W, H + 400);
    this.physics.world.setBoundsCollision(true, true, false, false);
    this.facing = 1; this.lastGround = -1e9; this.lastJumpPress = -1e9; this.wasGround = true; this.prevVy = 0;

    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.qblocks, (p, q) => this.hitQ(p, q));
    this.physics.add.overlap(this.player, this.coins, (p, c) => this.getCoin(c));
    this.physics.add.overlap(this.player, this.stars, (p, s) => this.getStar(s));
    this.physics.add.overlap(this.player, this.spikes, () => this.die());
    this.physics.add.overlap(this.player, this.bats, (p, b) => this.touchBat(b));
    this.physics.add.overlap(this.player, this.cps, (p, s) => this.touchCp(s));
    this.physics.add.overlap(this.player, this.goal, () => this.win());

    // --- camera: leads the player so gaps/enemies ahead are visible early ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, H);
    cam.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
    this.look = CAMERA_LOOKAHEAD; cam.setFollowOffset(-this.look, 0);
    cam.fadeIn(150, 255, 255, 255);

    // --- HUD: no text. Just an empty star outline that fills when you find the star. ---
    this.hudSlot = this.add.image(VIEW_W - 30, 30, 'starslot').setScrollFactor(0).setDepth(10);
    this.hudStar = this.add.image(VIEW_W - 30, 30, 'star').setScrollFactor(0).setDepth(11).setVisible(run.star);

    // --- input ---
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard.addKeys({ left: K.LEFT, right: K.RIGHT, a: K.A, d: K.D, up: K.UP, w: K.W, space: K.SPACE, r: K.R });
    this.jumpKeys = [this.keys.space, this.keys.up, this.keys.w];

    if (VIEW) this.setupStaticView();
    window.__scene = this;
  }

  sectionAt(c) { return SECTIONS.find(s => c >= s.from && c <= s.to) || SECTIONS[SECTIONS.length - 1]; }

  // ?view=all|1|2|3 : freeze and frame the whole level or one section (for screenshots)
  setupStaticView() {
    this.physics.pause(); this.player.setVisible(VIEW === '1');
    const s = VIEW === 'all' ? { from: 0, to: MAP_W - 1 } : SECTIONS[parseInt(VIEW, 10) - 1];
    const cam = this.cameras.main; cam.stopFollow(); cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setScroll(s.from * TILE, 0);
    const col = Phaser.Display.Color.ValueToColor(this.sectionAt(s.from).sky);
    cam.setBackgroundColor(col);
    this.hills.setTint(this.sectionAt(s.from).hills);
    this.hills.width = this.scale.width; this.clouds.width = this.scale.width;
    this.hills.tilePositionX = s.from * TILE * 0.3;
    if (VIEW === 'all') {
      // paint each section's sky behind it
      SECTIONS.forEach(sec => this.add.rectangle(sec.from * TILE, 0, (sec.to - sec.from + 1) * TILE, MAP_H * TILE, sec.sky).setOrigin(0).setDepth(-10).setScrollFactor(1));
      this.hills.setVisible(false); this.clouds.setVisible(false);
    }
    this.hudStar.setVisible(false); this.hudSlot.setVisible(false);
  }

  update(time, delta) {
    if (VIEW) return;
    const p = this.player, body = p.body, dt = delta / 1000, k = this.keys;
    this.updateBats(time);
    this.updateSky(p.x);
    if (Phaser.Input.Keyboard.JustDown(k.r)) return this.die();
    if (this.dead || this.won) return;

    // --- horizontal movement with acceleration ---
    const dir = (k.left.isDown || k.a.isDown ? -1 : 0) + (k.right.isDown || k.d.isDown ? 1 : 0);
    const onGround = body.blocked.down || body.touching.down;
    if (onGround) this.lastGround = time;
    let vx = body.velocity.x;
    const target = dir * RUN_SPEED;
    const accel = dir === 0 ? (onGround ? GROUND_FRICTION : AIR_ACCEL * 0.4) : (onGround ? RUN_ACCEL : AIR_ACCEL);
    if (vx < target) vx = Math.min(target, vx + accel * dt); else if (vx > target) vx = Math.max(target, vx - accel * dt);
    body.setVelocityX(vx);
    if (dir) this.facing = dir;
    p.setFlipX(this.facing < 0);

    // --- jump with coyote time + input buffering ---
    if (this.jumpKeys.some(key => Phaser.Input.Keyboard.JustDown(key))) this.lastJumpPress = time;
    const jumpHeld = this.jumpKeys.some(key => key.isDown);
    if (time - this.lastJumpPress <= JUMP_BUFFER_MS && time - this.lastGround <= COYOTE_MS) {
      body.setVelocityY(-JUMP_VELOCITY);
      this.lastJumpPress = this.lastGround = -1e9; this.jumpCut = false;
      Sfx.jump(); this.squash(0.75, 1.3);
    }
    // variable height: let go early = smaller hop
    if (!jumpHeld && body.velocity.y < 0 && !this.jumpCut && !this.bouncing) { body.setVelocityY(body.velocity.y * JUMP_CUT); this.jumpCut = true; }
    if (body.velocity.y >= 0) this.bouncing = false;

    // landing squash
    if (onGround && !this.wasGround && this.prevVy > 250) this.squash(1.3, 0.75);
    this.wasGround = onGround; this.prevVy = body.velocity.y;

    // camera leads in the direction you face
    this.look = Phaser.Math.Linear(this.look, this.facing * CAMERA_LOOKAHEAD, 0.03);
    this.cameras.main.setFollowOffset(-this.look, 0);
    this.hills.tilePositionX = this.cameras.main.scrollX * 0.3;
    this.clouds.tilePositionX = this.cameras.main.scrollX * 0.12 + time * 0.01;

    if (p.y > MAP_H * TILE + 40) this.die();
  }

  updateSky(x) {
    const s = this.sectionAt(Math.floor(x / TILE));
    const lerp = (a, b) => Phaser.Display.Color.Interpolate.ColorWithColor(a, Phaser.Display.Color.ValueToColor(b), 100, 4);
    const sc = lerp(this.skyCol, s.sky), hc = lerp(this.hillCol, s.hills);
    this.skyCol = new Phaser.Display.Color(sc.r, sc.g, sc.b); this.hillCol = new Phaser.Display.Color(hc.r, hc.g, hc.b);
    this.cameras.main.setBackgroundColor(this.skyCol);
    this.hills.setTint(this.hillCol.color);
    this.clouds.setAlpha(s === SECTIONS[2] ? 0.25 : 1);
  }

  updateBats(time) {
    const t = time / 1000;
    this.bats.children.each(b => {
      if (!b.alive) return;
      const s = Math.sin(t * BAT_SPEED + b.phase);
      if (b.type === 'b') { b.x = b.bx + s * BAT_RANGE * TILE; b.y = b.by + Math.sin(t * 7) * 4; b.setFlipX(Math.cos(t * BAT_SPEED + b.phase) < 0); }
      else { b.y = b.by + s * BAT_RANGE * TILE; b.x = b.bx + Math.sin(t * 3) * 4; }
      b.setTexture(Math.floor(time / 110) % 2 ? 'bat0' : 'bat1');
    });
  }

  squash(sx, sy) {
    this.tweens.killTweensOf(this.player, ['scaleX', 'scaleY']);
    this.player.setScale(sx, sy);
    this.tweens.add({ targets: this.player, scaleX: 1, scaleY: 1, duration: 160, ease: 'Back.easeOut' });
  }

  burst(x, y, tint, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, d = this.add.image(x, y, 'dot').setTint(tint).setScale(0.8);
      this.tweens.add({ targets: d, x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30, alpha: 0, scale: 0.2, duration: 350, onComplete: () => d.destroy() });
    }
  }

  getCoin(c) {
    run.collected.add(c.key); run.coins++;
    Sfx.coin(); this.burst(c.x, c.y, 0xffd23f, 6);
    c.glow.destroy(); c.destroy();
  }

  getStar(s) {
    run.collected.add(s.key); run.star = true;
    Sfx.star(); this.burst(s.x, s.y, 0xffe34d, 16); this.cameras.main.flash(200, 255, 240, 160);
    s.glow.destroy(); s.destroy();
    this.hudStar.setVisible(true).setScale(2); this.tweens.add({ targets: this.hudStar, scale: 1, duration: 400, ease: 'Back.easeOut' });
  }

  hitQ(p, q) {
    if (q.used || !(p.body.blocked.up || p.body.touching.up) || !q.body.touching.down) return;
    q.used = true; q.setTexture('qused'); run.collected.add(q.key); run.coins++;
    Sfx.bump(); Sfx.coin();
    this.tweens.add({ targets: q, y: q.y - 8, duration: 70, yoyo: true });
    const c = this.add.image(q.x, q.y - TILE / 2, 'coin');
    this.tweens.add({ targets: c, y: c.y - 50, duration: 300, ease: 'Quad.easeOut', yoyo: true, onComplete: () => { this.burst(c.x, c.y, 0xffd23f, 6); c.destroy(); } });
  }

  touchBat(b) {
    if (!b.alive || this.dead) return;
    const p = this.player.body;
    if (p.velocity.y > 0 && p.bottom <= b.body.top + 12) {
      // stomp: the jump becomes an attack (the twist)
      b.alive = false; b.body.enable = false; Sfx.stomp(); this.burst(b.x, b.y, 0xe0284f, 10);
      this.tweens.add({ targets: b, y: b.y + 300, angle: 200, alpha: 0, duration: 700, onComplete: () => b.destroy() });
      const held = this.jumpKeys.some(key => key.isDown);
      p.setVelocityY(-(held ? JUMP_VELOCITY : STOMP_BOUNCE)); this.bouncing = true; this.squash(1.3, 0.75);
    } else this.die();
  }

  touchCp(s) {
    if (run.checkpoint(s.index, s.cp.c, s.cp.r)) {
      s.setTexture('cpon'); Sfx.check(); this.burst(s.x, s.y - 10, 0x3ddc84, 10);
    }
  }

  die() {
    if (this.dead || this.won) return;
    this.dead = true; run.deaths++;
    Sfx.hurt();
    this.player.body.enable = false; this.player.setTint(0xff3b3b);
    this.burst(this.player.x, this.player.y, 0xff3b3b, 12);
    this.tweens.add({ targets: this.player, scale: 0, angle: 360, duration: RESTART_DELAY_MS - 50 });
    this.cameras.main.shake(160, 0.008);
    this.time.delayedCall(RESTART_DELAY_MS, () => this.scene.restart());
  }

  win() {
    if (this.won || this.dead) return;
    this.won = true; run.endTime = performance.now();
    Sfx.win();
    this.player.body.setVelocity(0, 0); this.player.body.allowGravity = false;
    this.tweens.add({ targets: this.player, x: this.flag.x - 6, y: this.player.y - 60, angle: 720, duration: 600, ease: 'Quad.easeOut' });
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 180, () => this.burst(this.flag.x + Phaser.Math.Between(-30, 30), this.flag.y - Phaser.Math.Between(0, 60), [0xffd23f, 0x3ddc84, 0xff7a3d, 0x8fd3ff][i], 14));
    this.time.delayedCall(1400, () => this.scene.start('End'));
  }
}

// =====================================================================
//  END SCREEN (text allowed here)
// =====================================================================
class End extends Phaser.Scene {
  constructor() { super('End'); }
  create() {
    this.cameras.main.setBackgroundColor(0x2a3566);
    const secs = (run.endTime - run.startTime) / 1000;
    const t = `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`;
    const txt = (y, s, size, color = '#ffffff') => this.add.text(VIEW_W / 2, y, s, { fontFamily: FONT, fontSize: size, color, stroke: '#111122', strokeThickness: 6 }).setOrigin(0.5);
    txt(110, 'LEVEL COMPLETE!', '64px', '#3ddc84');
    txt(200, `Time   ${t}`, '32px');
    txt(250, `Coins   ${run.coins} / ${TOTAL_COINS}`, '32px', '#ffd23f');
    txt(300, `Falls   ${run.deaths}`, '32px', '#ff8a8a');
    this.add.image(VIEW_W / 2, 360, run.star ? 'star' : 'starslot').setScale(1.6);
    if (!run.star) txt(400, 'A star is hidden somewhere…', '22px', '#c9d3ff');
    const again = txt(460, 'Press SPACE to play again', '28px');
    this.tweens.add({ targets: again, alpha: 0.35, duration: 600, yoyo: true, repeat: -1 });
    this.time.delayedCall(400, () => {
      let went = false;
      const go = () => { if (went) return; went = true; run.reset(); this.scene.start('Game'); };
      this.input.keyboard.once('keydown-SPACE', go); this.input.keyboard.once('keydown-ENTER', go); this.input.once('pointerdown', go);
    });
  }
}

// =====================================================================
//  START
// =====================================================================
const viewSec = VIEW && VIEW !== 'all' ? SECTIONS[parseInt(VIEW, 10) - 1] : null;
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#8fd3ff',
  width: VIEW === 'all' ? MAP_W * TILE : viewSec ? (viewSec.to - viewSec.from + 1) * TILE : VIEW_W,
  height: VIEW_H,
  scale: VIEW ? { mode: Phaser.Scale.NONE } : { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: GRAVITY }, debug: PARAMS.has('debug') } },
  render: { antialias: true, roundPixels: true },
  audio: { noAudio: true }, // sounds come from the small synth above
  scene: [Boot, Title, Game, End],
});
