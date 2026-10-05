// Phaser is loaded globally from lib/phaser.min.js (see index.html).
class Missile extends Phaser.GameObjects.Container {

    constructor(scene, config) {
        super(scene, config.x, config.y);

        this.scene = scene;
        this.speed = config.speed;
        this.color = config.color;
        this.radius = config.radius ?? 4;
        this.trailDistance = config.trailDistance ?? 180;
        this.trailWidth = config.trailWidth ?? 4;
        this.targetX = config.targetX ?? null;
        this.targetY = config.targetY ?? null;
        this.target = config.target ?? null;
        this.kind = config.kind ?? 'player';
        this.onImpact = config.onImpact ?? null;
        this.onDestroyed = config.onDestroyed ?? null;

        this.isFlying = true;
        this.isDestroyed = false;

        this.trailPoints = [];
        this.trail = scene.add.graphics();
        this.trail.setDepth(config.trailDepth ?? 5);

        this.body = scene.add.circle(
            0,
            0,
            this.radius,
            this.color
        );

        this.body.setDepth(config.bodyDepth ?? 10);

        this.glow = scene.add.circle(
            0, 0, this.radius * 2.6, this.color, 0.28
        );

        // White hot core – pulses together with the glow.
        this.core = scene.add.circle(0, 0, this.radius * 0.55, 0xffffff, 0.9);
        this.pulse = Math.random() * Math.PI * 2;
        this.pulseSpeed = config.pulseSpeed ?? 26;

        this.add(this.glow);
        this.add(this.body);
        this.add(this.core);
        scene.add.existing(this);
    }

    update(dt) {
        if (!this.isFlying || this.isDestroyed)
            return;

        // Warhead brightness oscillation.
        this.pulse += dt * this.pulseSpeed;
        const k = (Math.sin(this.pulse) + 1) / 2;
        this.glow.setAlpha(0.04 + 0.66 * k);
        this.glow.setScale(0.5 + 1.0 * k);
        this.core.setAlpha(0.1 + 0.9 * k);
        this.core.setScale(0.7 + 0.7 * k);

        const target = this.target;

        const tx = target
            ? target.x
            : this.targetX;

        const ty = target
            ? target.y
            : this.targetY;

        const dx = tx - this.x;
        const dy = ty - this.y;
        const distance = Math.hypot(dx, dy);

        const maxStep = this.speed * dt;

        if (distance <= Math.max(6, maxStep)) {
            this.x = tx;
            this.y = ty;

            this.updateTrail();
            this.impact();
            return;
        }

        this.x += dx / distance * maxStep;
        this.y += dy / distance * maxStep;

        this.updateTrail();
    }

    updateTrail() {
        const points = this.trailPoints;

        if (points.length === 0) {
            points.push({
                x: this.x,
                y: this.y,
                distanceFromHead: 0
            });
        }
        else {
            const last = points[points.length - 1];

            const segmentDistance =
                Phaser.Math.Distance.Between(
                    last.x,
                    last.y,
                    this.x,
                    this.y
                );

            if (segmentDistance < 0.5)
                return;

            points.push({
                x: this.x,
                y: this.y,
                distanceFromHead: 0
            });

            for (let i = points.length - 2; i >= 0; i--) {
                points[i].distanceFromHead += segmentDistance;
            }
        }

        while (
            points.length > 1 &&
            points[0].distanceFromHead > this.trailDistance
        ) {
            points.shift();
        }

        this.trail.clear();

        for (let i = 1; i < points.length; i++) {
            const p1 = points[i - 1];
            const p2 = points[i];

            const alpha = Math.max(
                0.05,
                1 - p2.distanceFromHead / this.trailDistance
            );

            this.trail.lineStyle(
                this.trailWidth * 3,
                this.color,
                alpha * 0.16
            );

            this.trail.beginPath();
            this.trail.moveTo(p1.x, p1.y);
            this.trail.lineTo(p2.x, p2.y);
            this.trail.strokePath();

            this.trail.lineStyle(
                this.trailWidth,
                this.color,
                alpha * 0.9
            );

            this.trail.beginPath();
            this.trail.moveTo(p1.x, p1.y);
            this.trail.lineTo(p2.x, p2.y);
            this.trail.strokePath();
        }
    }

    impact() {
        if (!this.isFlying || this.isDestroyed)
            return;

        this.isFlying = false;

        if (this.body)
            this.body.setVisible(false);

        if (this.glow)
            this.glow.setVisible(false);

        if (this.core)
            this.core.setVisible(false);

        if (this.onImpact)
            this.onImpact(this);

        const trail = this.trail;

        if (!trail || !trail.active) {
            this.finishDestroy();
            return;
        }

        this.scene.tweens.add({
            targets: trail,
            alpha: 0,
            duration: 950,
            ease: 'Linear',
            onComplete: () => {
                this.finishDestroy();
            }
        });
    }

    finishDestroy() {
        if (this.isDestroyed)
            return;

        this.isDestroyed = true;

        if (this.trail && this.trail.active)
            this.trail.destroy();

        this.trail = null;

        if (this.onDestroyed)
            this.onDestroyed(this);

        this.destroy();
    }

    destroyImmediately() {
        if (this.isDestroyed)
            return;

        this.isFlying = false;
        this.isDestroyed = true;

        if (this.trail && this.trail.active)
            this.trail.destroy();

        this.trail = null;

        if (this.onDestroyed)
            this.onDestroyed(this);

        this.destroy();
    }
}

// Difficulty.
const ENEMY_START_SPEED = 100;    // px/s in wave 1
const ENEMY_START_COUNT = 10;     // enemy missiles in wave 1
const ENEMY_LAUNCH_DELAY = 600;   // ms between enemy launches
const ENEMY_COUNT_STEP = 2;       // +2 enemy missiles each wave
const ENEMY_SPEED_STEP = 0.05;    // each wave +5 % of the START speed (linear)

// UFOs: from wave 2, one more every 2 waves (2-3: 1, 4-5: 2, 6-7: 3 ...).
const UFO_FIRST_WAVE = 2;
// UFO types: unlocked from a given wave, picked at random from those available.
const UFO_TYPES = {
    saucer: {
        name: 'SAUCER', fromWave: 2, speed: 110, scale: 1, hp: 1, points: 100,
        salvo: [1, 3], fire: [1500, 2600], dome: 0x80deea, hull: 0xb0bec5, hullDark: 0x546e7a
    },
    scout: {
        name: 'SCOUT', fromWave: 4, speed: 175, scale: 0.7, hp: 1, points: 150,
        salvo: [1, 1], fire: [900, 1500], dome: 0xa5d6a7, hull: 0x9e9e9e, hullDark: 0x424242
    },
    mothership: {
        name: 'MOTHERSHIP', fromWave: 6, speed: 60, scale: 1.6, hp: 2, points: 300,
        salvo: [2, 4], fire: [2000, 3000], dome: 0xce93d8, hull: 0x90a4ae, hullDark: 0x37474f
    }
};
const UFO_RESPAWN_DELAY = 1500;   // ms before the next UFO appears (only 1 on screen)

// Smart bombs: wave 3, 6, 9 ... (1 at wave 3, 2 at wave 6, ...).
const BOMB_EVERY = 3;
const BOMB_POINTS = 200;
const BOMB_SPEED_FACTOR = 0.9;    // relative to current enemy speed
const BOMB_AVOID_MARGIN = 38;     // px kept away from an explosion's edge

// Mercy rule: each wave the enemy targets at most 3 cities (plus all silos).
// When those cities are destroyed the wave ends – the enemy withdraws.
const MERCY_CITY_TARGETS = 3;

// Splitting missiles (MIRV): from wave 6 an enemy missile may split in the
// air into 2 or more (max 2 in phase 1, +1 per phase). The children are taken
// from the wave's remaining missiles, so the wave total is never exceeded.
const SPLIT_FROM_WAVE = 6;
const SPLIT_CHANCE = 0.20;

// Perfect defense: no hit on the ground, every enemy destroyed (no UFO escaped)
// → bonus = 20 % of the points earned in that wave.
const PERFECT_BONUS = 0.20;

// Defensive cloud timing (ms) – grows, then shrinks.
const CLOUD_EXPAND_MS = 440;
const CLOUD_SHRINK_MS = 810;

// Player.
const PLAYER_MISSILE_SPEED = 540;  // px/s (+20 % from 450)
const DOOMSDAY_START = 1;          // doomsday missiles at the start
// +1 doomsday missile for every completed phase (every 6 waves).
const MOTHERSHIP_BOMB_CHANCE = 0.35; // chance a mothership drops a smart bomb instead of a salvo
const BONUS_CITY_EVERY = 5000;     // points per bonus city
const MAX_START_WAVE = 40;

// High score table (browser localStorage).
const HS_KEY = 'missileCommander.highScores';
const HS_MAX = 10;

function loadHighScores() {
    try {
        const list = JSON.parse(localStorage.getItem(HS_KEY) || '[]');
        if (!Array.isArray(list))
            return [];
        return list
            .filter(e => e && typeof e.name === 'string' && Number.isFinite(e.score))
            .sort((a, b) => b.score - a.score)
            .slice(0, HS_MAX);
    }
    catch (e) {
        return [];
    }
}

function qualifiesForHighScore(score) {
    if (score <= 0)
        return false;
    const list = loadHighScores();
    return list.length < HS_MAX || score > list[list.length - 1].score;
}

// Returns the rank (0-based) of the new entry, or -1.
function saveHighScore(entry) {
    const list = loadHighScores();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, HS_MAX);

    try {
        localStorage.setItem(HS_KEY, JSON.stringify(top));
    }
    catch (e) {
        // Storage blocked (private mode etc.) – table just won't persist.
    }

    return top.indexOf(entry);
}

// A phase has 10 waves; each wave in a phase has its own colour scheme.
// Wave 5 of each phase is a UFO attack, wave 10 a smart bomb rain.
const PHASE_LENGTH = 10;

const WAVE_PALETTES = [
    { name: 'NIGHT',   sky: 0x050914, ground: 0x101b24, haze: 0x1d4a6b, line: 0x4fc3f7, enemy: 0xff2020 },
    { name: 'DUSK',    sky: 0x0e0618, ground: 0x1d1026, haze: 0x5a2a7a, line: 0xc77dff, enemy: 0x39ff14 },
    { name: 'TOXIC',   sky: 0x03100a, ground: 0x0d2016, haze: 0x1f6b3a, line: 0x69f0ae, enemy: 0xff3df2 },
    { name: 'STORM',   sky: 0x0a0d14, ground: 0x1a1f2b, haze: 0x3d4a66, line: 0x9fa8da, enemy: 0xff9100 },
    { name: 'NEON',    sky: 0x0b0418, ground: 0x1a0b2e, haze: 0x6a1b9a, line: 0xff4081, enemy: 0x18ffff },
    { name: 'DESERT',  sky: 0x120c02, ground: 0x2a1d08, haze: 0x7a5a1d, line: 0xffd54f, enemy: 0xff1744 },
    { name: 'ICE',     sky: 0x041318, ground: 0x0d2a30, haze: 0x2a7a8a, line: 0xb2ebf2, enemy: 0xffea00 },
    { name: 'ABYSS',   sky: 0x010d12, ground: 0x062028, haze: 0x0e5a6b, line: 0x4dd0e1, enemy: 0xff6e40 },
    { name: 'SOLAR',   sky: 0x140a00, ground: 0x2b1600, haze: 0x8a4b00, line: 0xffab40, enemy: 0x7c4dff },
    { name: 'INFERNO', sky: 0x160505, ground: 0x261010, haze: 0x7a2a1d, line: 0xff8a65, enemy: 0x00e5ff }
];

const paletteForWave = w => WAVE_PALETTES[(w - 1) % WAVE_PALETTES.length];
const phaseForWave = w => Math.floor((w - 1) / PHASE_LENGTH) + 1;

// Everything a wave contains – used by the game and by the wave table.
// Enemy missile buffer: 10 in wave 1, +2 every wave. Missiles launched from
// the top AND missiles fired by UFOs are all drawn from this one buffer.
function getWaveSpec(w) {
    const pos = (w - 1) % PHASE_LENGTH + 1;        // 1..10 inside the phase
    const level = phaseForWave(w) - 1;              // 0 in phase 1
    const buffer = ENEMY_START_COUNT + ENEMY_COUNT_STEP * (w - 1);

    // Special wave 5: UFOs only, several at once (4 in phase 1, 5 in phase 2 ...)
    // and faster than usual (+30 %, +10 % more each phase).
    if (pos === 5) {
        const atOnce = 4 + level;
        return {
            special: 'ufo', title: 'UFO ATTACK',
            // Same buffer, but nothing is launched from the top – only UFOs fire.
            missiles: buffer, noTopLaunch: true,
            ufos: atOnce * 3, ufoAtOnce: atOnce, ufoBombOnly: false, bombs: 0,
            ufoSpeedMul: 1.3 + 0.1 * level
        };
    }

    // Special wave 10: smart bombs only, plus a few UFO bombers dropping more.
    if (pos === PHASE_LENGTH) {
        return {
            special: 'bombs', title: 'SMART BOMB RAIN',
            // Bomb wave: no missiles at all, only smart bombs.
            missiles: 0, noTopLaunch: true,
            ufos: 2 + level, ufoAtOnce: 1, ufoBombOnly: true, bombs: 6 + 2 * level
        };
    }

    const ufos = w >= UFO_FIRST_WAVE ? Math.floor(w / 2) : 0;
    return {
        special: null, title: '',
        missiles: buffer,
        noTopLaunch: false,
        ufos,
        ufoAtOnce: 1,
        ufoBombOnly: false,
        bombs: w % BOMB_EVERY === 0 ? w / BOMB_EVERY : 0
    };
}

// Scoring.
const KILL_POINTS = 50;
const CITY_BONUS = 100;
const AMMO_BONUS = 10;

const hexColor = c => '#' + c.toString(16).padStart(6, '0');

// ---------------------------------------------------------------------------
// Settings (browser localStorage): key bindings + sound volume.
// Keys are stored as KeyboardEvent.code values (e.g. 'KeyQ', 'Space').
// ---------------------------------------------------------------------------
const SETTINGS_KEY = 'missileCommander.settings';

const DEFAULT_SETTINGS = {
    keys: {
        left: 'KeyQ',
        center: 'KeyW',
        right: 'KeyE',
        doomsday: 'KeyT',
        pause: 'KeyP'
    },
    volume: 0.5,
    waveSound: 'SIREN'
};

const WAVE_SOUNDS = ['SIREN', 'ARCADE', 'SONAR'];

const KEY_ACTIONS = [
    { id: 'left', label: 'FIRE LEFT SILO' },
    { id: 'center', label: 'FIRE CENTRE SILO' },
    { id: 'right', label: 'FIRE RIGHT SILO' },
    { id: 'doomsday', label: 'DOOMSDAY MISSILE', note: '+ right mouse button' },
    { id: 'pause', label: 'PAUSE', note: '+ ESC' }
];

function loadSettings() {
    try {
        const o = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        const volume = Number.isFinite(o.volume)
            ? Math.min(1, Math.max(0, o.volume))
            : DEFAULT_SETTINGS.volume;
        const waveSound = WAVE_SOUNDS.includes(o.waveSound) ? o.waveSound : DEFAULT_SETTINGS.waveSound;
        return { keys: { ...DEFAULT_SETTINGS.keys, ...(o.keys || {}) }, volume, waveSound };
    }
    catch (e) {
        return { keys: { ...DEFAULT_SETTINGS.keys }, volume: DEFAULT_SETTINGS.volume, waveSound: DEFAULT_SETTINGS.waveSound };
    }
}

const SETTINGS = loadSettings();

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS));
    }
    catch (e) {
        // Storage blocked – settings just won't persist.
    }
}

function keyLabel(code) {
    if (!code)
        return '-';
    return code
        .replace(/^Key/, '')
        .replace(/^Digit/, '')
        .replace(/^Numpad/, 'NUM ')
        .replace(/^Arrow/, '')
        .replace(/Left$|Right$/, m => (code.startsWith('Arrow') ? m : ' ' + m[0]))
        .toUpperCase();
}

function clearHighScores() {
    try {
        localStorage.removeItem(HS_KEY);
    }
    catch (e) {
        // ignore
    }
}

