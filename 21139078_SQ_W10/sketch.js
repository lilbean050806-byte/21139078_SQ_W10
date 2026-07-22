// ================================================================================================
//  BLOB BRAWL ARENA
//  A from-scratch redesign of the original two-fighter tutorial.
//
//  ARCHITECTURE OVERVIEW
//  ----------------------
//  Game            -> top level state machine (menu / select / fight / pause / etc.), owns Match
//  Match           -> a best-of-rounds contest between two Fighters on a Stage
//  Fighter (base)  -> physics, health/meter, state machine, move execution, drawing
//    Kaida, Torque -> subclasses that supply their own special/super moves & stats
//  InputSource     -> HumanInput (keyboard) or AIInput (simple finite-state CPU brain);
//                     Fighters don't care which one is driving them
//  Stage           -> visual theme (palette + animated parallax-style background layers)
//  ParticleSystem  -> pooled particles for hit sparks, block sparks, dust, trails
//  Camera          -> screen shake / punch-zoom applied only to the arena layer
//  Audio           -> procedurally synthesized sound effects + generative music, no asset files
//  UI              -> small immediate-mode Button helper used by every menu screen
// ================================================================================================


// ------------------------------------------------------------------------------------------------
// CONFIG - tunable constants, kept in one place instead of scattered magic numbers
// ------------------------------------------------------------------------------------------------
const CFG = {
  W: 960, H: 540,
  GROUND_Y: 430,
  GRAVITY: 0.9,
  ROUND_TIME: 60,       // seconds per round
  ROUNDS_TO_WIN: 2,     // first fighter to win this many rounds wins the match
  METER_MAX: 100,
  SPECIAL_COST: 30,
  SUPER_COST: 100,
  COMBO_WINDOW: 45,     // frames a combo stays "alive" between hits
};

// Palette - deliberately not the generic cream/terracotta or acid-green defaults.
// A magenta/cyan rivalry pair on a near-black arena, amber for shared UI accents.
const PALETTE = {
  bg:        '#05060a',
  p1:        '#ff2e63',   // hot magenta - Kaida
  p1Dark:    '#9c1440',
  p2:        '#08d9d6',   // electric cyan - Torque
  p2Dark:    '#046a68',
  amber:     '#ffd460',
  ink:       '#eef1f6',
  inkDim:    '#8b93a7',
  panel:     '#10131c',
  danger:    '#ff5252',
};

const STAGES = [
  { name: 'NEON ROOFTOP', sky: ['#1a0b2e', '#3a1257', '#7a2f8f'], ground: '#150a22', accent: '#ff2e9a', motif: 'neon' },
  { name: 'DESERT RUINS', sky: ['#2b1608', '#6b3618', '#c9702f'], ground: '#241207', accent: '#ffb347', motif: 'sand' },
  { name: 'STORM DOCKS',  sky: ['#0a1420', '#122238', '#1d3a52'], ground: '#0a0f16', accent: '#6fe3ff', motif: 'rain' },
];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp2(a, b, t) { return a + (b - a) * t; }


// ================================================================================================
// AUDIO MANAGER - every sound is synthesized live with the Web Audio API. No external files means
// nothing to fetch, license, or fail to load; it also keeps every sound perfectly on-theme.
// ================================================================================================
class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.sfxVolume = 0.7;
    this.musicVolume = 0.35;
    this.muted = false;
    this.musicOn = true;
    this.musicStep = 0;
    this.musicScale = [0, 3, 5, 7, 10, 12];
    this.musicBaseFreq = 110;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setSfxVolume(v) { this.sfxVolume = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.musicGain) this.musicGain.gain.value = v; }

  // Generic short synthesized blip: a tone with an exponential decay envelope,
  // optionally sweeping frequency for "whoosh" style effects.
  tone(freq, dur, type = 'sine', gain = 0.35, sweepTo = null, noiseMix = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(env).connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);

    if (noiseMix > 0) {
      const bufferSize = this.ctx.sampleRate * dur;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const nEnv = this.ctx.createGain();
      nEnv.gain.setValueAtTime(gain * noiseMix, t0);
      nEnv.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      noise.connect(nEnv).connect(this.sfxGain);
      noise.start(t0);
    }
  }

  playLight()    { this.tone(720, 0.08, 'square', 0.25); }
  playHeavy()    { this.tone(180, 0.18, 'sawtooth', 0.4, 90, 0.5); }
  playSpecial()  { this.tone(300, 0.3, 'sawtooth', 0.35, 700); }
  playSuper()    { this.tone(600, 0.6, 'sawtooth', 0.45, 60, 0.6); }
  playBlock()    { this.tone(500, 0.12, 'triangle', 0.3, 350); }
  playWhiff()    { this.tone(900, 0.05, 'sine', 0.08); }
  playJump()     { this.tone(400, 0.12, 'sine', 0.2, 650); }
  playLand()     { this.tone(120, 0.08, 'sine', 0.2); }
  playKO()       { this.tone(220, 0.9, 'sawtooth', 0.4, 40, 0.4); }
  playSelect()   { this.tone(880, 0.06, 'square', 0.2); }
  playConfirm()  { this.tone(660, 0.1, 'square', 0.25, 990); }
  playCountdown(){ this.tone(500, 0.15, 'square', 0.3); }
  playBell()     { this.tone(1200, 0.5, 'sine', 0.3, 800); }

  // Extremely small generative music stinger - one bass note plus an occasional
  // scale-degree arpeggio note, re-triggered on a timer from the main loop.
  musicTick(stageIndex) {
    if (!this.ctx || this.muted || !this.musicOn) return;
    const root = this.musicBaseFreq * (1 + stageIndex * 0.12);
    const t0 = this.ctx.currentTime;
    const bass = this.ctx.createOscillator();
    bass.type = 'triangle';
    bass.frequency.value = root;
    const bEnv = this.ctx.createGain();
    bEnv.gain.setValueAtTime(0.18, t0);
    bEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    bass.connect(bEnv).connect(this.musicGain);
    bass.start(t0); bass.stop(t0 + 0.4);

    if (this.musicStep % 2 === 0) {
      const degree = this.musicScale[Math.floor(Math.random() * this.musicScale.length)];
      const freq = root * 2 * Math.pow(2, degree / 12);
      const arp = this.ctx.createOscillator();
      arp.type = 'square';
      arp.frequency.value = freq;
      const aEnv = this.ctx.createGain();
      aEnv.gain.setValueAtTime(0.05, t0 + 0.05);
      aEnv.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      arp.connect(aEnv).connect(this.musicGain);
      arp.start(t0 + 0.05); arp.stop(t0 + 0.35);
    }
    this.musicStep++;
  }
}
const AUDIO = new AudioManager();


// ================================================================================================
// PARTICLE SYSTEM
// ================================================================================================
class Particle {
  constructor(x, y, vx, vy, life, size, col, grav = 0) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.size = size; this.col = col; this.grav = grav;
  }
  update(dt) {
    this.vy += this.grav * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
  }
  draw() {
    const t = clamp(this.life / this.maxLife, 0, 1);
    push();
    noStroke();
    fill(this.col[0], this.col[1], this.col[2], 255 * t);
    circle(this.x, this.y, this.size * t);
    pop();
  }
}
class ParticleSystem {
  constructor() { this.items = []; }
  update(dt) {
    for (const p of this.items) p.update(dt);
    this.items = this.items.filter(p => p.life > 0);
  }
  draw() { for (const p of this.items) p.draw(); }

