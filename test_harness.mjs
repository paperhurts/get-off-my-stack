// Loads the real game script out of index.html and runs it against a minimal
// fake DOM, so behavioural tests exercise the actual code instead of a copy of
// it that quietly drifts. No dependencies, in keeping with the rest of the repo.
import { readFileSync } from 'fs';

function makeElement() {
  return {
    style: {},
    textContent: '',
    appendChild() {},
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 120, height: 120 })
  };
}

// Swallows every canvas call; remembers whatever gets assigned so that
// read-modify-write on things like globalAlpha still behaves.
function makeCtx() {
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; }
  });
}

export function loadGame() {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('could not find the game <script> block in index.html');

  const listeners = { document: {}, window: {} };
  const record = (bucket) => (type, fn) => {
    (listeners[bucket][type] ||= []).push(fn);
  };

  const doc = {
    getElementById: (id) => {
      // Touch controls are optional in the real page; returning null exercises
      // the `if (joystickZone)` / `if (smackBtn)` guards.
      if (['joystick-zone', 'joystick-knob', 'smack-btn'].includes(id)) return null;
      if (id === 'game') return { width: 800, height: 600, getContext: makeCtx };
      return makeElement();
    },
    createElement: (tag) => (tag === 'canvas'
      ? { width: 0, height: 0, getContext: makeCtx }
      : makeElement()),
    createTextNode: (text) => ({ nodeValue: text }),
    addEventListener: record('document')
  };
  const win = { addEventListener: record('window') };

  // Expose the internals as live getters — `enemies` and friends are
  // reassigned by the game, so a plain snapshot would go stale immediately.
  const exposed = `
    return {
      ENEMY_TYPES, POWERUP_TYPES, WAVES, CLIPPY_SUGGESTIONS,
      startGame, gameOver, update, draw, gameLoop,
      spawnEnemy, spawnEnemyAt, spawnPowerup, swingCane, checkCaneHit,
      addText, addParticles,
      player, keys,
      get enemies() { return enemies; },       set enemies(v) { enemies = v; },
      get particles() { return particles; },   set particles(v) { particles = v; },
      get powerups() { return powerups; },     set powerups(v) { powerups = v; },
      get floatingTexts() { return floatingTexts; }, set floatingTexts(v) { floatingTexts = v; },
      get killLog() { return killLog; },       set killLog(v) { killLog = v; },
      get score() { return score; },           set score(v) { score = v; },
      get health() { return health; },         set health(v) { health = v; },
      get wave() { return wave; },             set wave(v) { wave = v; },
      get waveTimer() { return waveTimer; },   set waveTimer(v) { waveTimer = v; },
      get spawnTimer() { return spawnTimer; }, set spawnTimer(v) { spawnTimer = v; },
      get gameRunning() { return gameRunning; }, set gameRunning(v) { gameRunning = v; },
      get gameTick() { return gameTick; },
      get screenShake() { return screenShake; }, set screenShake(v) { screenShake = v; },
      get caneSwinging() { return caneSwinging; }, set caneSwinging(v) { caneSwinging = v; },
      get caneAngle() { return caneAngle; },   set caneAngle(v) { caneAngle = v; },
      get caneTimer() { return caneTimer; },   set caneTimer(v) { caneTimer = v; },
      get activePowerup() { return activePowerup; }, set activePowerup(v) { activePowerup = v; },
      get powerupTimer() { return powerupTimer; }, set powerupTimer(v) { powerupTimer = v; }
    };
  `;

  const factory = new Function(
    'document', 'window', 'requestAnimationFrame', 'console',
    match[1] + exposed
  );

  const game = factory(doc, win, () => {}, console);
  game.fire = (bucket, type, event = {}) => {
    (listeners[bucket][type] || []).forEach(fn => fn(event));
  };
  return game;
}