// ---------------------------------------------------------------------------
// Sound effects – synthesised with the Web Audio API (no audio files).
// The audio context is created / resumed on the first click or key press.
// ---------------------------------------------------------------------------
const Sfx = {
    ctx: null,
    master: null,
    noiseBuf: null,
    last: {},

    // Minimum time (s) between two plays of the same sound.
    gaps: { explosion: 0.04, tick: 0.02, launch: 0.03, nuke: 0.15, empty: 0.12 },

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended' && !this.held)
                this.ctx.resume();
            return;
        }

        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC)
            return;

        try {
            this.ctx = new AC();
        }
        catch (e) {
            return;
        }

        // Master volume → compressor (lets effects be loud without clipping).
        this.master = this.ctx.createGain();
        this.master.gain.value = SETTINGS.volume;

        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 10;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;

        this.master.connect(comp);
        comp.connect(this.ctx.destination);

        const len = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++)
            data[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
    },

    setVolume(v) {
        if (this.master)
            this.master.gain.value = v;
    },

    // Used by pause: silence everything (incl. UFO hum) until resumed.
    hold() {
        this.held = true;
        if (this.ctx)
            this.ctx.suspend();
    },

    release() {
        this.held = false;
        if (this.ctx)
            this.ctx.resume();
    },

    ok(name) {
        if (!this.ctx || this.held || this.ctx.state === 'closed' || SETTINGS.volume <= 0)
            return false;

        const now = this.ctx.currentTime;
        const gap = this.gaps[name] || 0;
        if (gap && this.last[name] && now - this.last[name] < gap)
            return false;

        this.last[name] = now;
        return true;
    },

    tone(o) {
        const c = this.ctx;
        const t = c.currentTime + (o.delay || 0);
        const osc = c.createOscillator();
        const g = c.createGain();

        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(o.f, t);
        if (o.f2)
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + o.dur);

        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + (o.att || 0.005));
        g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

        osc.connect(g);
        g.connect(this.master);
        osc.start(t);
        osc.stop(t + o.dur + 0.05);
    },

    noise(o) {
        const c = this.ctx;
        const t = c.currentTime + (o.delay || 0);
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;

        const f = c.createBiquadFilter();
        f.type = o.filter || 'lowpass';
        f.frequency.setValueAtTime(o.f || 1000, t);
        if (o.q)
            f.Q.value = o.q;
        if (o.f2)
            f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);

        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + (o.att || 0.005));
        g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

        src.connect(f);
        f.connect(g);
        g.connect(this.master);
        src.start(t);
        src.stop(t + o.dur + 0.05);
    },

    play(name, arg) {
        const fn = this.sounds[name];
        if (!fn || !this.ok(name))
            return;
        try {
            fn.call(this, arg);
        }
        catch (e) {
            // never let audio break the game
        }
    },

    sounds: {
        launch() {
            // Heavy launch: short crack + dark rumbling boom + sub drop
            // (this used to be the defensive explosion sound).
            this.noise({ filter: 'highpass', f: 2500, dur: 0.04, vol: 0.25 });
            this.noise({ f: 1100, f2: 60, dur: 1.4, vol: 0.45, att: 0.006 });
            this.tone({ type: 'sine', f: 75, f2: 24, dur: 1.2, vol: 0.42, att: 0.005 });
            this.tone({ type: 'sawtooth', f: 58, f2: 30, dur: 0.5, vol: 0.06 });
        },
        empty() {
            this.tone({ type: 'square', f: 110, dur: 0.07, vol: 0.08 });
        },
        explosion(size = 1) {
            // Defensive explosion = the former city-hit boom (scaled by size).
            this.noise({ f: 900, f2: 50, dur: 1.4 + size, vol: 0.55 * size, att: 0.02 });
            this.tone({ type: 'sine', f: 70, f2: 22, dur: 1.2 + 0.8 * size, vol: 0.5 * size });
            this.tone({ type: 'sawtooth', f: 55, f2: 30, dur: 1.2, vol: 0.1 * size });
        },
        nuke() {
            // City / silo hit – the big one:
            // crack → massive sub drop → distorted, fluttering rumble,
            // a delayed echo boom, debris crackles and a low growl.
            const c = this.ctx;
            const t = c.currentTime;

            this.noise({ filter: 'highpass', f: 1800, dur: 0.09, vol: 0.6 });
            this.tone({ type: 'sine', f: 95, f2: 18, dur: 3.2, vol: 0.75, att: 0.004 });
            this.tone({ type: 'sawtooth', f: 46, f2: 24, dur: 2.2, vol: 0.13, att: 0.01 });

            // Distorted rumble with an amplitude flutter.
            const src = c.createBufferSource();
            src.buffer = this.noiseBuf;
            src.loop = true;
            const lp = c.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(1800, t);
            lp.frequency.exponentialRampToValueAtTime(45, t + 4);
            const shaper = c.createWaveShaper();
            const curve = new Float32Array(1024);
            for (let i = 0; i < curve.length; i++) {
                const x = i / (curve.length - 1) * 2 - 1;
                curve[i] = Math.tanh(4 * x);
            }
            shaper.curve = curve;
            const env = c.createGain();
            env.gain.setValueAtTime(0.0001, t);
            env.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
            env.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
            const flutter = c.createGain();
            flutter.gain.value = 0.75;
            const lfo = c.createOscillator();
            lfo.frequency.setValueAtTime(9, t);
            lfo.frequency.exponentialRampToValueAtTime(3, t + 4);
            const lfoDepth = c.createGain();
            lfoDepth.gain.value = 0.25;
            lfo.connect(lfoDepth);
            lfoDepth.connect(flutter.gain);
            src.connect(lp);
            lp.connect(shaper);
            shaper.connect(env);
            env.connect(flutter);
            flutter.connect(this.master);
            src.start(t);
            lfo.start(t);
            src.stop(t + 4.3);
            lfo.stop(t + 4.3);

            // Echo boom from the distance.
            this.noise({ f: 500, f2: 60, dur: 2.0, vol: 0.32, att: 0.02, delay: 0.55 });
            this.tone({ type: 'sine', f: 60, f2: 25, dur: 1.4, vol: 0.3, delay: 0.55 });

            // Falling debris crackles.
            for (let i = 0; i < 14; i++) {
                this.noise({
                    filter: 'highpass', f: 2500 + Math.random() * 4000, dur: 0.02 + Math.random() * 0.03,
                    vol: 0.08 + Math.random() * 0.08, delay: 0.3 + Math.random() * 2.4
                });
            }
        },
        hit() {
            this.tone({ type: 'square', f: 320, f2: 140, dur: 0.16, vol: 0.1 });
        },
        ufoDown() {
            this.tone({ type: 'sawtooth', f: 700, f2: 60, dur: 0.7, vol: 0.12 });
        },
        split() {
            this.tone({ type: 'square', f: 1800, f2: 900, dur: 0.06, vol: 0.06 });
            this.tone({ type: 'square', f: 1400, f2: 600, dur: 0.06, vol: 0.05, delay: 0.06 });
            this.noise({ filter: 'highpass', f: 4000, dur: 0.05, vol: 0.08 });
        },
        bombAlert() {
            [0, 0.14].forEach(d => this.tone({ type: 'square', f: 1320, dur: 0.08, vol: 0.06, delay: d }));
        },
        tick() {
            this.tone({ type: 'square', f: 1500, dur: 0.035, vol: 0.05 });
        },
        cityTick() {
            this.tone({ type: 'triangle', f: 880, f2: 1320, dur: 0.12, vol: 0.12 });
        },
        total() {
            [523, 659, 784].forEach((f, i) =>
                this.tone({ type: 'triangle', f, dur: 0.22, vol: 0.12, delay: i * 0.07 }));
        },
        perfect() {
            // Victory fanfare: rising arpeggio, then a held major chord.
            [523, 659, 784, 1047, 1319].forEach((f, i) =>
                this.tone({ type: 'square', f, dur: 0.12, vol: 0.06, att: 0.003, delay: i * 0.09 }));
            [523, 659, 784, 1047].forEach(f =>
                this.tone({ type: 'triangle', f, dur: 1.2, vol: 0.09, att: 0.02, delay: 0.5 }));
            this.tone({ type: 'sine', f: 131, dur: 1.2, vol: 0.2, att: 0.02, delay: 0.5 });
        },
        bonus() {
            [523, 659, 784, 1047].forEach((f, i) =>
                this.tone({ type: 'triangle', f, dur: 0.25, vol: 0.14, delay: i * 0.09 }));
        },
        // Wave start sound – three styles, chosen in Settings.
        waveStart(phase) {
            const fn = {
                SIREN: this.sounds.waveSiren,
                ARCADE: this.sounds.waveArcade,
                SONAR: this.sounds.waveSonar
            }[SETTINGS.waveSound] || this.sounds.waveSiren;
            fn.call(this, phase);
        },

        // SIREN: air-raid siren rising and falling over a low drone.
        waveSiren(phase) {
            const c = this.ctx;
            const t = c.currentTime;
            const k = phase ? 1.2 : 1;

            const lp = c.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 1800;
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.09, t + 0.15);
            g.gain.setValueAtTime(0.09, t + 2.2);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
            lp.connect(g);
            g.connect(this.master);

            [['sawtooth', 1], ['sine', 1.006]].forEach(([type, mul]) => {
                const o = c.createOscillator();
                o.type = type;
                const f = o.frequency;
                f.setValueAtTime(380 * k * mul, t);
                f.linearRampToValueAtTime(820 * k * mul, t + 0.6);
                f.linearRampToValueAtTime(380 * k * mul, t + 1.2);
                f.linearRampToValueAtTime(820 * k * mul, t + 1.8);
                f.linearRampToValueAtTime(300 * k * mul, t + 2.8);
                o.connect(lp);
                o.start(t);
                o.stop(t + 2.9);
            });

            this.tone({ type: 'sine', f: 55, dur: 2.8, vol: 0.15, att: 0.2 });
        },

        // ARCADE: quick 8-bit fanfare with a triangle bass line.
        waveArcade(phase) {
            const k = phase ? 1.26 : 1;
            const melody = [523, 659, 784, 1047, 784, 1047, 1319];
            melody.forEach((f, i) => {
                const last = i === melody.length - 1;
                this.tone({
                    type: 'square', f: f * k, dur: last ? 0.45 : 0.1,
                    vol: 0.07, att: 0.003, delay: i * 0.1
                });
            });
            [131, 196, 262, 196].forEach((f, i) =>
                this.tone({ type: 'triangle', f: f * k, dur: 0.22, vol: 0.18, att: 0.005, delay: i * 0.2 }));
            this.noise({ filter: 'highpass', f: 6000, dur: 0.05, vol: 0.08, delay: 0.6 });
        },

        // SONAR: two heartbeat thumps, then a deep sonar ping with echoes.
        waveSonar(phase) {
            const c = this.ctx;
            const t = c.currentTime;

            [0, 0.28].forEach(d =>
                this.tone({ type: 'sine', f: 65, f2: 38, dur: 0.2, vol: 0.38, att: 0.004, delay: d }));

            // Echo network: delay with filtered feedback.
            const delay = c.createDelay(1);
            delay.delayTime.value = 0.34;
            const fb = c.createGain();
            fb.gain.value = 0.48;
            const lp = c.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 2200;
            delay.connect(lp);
            lp.connect(fb);
            fb.connect(delay);
            lp.connect(this.master);

            const start = t + 0.65;
            const o = c.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(phase ? 1500 : 1180, start);
            o.frequency.exponentialRampToValueAtTime(phase ? 1420 : 1120, start + 1.2);
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, start);
            g.gain.exponentialRampToValueAtTime(0.13, start + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, start + 1.3);
            o.connect(g);
            g.connect(this.master);
            g.connect(delay);
            o.start(start);
            o.stop(start + 1.4);

            // Let the echoes ring out, then disconnect the feedback loop.
            setTimeout(() => {
                try {
                    fb.disconnect();
                }
                catch (e) {
                    // ignore
                }
            }, 4500);
        },

        withdraw() {
            [660, 550, 440].forEach((f, i) =>
                this.tone({ type: 'triangle', f, dur: 0.25, vol: 0.1, delay: i * 0.12 }));
        },
        gameOver() {
            [392, 330, 262, 196].forEach((f, i) =>
                this.tone({ type: 'sawtooth', f, dur: 0.4, vol: 0.09, delay: i * 0.28 }));
        },
        doomLaunch() {
            this.tone({ type: 'sawtooth', f: 80, f2: 1200, dur: 0.9, vol: 0.12 });
            this.noise({ filter: 'bandpass', f: 400, f2: 3000, dur: 0.9, vol: 0.1 });
        },
        doomBlast() {
            this.noise({ f: 3000, f2: 60, dur: 3.0, vol: 0.7, att: 0.01 });
            this.tone({ type: 'sine', f: 90, f2: 20, dur: 2.5, vol: 0.6 });
        },
        click() {
            this.tone({ type: 'square', f: 900, dur: 0.04, vol: 0.06 });
        }
    },

    // Classic sci-fi UFO warble; returns a handle with stop() and setPan().
    hum(typeKey = 'saucer') {
        if (!this.ok('hum'))
            return null;

        const presets = {
            saucer: { f: 520, depth: 170, rate: 8, vol: 0.05 },
            scout: { f: 880, depth: 260, rate: 15, vol: 0.04 },
            mothership: { f: 150, depth: 45, rate: 3.5, vol: 0.08 }
        };
        const p = presets[typeKey] || presets.saucer;

        try {
            const c = this.ctx;
            const now = c.currentTime;

            // Main warbling sine (pitch wobbled by an LFO).
            const osc = c.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = p.f;

            const lfo = c.createOscillator();
            lfo.frequency.value = p.rate;
            const lfoGain = c.createGain();
            lfoGain.gain.value = p.depth;
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);

            // Low buzzing body one octave below.
            const body = c.createOscillator();
            body.type = 'square';
            body.frequency.value = p.f / 2;
            const bodyFilter = c.createBiquadFilter();
            bodyFilter.type = 'lowpass';
            bodyFilter.frequency.value = 700;
            const bodyGain = c.createGain();
            bodyGain.gain.value = 0.25;
            lfoGain.connect(body.frequency);
            body.connect(bodyFilter);
            bodyFilter.connect(bodyGain);

            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, now);
            g.gain.exponentialRampToValueAtTime(p.vol, now + 0.4);

            const pan = c.createStereoPanner ? c.createStereoPanner() : null;

            osc.connect(g);
            bodyGain.connect(g);
            if (pan) {
                g.connect(pan);
                pan.connect(this.master);
            }
            else {
                g.connect(this.master);
            }

            osc.start();
            lfo.start();
            body.start();

            return {
                setPan: v => {
                    if (pan)
                        pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)), c.currentTime, 0.05);
                },
                stop: () => {
                    try {
                        const t = c.currentTime;
                        g.gain.cancelScheduledValues(t);
                        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
                        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
                        [osc, lfo, body].forEach(o => o.stop(t + 0.3));
                    }
                    catch (e) {
                        // already stopped
                    }
                }
            };
        }
        catch (e) {
            return null;
        }
    }
};

// Browsers only allow audio after a user gesture.
window.addEventListener('pointerdown', () => Sfx.init());
window.addEventListener('keydown', () => Sfx.init());



// Silos: mound + ammo pyramid (4-3-2-1 = 10 missiles).
const SILO_MOUND_H = 26;
const SILO_PAD_H = 4;
const SILO_ROWS = [4, 3, 2, 1];
const AMMO_PYRAMID_MAX = 10;
const AMMO_STEP_X = 14;
const AMMO_STEP_Y = 15;