  burstHit(x, y, col) {
    for (let i = 0; i < 14; i++) {
      const a = random(TWO_PI);
      const spd = random(2, 7);
      this.items.push(new Particle(x, y, cos(a) * spd, sin(a) * spd - 1, random(14, 26), random(4, 9), col, 0.25));
    }
  }
  burstBlock(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = random(-PI * 0.3, PI * 0.3);
      const spd = random(3, 6);
      this.items.push(new Particle(x, y, cos(a) * spd, sin(a) * spd, random(10, 18), random(3, 6), [255, 212, 96], 0.1));
    }
  }
  dust(x, y) {
    for (let i = 0; i < 6; i++) {
      this.items.push(new Particle(x + random(-10, 10), y, random(-1, 1), random(-1.5, -0.2), random(16, 28), random(5, 10), [200, 200, 210], -0.02));
    }
  }
  trail(x, y, col) {
    this.items.push(new Particle(x, y, random(-0.5, 0.5), random(-0.5, 0.5), 14, random(6, 12), col, 0));
  }
}


// ================================================================================================
// CAMERA - purely a shake / punch-in effect layered on top of an otherwise static arena camera,
// which is the norm for 2D fighting games.
// ================================================================================================
class Camera {
  constructor() { this.shake = 0; this.zoom = 1; this.zoomTarget = 1; }
  addShake(amount) { this.shake = Math.min(this.shake + amount, 24); }
  punch(amount) { this.zoomTarget = 1 + amount; }
  update(dt) {
    this.shake = lerp2(this.shake, 0, 0.2 * dt);
    if (this.shake < 0.05) this.shake = 0;
    this.zoomTarget = lerp2(this.zoomTarget, 1, 0.08 * dt);
    this.zoom = lerp2(this.zoom, this.zoomTarget, 0.25 * dt);
  }
  begin() {
    push();
    translate(CFG.W / 2, CFG.H / 2);
    scale(this.zoom);
    if (this.shake > 0) translate(random(-this.shake, this.shake), random(-this.shake, this.shake));
    translate(-CFG.W / 2, -CFG.H / 2);
  }
  end() { pop(); }
}


// ================================================================================================
// STAGE - animated background rendering per theme. Layers drift at their own independent speeds
// to give a living, parallax-like atmosphere even though the fight camera itself never pans.
// ================================================================================================
class Stage {
  constructor(def) { this.def = def; this.t = 0; this.bolts = []; }
  update(dt) {
    this.t += dt;
    if (this.def.motif === 'rain' && random() < 0.4) {
      this.bolts.push({ x: random(CFG.W), y: -10, life: 40 });
    }
    this.bolts.forEach(b => b.y += 14);
    this.bolts = this.bolts.filter(b => b.y < CFG.H);
  }
  draw() {
    const [c1, c2, c3] = this.def.sky;
    for (let i = 0; i < CFG.GROUND_Y; i++) {
      const tt = i / CFG.GROUND_Y;
      const col = tt < 0.5
        ? lerpColor(color(c1), color(c2), tt * 2)
        : lerpColor(color(c2), color(c3), (tt - 0.5) * 2);
      stroke(col); line(0, i, CFG.W, i);
    }
    noStroke();

    if (this.def.motif === 'neon') {
      for (let i = 0; i < 6; i++) {
        const x = (i * 170 + (this.t * 6) % 170) % (CFG.W + 40) - 20;
        const h = 90 + (i % 3) * 40;
        fill(255, 46, 154, 26);
        rect(x, CFG.GROUND_Y - h, 26, h);
        fill(255, 46, 154, 70);
        rect(x + 8, CFG.GROUND_Y - h, 4, h);
      }
    } else if (this.def.motif === 'sand') {
      for (let i = 0; i < 5; i++) {
        const x = (i * 210 + (this.t * 3) % 210) % (CFG.W + 60) - 30;
        fill(120, 70, 35, 90);
        triangle(x, CFG.GROUND_Y, x + 90, CFG.GROUND_Y - 130, x + 180, CFG.GROUND_Y);
      }
      fill(255, 200, 140, 20);
      circle(CFG.W - 130, 90, 90);
    } else if (this.def.motif === 'rain') {
      stroke(180, 220, 255, 90); strokeWeight(2);
      for (const b of this.bolts) line(b.x, b.y, b.x - 4, b.y + 14);
      noStroke();
    }

    // ground + horizon line
    fill(this.def.ground);
    rect(0, CFG.GROUND_Y, CFG.W, CFG.H - CFG.GROUND_Y);
    stroke(this.def.accent); strokeWeight(2);
    line(0, CFG.GROUND_Y, CFG.W, CFG.GROUND_Y);
    noStroke();
    fill(0, 0, 0, 70);
    rect(0, CFG.GROUND_Y + 2, CFG.W, 10);
  }
}


// ================================================================================================
// INPUT SOURCES - Fighters don't know or care whether a human or the CPU is driving them.
// ================================================================================================

// Keys that were pressed THIS frame only (edge-triggered), populated by the global keyPressed().
const justPressed = new Set();

class HumanInput {
  constructor(keys) { this.keys = keys; } // {left,right,up,down,light,heavy,special,super}
  getIntents() {
    return {
      left: keyIsDown(this.keys.left),
      right: keyIsDown(this.keys.right),
      jumpPressed: justPressed.has(this.keys.up),
      block: keyIsDown(this.keys.down),
      lightPressed: justPressed.has(this.keys.light),
      heavyPressed: justPressed.has(this.keys.heavy),
      specialPressed: justPressed.has(this.keys.special),
      superPressed: justPressed.has(this.keys.super),
    };
  }
}

class AIInput {
  constructor(difficulty = 1) {
    this.difficulty = difficulty; // 0..1, higher = faster reactions
    this.decisionTimer = 0;
    this.mode = 'approach';
    this.self = null; this.foe = null;
  }
  bind(self, foe) { this.self = self; this.foe = foe; }
  getIntents() {
    const out = { left: false, right: false, jumpPressed: false, block: false, lightPressed: false, heavyPressed: false, specialPressed: false, superPressed: false };
    if (!this.self || !this.foe) return out;
    const self = this.self, foe = this.foe;

    // React to an incoming attack with some chance to block, scaled by difficulty.
    if (foe.activeMove && foe.activeMove.phase !== 'recovery' && random() < 0.02 + 0.05 * this.difficulty) {
      this.mode = 'block';
    }

    this.decisionTimer -= 1;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = Math.floor(random(14, 30) / (0.5 + this.difficulty));
      const dist = Math.abs(foe.x - self.x);
      if (self.health < self.maxHealth * 0.25 && random() < 0.5) this.mode = 'retreat';
      else if (dist > 150) this.mode = 'approach';
      else if (dist < 70) this.mode = random() < 0.6 ? 'attackClose' : 'approach';
      else this.mode = random() < 0.5 ? 'attackFar' : 'approach';
    }

    const dx = foe.x - self.x;
    if (this.mode === 'approach') {
      out.left = dx < -4; out.right = dx > 4;
      if (Math.abs(dx) < 120 && random() < 0.01) out.jumpPressed = true;
    } else if (this.mode === 'retreat') {
      out.left = dx > 0; out.right = dx < 0;
    } else if (this.mode === 'block') {
      out.block = true;
      if (Math.abs(dx) > 90) this.mode = 'approach';
    } else if (this.mode === 'attackClose') {
      if (!self.activeMove) {
        if (self.meter >= CFG.METER_MAX && random() < 0.15) out.superPressed = true;
        else if (self.meter >= CFG.SPECIAL_COST && random() < 0.2) out.specialPressed = true;
        else out.lightPressed = random() < 0.7;
        if (!out.lightPressed && !out.specialPressed && !out.superPressed) out.heavyPressed = random() < 0.3;
      }
    } else if (this.mode === 'attackFar') {
      out.left = dx < -4; out.right = dx > 4;
      if (Math.abs(dx) < 65 && !self.activeMove) out.heavyPressed = true;
    }
    return out;
  }
}


// ================================================================================================
// MOVESET DATA - plain data tables keep balance changes to one place instead of buried in logic.
// ================================================================================================
const MOVES_BASE = {
  light:  { startup: 5,  active: 4, recovery: 9,  damage: 5,  chip: 1, meter: 8,  knockX: 4,  knockY: 0,  hitstun: 14, blockstun: 8,  range: 46, w: 34, h: 22 },
  heavy:  { startup: 13, active: 6, recovery: 19, damage: 12, chip: 2, meter: 14, knockX: 9,  knockY: -2, hitstun: 22, blockstun: 14, range: 58, w: 40, h: 26 },
};

// ================================================================================================
// FIGHTER (base class)
// ================================================================================================
class Fighter {
  constructor(x, name, colMain, colDark, label) {
    this.x = x;
    this.y = CFG.GROUND_Y; // feet position; equals GROUND_Y when grounded
    this.vx = 0; this.vy = 0;
    this.name = name;
    this.colMain = colMain; this.colDark = colDark;
    this.label = label; // 'P1' | 'P2'

    this.bodyW = 46; this.bodyH = 100;
    this.speed = 0.6; this.maxSpeed = 4.2; this.friction = 0.78;
    this.jumpForce = 15;
    this.weight = 1;

    this.maxHealth = 100; this.health = 100;
    this.meter = 0;
    this.facing = this.label === 'P1' ? 1 : -1;
    this.grounded = true;

    this.state = 'idle';       // idle | walk | jump | block | hit | ko
    this.activeMove = null;    // {type, frame, phase, hasHit, data}
    this.hitstun = 0; this.blockstun = 0;
    this.isBlocking = false;
    this.flash = 0;            // white hit-flash timer
    this.squash = 0;           // landing squash animation timer
    this.comboCount = 0; this.comboTimer = 0;
    this.invuln = 0;           // frames of invulnerability (used by some supers)
    this.armored = 0;          // frames that ignore hitstun (super armor)
    this.animT = random(1000);
    this.controller = null;
    this.koFallAngle = 0;
    this.wins = 0;
  }

  bindController(c) { this.controller = c; }

  moveset() { return MOVES_BASE; } // subclasses extend with .special / .super

  hurtbox() {
    return { x: this.x - this.bodyW / 2, y: this.y - (this.crouching ? this.bodyH * 0.6 : this.bodyH), w: this.bodyW, h: this.crouching ? this.bodyH * 0.6 : this.bodyH };
  }

  startMove(type, foe) {
    const table = this.moveset();
    const data = table[type];
    if (!data) return;
    this.activeMove = { type, frame: 0, phase: 'startup', hasHit: false, data, hits: data.hits ? data.hits.map(() => false) : null };
    if (type === 'special') this.meter -= CFG.SPECIAL_COST;
    if (type === 'super') { this.meter -= CFG.SUPER_COST; this.invuln = data.invuln || 0; this.armored = data.armor ? 999 : 0; }
    if (type === 'light') AUDIO.playLight();
    if (type === 'heavy') AUDIO.playHeavy();
    if (type === 'special') AUDIO.playSpecial();
    if (type === 'super') AUDIO.playSuper();
    this.onStartMove(type, data, foe);
  }
  onStartMove() {} // hook for subclasses (e.g. dash velocity)

  getHitbox() {
    if (!this.activeMove || this.activeMove.phase !== 'active') return null;
    const d = this.activeMove.data;
    const reach = d.range !== undefined ? d.range : 50;
    const w = d.w || 40, h = d.h || 26;
    const cx = this.x + this.facing * (this.bodyW / 2 + reach / 2);
    const cy = this.y - this.bodyH * (d.low ? 0.25 : 0.6);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  takeDamage(amount, knockX, knockY, hitstun, particles, camera, chip = false) {
    if (this.invuln > 0) return;
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    this.vx = knockX; this.vy = knockY;
    this.flash = 10;
    if (!chip) {
      this.hitstun = hitstun;
      this.state = 'hit';
      particles.burstHit(this.x, this.y - this.bodyH * 0.55, this.colMain === PALETTE.p1 ? [255, 90, 130] : [90, 240, 235]);
      camera.addShake(6);
      camera.punch(0.02);
    } else {
      this.blockstun = hitstun;
      particles.burstBlock(this.x - this.facing * this.bodyW * 0.5, this.y - this.bodyH * 0.6);
      camera.addShake(2);
    }
    if (this.health <= 0) { this.state = 'ko'; this.koFallAngle = 0; }
  }

  gainMeter(v) { this.meter = clamp(this.meter + v, 0, CFG.METER_MAX); }

  update(dt, foe, particles, camera) {
    this.animT += dt * 0.06;
    if (this.flash > 0) this.flash -= dt;
    if (this.squash > 0) this.squash -= dt;
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.comboCount = 0; }
    if (this.invuln > 0) this.invuln -= dt;

    if (this.state === 'ko') {
      this.koFallAngle = Math.min(this.koFallAngle + 0.06 * dt, PI / 2.1);
      this.vx *= 0.9;
      this.x += this.vx * dt;
      return;
    }

    const intents = this.controller ? this.controller.getIntents() : {};
    this.crouching = false;

    // Blockstun / hitstun lock out actions but still let physics + knockback drift resolve.
    if (this.hitstun > 0) {
      this.hitstun -= dt;
      this.vx = lerp2(this.vx, 0, 0.15 * dt);
    } else if (this.blockstun > 0) {
      this.blockstun -= dt;
      this.vx = lerp2(this.vx, 0, 0.2 * dt);
    } else {
      this.isBlocking = !!intents.block && this.grounded && !this.activeMove;
      this.crouching = this.isBlocking;

      if (!this.activeMove && !this.isBlocking) {
        if (intents.left) this.vx -= this.speed * dt;
        if (intents.right) this.vx += this.speed * dt;
        this.vx = clamp(this.vx, -this.maxSpeed, this.maxSpeed);
        if (!intents.left && !intents.right) this.vx *= Math.pow(this.friction, dt);

        if (intents.jumpPressed && this.grounded) {
          this.vy = -this.jumpForce; this.grounded = false; AUDIO.playJump();
        }
      } else if (this.isBlocking) {
        this.vx *= Math.pow(this.friction, dt);
      }

      if (!this.activeMove && this.grounded) {
        if (intents.superPressed && this.meter >= CFG.METER_MAX) this.startMove('super', foe);
        else if (intents.specialPressed && this.meter >= CFG.SPECIAL_COST) this.startMove('special', foe);
        else if (intents.heavyPressed) this.startMove('heavy', foe);
        else if (intents.lightPressed) this.startMove('light', foe);
      }
    }

    // Facing always tracks the opponent unless mid-knockback-lock.
    if (this.hitstun <= 0) this.facing = foe.x > this.x ? 1 : -1;

    // Physics
    this.vy += CFG.GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, this.bodyW / 2 + 10, CFG.W - this.bodyW / 2 - 10);
    const wasAirborne = !this.grounded;
    if (this.y >= CFG.GROUND_Y) {
      this.y = CFG.GROUND_Y; this.vy = 0;
      if (!this.grounded) {
        this.grounded = true;
        if (wasAirborne) { this.squash = 8; AUDIO.playLand(); particles.dust(this.x, this.y); }
      }
    } else {
      this.grounded = false;
    }