// Draws a UFO of the given type into a Graphics object (centre 0,0).
function drawUfoShape(g, typeKey, s = 1) {
    const t = UFO_TYPES[typeKey];

    // Dome.
    g.fillStyle(t.dome, 0.85);
    g.slice(0, -2 * s, 13 * s, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(-4 * s, -9 * s, 6 * s, 4 * s);

    // Hull.
    g.fillStyle(t.hullDark, 1);
    g.fillEllipse(0, 4 * s, 50 * s, 14 * s);
    g.fillStyle(t.hull, 1);
    g.fillEllipse(0, 0, 64 * s, 13 * s);
    g.fillStyle(0xffffff, 0.6);
    g.fillRect(-30 * s, -1.5 * s, 60 * s, 2 * s);

    if (typeKey === 'scout') {
        // Swept fins.
        g.fillStyle(t.hullDark, 1);
        g.fillTriangle(-30 * s, 0, -42 * s, -6 * s, -24 * s, -3 * s);
        g.fillTriangle(30 * s, 0, 42 * s, -6 * s, 24 * s, -3 * s);
    }

    if (typeKey === 'mothership') {
        // Lower deck with hangar lights.
        g.fillStyle(t.hullDark, 1);
        g.fillEllipse(0, 9 * s, 34 * s, 9 * s);
        g.fillStyle(0xffd54f, 0.9);
        for (let i = -2; i <= 2; i++)
            g.fillRect(i * 6 * s - 1.5 * s, 8 * s, 3 * s, 2 * s);
    }
}

// Doomsday missile standing upright, base at (x, baseY).
function drawDoomIcon(g, x, baseY, s = 1) {
    // Fins.
    g.fillStyle(0x8d6e00, 1);
    g.fillTriangle(x - 4 * s, baseY - 9 * s, x - 9 * s, baseY, x - 4 * s, baseY);
    g.fillTriangle(x + 4 * s, baseY - 9 * s, x + 9 * s, baseY, x + 4 * s, baseY);
    // Body with lit left side.
    g.fillStyle(0xffc107, 1);
    g.fillRect(x - 4 * s, baseY - 30 * s, 8 * s, 30 * s);
    g.fillStyle(0xfff59d, 1);
    g.fillRect(x - 4 * s, baseY - 30 * s, 2.5 * s, 30 * s);
    // Hazard bands.
    g.fillStyle(0x212121, 1);
    g.fillRect(x - 4 * s, baseY - 22 * s, 8 * s, 2 * s);
    g.fillRect(x - 4 * s, baseY - 12 * s, 8 * s, 2 * s);
    // Red nose cone.
    g.fillStyle(0xff3d00, 1);
    g.fillTriangle(x - 4 * s, baseY - 30 * s, x + 4 * s, baseY - 30 * s, x, baseY - 40 * s);
}

// Mushroom cloud (fireball, stem, cap, ground shockwave) – purely visual.
// Used for city / silo hits and on the title screen.
function spawnMushroom(scene, x, groundY, scale = 1) {
    const C = Phaser.Display.Color;
    const stops = [
        [0.00, 0xfff8e1],
        [0.18, 0xffc04a],
        [0.40, 0xe2541c],
        [0.62, 0x7a2d22],
        [1.00, 0x4a4f5a]
    ];
    const heat = t => {
        for (let i = 1; i < stops.length; i++) {
            if (t <= stops[i][0]) {
                const [t0, c0] = stops[i - 1];
                const [t1, c1] = stops[i];
                const p = Math.round((t - t0) / (t1 - t0) * 100);
                const c = C.Interpolate.ColorWithColor(
                    C.ValueToColor(c0), C.ValueToColor(c1), 100, p
                );
                return C.GetColor(c.r, c.g, c.b);
            }
        }
        return stops[stops.length - 1][1];
    };


    // Ground shockwave ring.
    const ring = scene.add.ellipse(x, groundY - 2, 20, 6)
        .setStrokeStyle(3, 0xfff3c4, 0.9)
        .setDepth(16);
    scene.tweens.add({
        targets: ring,
        scaleX: 16 * scale,
        scaleY: 4 * scale,
        alpha: 0,
        duration: 900,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy()
    });

    const g = scene.add.graphics().setDepth(16);
    g.x = x;
    g.y = groundY;
    g.setScale(scale);

    const puffs = [];
    for (let i = 0; i < 9; i++) {
        puffs.push({
            a: i / 9 * Math.PI * 2,
            r: Phaser.Math.FloatBetween(0.35, 0.55),
            wob: Phaser.Math.FloatBetween(0, Math.PI * 2)
        });
    }

    const ease = v => 1 - Math.pow(1 - Math.min(1, v), 3);

    scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 2900,
        onUpdate: tw => {
            const t = tw.getValue();
            const rise = ease(t / 0.45);
            const fy = -18 - rise * 95;                 // fireball height
            const capR = 12 + 30 * ease(t / 0.5);       // cap radius
            const col = heat(t);
            const alpha = t < 0.65 ? 1 : Math.max(0, 1 - (t - 0.65) / 0.35);

            g.clear();

            // Dust cloud on the ground.
            g.fillStyle(heat(Math.min(1, t + 0.3)), alpha * 0.8);
            g.fillEllipse(0, -4, 40 + 120 * rise, 12 + 12 * rise);

            // Stem.
            const sw = 7 + 7 * rise;
            g.fillStyle(heat(Math.min(1, t + 0.15)), alpha * 0.85);
            g.fillRect(-sw / 2, fy, sw, -fy - 4);
            g.fillStyle(0xffffff, alpha * 0.15);
            g.fillRect(-sw / 2, fy, sw * 0.35, -fy - 4);

            // Cap: big flattened fireball + rolling puffs around it.
            g.fillStyle(col, alpha);
            g.fillEllipse(0, fy, capR * 2.5, capR * 1.35);
            puffs.forEach(p => {
                const a = p.a + t * 2.2;
                const px = Math.cos(a) * capR * 1.05;
                const py = Math.sin(a) * capR * 0.5;
                const pr = capR * (p.r + Math.sin(t * 9 + p.wob) * 0.05);
                g.fillStyle(heat(Math.min(1, t + (py > 0 ? 0.12 : 0))), alpha);
                g.fillCircle(px, fy + py, pr);
            });

            // Underside ring of the mushroom.
            g.fillStyle(heat(Math.min(1, t + 0.2)), alpha * 0.9);
            g.fillEllipse(0, fy + capR * 0.55, capR * 1.6, capR * 0.45);

            // Hot core early on.
            if (t < 0.35) {
                g.fillStyle(0xffffff, (0.35 - t) / 0.35);
                g.fillCircle(0, fy, capR * 0.55);
            }
        },
        onComplete: () => g.destroy()
    });
}

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
    }

    create(data) {
        const startWave = Phaser.Math.Clamp(
            (data && data.startWave) || 1, 1, MAX_START_WAVE
        );

        this.score = 0;
        this.wave = startWave;
        this.isFirstWave = true;
        this.missiles = [10, 10, 10];

        this.bonusCities = 0;
        this.doomsdays = DOOMSDAY_START;
        this.doomsdayActive = false;
        this.nextBonusAt = BONUS_CITY_EVERY;
        this.isPaused = false;

        this.enemySpeed = ENEMY_START_SPEED * (1 + ENEMY_SPEED_STEP * (startWave - 1));
        this.enemiesRemaining = 0;
        this.waveFinished = false;
        this.waveKills = 0;
        this.waveUfoKills = [];
        this.waveBombKills = 0;
        this.waveImpacts = 0;
        this.waveUfoEscapes = 0;
        this.ufosToSpawn = 0;
        this.bombsToSpawn = 0;
        this.inSummary = false;
        this.isGameOver = false;

        this.ufos = [];
        this.bombs = [];
        this.enemyMissiles = [];
        this.playerMissiles = [];
        this.explosions = [];
        this.cities = [];
        this.silos = [];

        this.createBackground();
        this.createCities();
        this.createSilos();
        this.createUI();
        this.createEffects();
        this.createDoomBay();

        // Configurable keys (see Settings).
        this.input.keyboard.on('keydown', event => {
            if (this.isGameOver)
                return;

            const k = SETTINGS.keys;
            if (event.code === k.left)
                this.fireFromSilo(0);
            else if (event.code === k.center)
                this.fireFromSilo(1);
            else if (event.code === k.right)
                this.fireFromSilo(2);
            else if (event.code === k.doomsday)
                this.fireDoomsday();
            else if (event.code === k.pause || event.code === 'Escape')
                this.pauseGame();
        });

        // Left click fires, right click = doomsday missile.
        this.input.mouse.disableContextMenu();
        this.input.on('pointerdown', pointer => {
            if (pointer.rightButtonDown()) {
                this.fireDoomsday();
                return;
            }
            this.fireFromNearestSilo(pointer.x, pointer.y);
        });

        // Pause also when the browser tab is hidden.
        this.onHidden = () => this.pauseGame();
        this.game.events.on('hidden', this.onHidden);
        this.events.once('shutdown', () => this.game.events.off('hidden', this.onHidden));

        this.startWave();

        // Faster start: first enemy appears almost immediately.
        this.time.delayedCall(250, () => this.launchEnemy());

        this.waveTimer = this.time.addEvent({
            delay: ENEMY_LAUNCH_DELAY,
            callback: this.launchEnemy,
            callbackScope: this,
            loop: true
        });
    }

    createBackground() {
        const width = this.scale.width;
        const height = this.scale.height;

        this.sky = this.add.rectangle(width / 2, height / 2, width, height, 0x050914);

        for (let i = 0; i < 100; i++) {
            const star = this.add.circle(
                Phaser.Math.Between(0, width),
                Phaser.Math.Between(0, height * 0.75),
                Phaser.Math.Between(1, 2),
                0xffffff,
                Phaser.Math.FloatBetween(0.2, 0.8)
            );

            this.tweens.add({
                targets: star,
                alpha: Phaser.Math.FloatBetween(0.05, 0.3),
                duration: Phaser.Math.Between(900, 2600),
                delay: Phaser.Math.Between(0, 2000),
                yoyo: true,
                repeat: -1
            });
        }

        this.ground = this.add.rectangle(width / 2, height - 35, width, 70, 0x101b24);

        this.haze = [];
        for (let i = 0; i < 6; i++) {
            this.haze.push(this.add.rectangle(
                width / 2,
                height - 75 - i * 10,
                width,
                10,
                0x1d4a6b,
                0.14 - i * 0.022
            ));
        }

        this.horizon = this.add.rectangle(width / 2, height - 70, width, 2, 0x4fc3f7, 0.5);
        this.palette = WAVE_PALETTES[0];
    }

    applyPalette(instant = false) {
        const from = this.palette;
        const to = paletteForWave(this.wave);
        this.palette = to;

        const C = Phaser.Display.Color;
        const mix = (a, b, p) => {
            const c = C.Interpolate.ColorWithColor(
                C.ValueToColor(a), C.ValueToColor(b), 100, p
            );
            return C.GetColor(c.r, c.g, c.b);
        };

        const paint = p => {
            this.sky.setFillStyle(mix(from.sky, to.sky, p));
            this.ground.setFillStyle(mix(from.ground, to.ground, p));
            this.haze.forEach(h => h.setFillStyle(mix(from.haze, to.haze, p), h.fillAlpha));
            this.horizon.setFillStyle(mix(from.line, to.line, p), 0.5);
        };

        if (instant) {
            paint(100);
            return;
        }

        // Smooth colour transition into the new wave.
        this.tweens.addCounter({
            from: 0,
            to: 100,
            duration: 1200,
            onUpdate: t => paint(Math.round(t.getValue()))
        });
    }

    pauseGame() {
        if (this.isGameOver || this.isPaused || !this.scene.isActive())
            return;

        this.isPaused = true;
        Sfx.hold();
        this.scene.pause();
        this.scene.launch('PauseScene');
    }

    resumeGame() {
        this.isPaused = false;
        Sfx.release();
        this.scene.resume();
    }

    getPhase() {
        return phaseForWave(this.wave);
    }

    showBanner(text, color, y = null, depth = 58) {
        const t = this.add.text(this.scale.width / 2, y ?? this.scale.height * 0.35, text, {
            fontFamily: 'monospace',
            fontSize: '40px',
            color
        }).setOrigin(0.5).setDepth(depth);

        t.alpha = 0;
        this.tweens.add({
            targets: t,
            alpha: 1,
            duration: 250,
            yoyo: true,
            hold: 1200,
            onComplete: () => t.destroy()
        });
    }

    createCities() {
        const width = this.scale.width;
        const groundY = this.scale.height - 70;

        // Cities sit between the silos (left / centre / right).
        const positions = [
            width * 0.17,
            width * 0.27,
            width * 0.37,
            width * 0.63,
            width * 0.73,
            width * 0.83
        ];

        positions.forEach(x => {
            const city = this.add.container(x, groundY);
            city.setDepth(2);

            // Soft glow of city lights in the sky.
            const glow = this.add.ellipse(0, -10, 100, 50, 0xffc857, 0.07);
            glow.setBlendMode(Phaser.BlendModes.ADD);
            city.add(glow);

            const intact = this.add.graphics();
            city.add(intact);

            const beacon = this.drawCity(intact, city);

            const ruin = this.add.graphics();
            this.drawCityRuin(ruin);
            ruin.setVisible(false);
            city.add(ruin);

            // Crater: how a city destroyed in an earlier wave looks.
            const crater = this.add.graphics();
            crater.fillStyle(0x262b31, 1);
            crater.fillEllipse(0, -2, 78, 12);
            crater.fillStyle(0x0b0e11, 1);
            crater.fillEllipse(0, 0, 56, 7);
            crater.fillStyle(0x3a3f45, 1);
            crater.fillEllipse(-30, -3, 14, 5);
            crater.fillEllipse(31, -3, 12, 4);
            crater.fillStyle(0x17110c, 0.8);
            crater.fillEllipse(-8, 1, 18, 3);
            crater.setVisible(false);
            city.add(crater);
            city.crater = crater;

            city.glow = glow;
            city.intact = intact;
            city.ruin = ruin;
            city.beacon = beacon;
            city.alive = true;

            this.cities.push(city);
        });
    }

    drawCity(g, city) {
        const R = Phaser.Math;
        const halfW = 38;

        // Back layer – dark silhouettes for depth.
        let bx = -halfW + R.Between(0, 6);
        while (bx < halfW - 8) {
            const w = R.Between(9, 15);
            const h = R.Between(26, 48);
            g.fillStyle(0x16242f, 1);
            g.fillRect(bx, -h, Math.min(w, halfW - bx), h);
            bx += w + R.Between(2, 8);
        }

        // Front buildings – taller towards the centre.
        const palette = [0x46677e, 0x52758b, 0x3b5a6e, 0x5f8396];
        const fronts = [];
        bx = -halfW;

        while (bx < halfW - 6) {
            const w = Math.min(R.Between(8, 13), halfW - bx);
            const center = 1 - Math.abs((bx + w / 2) / halfW);
            const h = Math.round(14 + center * 32 + R.Between(-4, 8));
            fronts.push({ x: bx, w, h, color: R.RND.pick(palette) });
            bx += w + 1;
        }

        fronts.forEach(b => {
            // Facade.
            g.fillStyle(b.color, 1);
            g.fillRect(b.x, -b.h, b.w, b.h);

            // Lit edge on the left, shadow on the right.
            g.fillStyle(0x8fb3c7, 0.55);
            g.fillRect(b.x, -b.h, 1.5, b.h);
            g.fillStyle(0x0b141b, 0.45);
            g.fillRect(b.x + b.w - 1.5, -b.h, 1.5, b.h);

            // Roof cornice.
            g.fillStyle(0x6f93ab, 1);
            g.fillRect(b.x, -b.h - 1, b.w, 1.5);

            // Windows.
            for (let wy = -b.h + 4; wy <= -5; wy += 5) {
                for (let wx = b.x + 2.5; wx <= b.x + b.w - 4; wx += 4) {
                    if (Math.random() < 0.38) {
                        g.fillStyle(R.RND.pick([0xffd54f, 0xffe9a8, 0x8fd3ff]), 0.9);
                    }
                    else {
                        g.fillStyle(0x0f1a22, 0.85);
                    }
                    g.fillRect(wx, wy, 2, 2);
                }
            }
        });

        // Rooftop details.
        const tallest = fronts.reduce((a, b) => (b.h > a.h ? b : a));
        const ax = tallest.x + tallest.w / 2;
        const topY = -tallest.h - 1;

        // Antenna with a blinking light.
        g.lineStyle(1, 0x90a4ae, 1);
        g.beginPath();
        g.moveTo(ax, topY);
        g.lineTo(ax, topY - 11);
        g.strokePath();

        const beacon = this.add.circle(ax, topY - 12, 1.8, 0xff3d3d, 1);
        city.add(beacon);
        this.tweens.add({
            targets: beacon,
            alpha: 0.15,
            duration: 650,
            delay: R.Between(0, 900),
            yoyo: true,
            repeat: -1
        });

        // Dome or water tank on another building.
        const others = fronts.filter(b => b !== tallest && b.w >= 9);
        if (others.length) {
            const b = R.RND.pick(others);
            const cx = b.x + b.w / 2;
            const y = -b.h - 1;

            if (Math.random() < 0.5) {
                g.fillStyle(0x78909c, 1);
                g.slice(cx, y, b.w / 2 - 1, Math.PI, 0, false);
                g.fillPath();
            }
            else {
                g.fillStyle(0x546e7a, 1);
                g.fillRect(cx - 3, y - 6, 6, 5);
                g.fillRect(cx - 2.5, y - 1, 1, 1);
                g.fillRect(cx + 1.5, y - 1, 1, 1);
            }
        }

        // Base.
        g.fillStyle(0x223441, 1);
        g.fillRect(-halfW - 4, -3, halfW * 2 + 8, 3);
        g.fillStyle(0x4fc3f7, 0.35);
        g.fillRect(-halfW - 4, -3, halfW * 2 + 8, 1);

        return beacon;
    }

    drawCityRuin(g) {
        const R = Phaser.Math;

        // Building stumps with broken tops.
        for (let i = 0; i < 4; i++) {
            const x = -30 + i * 16 + R.Between(-3, 3);
            const w = R.Between(6, 10);
            const h = R.Between(6, 15);

            g.fillStyle(0x333c43, 1);
            g.fillPoints([
                { x, y: 0 },
                { x, y: -h },
                { x: x + w * 0.35, y: -h + R.Between(2, 5) },
                { x: x + w * 0.6, y: -h - R.Between(0, 3) },
                { x: x + w, y: -h + R.Between(3, 6) },
                { x: x + w, y: 0 }
            ], true);
        }

        // Rubble pile.
        const pts = [{ x: -40, y: 0 }];
        for (let x = -36; x <= 36; x += 6) {
            pts.push({ x, y: -R.Between(2, 8) });
        }
        pts.push({ x: 40, y: 0 });
        g.fillStyle(0x262d33, 1);
        g.fillPoints(pts, true);

        // Smouldering embers.
        for (let i = 0; i < 6; i++) {
            g.fillStyle(R.RND.pick([0xff7043, 0xffa726, 0xff5252]), 0.85);
            g.fillRect(R.Between(-34, 34), -R.Between(1, 6), 2, 2);
        }
    }

    createSilos() {
        const width = this.scale.width;

        const groundY = this.scale.height - 70;
        const edge = Math.max(64, width * 0.06);

        const positions = [
            edge,
            width * 0.50,
            width - edge
        ];

        const keys = [SETTINGS.keys.left, SETTINGS.keys.center, SETTINGS.keys.right].map(keyLabel);
        const H = SILO_MOUND_H;
        const padTop = -H - SILO_PAD_H;

        positions.forEach((x, index) => {
            // Container sits at ground level, the mound grows upwards.
            const silo = this.add.container(x, groundY);
            silo.setDepth(2);

            const g = this.add.graphics();

            // Mound – dark lower layer.
            g.fillStyle(0x1c2a34, 1);
            g.fillPoints([
                { x: -64, y: 0 },
                { x: -40, y: -H },
                { x: 40, y: -H },
                { x: 64, y: 0 }
            ], true);

            // Lighter upper band (lit slope).
            g.fillStyle(0x2b4051, 1);
            g.fillPoints([
                { x: -51, y: -H * 0.45 },
                { x: -40, y: -H },
                { x: 40, y: -H },
                { x: 51, y: -H * 0.45 }
            ], true);

            // Contour lines / slope texture.
            g.lineStyle(1, 0x4fc3f7, 0.1);
            for (let i = 1; i <= 3; i++) {
                const y = -H * i / 4;
                const hw = 64 - 24 * i / 4;
                g.beginPath();
                g.moveTo(-hw + 4, y);
                g.lineTo(hw - 4, y);
                g.strokePath();
            }

            // Mound outline.
            g.lineStyle(2, 0x4fc3f7, 0.45);
            g.beginPath();
            g.moveTo(-64, 0);
            g.lineTo(-40, -H);
            g.lineTo(40, -H);
            g.lineTo(64, 0);
            g.strokePath();

            // Bunker entrance.
            g.fillStyle(0x0b141b, 1);
            g.fillRect(-9, -13, 18, 13);
            g.lineStyle(1, 0x78909c, 0.7);
            g.strokeRect(-9, -13, 18, 13);
            g.lineStyle(1, 0x4fc3f7, 0.25);
            g.beginPath();
            g.moveTo(0, -13);
            g.lineTo(0, 0);
            g.strokePath();

            // Launch pad.
            g.fillStyle(0x546e7a, 1);
            g.fillRect(-44, padTop, 88, SILO_PAD_H);
            g.fillStyle(0xb0bec5, 1);
            g.fillRect(-44, padTop, 88, 1);

            // Hazard stripes on the front of the pad.
            for (let sx = -42; sx < 42; sx += 8) {
                g.fillStyle(0xffb300, 0.9);
                g.fillPoints([
                    { x: sx, y: -H },
                    { x: sx + 3, y: padTop + 1 },
                    { x: sx + 7, y: padTop + 1 },
                    { x: sx + 4, y: -H }
                ], true);
            }

            silo.add(g);

            // Ammo pyramid (redrawn in drawSiloAmmo).
            const ammo = this.add.graphics();
            silo.add(ammo);

            // Rubble shown while the silo is destroyed.
            const rubble = this.add.graphics();
            rubble.fillStyle(0x1a1f24, 1);
            rubble.fillPoints([
                { x: -46, y: padTop + SILO_PAD_H }, { x: -40, y: padTop - 6 },
                { x: -28, y: padTop - 2 }, { x: -18, y: padTop - 12 },
                { x: -6, y: padTop - 4 }, { x: 4, y: padTop - 14 },
                { x: 14, y: padTop - 5 }, { x: 26, y: padTop - 10 },
                { x: 38, y: padTop - 3 }, { x: 46, y: padTop + SILO_PAD_H }
            ], true);
            rubble.fillStyle(0xff7043, 0.8);
            [-30, -12, 8, 30].forEach(rx => rubble.fillRect(rx, padTop - 4, 2, 2));
            rubble.setVisible(false);
            silo.add(rubble);
            silo.rubble = rubble;

            // Status lights on both sides of the pad.
            const lights = [-48, 48].map(lx => {
                const halo = this.add.circle(lx, padTop + 1, 6, 0x66ff99, 0.25);
                const dot = this.add.circle(lx, padTop + 1, 2.5, 0x66ff99, 1);
                silo.add(halo);
                silo.add(dot);
                return { halo, dot };
            });

            // Key label under the mound.
            // Centre silo: key label moves left to make room for the doomsday bay.
            silo.add(this.add.text(index === 1 ? -50 : 0, 6, keys[index], {
                fontFamily: 'monospace',
                fontSize: '14px',
                color: '#90a4ae'
            }).setOrigin(0.5, 0));

            // Status (LOW / EMPTY) above the pyramid.
            const status = this.add.text(0, 0, '', {
                fontFamily: 'monospace',
                fontSize: '13px',
                color: '#ffb300'
            }).setOrigin(0.5, 1);
            silo.add(status);

            silo.ammo = ammo;
            silo.lights = lights;
            silo.lightState = null;
            silo.status = status;
            silo.index = index;
            silo.alive = true;

            // Missiles launch from the top of the pyramid.
            silo.launchX = x;
            silo.launchY = groundY + padTop - SILO_ROWS.length * AMMO_STEP_Y;

            this.silos.push(silo);
        });
    }

    drawSiloAmmo(silo, count) {
        const g = silo.ammo;
        g.clear();

        const shown = Math.min(count, AMMO_PYRAMID_MAX);
        const padTop = -SILO_MOUND_H - SILO_PAD_H;
        let slot = 0;
        let topFilledRow = -1;

        // Rows from the bottom: 4, 3, 2, 1. Taken from the top.
        SILO_ROWS.forEach((rowCount, row) => {
            const baseY = padTop - row * AMMO_STEP_Y;
            const rowWidth = (rowCount - 1) * AMMO_STEP_X;

            for (let i = 0; i < rowCount; i++) {
                const ax = -rowWidth / 2 + i * AMMO_STEP_X;
                const filled = slot < shown;
                slot++;

                if (filled) {
                    topFilledRow = row;
                    this.drawAmmoIcon(g, ax, baseY);
                }
                else {
                    // Empty slot – faint outline only.
                    g.lineStyle(1, 0x4fc3f7, 0.18);
                    g.strokeRect(ax - 3, baseY - 13, 6, 12);
                }
            }
        });

        let state;
        if (!silo.alive) {
            silo.status.setText('DESTROYED').setColor('#ff4050');
            state = 'empty';
        }
        else if (count <= 0) {
            silo.status.setText('EMPTY').setColor('#ff4050');
            state = 'empty';
        }
        else if (count <= 3) {
            silo.status.setText('LOW').setColor('#ffb300');
            state = 'low';
        }
        else {
            silo.status.setText('');
            state = 'ok';
        }

        silo.status.y = padTop - (topFilledRow + 1) * AMMO_STEP_Y - 2;

        // During the recap the silos are emptied on purpose – no warning.
        if (this.inSummary)
            silo.status.setText('');
        this.setSiloLights(silo, state);
    }

    drawAmmoIcon(g, x, baseY) {
        // Fins.
        g.fillStyle(0x0277bd, 1);
        g.fillTriangle(x - 3, baseY - 5, x - 5.5, baseY - 1, x - 3, baseY - 1);
        g.fillTriangle(x + 3, baseY - 5, x + 5.5, baseY - 1, x + 3, baseY - 1);

        // Body with a lit left side.
        g.fillStyle(0x90a4ae, 1);
        g.fillRect(x - 3, baseY - 10, 6, 9);
        g.fillStyle(0xeceff1, 1);
        g.fillRect(x - 3, baseY - 10, 2, 9);

        // Blue band.
        g.fillStyle(0x29b6f6, 1);
        g.fillRect(x - 3, baseY - 7, 6, 2);

        // Nose.
        g.fillStyle(0x4fc3f7, 1);
        g.fillTriangle(
            x - 3, baseY - 10,
            x + 3, baseY - 10,
            x, baseY - 15
        );

        // Nozzle.
        g.fillStyle(0x37474f, 1);
        g.fillRect(x - 1.5, baseY - 1, 3, 1);
    }

    setSiloLights(silo, state) {
        if (silo.lightState === state)
            return;

        silo.lightState = state;

        const color = state === 'ok'
            ? 0x66ff99
            : state === 'low' ? 0xffb300 : 0xff4050;

        if (silo.lightTween) {
            silo.lightTween.stop();
            silo.lightTween = null;
        }

        const targets = [];
        silo.lights.forEach(({ halo, dot }) => {
            halo.setFillStyle(color, 0.25);
            dot.setFillStyle(color, 1);
            halo.alpha = 1;
            dot.alpha = 1;
            targets.push(halo, dot);
        });

        if (state !== 'ok') {
            silo.lightTween = this.tweens.add({
                targets,
                alpha: 0.2,
                duration: state === 'empty' ? 220 : 450,
                yoyo: true,
                repeat: -1
            });
        }
    }

    refillSilos() {
        // Destroyed silos are rebuilt for the new wave.
        this.silos.forEach(silo => {
            if (silo.alive)
                return;
            silo.alive = true;
            silo.rubble.setVisible(false);
            silo.setScale(1, 0.2);
            this.tweens.add({ targets: silo, scaleY: 1, duration: 400, ease: 'Back.easeOut' });
        });

        // Refill to 10 – missiles pop in one by one.
        this.silos.forEach((silo, index) => {
            if (this.missiles[index] >= AMMO_PYRAMID_MAX)
                return;

            const ev = this.time.addEvent({
                delay: 70,
                loop: true,
                callback: () => {
                    if (this.missiles[index] >= AMMO_PYRAMID_MAX) {
                        ev.remove();
                        return;
                    }

                    this.missiles[index]++;
                    this.updateSiloUI();

                    if (this.missiles[index] >= AMMO_PYRAMID_MAX)
                        ev.remove();
                }
            });
        });
    }

    createUI() {
        const style = {
            fontFamily: 'monospace',
            color: '#ffffff'
        };

        this.add.text(
            this.scale.width - 20,
            this.scale.height - 18,
            'VERSION 42',
            {
                ...style,
                fontSize: '14px',
                color: '#ff00ff'
            }
        ).setOrigin(1, 1);

        this.scoreText = this.add.text(
            20, 20, 'SCORE: 0',
            { ...style, fontSize: '22px' }
        );

        this.waveText = this.add.text(
            20, 50, 'WAVE: 1',
            { ...style, fontSize: '18px', color: '#8fd3ff' }
        );

        // Top right: enemy speed and enemy missiles left in this wave.
        this.speedText = this.add.text(
            this.scale.width - 20, 20, '',
            { ...style, fontSize: '18px', color: '#ffffff' }
        ).setOrigin(1, 0);

        this.remainingText = this.add.text(
            this.scale.width - 20, 46, '',
            { ...style, fontSize: '18px', color: '#ff8a80' }
        ).setOrigin(1, 0);

        this.ufoText = this.add.text(
            this.scale.width - 20, 72, '',
            { ...style, fontSize: '18px', color: '#b388ff' }
        ).setOrigin(1, 0);

        this.bombText = this.add.text(
            this.scale.width - 20, 98, '',
            { ...style, fontSize: '18px', color: '#ffffff' }
        ).setOrigin(1, 0);

        this.bonusText = this.add.text(
            this.scale.width - 20, 124, '',
            { ...style, fontSize: '18px', color: '#ffd54f' }
        ).setOrigin(1, 0);

        this.doomText = this.add.text(20, 78, '', {
            ...style, fontSize: '16px', color: '#ffd54f'
        });

        this.add.text(20, this.scale.height - 18, `${keyLabel(SETTINGS.keys.pause)} / ESC – PAUSE`, {
            ...style, fontSize: '13px', color: '#607d8b'
        }).setOrigin(0, 1);

    }

    createEffects() {
        if (!this.textures.exists('spark')) {
            const g = this.make.graphics({ x: 0, y: 0, add: false });
            g.fillStyle(0xffffff, 1);
            g.fillCircle(4, 4, 4);
            g.generateTexture('spark', 8, 8);
            g.destroy();
        }

        this.input.setDefaultCursor('none');
        this.crosshair = this.add.graphics().setDepth(50);
    }

    updateCrosshair(time) {
        const g = this.crosshair;
        g.clear();

        if (this.isGameOver)
            return;

        const p = this.input.activePointer;
        const blocked = p.y > this.scale.height - 80;
        const color = blocked ? 0x607d8b : 0x8fd3ff;
        const r = 14 + Math.sin(time / 120) * 2;

        g.lineStyle(2, color, 0.9);
        g.strokeCircle(p.x, p.y, r);
        g.beginPath();
        g.moveTo(p.x - r - 7, p.y);
        g.lineTo(p.x - 5, p.y);
        g.moveTo(p.x + 5, p.y);
        g.lineTo(p.x + r + 7, p.y);
        g.moveTo(p.x, p.y - r - 7);
        g.lineTo(p.x, p.y - 5);
        g.moveTo(p.x, p.y + 5);
        g.lineTo(p.x, p.y + r + 7);
        g.strokePath();
    }

    burst(x, y, color, count = 18, speed = 220, lifespan = 600) {
        const emitter = this.add.particles(x, y, 'spark', {
            speed: { min: speed * 0.3, max: speed },
            angle: { min: 0, max: 360 },
            scale: { start: 0.9, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan,
            tint: color,
            blendMode: 'ADD',
            emitting: false
        });

        emitter.setDepth(20);
        emitter.explode(count);

        this.time.delayedCall(lifespan + 100, () => emitter.destroy());
    }

    updateSiloUI() {
        this.silos.forEach((silo, index) =>
            this.drawSiloAmmo(silo, this.missiles[index])
        );
    }

    startWave() {
        const spec = getWaveSpec(this.wave);
        this.waveSpec = spec;
        // Enemy missile buffer for the wave – shared by the top launcher and UFOs.
        // MISSILES LEFT starts at the total and only counts down.
        this.enemiesRemaining = spec.missiles;
        this.ufoAtOnce = spec.ufoAtOnce;
        this.ufoBombOnly = spec.ufoBombOnly;

        // Cities lost in earlier waves: smoking ruins turn into craters.
        this.cities.forEach(c => {
            if (c.alive || c.pendingRebuild)
                return;
            c.ruin.setVisible(false);
            c.crater.setVisible(true);
            if (c.smoke) {
                c.smoke.destroy();
                c.smoke = null;
            }
        });

        // Mercy rule: pick up to 3 living cities as this wave's targets.
        this.waveTargetCities = Phaser.Utils.Array.Shuffle(
            this.cities.filter(c => c.alive)
        ).slice(0, MERCY_CITY_TARGETS);
        this.waveCityLosses = 0;
        this.enemyWithdrawn = false;

        // UFOs: normally one on screen (special UFO wave: several at once);
        // the next comes after one is gone.
        this.ufosToSpawn = spec.ufos;
        if (this.ufosToSpawn > 0)
            this.time.delayedCall(spec.special === 'ufo' ? 2200 : 1800, () => this.spawnNextUfo());

        // Smart bombs enter one after another (a dense rain in the bomb wave).
        const bombCount = spec.bombs;
        const bombGap = spec.special === 'bombs' ? 1700 : 3500;
        this.bombsToSpawn = bombCount;
        for (let i = 0; i < bombCount; i++) {
            this.time.delayedCall(2500 + i * bombGap, () => {
                if (this.isGameOver || this.bombsToSpawn <= 0)
                    return;
                this.bombsToSpawn--;
                this.spawnBomb();
            });
        }
        this.waveText.setText(`WAVE: ${this.wave}   PHASE: ${this.getPhase()}`);
        this.updateSiloUI();

        const firstInPhase = (this.wave - 1) % PHASE_LENGTH === 0;
        if (this.isFirstWave)
            this.palette = paletteForWave(this.wave);
        this.applyPalette(this.isFirstWave);

        const hex = hexColor(this.palette.line);
        this.remainingText.setColor(hexColor(this.palette.enemy));
        if (firstInPhase && this.wave > 1)
            this.showBanner(`PHASE ${this.getPhase()}`, hex);
        else if (this.wave > 1)
            this.showBanner(`WAVE ${this.wave}`, hex);

        // Special wave announcement after the wave banner.
        if (spec.special) {
            this.time.delayedCall(this.wave > 1 ? 1750 : 300, () => {
                if (!this.isGameOver)
                    this.showBanner(`SPECIAL WAVE: ${spec.title}`, hexColor(this.palette.enemy));
            });
        }

        // Vibe sting at every wave start (bigger one for a new phase).
        Sfx.play('waveStart', firstInPhase && this.wave > 1);

        this.isFirstWave = false;
    }

    fireFromSilo(index) {
        const silo = this.silos[index];

        if (!silo || !silo.alive || this.missiles[index] <= 0) {
            if (!this.inSummary && !this.isGameOver)
                Sfx.play('empty');
            return;
        }

        // Silo keys fire toward the current mouse position.
        const pointer = this.input.activePointer;

        this.fire(index, pointer.x, pointer.y);
    }

    fireFromNearestSilo(x, y) {
        let nearest = -1;
        let distance = Infinity;

        this.silos.forEach((silo, index) => {
            if (!silo.alive || this.missiles[index] <= 0)
                return;

            const d = Math.abs(silo.x - x);

            if (d < distance) {
                distance = d;
                nearest = index;
            }
        });

        if (nearest !== -1)
            this.fire(nearest, x, y);
        else if (!this.inSummary && !this.isGameOver)
            Sfx.play('empty');
    }

    fire(index, x, y) {
        if (this.inSummary || this.isGameOver)
            return;

        if (this.missiles[index] <= 0)
            return;

        if (y > this.scale.height - 80)
            return;

        const silo = this.silos[index];

        if (!silo.alive)
            return;

        this.missiles[index]--;
        this.updateSiloUI();

        // Flash at the top of the pyramid when firing.
        this.burst(silo.launchX, silo.launchY, 0x8fd3ff, 8, 120, 260);
        Sfx.play('launch');

        const marker = this.add.graphics().setDepth(4);
        marker.lineStyle(2, 0x8fd3ff, 0.8);
        marker.beginPath();
        marker.moveTo(x - 6, y - 6);
        marker.lineTo(x + 6, y + 6);
        marker.moveTo(x + 6, y - 6);
        marker.lineTo(x - 6, y + 6);
        marker.strokePath();

        const missile = new Missile(this, {
            x: silo.launchX,
            y: silo.launchY,
            targetX: x,
            targetY: y,
            speed: PLAYER_MISSILE_SPEED,
            color: 0x008cff,
            trailDistance: 180,
            trailWidth: 5,
            kind: 'player',
            onImpact: current => {
                marker.destroy();
                this.createCloud(
                    current.x,
                    current.y
                );
            },
            onDestroyed: current => {
                marker.destroy();

                Phaser.Utils.Array.Remove(
                    this.playerMissiles,
                    current
                );
            }
        });

        this.playerMissiles.push(missile);
    }

    launchEnemy() {
        if (this.enemiesRemaining <= 0 || (this.waveSpec && this.waveSpec.noTopLaunch))
            return;

        if (!this.pickTarget()) {
            // Nothing left to aim at – don't stall the wave.
            this.enemiesRemaining = 0;
            return;
        }

        this.enemiesRemaining--;

        const startX =
            Phaser.Math.Between(
                20,
                this.scale.width - 20
            );

        const missile = this.spawnEnemyMissile(startX, -10);

        // MIRV: some missiles will split on the way down.
        if (missile && this.wave >= SPLIT_FROM_WAVE && Math.random() < SPLIT_CHANCE) {
            missile.splitCount = Phaser.Math.Between(2, this.getPhase() + 1);
            missile.splitAtY = this.scale.height * Phaser.Math.FloatBetween(0.22, 0.5);
        }
    }

    splitMissile(missile) {
        missile.splitAtY = null;

        // Never exceed the wave's missile limit.
        const n = Math.min(missile.splitCount, this.enemiesRemaining + 1);
        if (n < 2 || this.enemyWithdrawn)
            return;

        this.enemiesRemaining -= n - 1;

        for (let i = 0; i < n - 1; i++)
            this.spawnEnemyMissile(missile.x, missile.y);

        this.burst(missile.x, missile.y, this.palette.enemy, 10 + n * 3, 140, 350);
        this.burst(missile.x, missile.y, 0xffffff, 6, 90, 250);
        Sfx.play('split');
    }

    // ---------- Doomsday missile ----------

    // Underground bay below the centre silo showing the doomsday missiles.
    createDoomBay() {
        const silo = this.silos[1];
        const bay = this.add.container(silo.x, this.scale.height - 70).setDepth(3);

        const frame = this.add.graphics();
        frame.fillStyle(0x070d12, 1);
        frame.fillRect(-30, 4, 60, 50);
        frame.lineStyle(2, 0x546e7a, 1);
        frame.strokeRect(-30, 4, 60, 50);
        frame.lineStyle(1, 0xffb300, 0.6);
        for (let i = -28; i < 30; i += 8) {
            frame.beginPath();
            frame.moveTo(i, 54);
            frame.lineTo(i + 4, 50);
            frame.strokePath();
        }
        bay.add(frame);

        const icons = this.add.graphics();
        bay.add(icons);

        // Hatch doors (slide open on launch).
        const doorL = this.add.rectangle(-15, 6, 30, 5, 0x78909c).setOrigin(0.5, 0.5);
        const doorR = this.add.rectangle(15, 6, 30, 5, 0x78909c).setOrigin(0.5, 0.5);
        bay.add(doorL);
        bay.add(doorR);

        const extra = this.add.text(34, 50, '', {
            fontFamily: 'monospace', fontSize: '12px', color: '#ffd54f'
        }).setOrigin(0, 1);
        bay.add(extra);

        this.doomBay = { bay, icons, doorL, doorR, extra };
        this.updateDoomBay();
    }

    updateDoomBay() {
        if (!this.doomBay)
            return;

        const { icons, extra } = this.doomBay;
        icons.clear();

        const shown = Math.min(this.doomsdays, 3);
        for (let i = 0; i < shown; i++)
            drawDoomIcon(icons, (i - (shown - 1) / 2) * 16, 52, 1);

        extra.setText(this.doomsdays > 3 ? `+${this.doomsdays - 3}` : '');
    }

    openDoomHatch() {
        const { doorL, doorR } = this.doomBay;
        this.tweens.killTweensOf([doorL, doorR]);
        this.tweens.add({ targets: doorL, x: -40, duration: 180 });
        this.tweens.add({ targets: doorR, x: 40, duration: 180 });
        this.tweens.add({ targets: doorL, x: -15, duration: 300, delay: 900 });
        this.tweens.add({ targets: doorR, x: 15, duration: 300, delay: 900 });
    }

    fireDoomsday() {
        if (this.doomsdays <= 0 || this.inSummary || this.isGameOver || this.doomsdayActive) {
            if (!this.inSummary && !this.isGameOver)
                Sfx.play('empty');
            return;
        }

        this.doomsdays--;
        this.doomsdayActive = true;
        this.updateDoomBay();

        const W = this.scale.width;
        const H = this.scale.height;

        // Launches out of the underground bay below the centre silo
        // (works even when the silo above is destroyed).
        this.openDoomHatch();
        const sx = this.silos[1].x;
        const sy = H - 70 + 10;
        const tx = W / 2;
        const ty = H * 0.38;

        Sfx.play('doomLaunch');
        this.burst(sx, sy, 0xffd54f, 20, 200, 500);

        const missile = new Missile(this, {
            x: sx,
            y: sy,
            targetX: tx,
            targetY: ty,
            speed: 520,
            radius: 7,
            color: 0xffd54f,
            trailDistance: 260,
            trailWidth: 8,
            pulseSpeed: 30,
            kind: 'player',
            onImpact: current => this.doomsdayBlast(current.x, current.y),
            onDestroyed: current => Phaser.Utils.Array.Remove(this.playerMissiles, current)
        });

        this.playerMissiles.push(missile);
    }

    doomsdayBlast(x, y) {
        const W = this.scale.width;
        const H = this.scale.height;
        const maxR = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 40;

        Sfx.play('doomBlast');
        this.cameras.main.flash(700, 255, 255, 255);
        this.cameras.main.shake(700, 0.015);

        const g = this.add.graphics().setDepth(40);

        this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 1100,
            ease: 'Cubic.easeOut',
            onUpdate: tw => {
                const t = tw.getValue();
                const r = 20 + t * maxR;

                g.clear();
                g.fillStyle(0xfff8e1, 0.35 * (1 - t));
                g.fillCircle(x, y, r);
                g.lineStyle(22, 0xffffff, 0.75 * (1 - t));
                g.strokeCircle(x, y, r);
                g.lineStyle(6, 0xffd54f, 1 - t);
                g.strokeCircle(x, y, r - 16);

                // Everything the shockwave reaches is destroyed.
                [...this.enemyMissiles].forEach(m => {
                    if (m.isFlying && Phaser.Math.Distance.Between(m.x, m.y, x, y) < r)
                        this.doomsdayKill(m);
                });
                [...this.ufos].forEach(u => {
                    if (u.alive && Phaser.Math.Distance.Between(u.x, u.y, x, y) < r) {
                        u.hp = 1;
                        u.invulnerableUntil = 0;
                        this.destroyUfo(u);
                    }
                });
                [...this.bombs].forEach(b => {
                    if (b.alive && Phaser.Math.Distance.Between(b.x, b.y, x, y) < r)
                        this.destroyBomb(b);
                });
            },
            onComplete: () => {
                g.destroy();
                this.doomsdayActive = false;
            }
        });
    }

    doomsdayKill(missile) {
        if (!missile.isFlying)
            return;

        this.waveKills++;
        this.addScore(KILL_POINTS);

        // Small white flash instead of a full cloud (keeps it light).
        missile.onImpact = current => this.burst(current.x, current.y, 0xffffff, 8, 160, 400);
        missile.impact();
    }

    // Enemy targets: living cities and silos.
    pickTarget() {
        const targets = [
            ...(this.waveTargetCities || []).filter(c => c.alive),
            ...this.silos.filter(s => s.alive)
        ];
        return targets.length ? Phaser.Utils.Array.GetRandom(targets) : null;
    }

    hitTarget(target) {
        if (!target)
            return;

        if (this.silos.includes(target))
            this.destroySilo(target);
        else
            this.destroyCity(target);
    }

    spawnEnemyMissile(x, y) {
        const target = this.pickTarget();

        if (!target)
            return;

        const missile = new Missile(this, {
            x,
            y,
            target: target,
            speed: this.enemySpeed,
            color: this.palette.enemy,
            trailDistance: 300,
            trailWidth: 4,
            kind: 'enemy',
            onImpact: current => {
                // Ground hit: nuclear explosion (does not destroy other missiles).
                this.waveImpacts++;
                this.createNuke(current.x, current.y);
                this.hitTarget(target);
            },
            onDestroyed: current => {
                Phaser.Utils.Array.Remove(
                    this.enemyMissiles,
                    current
                );
            }
        });

        this.enemyMissiles.push(missile);
        return missile;
    }

    update(time, delta) {
        const dt = delta / 1000;

        this.updateEnemyMissiles(dt);
        this.updatePlayerMissiles(dt);
        this.updateUfos(dt, time);
        this.updateBombs(dt, time);

        this.checkWaveEnd();
        this.updateCrosshair(time);
        this.updateInfo();
    }

    updateInfo() {
        const pct = Math.round(this.enemySpeed / ENEMY_START_SPEED * 100);
        const flying = this.enemyMissiles.filter(m => m.isFlying).length;

        this.speedText.setText(`SPEED: ${Math.round(this.enemySpeed)} (${pct}%)`);
        this.remainingText.setText(`MISSILES LEFT: ${this.enemiesRemaining + flying}`);
        this.ufoText.setText(`UFOS: ${this.ufosToSpawn + this.ufos.length}`);
        this.bombText.setText(`SMART BOMBS: ${this.bombsToSpawn + this.bombs.length}`);
        this.bonusText.setText(this.bonusCities > 0 ? `BONUS CITIES: ${this.bonusCities}` : '');
        this.doomText.setText(this.doomsdays > 0
            ? `DOOMSDAY: ${this.doomsdays}  [${keyLabel(SETTINGS.keys.doomsday)} / RMB]`
            : 'DOOMSDAY: 0');
        this.doomText.setColor(this.doomsdays > 0 ? '#ffd54f' : '#607d8b');
    }

    // ---------- Smart bomb ----------

    spawnBomb(x = null, y = -12) {
        const bomb = this.add.graphics().setDepth(11);
        bomb.x = x ?? Phaser.Math.Between(60, this.scale.width - 60);
        bomb.y = y;
        Sfx.play('bombAlert');
        bomb.vx = 0;
        bomb.vy = 1;
        bomb.spin = 0;
        bomb.history = [];
        bomb.alive = true;
        bomb.evading = false;
        bomb.target = this.pickTarget();

        this.bombs.push(bomb);
    }

    updateBombs(dt, time) {
        const W = this.scale.width;
        const speed = this.enemySpeed * BOMB_SPEED_FACTOR;

        // Iterate over a copy – the list can change while looping
        // (e.g. game over removes everything).
        const bombsSnapshot = [...this.bombs];
        for (let i = bombsSnapshot.length - 1; i >= 0; i--) {
            const bomb = bombsSnapshot[i];

            if (!bomb || !bomb.alive)
                continue;

            if (!bomb.target || !bomb.target.alive)
                bomb.target = this.pickTarget();
            if (!bomb.target) {
                this.removeBomb(bomb);
                continue;
            }

            const tx = bomb.target.x;
            const ty = bomb.target.y - 10;

            // 1) Seek the target.
            let dx = tx - bomb.x;
            let dy = ty - bomb.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 8) {
                this.bombImpact(bomb);
                continue;
            }

            let ax = dx / dist;
            let ay = dy / dist;

            // 2) Avoid explosion clouds: strong push away from any cloud that is
            //    close – it can climb back up and change direction.
            let evading = false;
            this.explosions.forEach(ex => {
                const ex2 = bomb.x - ex.x;
                const ey2 = bomb.y - ex.y;
                const d = Math.hypot(ex2, ey2) || 0.001;
                // While a cloud is still growing, avoid its final size.
                const r = ex.expanding ? ex.maxRadius : ex.radiusValue;
                const danger = r + BOMB_AVOID_MARGIN;

                if (d < danger) {
                    const push = (danger - d) / BOMB_AVOID_MARGIN * 3;
                    ax += ex2 / d * push;
                    ay += ey2 / d * push;
                    evading = true;
                }
            });

            const len = Math.hypot(ax, ay) || 1;
            const boost = evading ? 1.35 : 1;
            bomb.vx = ax / len * speed * boost;
            bomb.vy = ay / len * speed * boost;
            bomb.evading = evading;

            bomb.x = Phaser.Math.Clamp(bomb.x + bomb.vx * dt, 12, W - 12);
            bomb.y = Math.max(-20, bomb.y + bomb.vy * dt);

            bomb.history.push({ x: bomb.x, y: bomb.y });
            if (bomb.history.length > 14)
                bomb.history.shift();

            bomb.spin += dt * (evading ? 14 : 5);
            this.drawBomb(bomb, time);
        }
    }

    drawBomb(bomb, time) {
        const g = bomb;
        const c = this.palette.enemy;
        g.clear();

        // Ghost trail (in world coords → relative to bomb).
        bomb.history.forEach((p, i) => {
            const a = (i + 1) / bomb.history.length * 0.35;
            g.fillStyle(c, a);
            g.fillCircle(p.x - bomb.x, p.y - bomb.y, 1.5 + i * 0.12);
        });

        // Rotating diamond.
        const s = 9;
        const cos = Math.cos(bomb.spin);
        const pts = [
            { x: 0, y: -s },
            { x: s * cos, y: 0 },
            { x: 0, y: s },
            { x: -s * cos, y: 0 }
        ];

        // Pulsing glow.
        const k = (Math.sin(time / 85) + 1) / 2;
        g.fillStyle(c, 0.12 + 0.3 * k);
        g.fillCircle(0, 0, 10 + 7 * k);
        g.fillStyle(0xffffff, 0.08 + 0.2 * k);
        g.fillCircle(0, 0, 6 + 3 * k);

        const blink = Math.sin(time / 70) > 0 || bomb.evading;
        g.fillStyle(blink ? 0xffffff : c, 1);
        g.fillPoints(pts, true);
        g.lineStyle(1.5, c, 1);
        g.strokePoints(pts, true);
    }

    bombImpact(bomb) {
        this.waveImpacts++;
        const x = bomb.x;
        const y = bomb.y;
        const target = bomb.target;

        this.removeBomb(bomb);
        this.createNuke(x, target.y);
        this.hitTarget(target);
    }

    removeBomb(bomb) {
        bomb.alive = false;
        Phaser.Utils.Array.Remove(this.bombs, bomb);
        bomb.destroy();
    }

    destroyBomb(bomb) {
        if (!bomb.alive)
            return;

        const x = bomb.x;
        const y = bomb.y;

        this.waveBombKills++;
        this.addScore(BOMB_POINTS);
        this.removeBomb(bomb);

        this.burst(x, y, 0xffffff, 18, 240, 500);
        this.floatText(x, y - 16, `+${BOMB_POINTS}`, '#ffffff');
        this.createCloud(x, y, 0.65);
    }

    // ---------- UFO ----------

    pickUfoType() {
        const available = Object.keys(UFO_TYPES)
            .filter(k => this.wave >= UFO_TYPES[k].fromWave);
        return Phaser.Utils.Array.GetRandom(available);
    }

    drawUfoShape(g, typeKey, s = 1) {
        drawUfoShape(g, typeKey, s);
    }

    spawnUfo() {
        const W = this.scale.width;
        const typeKey = this.pickUfoType();
        const type = UFO_TYPES[typeKey];
        const s = type.scale;
        const fromLeft = Math.random() < 0.5;
        // Random height, always in the upper half of the screen
        // (below the top-right info panel). With several UFOs at once each
        // gets its own height lane so they don't overlap.
        const top = 160 + 10 * s;
        const bottom = Math.max(top + 20, this.scale.height / 2 - 30);
        const lanes = this.ufoAtOnce || 1;
        let lane = 0;
        let y;
        if (lanes > 1) {
            const used = this.ufos.map(u => u.lane);
            const free = [...Array(lanes).keys()].filter(l => !used.includes(l));
            lane = free.length ? Phaser.Utils.Array.GetRandom(free) : 0;
            const laneH = (bottom - top) / lanes;
            y = top + laneH * (lane + 0.5) + Phaser.Math.Between(-6, 6);
        }
        else {
            y = Phaser.Math.Between(top, bottom);
        }

        const ufo = this.add.container(fromLeft ? -60 * s : W + 60 * s, y);
        ufo.setDepth(12);

        // Faint glow under the saucer.
        ufo.add(this.add.ellipse(0, 6 * s, 80 * s, 26 * s, this.palette.enemy, 0.12));

        const body = this.add.graphics();
        this.drawUfoShape(body, typeKey, s);
        ufo.add(body);

        // Running lights along the rim.
        const lights = [];
        const n = typeKey === 'mothership' ? 7 : 5;
        for (let i = 0; i < n; i++) {
            const lx = (-22 + i * 44 / (n - 1)) * s;
            const l = this.add.circle(lx, 2 * s, 2.2 * Math.min(s, 1.2), this.palette.enemy);
            ufo.add(l);
            lights.push(l);
        }

        ufo.lane = lane;
        ufo.typeKey = typeKey;
        ufo.type = type;
        ufo.hp = type.hp;
        ufo.hitR = 18 * s;
        ufo.invulnerableUntil = 0;
        ufo.lights = lights;
        ufo.lightPhase = 0;
        ufo.vx = (fromLeft ? 1 : -1) * type.speed * ((this.waveSpec && this.waveSpec.ufoSpeedMul) || 1);
        ufo.baseY = y;
        ufo.alive = true;

        ufo.hum = Sfx.hum(typeKey);

        ufo.lightTimer = this.time.addEvent({
            delay: typeKey === 'scout' ? 70 : 120,
            loop: true,
            callback: () => {
                ufo.lightPhase = (ufo.lightPhase + 1) % lights.length;
                lights.forEach((l, i) => l.setAlpha(i === ufo.lightPhase ? 1 : 0.3));
            }
        });

        const scheduleShot = () => {
            ufo.fireTimer = this.time.delayedCall(
                Phaser.Math.Between(type.fire[0], type.fire[1]),
                () => {
                    if (!ufo.alive || this.isGameOver || this.enemyWithdrawn)
                        return;
                    if (ufo.x > 30 && ufo.x < this.scale.width - 30)
                        this.ufoFire(ufo);
                    scheduleShot();
                }
            );
        };
        scheduleShot();

        this.ufos.push(ufo);
    }

    spawnNextUfo() {
        if (this.isGameOver)
            return;

        // Fill up to the allowed number of UFOs on screen.
        while (this.ufos.length < (this.ufoAtOnce || 1) && this.ufosToSpawn > 0) {
            this.ufosToSpawn--;
            this.spawnUfo();
        }
    }

    ufoFire(ufo) {
        // Muzzle flash + a salvo of enemy missiles. They are ordinary
        // enemy missiles – counted together with the rest (kills, MISSILES LEFT).
        const s = ufo.type.scale;

        // Bomb wave: every UFO is a bomber. Otherwise the big mothership
        // can drop a smart bomb instead of a salvo.
        if (this.ufoBombOnly ||
            (ufo.typeKey === 'mothership' && Math.random() < MOTHERSHIP_BOMB_CHANCE)) {
            this.burst(ufo.x, ufo.y + 14 * s, 0xffffff, 10, 90, 300);
            this.spawnBomb(ufo.x, ufo.y + 14 * s);
            return;
        }

        // UFO missiles are drawn from the wave's missile buffer.
        const [min, max] = ufo.type.salvo;
        const count = Math.min(Phaser.Math.Between(min, max), this.enemiesRemaining);
        if (count <= 0)
            return;
        this.enemiesRemaining -= count;
        this.burst(ufo.x, ufo.y + 8 * s, this.palette.enemy, 6 + count * 3, 90, 250);

        for (let i = 0; i < count; i++)
            this.spawnEnemyMissile(ufo.x + (i - (count - 1) / 2) * 12, ufo.y + 8 * s);
    }

    updateUfos(dt, time) {
        const W = this.scale.width;

        // Iterate over a copy – the list can change while looping
        // (e.g. game over removes everything).
        const ufosSnapshot = [...this.ufos];
        for (let i = ufosSnapshot.length - 1; i >= 0; i--) {
            const ufo = ufosSnapshot[i];

            if (!ufo || !ufo.alive)
                continue;
            const amp = ufo.typeKey === 'scout' ? 14 : 5;

            ufo.x += ufo.vx * dt;

            // UFO sound follows the saucer left ↔ right.
            if (ufo.hum)
                ufo.hum.setPan(ufo.x / W * 2 - 1);
            ufo.y = ufo.baseY + Math.sin(time / (ufo.typeKey === 'scout' ? 180 : 300) + i) * amp;
            ufo.rotation = Math.sin(time / 450 + i) * 0.06;

            // Flew off the other side – escaped.
            const edge = 70 * ufo.type.scale;
            if ((ufo.vx > 0 && ufo.x > W + edge) || (ufo.vx < 0 && ufo.x < -edge)) {
                this.waveUfoEscapes++;
                this.removeUfo(ufo);
            }
        }
    }

    removeUfo(ufo) {
        ufo.alive = false;

        if (ufo.fireTimer)
            ufo.fireTimer.remove();
        if (ufo.lightTimer)
            ufo.lightTimer.remove();
        if (ufo.hum)
            ufo.hum.stop();
        if (ufo.smoke)
            ufo.smoke.destroy();

        Phaser.Utils.Array.Remove(this.ufos, ufo);
        ufo.destroy();

        if (!this.isGameOver && this.ufosToSpawn > 0)
            this.time.delayedCall(UFO_RESPAWN_DELAY, () => this.spawnNextUfo());

        // UFO-only wave: when the last UFO is gone, the rest of the buffer is too.
        if (this.waveSpec && this.waveSpec.noTopLaunch &&
            this.ufosToSpawn <= 0 && this.ufos.length === 0)
            this.enemiesRemaining = 0;
    }

    hitUfo(ufo) {
        if (!ufo.alive || this.time.now < ufo.invulnerableUntil)
            return;

        ufo.hp--;

        if (ufo.hp > 0) {
            // Damaged (mothership): flash, smoke trail, short invulnerability
            // so the same cloud can't hit twice.
            ufo.invulnerableUntil = this.time.now + 700;
            Sfx.play('hit');
            this.burst(ufo.x, ufo.y, 0xffffff, 14, 200, 400);
            this.tweens.add({ targets: ufo, alpha: 0.3, duration: 70, yoyo: true, repeat: 4 });
            ufo.vx *= 1.4;

            ufo.smoke = this.add.particles(0, 0, 'spark', {
                follow: ufo,
                speedY: { min: -20, max: -5 },
                speedX: { min: -10, max: 10 },
                scale: { start: 0.8, end: 1.8 },
                alpha: { start: 0.45, end: 0 },
                lifespan: 900,
                frequency: 60,
                tint: 0x555555
            }).setDepth(11);
            return;
        }

        this.destroyUfo(ufo);
    }

    destroyUfo(ufo) {
        if (!ufo.alive)
            return;

        const x = ufo.x;
        const y = ufo.y;
        const pts = ufo.type.points;

        this.waveUfoKills.push(ufo.typeKey);
        this.addScore(pts);
        this.removeUfo(ufo);

        this.burst(x, y, 0xb0bec5, 24, 260, 700);
        Sfx.play('ufoDown');
        this.burst(x, y, this.palette.enemy, 12, 180, 500);
        this.floatText(x, y - 20, `+${pts}`, '#b388ff');
        this.createCloud(x, y, 0.8);
    }

    updateEnemyMissiles(dt) {
        // Iterate over a copy – the list can change while looping
        // (e.g. game over removes everything).
        const enemyMissilesSnapshot = [...this.enemyMissiles];
        for (let i = enemyMissilesSnapshot.length - 1; i >= 0; i--) {
            const missile = enemyMissilesSnapshot[i];

            if (!missile || missile.isDestroyed)
                continue;

            if (!missile.isFlying)
                continue;

            missile.update(dt);

            if (missile.splitAtY && missile.isFlying && missile.y >= missile.splitAtY)
                this.splitMissile(missile);
        }
    }

    updatePlayerMissiles(dt) {
        // Iterate over a copy – the list can change while looping
        // (e.g. game over removes everything).
        const playerMissilesSnapshot = [...this.playerMissiles];
        for (let i = playerMissilesSnapshot.length - 1; i >= 0; i--) {
            const missile = playerMissilesSnapshot[i];

            if (!missile || missile.isDestroyed)
                continue;

            if (!missile.isFlying)
                continue;

            missile.update(dt);
        }
    }

    createCloud(x, y, size = 1) {
        const R = Phaser.Math;
        const cloud = this.add.container(x, y);
        cloud.setDepth(15);

        this.burst(x, y, 0xffc84a, size < 1 ? 10 : 18, 200 * size);
        Sfx.play('explosion', size);

        // Fire cloud made of many puffs in three layers:
        // orange outer, yellow middle, white core.
        // Outer edge ≈ 72 px at scale 1 (matches the hit radius).
        const layers = [
            { count: 9, dist: [26, 40], r: [24, 32], color: 0xff6a1a, alpha: 0.55 },
            { count: 7, dist: [12, 26], r: [20, 28], color: 0xffb340, alpha: 0.75 },
            { count: 4, dist: [0, 12], r: [14, 20], color: 0xfff3c4, alpha: 0.9 }
        ];

        const puffs = [];
        const offset = R.FloatBetween(0, Math.PI * 2);

        layers.forEach(layer => {
            for (let i = 0; i < layer.count; i++) {
                const a = offset + i / layer.count * Math.PI * 2 + R.FloatBetween(-0.3, 0.3);
                const d = R.FloatBetween(layer.dist[0], layer.dist[1]);
                const puff = this.add.circle(
                    Math.cos(a) * d,
                    Math.sin(a) * d,
                    R.FloatBetween(layer.r[0], layer.r[1]),
                    layer.color,
                    layer.alpha
                );

                puff.baseColor = Phaser.Display.Color.ValueToColor(layer.color);
                puff.baseAlpha = layer.alpha;
                cloud.add(puff);
                puffs.push(puff);

                // Boiling – each puff 'breathes' at its own pace.
                this.tweens.add({
                    targets: puff,
                    scale: R.FloatBetween(0.82, 1.15),
                    x: puff.x + R.FloatBetween(-4, 4),
                    y: puff.y + R.FloatBetween(-4, 4),
                    duration: R.Between(90, 170),
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
        });

        // Brightness flicker: an additive white glow that pulses fast.
        const flicker = this.add.circle(0, 0, 44, 0xfff8e1, 0.3);
        flicker.setBlendMode(Phaser.BlendModes.ADD);
        cloud.add(flicker);
        this.tweens.add({
            targets: flicker,
            alpha: 0.04,
            scale: 0.8,
            duration: R.Between(60, 95),
            yoyo: true,
            repeat: -1
        });

        cloud.setScale(0.15);
        cloud.rotation = R.FloatBetween(0, Math.PI * 2);
        cloud.radiusValue = 8;
        cloud.maxRadius = 8 + 1.35 * size * 72;
        cloud.expanding = true;

        this.explosions.push(cloud);

        // Slow cloud rotation.
        this.tweens.add({
            targets: cloud,
            rotation: cloud.rotation + R.FloatBetween(-0.6, 0.6),
            duration: 960
        });

        const ember = Phaser.Display.Color.ValueToColor(0xb3261e);

        // Expand.
        this.tweens.add({
            targets: cloud,
            scale: 1.35 * size,
            duration: CLOUD_EXPAND_MS,
            ease: 'Cubic.easeOut',
            onUpdate: () => {
                cloud.radiusValue = 8 + cloud.scaleX * 72;
                this.checkExplosionHits(cloud);
            },
            onComplete: () => {
                cloud.expanding = false;
                this.spawnSmoke(x, y, size);

                // Shrink – the cloud cools to dark red and fades.
                this.tweens.add({
                    targets: cloud,
                    scale: 0.15,
                    alpha: 0,
                    duration: CLOUD_SHRINK_MS,
                    ease: 'Cubic.easeIn',
                    onUpdate: tween => {
                        const p = Math.round(tween.progress * 100);

                        puffs.forEach(puff => {
                            const c = Phaser.Display.Color.Interpolate.ColorWithColor(
                                puff.baseColor, ember, 100, p
                            );
                            puff.setFillStyle(
                                Phaser.Display.Color.GetColor(c.r, c.g, c.b),
                                puff.baseAlpha
                            );
                        });

                        cloud.radiusValue = 8 + cloud.scaleX * 72;
                        this.checkExplosionHits(cloud);
                    },
                    onComplete: () => {
                        this.tweens.killTweensOf(puffs);
                        this.tweens.killTweensOf(flicker);
                        cloud.destroy();

                        Phaser.Utils.Array.Remove(
                            this.explosions,
                            cloud
                        );
                    }
                });
            }
        });
    }

    spawnSmoke(x, y, size) {
        // Smoke after the explosion – visual only, does not hit missiles.
        const count = size < 1 ? 4 : 7;
        const R = Phaser.Math;

        for (let i = 0; i < count; i++) {
            const a = R.FloatBetween(0, Math.PI * 2);
            const d = R.FloatBetween(0, 40) * size;
            const puff = this.add.circle(
                x + Math.cos(a) * d,
                y + Math.sin(a) * d,
                R.FloatBetween(14, 24) * size,
                R.RND.pick([0x4a4f5a, 0x5c6170, 0x3d414a]),
                0.4
            ).setDepth(14);

            this.tweens.add({
                targets: puff,
                y: puff.y - R.Between(25, 55),
                x: puff.x + R.Between(-15, 15),
                scale: R.FloatBetween(1.4, 2),
                alpha: 0,
                duration: R.Between(900, 1500),
                delay: R.Between(0, 200),
                ease: 'Sine.easeOut',
                onComplete: () => puff.destroy()
            });
        }
    }

    checkExplosionHits(explosion) {
        // Iterate over a copy – the list can change while looping
        // (e.g. game over removes everything).
        const enemyMissilesSnapshot = [...this.enemyMissiles];
        for (let i = enemyMissilesSnapshot.length - 1; i >= 0; i--) {
            const missile = enemyMissilesSnapshot[i];

            if (!missile || missile.isDestroyed)
                continue;

            const distance = Phaser.Math.Distance.Between(
                missile.x,
                missile.y,
                explosion.x,
                explosion.y
            );

            if (distance < explosion.radiusValue)
                this.destroyEnemy(missile);
        }

        // Iterate over a copy – the list can change while looping
        // (e.g. game over removes everything).
        const ufosSnapshot = [...this.ufos];
        for (let i = ufosSnapshot.length - 1; i >= 0; i--) {
            const ufo = ufosSnapshot[i];

            if (!ufo || !ufo.alive)
                continue;

            const distance = Phaser.Math.Distance.Between(
                ufo.x, ufo.y, explosion.x, explosion.y
            );

            if (distance < explosion.radiusValue + ufo.hitR)
                this.hitUfo(ufo);
        }

        // Iterate over a copy – the list can change while looping
        // (e.g. game over removes everything).
        const bombsSnapshot = [...this.bombs];
        for (let i = bombsSnapshot.length - 1; i >= 0; i--) {
            const bomb = bombsSnapshot[i];

            if (!bomb || !bomb.alive)
                continue;

            const distance = Phaser.Math.Distance.Between(
                bomb.x, bomb.y, explosion.x, explosion.y
            );

            if (distance < explosion.radiusValue)
                this.destroyBomb(bomb);
        }
    }

    destroyEnemy(missile) {
        if (!missile || !missile.isFlying)
            return;

        const x = missile.x;
        const y = missile.y;

        this.waveKills++;
        this.addScore(KILL_POINTS);

        // A hit enemy missile uses the same
        // Missile object and lets its trail fade like the player's.
        missile.onImpact = current => {
            this.createCloud(
                x,
                y,
                0.65
            );
        };

        missile.impact();
    }

    destroyCity(city) {
        if (!city.alive)
            return;

        city.alive = false;
        // Switch to ruins: turn off windows, glow and antenna.
        city.intact.setVisible(false);
        city.glow.setVisible(false);
        this.tweens.killTweensOf(city.beacon);
        city.beacon.setVisible(false);

        city.ruin.setVisible(true);
        city.ruin.setScale(1, 1.8);
        this.tweens.add({
            targets: city.ruin,
            scaleY: 1,
            duration: 380,
            ease: 'Bounce.easeOut'
        });

        this.burst(city.x, city.y - 15, 0xff6a2a, 30, 300, 900);
        this.cameras.main.shake(260, 0.008);

        if (city.smoke)
            city.smoke.destroy();
        city.smoke = this.add.particles(city.x, city.y - 6, 'spark', {
            speedY: { min: -45, max: -20 },
            speedX: { min: -10, max: 10 },
            scale: { start: 0.8, end: 1.8 },
            alpha: { start: 0.35, end: 0 },
            lifespan: 1400,
            frequency: 140,
            tint: 0x555555
        }).setDepth(3);

        // Bonus city: rebuilds the destroyed city right away.
        if (this.bonusCities > 0) {
            this.bonusCities--;
            city.pendingRebuild = true;
            this.time.delayedCall(1600, () => this.rebuildCity(city));
        }

        if (this.cities.every(c => !c.alive && !c.pendingRebuild)) {
            this.gameOver();
            return;
        }

        // Mercy rule: the wave's target cities are gone → enemy withdraws.
        this.waveCityLosses++;
        if (this.waveCityLosses >= this.waveTargetCities.length)
            this.enemyWithdraw();
    }

    enemyWithdraw() {
        if (this.enemyWithdrawn || this.isGameOver)
            return;

        this.enemyWithdrawn = true;

        // No more launches, UFOs or smart bombs this wave.
        this.enemiesRemaining = 0;
        this.ufosToSpawn = 0;
        this.bombsToSpawn = 0;

        // UFOs on screen stop firing and leave quickly.
        this.ufos.forEach(ufo => {
            if (ufo.fireTimer)
                ufo.fireTimer.remove();
            ufo.vx *= 3;
        });

        this.showBanner('ENEMY WITHDRAWS', '#ff8a80');
        Sfx.play('withdraw');
    }

    rebuildCity(city) {
        if (this.isGameOver)
            return;

        city.pendingRebuild = false;
        city.alive = true;

        if (city.smoke) {
            city.smoke.destroy();
            city.smoke = null;
        }

        // New skyline.
        city.intact.clear();
        if (city.beacon)
            city.beacon.destroy();
        city.beacon = this.drawCity(city.intact, city);

        city.ruin.setVisible(false);
        city.crater.setVisible(false);
        city.intact.setVisible(true);
        city.glow.setVisible(true);

        city.setScale(1, 0.1);
        this.tweens.add({ targets: city, scaleY: 1, duration: 500, ease: 'Back.easeOut' });

        this.burst(city.x, city.y - 20, 0xffd54f, 24, 180, 700);
        this.floatText(city.x, city.y - 55, 'BONUS CITY', '#ffd54f');
        Sfx.play('cityTick');
    }

    destroySilo(silo) {
        if (!silo.alive)
            return;

        silo.alive = false;
        this.missiles[silo.index] = 0;
        silo.rubble.setVisible(true);
        this.updateSiloUI();

        this.burst(silo.x, silo.y - 30, 0xff6a2a, 26, 260, 800);
        this.cameras.main.shake(220, 0.007);
    }

    // City / silo hit: flash, shake, sound + mushroom cloud.
    createNuke(x, groundY) {
        this.cameras.main.flash(180, 255, 230, 190);
        this.cameras.main.shake(320, 0.01);
        Sfx.play('nuke');
        this.burst(x, groundY - 10, 0xffc04a, 34, 320, 900);
        spawnMushroom(this, x, groundY, 1);
    }

    checkWaveEnd() {
        if (
            this.enemiesRemaining === 0 &&
            this.ufosToSpawn === 0 &&
            this.ufos.length === 0 &&
            this.bombsToSpawn === 0 &&
            this.bombs.length === 0 &&
            this.enemyMissiles.length === 0 &&
            this.playerMissiles.length === 0 &&
            !this.waveFinished &&
            !this.isGameOver
        ) {
            this.waveFinished = true;

            this.time.delayedCall(
                900,
                () => this.showWaveSummary()
            );
        }
    }

    addScore(points) {
        this.score += points;
        this.scoreText.setText(`SCORE: ${this.score}`);

        // Bonus city every BONUS_CITY_EVERY points.
        while (this.score >= this.nextBonusAt) {
            this.nextBonusAt += BONUS_CITY_EVERY;
            this.bonusCities++;
            this.showBanner('BONUS CITY!', '#ffd54f');
            Sfx.play('bonus');

            // A city already in ruins is rebuilt straight away.
            const ruined = this.cities.find(c => !c.alive && !c.pendingRebuild);
            if (ruined && !this.isGameOver) {
                this.bonusCities--;
                ruined.pendingRebuild = true;
                this.time.delayedCall(800, () => this.rebuildCity(ruined));
            }
        }
    }

    floatText(x, y, text, color) {
        const t = this.add.text(x, y, text, {
            fontFamily: 'monospace',
            fontSize: '14px',
            color
        }).setOrigin(0.5, 1).setDepth(55);

        this.tweens.add({
            targets: t,
            y: y - 28,
            alpha: 0,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => t.destroy()
        });
    }

    // Calls onTick `count` times in sequence, then onDone.
    tally(count, delay, onTick, onDone) {
        if (count <= 0) {
            this.time.delayedCall(250, onDone);
            return;
        }

        let i = 0;
        this.time.addEvent({
            delay,
            repeat: count - 1,
            callback: () => {
                onTick(i++);
                if (i >= count)
                    this.time.delayedCall(350, onDone);
            }
        });
    }

    // Congratulations: banner, fanfare and fireworks above the cities.
    celebrate() {
        // Above the recap panel, near the top of the screen.
        this.showBanner('WELL DONE, COMMANDER!', '#69f0ae', 40, 65);
        Sfx.play('perfect');

        const colors = [0x69f0ae, 0xffd54f, 0x8fd3ff, 0xff8a80, 0xce93d8];
        for (let i = 0; i < 10; i++) {
            this.time.delayedCall(i * 160, () => {
                const x = Phaser.Math.Between(80, this.scale.width - 80);
                const y = Phaser.Math.Between(140, this.scale.height * 0.45);
                this.burst(x, y, Phaser.Utils.Array.GetRandom(colors), 26, 240, 900);
                Sfx.play('tick');
            });
        }
    }

    drawMiniCity(g, alive) {
        // Small city silhouette for the recap (base at y = 0).
        const blocks = [
            { x: -22, w: 9, h: 14 },
            { x: -12, w: 8, h: 22 },
            { x: -3, w: 9, h: 30 },
            { x: 7, w: 8, h: 19 },
            { x: 16, w: 7, h: 12 }
        ];

        if (!alive) {
            g.fillStyle(0x2b3238, 1);
            g.fillPoints([
                { x: -24, y: 0 }, { x: -20, y: -6 }, { x: -14, y: -3 },
                { x: -8, y: -9 }, { x: -2, y: -4 }, { x: 4, y: -8 },
                { x: 10, y: -3 }, { x: 16, y: -6 }, { x: 24, y: 0 }
            ], true);
            g.fillStyle(0xff7043, 0.6);
            g.fillRect(-10, -4, 2, 2);
            g.fillRect(6, -3, 2, 2);
            return;
        }

        blocks.forEach((b, i) => {
            g.fillStyle(i % 2 ? 0x52758b : 0x46677e, 1);
            g.fillRect(b.x, -b.h, b.w, b.h);
            g.fillStyle(0x8fb3c7, 0.6);
            g.fillRect(b.x, -b.h, 1, b.h);

            for (let wy = -b.h + 3; wy <= -4; wy += 4) {
                for (let wx = b.x + 2; wx <= b.x + b.w - 3; wx += 3) {
                    g.fillStyle((wx + wy) % 3 ? 0xffd54f : 0x0f1a22, 0.9);
                    g.fillRect(wx, wy, 1.5, 1.5);
                }
            }
        });

        // Antenna.
        g.lineStyle(1, 0x90a4ae, 1);
        g.beginPath();
        g.moveTo(1.5, -30);
        g.lineTo(1.5, -37);
        g.strokePath();
        g.fillStyle(0xff3d3d, 1);
        g.fillCircle(1.5, -38, 1.3);

        g.fillStyle(0x4fc3f7, 0.5);
        g.fillRect(-26, 0, 52, 1);
    }

    showWaveSummary() {
        if (this.isGameOver)
            return;

        this.inSummary = true;

        const W = this.scale.width;
        const H = this.scale.height;
        const pw = 520;

        const kills = this.waveKills;
        const ufoKills = [...this.waveUfoKills];
        const bombKills = this.waveBombKills;
        const aliveCities = this.cities.filter(c => c.alive);

        // List of remaining missiles: [silo index, ...] – taken from the top.
        const ammoList = [];
        this.missiles.forEach((n, i) => {
            for (let k = 0; k < n; k++)
                ammoList.push(i);
        });

        // Only rows with something to show (no "0 × ..." rows).
        // h = row height, iconDy = icon line offset below the label.
        const rows = [];
        if (kills > 0)
            rows.push({ key: 'kills', label: 'ENEMIES DESTROYED', color: '#ff8a80', h: 34 });
        if (ufoKills.length > 0)
            rows.push({ key: 'ufos', label: 'UFOS DESTROYED', color: '#b388ff', h: 66, iconDy: 30 });
        if (bombKills > 0)
            rows.push({ key: 'bombs', label: 'SMART BOMBS DESTROYED', color: '#ffffff', h: 60, iconDy: 28 });
        if (ammoList.length > 0)
            rows.push({ key: 'ammo', label: 'MISSILES SAVED', color: '#4fc3f7', h: 70, iconDy: 36 });
        rows.push({ key: 'cities', label: 'CITIES SURVIVED', color: '#ffd54f', h: 96, iconDy: 58 });

        // Perfect defense: nothing hit the ground, nothing escaped, something was shot down.
        const destroyed = kills + ufoKills.length + bombKills;
        const perfect = this.waveImpacts === 0 && this.waveUfoEscapes === 0 && destroyed > 0;
        if (perfect)
            rows.push({ key: 'perfect', label: `PERFECT DEFENSE!  +${Math.round(PERFECT_BONUS * 100)} %`, color: '#69f0ae', h: 40 });

        const ph = 70 + rows.reduce((a, r) => a + r.h, 0) + 56;
        const top = -ph / 2;
        const cx = W / 2;
        const cy = Math.max(ph / 2 + 10, H * 0.40);

        const panel = this.add.container(cx, cy).setDepth(60);
        panel.alpha = 0;

        const bg = this.add.rectangle(0, 0, pw, ph, 0x050914, 0.88);
        bg.setStrokeStyle(2, 0x4fc3f7, 0.7);
        panel.add(bg);

        const font = { fontFamily: 'monospace', color: '#ffffff' };

        panel.add(this.add.text(0, top + 22, `WAVE ${this.wave} COMPLETE`, {
            ...font, fontSize: '24px', color: '#8fd3ff'
        }).setOrigin(0.5, 0));

        const left = -pw / 2 + 28;
        const right = pw / 2 - 28;

        const makeRow = (y, label, color) => {
            const l = this.add.text(left, y, label, {
                ...font, fontSize: '18px', color
            }).setOrigin(0, 0.5);
            const v = this.add.text(right, y, '', {
                ...font, fontSize: '18px', color
            }).setOrigin(1, 0.5);
            l.alpha = 0;
            v.alpha = 0;
            panel.add(l);
            panel.add(v);
            return { l, v };
        };

        let cursor = top + 70;
        rows.forEach(r => {
            r.y = cursor;
            r.iconY = cursor + (r.iconDy || 0);
            r.ui = makeRow(cursor, r.label, r.color);
            cursor += r.h;
        });

        const line = this.add.rectangle(0, ph / 2 - 58, pw - 56, 1, 0x4fc3f7, 0.5);
        line.alpha = 0;
        panel.add(line);

        const total = makeRow(ph / 2 - 32, 'WAVE TOTAL', '#ffffff');
        total.l.setFontSize(20);
        total.v.setFontSize(20);

        // Icon pops into the panel.
        const pop = obj => {
            obj.setScale(0);
            this.tweens.add({
                targets: obj,
                scale: 1,
                duration: 160,
                ease: 'Back.easeOut'
            });
        };

        const addIcon = (x, y, draw) => {
            const icon = this.add.graphics();
            icon.x = x;
            icon.y = y;
            draw(icon);
            panel.add(icon);
            pop(icon);
        };

        const cityStep = 64;
        const citySlotX = i =>
            -((this.cities.length - 1) * cityStep) / 2 + i * cityStep;

        const show = row => {
            row.l.alpha = 1;
            row.v.alpha = 1;
        };

        let waveTotal = 0;
        const setVal = (row, n, pts) =>
            row.v.setText(`${n} × ${pts} = ${n * pts}`);

        // One step per row; each calls done() when finished.
        const steps = {
            kills: (r, done) => {
                show(r.ui);
                setVal(r.ui, kills, KILL_POINTS);
                waveTotal += kills * KILL_POINTS;
                this.time.delayedCall(300, done);
            },

            ufos: (r, done) => {
                // Different UFO types have different points – show the sum.
                show(r.ui);
                let sum = 0;
                this.tally(ufoKills.length, 200, i => {
                    const typeKey = ufoKills[i];
                    const pts = UFO_TYPES[typeKey].points;
                    sum += pts;
                    waveTotal += pts;
                    r.ui.v.setText(`${i + 1} = ${sum}`);
                    Sfx.play('tick');
                    addIcon(left + 22 + i * 46, r.iconY, g =>
                        this.drawUfoShape(g, typeKey, typeKey === 'mothership' ? 0.62 : 0.5)
                    );
                }, done);
            },

            bombs: (r, done) => {
                show(r.ui);
                setVal(r.ui, 0, BOMB_POINTS);
                this.tally(bombKills, 180, i => {
                    waveTotal += BOMB_POINTS;
                    setVal(r.ui, i + 1, BOMB_POINTS);
                    Sfx.play('tick');
                    addIcon(left + 18 + i * 28, r.iconY, g => this.drawBombIcon(g));
                }, done);
            },

            ammo: (r, done) => {
                // Saved missiles – taken out of the pyramids.
                show(r.ui);
                setVal(r.ui, 0, AMMO_BONUS);
                this.tally(ammoList.length, 55, i => {
                    const siloIndex = ammoList[ammoList.length - 1 - i];
                    const silo = this.silos[siloIndex];

                    this.missiles[siloIndex]--;
                    this.updateSiloUI();
                    this.burst(silo.launchX, silo.launchY + 30, 0x8fd3ff, 4, 80, 250);

                    this.addScore(AMMO_BONUS);
                    waveTotal += AMMO_BONUS;
                    setVal(r.ui, i + 1, AMMO_BONUS);

                    Sfx.play('tick');
                    addIcon(left + 8 + i * 14, r.iconY, g => this.drawAmmoIcon(g, 0, 0));
                }, done);
            },

            cities: (r, done) => {
                show(r.ui);
                setVal(r.ui, 0, CITY_BONUS);

                // Destroyed cities shown immediately as grey rubble.
                this.cities.forEach((c, ci) => {
                    if (c.alive)
                        return;
                    const g = this.add.graphics();
                    g.x = citySlotX(ci);
                    g.y = r.iconY;
                    this.drawMiniCity(g, false);
                    panel.add(g);
                });

                this.tally(aliveCities.length, 260, i => {
                    const city = aliveCities[i];

                    this.tweens.add({
                        targets: city,
                        scaleX: 1.12,
                        scaleY: 1.12,
                        duration: 110,
                        yoyo: true
                    });
                    this.burst(city.x, city.y - 25, 0xffd54f, 10, 140, 400);
                    this.floatText(city.x, city.y - 50, `+${CITY_BONUS}`, '#ffd54f');
                    Sfx.play('cityTick');

                    this.addScore(CITY_BONUS);
                    waveTotal += CITY_BONUS;
                    setVal(r.ui, i + 1, CITY_BONUS);

                    addIcon(citySlotX(this.cities.indexOf(city)), r.iconY,
                        g => this.drawMiniCity(g, true));
                }, done);
            },

            perfect: (r, done) => {
                // Bonus: 20 % of everything earned in this wave.
                const bonus = Math.round(waveTotal * PERFECT_BONUS);
                show(r.ui);
                r.ui.v.setText(`+${bonus}`);
                this.addScore(bonus);
                waveTotal += bonus;

                this.tweens.add({
                    targets: [r.ui.l, r.ui.v],
                    alpha: 0.35,
                    duration: 180,
                    yoyo: true,
                    repeat: 5
                });
                this.celebrate();
                this.time.delayedCall(900, done);
            }
        };

        const finish = () => {
            Sfx.play('total');
            line.alpha = 1;
            show(total);
            total.v.setText(`${waveTotal}`);

            this.tweens.add({
                targets: total.v,
                scale: 1.25,
                duration: 140,
                yoyo: true
            });

            this.time.delayedCall(2000, () => {
                this.tweens.add({
                    targets: panel,
                    alpha: 0,
                    duration: 300,
                    onComplete: () => {
                        panel.destroy();
                        this.inSummary = false;
                        this.nextWave();
                    }
                });
            });
        };

        const run = i => {
            if (i >= rows.length) {
                finish();
                return;
            }
            const r = rows[i];
            steps[r.key](r, () => this.time.delayedCall(150, () => run(i + 1)));
        };

        this.tweens.add({ targets: panel, alpha: 1, duration: 250 });
        this.time.delayedCall(450, () => run(0));
    }

    drawBombIcon(g) {
        // Small diamond for the recap.
        const c = this.palette.enemy;
        g.fillStyle(c, 0.25);
        g.fillCircle(0, 0, 10);
        g.fillStyle(0xffffff, 1);
        g.fillPoints([{ x: 0, y: -8 }, { x: 7, y: 0 }, { x: 0, y: 8 }, { x: -7, y: 0 }], true);
        g.lineStyle(1.5, c, 1);
        g.strokePoints([{ x: 0, y: -8 }, { x: 7, y: 0 }, { x: 0, y: 8 }, { x: -7, y: 0 }], true);
    }

    nextWave() {
        if (this.isGameOver)
            return;

        this.waveFinished = false;
        this.waveKills = 0;
        this.waveUfoKills = [];
        this.waveBombKills = 0;
        this.waveImpacts = 0;
        this.waveUfoEscapes = 0;

        // Completed a whole phase → +1 doomsday missile.
        if (this.wave % PHASE_LENGTH === 0) {
            this.doomsdays++;
            this.updateDoomBay();
            this.time.delayedCall(1600, () => {
                this.floatText(150, 120, '+1 DOOMSDAY MISSILE', '#ffd54f');
                Sfx.play('bonus');
            });
        }

        this.wave++;
        this.enemySpeed = ENEMY_START_SPEED * (1 + ENEMY_SPEED_STEP * (this.wave - 1));

        this.startWave();
        this.refillSilos();
    }

    gameOver() {
        this.isGameOver = true;
        Sfx.play('gameOver');
        this.input.setDefaultCursor('default');

        [...this.playerMissiles].forEach(missile => {
            missile.destroyImmediately();
        });

        [...this.enemyMissiles].forEach(missile => {
            missile.destroyImmediately();
        });

        this.ufosToSpawn = 0;
        this.bombsToSpawn = 0;
        [...this.ufos].forEach(ufo => this.removeUfo(ufo));
        [...this.bombs].forEach(bomb => this.removeBomb(bomb));

        const W = this.scale.width;
        const H = this.scale.height;
        const font = { fontFamily: 'monospace', align: 'center' };

        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setDepth(70);

        this.add.text(W / 2, H / 2 - 90, 'GAME OVER', {
            ...font, fontSize: '48px', color: '#ff4050'
        }).setOrigin(0.5).setDepth(71);

        this.add.text(W / 2, H / 2 - 30, `SCORE: ${this.score}   WAVE: ${this.wave}`, {
            ...font, fontSize: '22px', color: '#ffffff'
        }).setOrigin(0.5).setDepth(71);

        const hint = this.add.text(W / 2, H / 2 + 110, '', {
            ...font, fontSize: '18px', color: '#90a4ae'
        }).setOrigin(0.5).setDepth(71);

        const goToTitle = highlight => {
            hint.setText('Click to continue');
            // Small delay so a click from the game doesn't skip the screen.
            this.time.delayedCall(500, () => {
                this.input.once('pointerdown', () =>
                    this.scene.start('TitleScene', { highlight })
                );
            });
        };

        if (!qualifiesForHighScore(this.score)) {
            goToTitle(-1);
            return;
        }

        // ---- Name entry for the high score table ----
        this.add.text(W / 2, H / 2 + 20, 'NEW HIGH SCORE!  ENTER YOUR NAME:', {
            ...font, fontSize: '20px', color: '#ffd54f'
        }).setOrigin(0.5).setDepth(71);

        let name = '';
        const nameText = this.add.text(W / 2, H / 2 + 62, '', {
            ...font, fontSize: '30px', color: '#ffffff'
        }).setOrigin(0.5).setDepth(71);

        hint.setText('ENTER to confirm');

        let cursorOn = true;
        const render = () => nameText.setText(name + (cursorOn ? '_' : ' '));
        render();

        const blink = this.time.addEvent({
            delay: 400,
            loop: true,
            callback: () => {
                cursorOn = !cursorOn;
                render();
            }
        });

        const onKey = event => {
            if (event.key === 'Enter') {
                this.input.keyboard.off('keydown', onKey);
                blink.remove();
                cursorOn = false;

                const entry = {
                    name: name.trim() || 'PLAYER',
                    score: this.score,
                    wave: this.wave,
                    date: new Date().toISOString().slice(0, 10)
                };
                name = entry.name;
                render();

                goToTitle(saveHighScore(entry));
                return;
            }

            if (event.key === 'Backspace')
                name = name.slice(0, -1);
            else if (/^[a-zA-Z0-9 ]$/.test(event.key) && name.length < 10)
                name += event.key.toUpperCase();

            render();
        };

        this.input.keyboard.on('keydown', onKey);
    }
}

class PauseScene extends Phaser.Scene {
    constructor() {
        super('PauseScene');
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const font = { fontFamily: 'monospace', align: 'center' };

        this.input.setDefaultCursor('default');
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6);

        this.add.text(W / 2, H / 2 - 40, 'PAUSED', {
            ...font, fontSize: '52px', color: '#8fd3ff'
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2 + 30, `${keyLabel(SETTINGS.keys.pause)} / ESC / CLICK – resume\nM – quit to menu`, {
            ...font, fontSize: '18px', color: '#b0bec5', lineSpacing: 8
        }).setOrigin(0.5);

        const game = this.scene.get('GameScene');

        const resume = () => {
            this.scene.stop();
            game.input.setDefaultCursor('none');
            game.resumeGame();
        };

        // Small delay so the key that paused doesn't resume immediately.
        this.time.delayedCall(150, () => {
            const onKey = event => {
                if (event.code === SETTINGS.keys.pause || event.code === 'Escape') {
                    this.input.keyboard.off('keydown', onKey);
                    resume();
                }
            };
            this.input.keyboard.on('keydown', onKey);
            this.input.once('pointerdown', resume);
            this.input.keyboard.once('keydown-M', () => {
                this.scene.stop('GameScene');
                this.scene.start('TitleScene');
            });
        });
    }
}

class SettingsScene extends Phaser.Scene {
    constructor() {
        super('SettingsScene');
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const font = { fontFamily: 'monospace' };

        this.input.setDefaultCursor('default');
        this.add.rectangle(W / 2, H / 2, W, H, 0x050914);
        this.add.rectangle(W / 2, H - 35, W, 70, 0x101b24);
        this.add.rectangle(W / 2, H - 70, W, 2, 0x4fc3f7, 0.5);

        this.add.text(W / 2, H * 0.09, 'SETTINGS', {
            ...font, fontSize: '44px', color: '#8fd3ff'
        }).setOrigin(0.5);

        this.capturing = null;   // action id waiting for a key

        const colLabel = W / 2 - 250;
        const colKey = W / 2 + 120;
        const rowH = 44;
        let y = H * 0.20;

        this.add.text(colLabel, y, 'CONTROLS  (click a key to change it)', {
            ...font, fontSize: '15px', color: '#607d8b'
        }).setOrigin(0, 0.5);
        y += 36;

        // ---- Key bindings ----
        this.keyButtons = {};
        KEY_ACTIONS.forEach(action => {
            this.add.text(colLabel, y, action.label, {
                ...font, fontSize: '18px', color: '#ffffff'
            }).setOrigin(0, 0.5);

            if (action.note) {
                this.add.text(colKey + 70, y, action.note, {
                    ...font, fontSize: '13px', color: '#607d8b'
                }).setOrigin(0, 0.5);
            }

            const btn = this.makeButton(colKey, y, 120, 34, '', () => this.startCapture(action.id));
            this.keyButtons[action.id] = btn;
            y += rowH;
        });

        // ---- Volume ----
        y += 14;
        this.add.text(colLabel, y, 'SOUND VOLUME', {
            ...font, fontSize: '18px', color: '#ffffff'
        }).setOrigin(0, 0.5);

        const volText = this.add.text(colKey, y, '', {
            ...font, fontSize: '20px', color: '#ffd54f'
        }).setOrigin(0.5);

        const setVol = d => {
            SETTINGS.volume = Math.round(Phaser.Math.Clamp(SETTINGS.volume + d, 0, 1) * 10) / 10;
            Sfx.setVolume(SETTINGS.volume);
            saveSettings();
            volText.setText(SETTINGS.volume === 0 ? 'OFF' : `${Math.round(SETTINGS.volume * 100)}%`);
            Sfx.play('click');
        };
        this.makeArrow(colKey - 75, y, '◀', () => setVol(-0.1));
        this.makeArrow(colKey + 75, y, '▶', () => setVol(0.1));
        setVol(0);

        // ---- Wave start sound A / B ----
        y += 44;
        this.add.text(colLabel, y, 'WAVE START SOUND', {
            ...font, fontSize: '18px', color: '#ffffff'
        }).setOrigin(0, 0.5);

        const wsText = this.add.text(colKey, y, '', {
            ...font, fontSize: '20px', color: '#ffd54f'
        }).setOrigin(0.5);

        const showWs = () => wsText.setText(SETTINGS.waveSound);
        const cycleWs = d => {
            const i = WAVE_SOUNDS.indexOf(SETTINGS.waveSound);
            SETTINGS.waveSound = WAVE_SOUNDS[(i + d + WAVE_SOUNDS.length) % WAVE_SOUNDS.length];
            saveSettings();
            showWs();
            Sfx.last = {};
            Sfx.play('waveStart', false);   // preview
        };
        this.makeArrow(colKey - 95, y, '◀', () => cycleWs(-1));
        this.makeArrow(colKey + 95, y, '▶', () => cycleWs(1));
        showWs();

        // ---- Buttons ----
        y += 70;
        this.makeButton(W / 2 - 150, y, 250, 42, 'RESET KEYS', () => {
            SETTINGS.keys = { ...DEFAULT_SETTINGS.keys };
            saveSettings();
            this.refreshKeys();
            this.flash('Keys reset to default', '#8fd3ff');
        });

        let confirmClear = false;
        const clearBtn = this.makeButton(W / 2 + 150, y, 250, 42, 'CLEAR HIGH SCORES', () => {
            if (!confirmClear) {
                confirmClear = true;
                clearBtn.label.setText('CLICK AGAIN TO CONFIRM').setColor('#ff4050');
                this.time.delayedCall(3000, () => {
                    if (confirmClear) {
                        confirmClear = false;
                        clearBtn.label.setText('CLEAR HIGH SCORES').setColor('#ffffff');
                    }
                });
                return;
            }
            confirmClear = false;
            clearHighScores();
            clearBtn.label.setText('CLEAR HIGH SCORES').setColor('#ffffff');
            this.flash('High scores cleared', '#ff8a80');
        });

        y += 64;
        this.makeButton(W / 2 - 150, y, 250, 46, 'WAVE TABLE', () => this.scene.start('WaveInfoScene'));
        this.makeButton(W / 2 + 150, y, 250, 46, 'BACK', () => this.back());

        this.message = this.add.text(W / 2, y + 48, '', {
            ...font, fontSize: '16px', color: '#8fd3ff'
        }).setOrigin(0.5);

        this.refreshKeys();

        // Key capture / ESC to go back.
        this.input.keyboard.on('keydown', event => {
            if (this.capturing) {
                event.preventDefault?.();
                if (event.code !== 'Escape')
                    this.assignKey(this.capturing, event.code);
                this.capturing = null;
                this.refreshKeys();
                return;
            }
            if (event.code === 'Escape')
                this.back();
        });
    }

    makeButton(x, y, w, h, text, onClick) {
        const rect = this.add.rectangle(x, y, w, h, 0x0d2233, 1)
            .setStrokeStyle(2, 0x4fc3f7, 0.9)
            .setInteractive({ useHandCursor: true });
        const label = this.add.text(x, y, text, {
            fontFamily: 'monospace', fontSize: '17px', color: '#ffffff'
        }).setOrigin(0.5);

        rect.on('pointerover', () => rect.setFillStyle(0x1b4a66, 1));
        rect.on('pointerout', () => rect.setFillStyle(0x0d2233, 1));
        rect.on('pointerdown', () => {
            Sfx.play('click');
            onClick();
        });

        rect.label = label;
        return rect;
    }

    makeArrow(x, y, text, onClick) {
        const a = this.add.text(x, y, text, {
            fontFamily: 'monospace', fontSize: '22px', color: '#4fc3f7'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        a.on('pointerdown', onClick);
        a.on('pointerover', () => a.setColor('#ffd54f'));
        a.on('pointerout', () => a.setColor('#4fc3f7'));
        return a;
    }

    startCapture(id) {
        this.capturing = id;
        this.refreshKeys();
    }

    assignKey(id, code) {
        // If another action already uses this key, swap them.
        const other = Object.keys(SETTINGS.keys).find(k => k !== id && SETTINGS.keys[k] === code);
        if (other)
            SETTINGS.keys[other] = SETTINGS.keys[id];

        SETTINGS.keys[id] = code;
        saveSettings();
        this.flash(other ? 'Keys swapped' : 'Key saved', '#8fd3ff');
    }

    refreshKeys() {
        Object.entries(this.keyButtons).forEach(([id, btn]) => {
            if (this.capturing === id)
                btn.label.setText('PRESS A KEY').setColor('#ffd54f');
            else
                btn.label.setText(keyLabel(SETTINGS.keys[id])).setColor('#ffffff');
        });
    }

    flash(text, color) {
        this.message.setText(text).setColor(color).setAlpha(1);
        this.tweens.killTweensOf(this.message);
        this.tweens.add({ targets: this.message, alpha: 0, delay: 1500, duration: 500 });
    }

    back() {
        this.scene.start('TitleScene');
    }
}

class WaveInfoScene extends Phaser.Scene {
    constructor() {
        super('WaveInfoScene');
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        const font = { fontFamily: 'monospace' };

        this.input.setDefaultCursor('default');
        this.add.rectangle(W / 2, H / 2, W, H, 0x050914);

        this.add.text(W / 2, H * 0.07, 'WAVE PARAMETERS', {
            ...font, fontSize: '36px', color: '#8fd3ff'
        }).setOrigin(0.5);

        // Columns (x relative to centre, alignment).
        this.cols = [
            { title: 'WAVE', x: -440, o: 0 },
            { title: 'PHASE', x: -370, o: 0 },
            { title: 'COLOURS', x: -290, o: 0 },
            { title: 'SPEED', x: -100, o: 1 },
            { title: 'MISSILES', x: 20, o: 1 },
            { title: 'UFOS', x: 100, o: 1 },
            { title: 'UFO TYPES', x: 130, o: 0 },
            { title: 'SMART BOMBS', x: 450, o: 1 }
        ];

        this.tableTop = H * 0.15;
        this.cols.forEach(c => {
            this.add.text(W / 2 + c.x, this.tableTop, c.title, {
                ...font, fontSize: '14px', color: '#607d8b'
            }).setOrigin(c.o, 0.5);
        });

        this.perPage = PHASE_LENGTH;       // one phase per page
        this.pages = Math.ceil(MAX_START_WAVE / this.perPage);
        this.page = 0;
        this.rows = [];

        this.pageText = this.add.text(W / 2, this.tableTop + 30 + this.perPage * 26 + 14, '', {
            ...font, fontSize: '16px', color: '#ffffff'
        }).setOrigin(0.5);

        const arrow = (x, label, d) => {
            const a = this.add.text(x, this.pageText.y, label, {
                ...font, fontSize: '22px', color: '#4fc3f7'
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            a.on('pointerdown', () => this.showPage(this.page + d));
            a.on('pointerover', () => a.setColor('#ffd54f'));
            a.on('pointerout', () => a.setColor('#4fc3f7'));
        };
        arrow(W / 2 - 110, '◀', -1);
        arrow(W / 2 + 110, '▶', 1);

        // General rules.
        const ufoPts = Object.values(UFO_TYPES)
            .map(t => `${t.name.toLowerCase()} ${t.points}${t.hp > 1 ? ` (${t.hp} hits)` : ''}`)
            .join(' · ');
        const rules = [
            `Start: speed ${ENEMY_START_SPEED}, ${ENEMY_START_COUNT} missiles · each wave +${Math.round(ENEMY_SPEED_STEP * 100)} % of start speed, +${ENEMY_COUNT_STEP} missiles`,
            `MISSILES = one buffer per wave (${ENEMY_START_COUNT}, +${ENEMY_COUNT_STEP} each wave) – the top launcher and UFOs both draw from it`,
            `From wave ${SPLIT_FROM_WAVE}: ${Math.round(SPLIT_CHANCE * 100)} % of missiles split in the air into 2+ (max +1 per phase) – the wave total stays the same`,
            `Each wave targets max ${MERCY_CITY_TARGETS} cities + all silos – when those cities fall, the enemy withdraws`,
            `One UFO on screen at a time (except the UFO attack wave) · motherships may drop smart bombs · smart bombs dodge clouds`,
            `Points: missile ${KILL_POINTS} · smart bomb ${BOMB_POINTS} · ${ufoPts}`,
            `Wave end: saved missile ${AMMO_BONUS} · surviving city ${CITY_BONUS} · perfect defense +${Math.round(PERFECT_BONUS * 100)} % · bonus city every ${BONUS_CITY_EVERY} points`,
            `Phase = ${PHASE_LENGTH} waves · wave 5: fast UFO attack (4 at once, +1 per phase) · wave 10: smart bomb rain with UFO bombers`,
            `Doomsday missile: ${DOOMSDAY_START} at the start, +1 for each completed phase`
        ];
        this.add.text(W / 2, this.pageText.y + 36, rules.join('\n'), {
            ...font, fontSize: '13px', color: '#90a4ae', align: 'center', lineSpacing: 5
        }).setOrigin(0.5, 0);

        const back = this.add.text(W / 2, H - 34, 'BACK', {
            ...font, fontSize: '18px', color: '#ffffff',
            backgroundColor: '#0d2233', padding: { x: 24, y: 8 }
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        back.on('pointerdown', () => this.scene.start('SettingsScene'));

        this.input.keyboard.on('keydown-ESC', () => this.scene.start('SettingsScene'));
        this.input.keyboard.on('keydown-LEFT', () => this.showPage(this.page - 1));
        this.input.keyboard.on('keydown-RIGHT', () => this.showPage(this.page + 1));

        this.showPage(0);
    }

    // Same formulas the game uses.
    waveData(w) {
        const pal = paletteForWave(w);
        const spec = getWaveSpec(w);
        const types = Object.values(UFO_TYPES)
            .filter(t => w >= t.fromWave)
            .map(t => t.name.toLowerCase());

        let typeText = spec.ufos ? types.join(', ') : '-';
        if (spec.special === 'ufo')
            typeText = `★ UFO ATTACK – ${spec.ufoAtOnce} at once`;
        if (spec.special === 'bombs')
            typeText = '★ BOMB RAIN – UFO bombers';

        return {
            wave: w,
            phase: phaseForWave(w),
            pal,
            special: spec.special,
            speed: Math.round(ENEMY_START_SPEED * (1 + ENEMY_SPEED_STEP * (w - 1))),
            missiles: spec.missiles,
            ufos: spec.ufos,
            types: typeText,
            bombs: spec.bombs
        };
    }

    showPage(p) {
        this.page = Phaser.Math.Clamp(p, 0, this.pages - 1);
        this.rows.forEach(t => t.destroy());
        this.rows = [];

        const W = this.scale.width;
        const font = { fontFamily: 'monospace', fontSize: '16px' };
        const first = this.page * this.perPage + 1;

        for (let i = 0; i < this.perPage; i++) {
            const w = first + i;
            if (w > MAX_START_WAVE)
                break;

            const d = this.waveData(w);
            const y = this.tableTop + 30 + i * 26;
            const color = hexColor(d.pal.line);
            const values = [
                `${d.wave}`, `${d.phase}`, d.pal.name, `${d.speed}`,
                `${d.missiles || '-'}`, `${d.ufos || '-'}`, d.types, `${d.bombs || '-'}`
            ];

            // Colour swatch (sky + enemy colour) before the palette name.
            const sw = this.add.rectangle(W / 2 + this.cols[2].x - 14, y, 14, 14, d.pal.sky)
                .setStrokeStyle(2, d.pal.enemy);
            this.rows.push(sw);

            values.forEach((v, ci) => {
                const c = this.cols[ci];
                this.rows.push(this.add.text(W / 2 + c.x, y, v, {
                    ...font,
                    color: ci === 2 ? color : (d.special && ci === 6 ? '#ffd54f' : '#ffffff')
                }).setOrigin(c.o, 0.5));
            });
        }

        this.pageText.setText(`WAVES ${first}–${Math.min(first + this.perPage - 1, MAX_START_WAVE)}`);
    }
}

class TitleScene extends Phaser.Scene {
    constructor() {
        super('TitleScene');
    }

    create(data) {
        const W = this.scale.width;
        const H = this.scale.height;
        const highlight = data && Number.isInteger(data.highlight) ? data.highlight : -1;
        const font = { fontFamily: 'monospace' };

        this.input.setDefaultCursor('default');

        // Background: sky, stars, ground.
        this.add.rectangle(W / 2, H / 2, W, H, 0x050914);
        for (let i = 0; i < 120; i++) {
            const star = this.add.circle(
                Phaser.Math.Between(0, W),
                Phaser.Math.Between(0, H - 80),
                Phaser.Math.Between(1, 2),
                0xffffff,
                Phaser.Math.FloatBetween(0.2, 0.8)
            );
            this.tweens.add({
                targets: star,
                alpha: Phaser.Math.FloatBetween(0.05, 0.3),
                duration: Phaser.Math.Between(900, 2600),
                delay: Phaser.Math.Between(0, 2000),
                yoyo: true,
                repeat: -1
            });
        }
        this.add.rectangle(W / 2, H - 35, W, 70, 0x101b24);
        this.add.rectangle(W / 2, H - 70, W, 2, 0x4fc3f7, 0.5);

        // Demo UFO shows up now and then.
        this.demoUfo = null;
        this.demoBombs = [];
        this.time.delayedCall(2500, () => this.spawnDemoUfo());

        // Decorative enemy missiles raining down in the background.
        this.time.addEvent({
            delay: 1100,
            loop: true,
            callback: () => this.demoMissile(null, -10)
        });

        // Title.
        const titleY = H * 0.13;
        this.add.text(W / 2 + 3, titleY + 3, 'MISSILE COMMANDER', {
            ...font, fontSize: '54px', color: '#0d47a1'
        }).setOrigin(0.5);
        const title = this.add.text(W / 2, titleY, 'MISSILE COMMANDER', {
            ...font, fontSize: '54px', color: '#8fd3ff'
        }).setOrigin(0.5);
        this.tweens.add({
            targets: title,
            alpha: 0.75,
            duration: 1400,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.add.text(W / 2, titleY + 46, 'DEFEND THE CITIES', {
            ...font, fontSize: '18px', color: '#ff8a80'
        }).setOrigin(0.5);

        // START GAME button.
        const btnY = H * 0.29;
        const btn = this.add.rectangle(W / 2, btnY, 280, 58, 0x0d2233, 1)
            .setStrokeStyle(2, 0x4fc3f7, 1)
            .setInteractive({ useHandCursor: true });
        const btnText = this.add.text(W / 2, btnY, 'START GAME', {
            ...font, fontSize: '28px', color: '#ffffff'
        }).setOrigin(0.5);

        this.tweens.add({
            targets: [btn, btnText],
            scale: 1.04,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        btn.on('pointerover', () => {
            btn.setFillStyle(0x1b4a66, 1);
            btnText.setColor('#ffd54f');
        });
        btn.on('pointerout', () => {
            btn.setFillStyle(0x0d2233, 1);
            btnText.setColor('#ffffff');
        });

        // Start wave / phase picker (remembered for this session).
        let startWave = this.registry.get('startWave') || 1;
        const pickY = btnY + 50;

        const pickText = this.add.text(W / 2, pickY, '', {
            ...font, fontSize: '18px', color: '#ffffff'
        }).setOrigin(0.5);

        const updatePick = () => {
            const phase = phaseForWave(startWave);
            pickText.setText(`START WAVE ${String(startWave).padStart(2, ' ')}   PHASE ${phase}`);
            pickText.setColor(hexColor(paletteForWave(startWave).line));
            this.registry.set('startWave', startWave);
        };

        const change = d => {
            startWave = Phaser.Math.Clamp(startWave + d, 1, MAX_START_WAVE);
            updatePick();
        };

        const arrow = (x, label, d) => {
            const a = this.add.text(x, pickY, label, {
                ...font, fontSize: '22px', color: '#4fc3f7'
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            a.on('pointerdown', () => change(d));
            a.on('pointerover', () => a.setColor('#ffd54f'));
            a.on('pointerout', () => a.setColor('#4fc3f7'));
            return a;
        };

        arrow(W / 2 - 200, '◀◀', -PHASE_LENGTH);
        arrow(W / 2 - 160, '◀', -1);
        arrow(W / 2 + 160, '▶', 1);
        arrow(W / 2 + 200, '▶▶', PHASE_LENGTH);
        updatePick();

        this.input.keyboard.on('keydown-LEFT', () => change(-1));
        this.input.keyboard.on('keydown-RIGHT', () => change(1));
        this.input.keyboard.on('keydown-DOWN', () => change(-PHASE_LENGTH));
        this.input.keyboard.on('keydown-UP', () => change(PHASE_LENGTH));

        const start = () => this.scene.start('GameScene', { startWave });
        btn.on('pointerdown', start);
        this.input.keyboard.once('keydown-ENTER', start);
        this.input.keyboard.once('keydown-SPACE', start);

        this.add.text(W / 2, pickY + 28, 'ENTER – start    ◀ ▶ – wave    ▲ ▼ – phase', {
            ...font, fontSize: '14px', color: '#607d8b'
        }).setOrigin(0.5);

        // High score table.
        const tableY = H * 0.45;
        this.add.text(W / 2, tableY, 'HIGH SCORES', {
            ...font, fontSize: '24px', color: '#ffd54f'
        }).setOrigin(0.5);

        const scores = loadHighScores();
        const colRank = W / 2 - 190;
        const colName = W / 2 - 150;
        const colWave = W / 2 + 90;
        const colScore = W / 2 + 190;

        const head = { ...font, fontSize: '14px', color: '#607d8b' };
        this.add.text(colRank, tableY + 26, '#', head).setOrigin(0, 0.5);
        this.add.text(colName, tableY + 26, 'NAME', head).setOrigin(0, 0.5);
        this.add.text(colWave, tableY + 26, 'WAVE', head).setOrigin(1, 0.5);
        this.add.text(colScore, tableY + 26, 'SCORE', head).setOrigin(1, 0.5);

        if (scores.length === 0) {
            this.add.text(W / 2, tableY + 64, 'NO SCORES YET – BE THE FIRST!', {
                ...font, fontSize: '16px', color: '#90a4ae'
            }).setOrigin(0.5);
        }

        scores.forEach((e, i) => {
            const y = tableY + 52 + i * 24;
            const isNew = i === highlight;
            const color = isNew ? '#ffd54f' : (i < 3 ? '#ffffff' : '#b0bec5');
            const style = { ...font, fontSize: '18px', color };

            const row = [
                this.add.text(colRank, y, `${i + 1}.`, style).setOrigin(0, 0.5),
                this.add.text(colName, y, e.name, style).setOrigin(0, 0.5),
                this.add.text(colWave, y, `${e.wave ?? '-'}`, style).setOrigin(1, 0.5),
                this.add.text(colScore, y, `${e.score}`, style).setOrigin(1, 0.5)
            ];

            if (isNew) {
                this.tweens.add({
                    targets: row,
                    alpha: 0.3,
                    duration: 350,
                    yoyo: true,
                    repeat: -1
                });
            }
        });

        // Controls (from Settings).
        const k = SETTINGS.keys;
        this.add.text(W / 2, H - 100,
            `CLICK – fire from the nearest silo     ${keyLabel(k.left)} / ${keyLabel(k.center)} / ${keyLabel(k.right)} – fire from left / centre / right silo\n` +
            `${keyLabel(k.doomsday)} or RIGHT CLICK – doomsday missile (clears the screen)     ${keyLabel(k.pause)} – pause`, {
            ...font, fontSize: '14px', color: '#90a4ae', align: 'center', lineSpacing: 6
        }).setOrigin(0.5);

        // Settings button (top right).
        const setBtn = this.add.text(W - 20, 20, '⚙ SETTINGS', {
            ...font, fontSize: '18px', color: '#8fd3ff',
            backgroundColor: '#0d2233', padding: { x: 10, y: 6 }
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
        setBtn.on('pointerover', () => setBtn.setColor('#ffd54f'));
        setBtn.on('pointerout', () => setBtn.setColor('#8fd3ff'));
        setBtn.on('pointerdown', () => this.scene.start('SettingsScene'));
        this.input.keyboard.on('keydown-S', () => this.scene.start('SettingsScene'));

        // Keep all texts and the button above the demo missiles.
        this.children.list.forEach(o => {
            if (o.type === 'Text' || o === btn)
                o.setDepth(10);
        });
    }

    // ---- Demo UFO: crosses now and then, fires salvos and drops smart bombs ----

    spawnDemoUfo() {
        const W = this.scale.width;
        const H = this.scale.height;
        const typeKey = Phaser.Utils.Array.GetRandom(Object.keys(UFO_TYPES));
        const type = UFO_TYPES[typeKey];
        const fromLeft = Math.random() < 0.5;
        const s = type.scale;

        // Flies through the empty lower part of the title screen.
        const ufo = this.add.container(fromLeft ? -70 * s : W + 70 * s,
            Phaser.Math.Between(Math.round(H * 0.56), Math.round(H * 0.74)));
        ufo.setDepth(2);
        ufo.add(this.add.ellipse(0, 6 * s, 80 * s, 26 * s, 0xff2020, 0.12));
        const g = this.add.graphics();
        drawUfoShape(g, typeKey, s);
        ufo.add(g);

        ufo.typeKey = typeKey;
        ufo.vx = (fromLeft ? 1 : -1) * type.speed;
        ufo.baseY = ufo.y;
        ufo.nextShot = this.time.now + Phaser.Math.Between(700, 1300);
        this.demoUfo = ufo;
    }

    demoUfoFire(ufo) {
        const s = UFO_TYPES[ufo.typeKey].scale;

        // Show off: smart bomb (always possible here) or a salvo.
        if (Math.random() < 0.35) {
            this.spawnDemoBomb(ufo.x, ufo.y + 14 * s);
            return;
        }

        const [min, max] = UFO_TYPES[ufo.typeKey].salvo;
        const n = Phaser.Math.Between(Math.max(2, min), Math.max(2, max));
        for (let i = 0; i < n; i++)
            this.demoMissile(ufo.x + (i - (n - 1) / 2) * 12, ufo.y + 8 * s);
    }

    spawnDemoBomb(x, y) {
        const bomb = this.add.graphics().setDepth(2);
        bomb.x = x;
        bomb.y = y;
        bomb.phase = Math.random() * 10;
        this.demoBombs.push(bomb);
    }

    update(time, delta) {
        const dt = delta / 1000;
        const W = this.scale.width;
        const H = this.scale.height;

        const ufo = this.demoUfo;
        if (ufo) {
            ufo.x += ufo.vx * dt;
            ufo.y = ufo.baseY + Math.sin(time / 300) * 5;
            ufo.rotation = Math.sin(time / 450) * 0.06;

            if (time > ufo.nextShot && ufo.x > 40 && ufo.x < W - 40) {
                this.demoUfoFire(ufo);
                ufo.nextShot = time + Phaser.Math.Between(900, 1600);
            }

            if (ufo.x < -150 || ufo.x > W + 150) {
                ufo.destroy();
                this.demoUfo = null;
                this.time.delayedCall(Phaser.Math.Between(6000, 11000), () => this.spawnDemoUfo());
            }
        }

        // Demo smart bombs: weave down, then a mushroom cloud.
        this.demoBombs = this.demoBombs.filter(b => {
            b.phase += dt * 3;
            b.y += 70 * dt;
            b.x += Math.sin(b.phase) * 60 * dt;

            const k = (Math.sin(time / 85) + 1) / 2;
            b.clear();
            b.fillStyle(0xff2020, 0.12 + 0.3 * k);
            b.fillCircle(0, 0, 10 + 7 * k);
            const cs = Math.cos(time / 120);
            const pts = [{ x: 0, y: -9 }, { x: 9 * cs, y: 0 }, { x: 0, y: 9 }, { x: -9 * cs, y: 0 }];
            b.fillStyle(Math.sin(time / 70) > 0 ? 0xffffff : 0xff2020, 1);
            b.fillPoints(pts, true);

            if (b.y >= H - 70) {
                spawnMushroom(this, b.x, H - 70, 0.7);
                b.destroy();
                return false;
            }
            return true;
        });
    }

    demoMissile(fromX = null, fromY = -10) {
        const W = this.scale.width;
        const H = this.scale.height;

        const missile = new Missile(this, {
            x: fromX ?? Phaser.Math.Between(0, W),
            y: fromY,
            targetX: Phaser.Math.Between(40, W - 40),
            targetY: H - 70,
            speed: Phaser.Math.Between(70, 120),
            color: 0xff2020,
            trailDistance: 260,
            trailWidth: 3,
            trailDepth: 1,
            bodyDepth: 1,
            onImpact: current =>
                spawnMushroom(this, current.x, current.y, Phaser.Math.FloatBetween(0.45, 0.75))
        });
        missile.setAlpha(0.6);

        const tick = this.time.addEvent({
            delay: 16,
            loop: true,
            callback: () => {
                if (!missile.isFlying) {
                    tick.remove();
                    return;
                }
                missile.update(0.016);
            }
        });
    }
}

const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#050914',
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [TitleScene, GameScene, PauseScene, SettingsScene, WaveInfoScene]
};

new Phaser.Game(config);