    // Advance active move state machine
    if (this.activeMove) this.updateMove(dt, foe, particles, camera);

    this.updateSubclass(dt, foe, particles, camera);
  }

  updateSubclass() {} // hook for subclass-specific per-frame behavior (e.g. dash movement)

  updateMove(dt, foe, particles, camera) {
    const m = this.activeMove;
    m.frame += dt;
    const d = m.data;
    if (m.phase === 'startup' && m.frame >= d.startup) { m.phase = 'active'; m.frame = 0; }
    else if (m.phase === 'active' && m.frame >= d.active) { m.phase = 'recovery'; m.frame = 0; }
    else if (m.phase === 'recovery' && m.frame >= d.recovery) { this.activeMove = null; this.armored = 0; }
  }

  onStunned() {}

  draw() {
    push();
    translate(this.x, this.y);
    if (this.state === 'ko') rotate(this.facing * this.koFallAngle * -1);

    const squashAmt = this.squash > 0 ? map(this.squash, 0, 8, 0, 0.22) : 0;
    const bob = this.grounded && this.vx !== 0 && this.state !== 'ko' ? sin(this.animT * 6) * 3 : 0;

    // ground shadow, softer when airborne
    const airT = clamp((CFG.GROUND_Y - this.y) / 140, 0, 1);
    noStroke();
    fill(0, 0, 0, 90 * (1 - airT * 0.6));
    ellipse(0, 4, this.bodyW * (1 - airT * 0.3), 14 * (1 - airT * 0.3));

    const h = this.crouching ? this.bodyH * 0.6 : this.bodyH;
    const bodyCol = this.flash > 0 ? color(255) : color(this.colMain);

    // legs (simple animated pair)
    stroke(this.colDark); strokeWeight(8); strokeCap(ROUND);
    const legPhase = this.grounded ? sin(this.animT * 5) * (Math.abs(this.vx) > 0.3 ? 10 : 2) : 0;
    line(-8, -h * 0.05, -8 + (this.grounded ? legPhase : -6), -h * 0.55 + (this.state === 'jump' ? -8 : 0));
    line(8, -h * 0.05, 8 - (this.grounded ? legPhase : -6), -h * 0.55 + (this.state === 'jump' ? -8 : 0));

    // torso blob
    push();
    scale(1 + squashAmt, 1 - squashAmt);
    fill(bodyCol); noStroke();
    beginShape();
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (TWO_PI / n) * i;
      const nz = noise(cos(a) * 0.8 + this.animT, sin(a) * 0.8 + this.animT);
      const r = (h * 0.42) + map(nz, 0, 1, -5, 5);
      const squishY = this.crouching ? 0.65 : 1;
      vertex(cos(a) * r * 0.75, -h * 0.62 + bob + sin(a) * r * squishY * 0.9);
    }
    endShape(CLOSE);
    pop();

    // guard ring while blocking
    if (this.isBlocking) {
      noFill(); stroke(255, 255, 255, 160); strokeWeight(3);
      ellipse(0, -h * 0.6, h * 0.95, h * 0.95);
    }

    // arm / fist for active attacks
    if (this.activeMove && this.activeMove.phase !== 'recovery') {
      const d = this.activeMove.data;
      const reach = (d.range !== undefined ? d.range : 50) * (this.activeMove.phase === 'active' ? 1 : 0.4);
      stroke(this.colDark); strokeWeight(9); strokeCap(ROUND);
      line(this.facing * 6, -h * 0.6, this.facing * (10 + reach), -h * (d.low ? 0.3 : 0.62));
      noStroke(); fill(this.flash > 0 ? color(255) : color(this.colMain));
      circle(this.facing * (10 + reach), -h * (d.low ? 0.3 : 0.62), 17);
    }

    // eyes
    fill(10); noStroke();
    const eyeY = -h * 0.66 + bob;
    circle(-7 * this.facing, eyeY, 7);
    circle(7 * this.facing, eyeY, 7);
    if (this.state === 'hit') { fill(255, 60, 60); circle(-7 * this.facing, eyeY, 4); circle(7 * this.facing, eyeY, 4); }

    pop();
  }
}

// ------------------------------------------------------------------------------------------------
// KAIDA - fast ninja-styled fighter. Special = quick dashing strike. Super = five-hit flurry
// with brief invulnerability, rewarding aggressive, combo-focused play.
// ------------------------------------------------------------------------------------------------
class Kaida extends Fighter {
  constructor(x, label) {
    super(x, 'KAIDA', PALETTE.p1, PALETTE.p1Dark, label);
    this.speed = 0.75; this.maxSpeed = 5.2; this.jumpForce = 16.5;
    this.maxHealth = 92; this.health = 92;
  }
  moveset() {
    return {
      ...MOVES_BASE,
      special: { startup: 6, active: 10, recovery: 14, damage: 14, chip: 2, meter: 18, knockX: 10, knockY: -1, hitstun: 20, blockstun: 12, range: 30, w: 40, h: 26, dash: 9 },
      super:   { startup: 8, active: 30, recovery: 20, damage: 7, chip: 3, meter: 0, knockX: 3, knockY: -1, hitstun: 10, blockstun: 8, range: 40, w: 46, h: 30, invuln: 10, hits: [4, 10, 16, 22, 28] },
    };
  }
  onStartMove(type, data) {
    if (type === 'special') this._dashFramesLeft = 10;
  }
  updateSubclass(dt) {
    if (this._dashFramesLeft > 0 && this.activeMove && this.activeMove.type === 'special') {
      this.x += this.facing * this.activeMove.data.dash * dt * 0.6;
      this._dashFramesLeft -= dt;
    }
  }
}

// ------------------------------------------------------------------------------------------------
// TORQUE - heavy brawler. Special = ground slam shockwave that hits both sides. Super = an armored
// charge across the arena that shrugs off small attacks, rewarding patient meter-building play.
// ------------------------------------------------------------------------------------------------
class Torque extends Fighter {
  constructor(x, label) {
    super(x, 'TORQUE', PALETTE.p2, PALETTE.p2Dark, label);
    this.speed = 0.5; this.maxSpeed = 3.4; this.jumpForce = 13.5; this.weight = 1.4;
    this.bodyW = 54; this.maxHealth = 110; this.health = 110;
  }
  moveset() {
    return {
      ...MOVES_BASE,
      special: { startup: 16, active: 8, recovery: 22, damage: 17, chip: 3, meter: 20, knockX: 6, knockY: -8, hitstun: 26, blockstun: 16, range: 70, w: 90, h: 30, low: true },
      super:   { startup: 10, active: 26, recovery: 22, damage: 30, chip: 6, meter: 0, knockX: 14, knockY: -4, hitstun: 30, blockstun: 20, range: 40, w: 60, h: 40, armor: true, dash: 7 },
    };
  }
  onStartMove(type) {
    if (type === 'super') this._chargeFramesLeft = 26;
  }
  updateSubclass(dt) {
    if (this._chargeFramesLeft > 0 && this.activeMove && this.activeMove.type === 'super') {
      this.x += this.facing * this.activeMove.data.dash * dt * 0.5;
      this._chargeFramesLeft -= dt;
    }
  }
}

const ROSTER = [
  { key: 'kaida', label: 'KAIDA', tagline: 'Fast strikes. Fragile guard.', make: (x, l) => new Kaida(x, l) },
  { key: 'torque', label: 'TORQUE', tagline: 'Heavy hits. Slow feet.', make: (x, l) => new Torque(x, l) },
];


// ================================================================================================
// BUTTON - tiny immediate-mode UI helper used by every menu screen.
// ================================================================================================
class Button {
  constructor(x, y, w, h, label, sub = '') { this.x = x; this.y = y; this.w = w; this.h = h; this.label = label; this.sub = sub; }
  hovered() { return mouseX > this.x && mouseX < this.x + this.w && mouseY > this.y && mouseY < this.y + this.h; }
  draw(selected = false) {
    const hov = this.hovered() || selected;
    push();
    rectMode(CORNER);
    fill(hov ? color(PALETTE.amber) : color(PALETTE.panel));
    stroke(hov ? color(PALETTE.amber) : color(PALETTE.inkDim));
    strokeWeight(2);
    rect(this.x, this.y, this.w, this.h, 4);
    noStroke();
    fill(hov ? color(10) : color(PALETTE.ink));
    textFont('Bebas Neue, sans-serif');
    textAlign(CENTER, CENTER);
    textSize(this.h * 0.42);
    text(this.label, this.x + this.w / 2, this.y + this.h / 2 - (this.sub ? 8 : 0));
    if (this.sub) {
      textFont('Rubik, sans-serif');
      textSize(11);
      fill(hov ? color(30) : color(PALETTE.inkDim));
      text(this.sub, this.x + this.w / 2, this.y + this.h / 2 + 14);
    }
    pop();
  }
}


// ================================================================================================
// GAME - top level state machine
// ================================================================================================
const SCENE = { MENU: 'menu', SELECT: 'select', INTRO: 'intro', FIGHT: 'fight', ROUND_END: 'round_end', MATCH_END: 'match_end', PAUSED: 'paused', SETTINGS: 'settings' };

class Game {
  constructor() {
    this.scene = SCENE.MENU;
    this.prevSceneBeforeSettings = SCENE.MENU;
    this.mode = '1P';           // '1P' or '2P'
    this.pick = { p1: 0, p2: 1, stage: 0 };
    this.particles = new ParticleSystem();
    this.camera = new Camera();
    this.stage = new Stage(STAGES[0]);
    this.p1 = null; this.p2 = null;
    this.roundWins = { p1: 0, p2: 0 };
    this.roundTime = CFG.ROUND_TIME;
    this.roundTimerAcc = 0;
    this.introTimer = 0; this.introText = '';
    this.roundEndTimer = 0; this.roundEndWinner = null;
    this.sessionStats = { fights: 0, p1MatchWins: 0, p2MatchWins: 0, bestCombo: 0 }; // in-memory only
    this.musicTimer = 0;
    this.buttons = {};
    this.buildMenuButtons();
  }

  buildMenuButtons() {
    this.buttons.menu = [
      new Button(CFG.W / 2 - 130, 260, 260, 56, '1 PLAYER VS CPU'),
      new Button(CFG.W / 2 - 130, 326, 260, 56, '2 PLAYER VERSUS'),
      new Button(CFG.W / 2 - 130, 392, 260, 56, 'SETTINGS'),
    ];
    this.buttons.settingsBack = new Button(CFG.W / 2 - 90, 440, 180, 46, 'BACK');
    this.buttons.pause = [
      new Button(CFG.W / 2 - 110, 190, 220, 48, 'RESUME'),
      new Button(CFG.W / 2 - 110, 246, 220, 48, 'SETTINGS'),
      new Button(CFG.W / 2 - 110, 302, 220, 48, 'MAIN MENU'),
    ];
    this.buttons.matchEnd = [
      new Button(CFG.W / 2 - 230, 400, 200, 52, 'REMATCH'),
      new Button(CFG.W / 2 + 30, 400, 200, 52, 'MAIN MENU'),
    ];
    this.buttons.confirm = new Button(CFG.W / 2 - 90, 470, 180, 46, 'FIGHT!');
  }

  goMenu() { this.scene = SCENE.MENU; }

  goSelect(mode) { this.mode = mode; this.scene = SCENE.SELECT; }

  startMatch() {
    const p1def = ROSTER[this.pick.p1];
    const p2def = ROSTER[this.pick.p2];
    this.p1 = p1def.make(260, 'P1');
    this.p2 = p2def.make(CFG.W - 260, 'P2');
    this.p1.bindController(new HumanInput({ left: 65, right: 68, up: 87, down: 83, light: 70, heavy: 71, special: 84, super: 82 }));
    if (this.mode === '2P') {
      this.p2.bindController(new HumanInput({ left: LEFT_ARROW, right: RIGHT_ARROW, up: UP_ARROW, down: DOWN_ARROW, light: 75, heavy: 76, special: 79, super: 80 }));
    } else {
      const ai = new AIInput(0.65);
      ai.bind(this.p2, this.p1);
      this.p2.bindController(ai);
    }
    this.stage = new Stage(STAGES[this.pick.stage]);
    this.roundWins = { p1: 0, p2: 0 };
    this.sessionStats.fights++;
    this.startRound(1);
  }

  startRound(n) {
    this.roundNum = n;
    this.p1.x = 260; this.p2.x = CFG.W - 260;
    this.p1.y = CFG.GROUND_Y; this.p2.y = CFG.GROUND_Y;
    this.p1.vx = 0; this.p1.vy = 0; this.p2.vx = 0; this.p2.vy = 0;
    this.p1.health = this.p1.maxHealth; this.p2.health = this.p2.maxHealth;
    this.p1.meter = 0; this.p2.meter = 0;
    this.p1.state = 'idle'; this.p2.state = 'idle';
    this.p1.activeMove = null; this.p2.activeMove = null;
    this.p1.comboCount = 0; this.p2.comboCount = 0;
    this.roundTime = CFG.ROUND_TIME;
    this.roundTimerAcc = 0;
    this.introTimer = 90; this.introText = `ROUND ${n}`;
    this.scene = SCENE.INTRO;
    AUDIO.playBell();
  }

  update(dt) {
    if (this.scene === SCENE.FIGHT) this.updateFight(dt);
    else if (this.scene === SCENE.INTRO) this.updateIntro(dt);
    else if (this.scene === SCENE.ROUND_END) this.updateRoundEnd(dt);
    this.particles.update(dt);
    this.camera.update(dt);
    if (this.scene !== SCENE.MENU && this.scene !== SCENE.SELECT) this.stage.update(dt);

    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && (this.scene === SCENE.FIGHT || this.scene === SCENE.INTRO)) {
      this.musicTimer = 26;
      AUDIO.musicTick(this.pick.stage);
    }
  }

  updateIntro(dt) {
    this.introTimer -= dt;
    if (this.introTimer === 30) { this.introText = 'FIGHT!'; AUDIO.playCountdown(); }
    if (this.introTimer <= 0) this.scene = SCENE.FIGHT;
  }

  updateFight(dt) {
    const p1 = this.p1, p2 = this.p2;
    p1.update(dt, p2, this.particles, this.camera);
    p2.update(dt, p1, this.particles, this.camera);
    this.resolveCombat(p1, p2);
    this.resolveCombat(p2, p1);

    this.roundTimerAcc += dt / 60;
    if (this.roundTimerAcc >= 1) { this.roundTimerAcc -= 1; this.roundTime = Math.max(0, this.roundTime - 1); }

    if (p1.state === 'ko' || p2.state === 'ko') {
      this.endRound(p1.state === 'ko' ? 'P2' : 'P1');
    } else if (this.roundTime <= 0) {
      const winner = p1.health === p2.health ? 'DRAW' : (p1.health > p2.health ? 'P1' : 'P2');
      this.endRound(winner);
    }
    justPressed.clear();
  }

  resolveCombat(attacker, defender) {
    if (!attacker.activeMove || attacker.activeMove.phase !== 'active') return;
    const box = attacker.getHitbox();
    if (!box) return;
    const hb = defender.hurtbox();
    const overlap = box.x < hb.x + hb.w && box.x + box.w > hb.x && box.y < hb.y + hb.h && box.y + box.h > hb.y;
    if (!overlap) return;

    const d = attacker.activeMove.data;
    // multi-hit moves (supers) track separate hit windows so each hit lands once
    if (attacker.activeMove.hits) {
      const idx = d.hits.findIndex((f, i) => !attacker.activeMove.hits[i] && Math.abs(attacker.activeMove.frame - f) < 2);
      if (idx === -1) return;
      attacker.activeMove.hits[idx] = true;
    } else {
      if (attacker.activeMove.hasHit) return;
      attacker.activeMove.hasHit = true;
    }

    const facingCorrectly = (defender.facing === -attacker.facing) || true; // defenders auto-face attacker already
    const canBlock = defender.isBlocking && !defender.armored;
    if (canBlock) {
      defender.takeDamage(d.chip, attacker.facing * (d.knockX * 0.3), 0, Math.round(d.blockstun * 0.7), this.particles, this.camera, true);
      attacker.gainMeter(d.meter * 0.5);
      defender.gainMeter(3);
      AUDIO.playBlock();
    } else if (defender.armored) {
      // super armor: still take damage, no stagger
      defender.health = clamp(defender.health - d.damage * 0.5, 0, defender.maxHealth);
      this.particles.burstBlock(defender.x, defender.y - defender.bodyH * 0.6);
    } else {
      defender.takeDamage(d.damage, attacker.facing * d.knockX, d.knockY || 0, d.hitstun, this.particles, this.camera, false);
      attacker.gainMeter(d.meter);
      defender.gainMeter(d.meter * 0.4);
      attacker.comboCount++;
      attacker.comboTimer = CFG.COMBO_WINDOW;
      this.sessionStats.bestCombo = Math.max(this.sessionStats.bestCombo, attacker.comboCount);
      if (attacker.comboCount === 1) AUDIO.playConfirm();
    }
  }

  endRound(winnerLabel) {
    this.roundEndWinner = winnerLabel;
    if (winnerLabel === 'P1') this.roundWins.p1++;
    else if (winnerLabel === 'P2') this.roundWins.p2++;
    this.roundEndTimer = 150;
    this.scene = SCENE.ROUND_END;
    AUDIO.playKO();
  }

  updateRoundEnd(dt) {
    this.roundEndTimer -= dt;
    if (this.roundEndTimer <= 0) {
      if (this.roundWins.p1 >= CFG.ROUNDS_TO_WIN || this.roundWins.p2 >= CFG.ROUNDS_TO_WIN) {
        if (this.roundWins.p1 > this.roundWins.p2) this.sessionStats.p1MatchWins++; else this.sessionStats.p2MatchWins++;
        this.scene = SCENE.MATCH_END;
      } else {
        this.startRound(this.roundNum + 1);
      }
    }
  }

  // ---------------- DRAW ----------------
  draw() {
    background(PALETTE.bg);
    if (this.scene === SCENE.MENU) this.drawMenu();
    else if (this.scene === SCENE.SELECT) this.drawSelect();
    else {
      this.drawArenaScene();
      if (this.scene === SCENE.INTRO) this.drawIntro();
      else if (this.scene === SCENE.ROUND_END) this.drawRoundEnd();
      else if (this.scene === SCENE.MATCH_END) this.drawMatchEnd();
      else if (this.scene === SCENE.PAUSED) this.drawPause();
    }
    if (this.scene === SCENE.SETTINGS) this.drawSettings();
  }

  drawArenaScene() {
    this.camera.begin();
    this.stage.draw();
    this.particles.draw();
    if (this.p1) this.p1.draw();
    if (this.p2) this.p2.draw();
    this.camera.end();
    if (this.p1) this.drawHUD();
  }

  drawTitle(text_, y, size = 64, col = PALETTE.ink) {
    push();
    textFont('Bebas Neue, sans-serif');
    textAlign(CENTER, CENTER);
    fill(0, 0, 0, 140);
    textSize(size);
    text(text_, CFG.W / 2 + 3, y + 4);
    fill(col);
    text(text_, CFG.W / 2, y);
    pop();
  }

  drawMenu() {
    // ambient animated backdrop reused from a neutral stage theme
    const s = new Stage(STAGES[frameCount % 900 < 300 ? 0 : (frameCount % 900 < 600 ? 1 : 2)]);
    s.t = frameCount * 0.05;
    s.draw();
    fill(0, 0, 0, 120); rect(0, 0, CFG.W, CFG.H);
    this.drawTitle('BLOB BRAWL ARENA', 140, 72, PALETTE.amber);
    push(); textFont('Rubik'); textAlign(CENTER); fill(PALETTE.inkDim); textSize(15);
    text('A two-fighter arcade brawler — pick a mode to begin', CFG.W / 2, 190); pop();
    this.buttons.menu.forEach(b => b.draw());
    if (this.sessionStats.fights > 0) {
      push(); textFont('Rubik'); textAlign(CENTER); fill(PALETTE.inkDim); textSize(12);
      text(`Session: ${this.sessionStats.fights} fights  •  P1 match wins ${this.sessionStats.p1MatchWins}  •  P2 match wins ${this.sessionStats.p2MatchWins}  •  best combo x${this.sessionStats.bestCombo}`, CFG.W / 2, 470);
      pop();
    }
  }

  drawSelect() {
    const s = STAGES[this.pick.stage];
    const stagePreview = new Stage(s); stagePreview.t = frameCount * 0.04; stagePreview.draw();
    fill(0, 0, 0, 130); rect(0, 0, CFG.W, CFG.H);
    this.drawTitle(this.mode === '2P' ? 'CHOOSE YOUR FIGHTERS' : 'CHOOSE YOUR FIGHTER', 56, 40, PALETTE.ink);

    const cardW = 190, cardH = 220, gap = 30;
    const totalW = ROSTER.length * cardW + (ROSTER.length - 1) * gap;
    const startX = CFG.W / 2 - totalW / 2;

    // P1 row
    push(); textFont('Bebas Neue'); fill(PALETTE.p1); textAlign(LEFT); textSize(18); text('PLAYER 1', startX, 100); pop();
    ROSTER.forEach((r, i) => this.drawFighterCard(startX + i * (cardW + gap), 115, cardW, cardH, r, this.pick.p1 === i, PALETTE.p1, () => this.pick.p1 = i));

    if (this.mode === '2P') {
      push(); textFont('Bebas Neue'); fill(PALETTE.p2); textAlign(LEFT); textSize(18); text('PLAYER 2', startX, 360); pop();
      // (drawn compactly beneath in select handler via same helper, offset)
      ROSTER.forEach((r, i) => this.drawFighterCard(startX + i * (cardW + gap), 372, cardW, 110, r, this.pick.p2 === i, PALETTE.p2, () => this.pick.p2 = i, true));
    } else {
      push(); textFont('Rubik'); fill(PALETTE.inkDim); textAlign(CENTER); textSize(13);
      text(`CPU OPPONENT: ${ROSTER[this.pick.p2].label}`, CFG.W / 2, 372); pop();
    }

    // stage picker
    push(); textFont('Bebas Neue'); fill(PALETTE.ink); textAlign(CENTER); textSize(16); text('STAGE: ' + s.name, CFG.W / 2, this.mode === '2P' ? 500 : 420); pop();

    this.buttons.confirm.y = this.mode === '2P' ? 500 : 445;
    this.buttons.confirm.draw();
    const back = new Button(30, this.buttons.confirm.y, 120, 46, 'BACK');
    back.draw();
    this._selectBackBtn = back;
    const stageNext = new Button(CFG.W - 260, this.buttons.confirm.y, 100, 46, 'STAGE ▶');
    stageNext.draw();
    this._stageBtn = stageNext;
  }

  drawFighterCard(x, y, w, h, r, selected, accent, onClick, compact = false) {
    push();
    fill(selected ? color(accent) : color(PALETTE.panel));
    stroke(selected ? color(accent) : color(PALETTE.inkDim)); strokeWeight(2);
    rect(x, y, w, h, 6);
    noStroke();
    fill(selected ? 10 : 230);
    // mini portrait: silhouette using the fighter's own blob palette
    const cx = x + w / 2, cy = y + (compact ? h * 0.4 : h * 0.4);
    fill(r.key === 'kaida' ? color(PALETTE.p1) : color(PALETTE.p2));
    circle(cx, cy, compact ? 46 : 64);
    fill(10); circle(cx - 8, cy - 6, 5); circle(cx + 8, cy - 6, 5);
    textFont('Bebas Neue'); textAlign(CENTER);
    fill(selected ? 10 : PALETTE.ink);
    textSize(compact ? 18 : 22);
    text(r.label, cx, y + h - (compact ? 26 : 46));
    if (!compact) {
      textFont('Rubik'); textSize(11); fill(selected ? 20 : PALETTE.inkDim);
      text(r.tagline, cx, y + h - 20);
    }
    pop();
    this._cardHits = this._cardHits || [];
    this._cardHits.push({ x, y, w, h, onClick });
  }

  drawIntro() {
    fill(0, 0, 0, 90); rect(0, 0, CFG.W, CFG.H);
    const pulse = 1 + 0.05 * sin(frameCount * 0.3);
    push(); translate(CFG.W / 2, CFG.H / 2); scale(pulse);
    this.drawTitle(this.introText, 0, this.introText === 'FIGHT!' ? 84 : 60, PALETTE.amber);
    pop();
  }

  drawRoundEnd() {
    fill(0, 0, 0, 140); rect(0, 0, CFG.W, CFG.H);
    const text_ = this.roundEndWinner === 'DRAW' ? 'DRAW ROUND' : `${this.roundEndWinner} WINS ROUND ${this.roundNum}`;
    this.drawTitle(text_, CFG.H / 2 - 20, 44, this.roundEndWinner === 'P1' ? PALETTE.p1 : (this.roundEndWinner === 'P2' ? PALETTE.p2 : PALETTE.ink));
    push(); textFont('Rubik'); textAlign(CENTER); fill(PALETTE.inkDim); textSize(14);
    text(`${this.roundWins.p1} — ${this.roundWins.p2}`, CFG.W / 2, CFG.H / 2 + 30); pop();
  }

  drawMatchEnd() {
    fill(0, 0, 0, 160); rect(0, 0, CFG.W, CFG.H);
    const winner = this.roundWins.p1 > this.roundWins.p2 ? 'P1' : 'P2';
    this.drawTitle(`${winner} WINS THE MATCH`, 180, 56, winner === 'P1' ? PALETTE.p1 : PALETTE.p2);
    push(); textFont('Rubik'); textAlign(CENTER); fill(PALETTE.inkDim); textSize(13);
    text(`Best combo this fight: x${this.sessionStats.bestCombo}`, CFG.W / 2, 240); pop();
    this.buttons.matchEnd.forEach(b => b.draw());
  }

  drawPause() {
    fill(0, 0, 0, 170); rect(0, 0, CFG.W, CFG.H);
    this.drawTitle('PAUSED', 140, 48, PALETTE.ink);
    this.buttons.pause.forEach(b => b.draw());
  }

  drawSettings() {
    fill(0, 0, 0, 190); rect(0, 0, CFG.W, CFG.H);
    this.drawTitle('SETTINGS', 90, 40, PALETTE.ink);
    this.drawSlider(CFG.W / 2 - 140, 200, 280, 'MUSIC VOLUME', AUDIO.musicVolume, v => AUDIO.setMusicVolume(v));
    this.drawSlider(CFG.W / 2 - 140, 270, 280, 'SFX VOLUME', AUDIO.sfxVolume, v => AUDIO.setSfxVolume(v));
    const muteBtn = new Button(CFG.W / 2 - 90, 330, 180, 44, AUDIO.muted ? 'UNMUTE' : 'MUTE ALL');
    muteBtn.draw();
    this._muteBtn = muteBtn;
    this.buttons.settingsBack.draw();
  }

  drawSlider(x, y, w, label, value, onDrag) {
    push();
    textFont('Rubik'); fill(PALETTE.inkDim); textAlign(LEFT); textSize(12);
    text(label, x, y - 10);
    stroke(PALETTE.inkDim); strokeWeight(4); line(x, y, x + w, y);
    stroke(PALETTE.amber); strokeWeight(4); line(x, y, x + w * value, y);
    noStroke(); fill(PALETTE.amber); circle(x + w * value, y, 16);
    pop();
    this._sliders = this._sliders || [];
    this._sliders.push({ x, y, w, onDrag });
  }

  // -------- interaction plumbing (called from global mouse handlers) --------
  handleClick(mx, my) {
    AUDIO.init(); AUDIO.resume();
    if (this.scene === SCENE.MENU) {
      this.buttons.menu.forEach((b, i) => {
        if (b.hovered()) { AUDIO.playSelect(); if (i === 0) this.goSelect('1P'); else if (i === 1) this.goSelect('2P'); else this.openSettings(); }
      });
    } else if (this.scene === SCENE.SELECT) {
      this._cardHits = [];
      // re-run draw logic isn't available here; clicks are validated against last drawn hit list
      (this._lastCardHits || []).forEach(h => { if (mx > h.x && mx < h.x + h.w && my > h.y && my < h.y + h.h) { AUDIO.playSelect(); h.onClick(); } });
      if (this._selectBackBtn && this._selectBackBtn.hovered()) { AUDIO.playSelect(); this.goMenu(); }
      if (this._stageBtn && this._stageBtn.hovered()) { AUDIO.playSelect(); this.pick.stage = (this.pick.stage + 1) % STAGES.length; }
      if (this.buttons.confirm.hovered()) { AUDIO.playConfirm(); this.startMatch(); }
    } else if (this.scene === SCENE.PAUSED) {
      if (this.buttons.pause[0].hovered()) { AUDIO.playSelect(); this.scene = SCENE.FIGHT; }
      else if (this.buttons.pause[1].hovered()) { AUDIO.playSelect(); this.openSettings(); }
      else if (this.buttons.pause[2].hovered()) { AUDIO.playSelect(); this.goMenu(); }
    } else if (this.scene === SCENE.MATCH_END) {
      if (this.buttons.matchEnd[0].hovered()) { AUDIO.playConfirm(); this.startMatch(); }
      else if (this.buttons.matchEnd[1].hovered()) { AUDIO.playSelect(); this.goMenu(); }
    } else if (this.scene === SCENE.SETTINGS) {
      if (this._muteBtn && this._muteBtn.hovered()) { AUDIO.muted = !AUDIO.muted; AUDIO.playSelect(); }
      if (this.buttons.settingsBack.hovered()) { AUDIO.playSelect(); this.scene = this.prevSceneBeforeSettings; }
    }
  }

  openSettings() { this.prevSceneBeforeSettings = this.scene; this.scene = SCENE.SETTINGS; }

  handleDrag(mx) {
    if (this.scene !== SCENE.SETTINGS || !this._sliders) return;
    for (const s of this._sliders) {
      if (mouseY > s.y - 14 && mouseY < s.y + 14 && mx > s.x - 10 && mx < s.x + s.w + 10) {
        s.onDrag(clamp((mx - s.x) / s.w, 0, 1));
      }
    }
  }

  togglePause() {
    if (this.scene === SCENE.FIGHT) this.scene = SCENE.PAUSED;
    else if (this.scene === SCENE.PAUSED) this.scene = SCENE.FIGHT;
  }

  // ---------------- HUD ----------------
  drawHUD() {
    const barW = 300, barH = 20, barY = 34, pad = 24;
    push();
    // diagonal-cut health panels — a nod to classic arcade fighter HUDs
    this.drawDiagonalBar(pad, barY, barW, barH, this.p1.health / this.p1.maxHealth, PALETTE.p1, 'left');
    this.drawDiagonalBar(CFG.W - pad - barW, barY, barW, barH, this.p2.health / this.p2.maxHealth, PALETTE.p2, 'right');

    // meter bars
    this.drawDiagonalBar(pad, barY + 26, barW * 0.7, 8, this.p1.meter / CFG.METER_MAX, PALETTE.amber, 'left');
    this.drawDiagonalBar(CFG.W - pad - barW * 0.7, barY + 26, barW * 0.7, 8, this.p2.meter / CFG.METER_MAX, PALETTE.amber, 'right');

    // names
    textFont('Bebas Neue'); textAlign(LEFT); fill(PALETTE.p1); textSize(16);
    text(this.p1.name, pad, barY - 8);
    textAlign(RIGHT); fill(PALETTE.p2);
    text(this.p2.name, CFG.W - pad, barY - 8);

    // round pips
    textAlign(CENTER);
    for (let i = 0; i < CFG.ROUNDS_TO_WIN; i++) {
      fill(i < this.roundWins.p1 ? color(PALETTE.p1) : color(60));
      circle(CFG.W / 2 - 40 - i * 18, 20, 10);
      fill(i < this.roundWins.p2 ? color(PALETTE.p2) : color(60));
      circle(CFG.W / 2 + 40 + i * 18, 20, 10);
    }

    // timer
    fill(PALETTE.ink); textSize(30);
    text(Math.ceil(this.roundTime), CFG.W / 2, 42);

    // combo popups
    if (this.p1.comboCount >= 2) { fill(PALETTE.p1); textSize(16); textAlign(LEFT); text(`${this.p1.comboCount} HIT COMBO`, pad, 90); }
    if (this.p2.comboCount >= 2) { fill(PALETTE.p2); textSize(16); textAlign(RIGHT); text(`${this.p2.comboCount} HIT COMBO`, CFG.W - pad, 90); }

    // control hints
    textFont('Rubik'); fill(PALETTE.inkDim); textSize(11); textAlign(LEFT); noStroke();
    text('A/D move  W jump  S block  F light  G heavy  T special  R super   •   ESC pause', pad, CFG.H - 12);
    pop();
  }

  drawDiagonalBar(x, y, w, h, pct, col, side) {
    pct = clamp(pct, 0, 1);
    push();
    noStroke();
    fill(30);
    quad(x, y, x + w, y, x + w - h, y + h, x - h, y + h);
    fill(col);
    if (side === 'left') {
      const fw = w * pct;
      quad(x, y, x + fw, y, x + fw - h, y + h, x - h, y + h);
    } else {
      const fw = w * pct;
      quad(x + w - fw, y, x + w, y, x + w - h, y + h, x + w - h - fw, y + h);
    }
    pop();
  }
}

let GAME;

function preload() {}

function setup() {
  const c = createCanvas(CFG.W, CFG.H);
  c.parent(document.body);
  GAME = new Game();
  textFont('Rubik');
}

function draw() {
  const dt = clamp(deltaTime / (1000 / 60), 0.2, 3); // delta-time scaling, clamped to avoid tab-switch spikes
  GAME.update(dt);
  GAME.draw();

  // stash the fighter-card hit list generated during this frame's select-screen draw
  if (GAME._cardHits) { GAME._lastCardHits = GAME._cardHits; GAME._cardHits = null; }
  GAME._sliders = null;
}

function keyPressed() {
  justPressed.add(keyCode);
  AUDIO.init(); AUDIO.resume();
  if (keyCode === 27) { // ESC
    if (GAME.scene === SCENE.FIGHT || GAME.scene === SCENE.PAUSED) GAME.togglePause();
  }
  return false;
}
function keyReleased() { return false; }

function mousePressed() {
  GAME.handleClick(mouseX, mouseY);
}
function mouseDragged() {
  GAME.handleDrag(mouseX);
}