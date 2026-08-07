// Behavioural tests: these run the real game code from index.html.
import { loadGame } from './test_harness.mjs';

let passed = 0, failed = 0;
const assert = (cond, name) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ FAIL: ${name}`); }
};

// Runs n update ticks with spawning disabled, so tests only see what they set up.
const tick = (g, n = 1) => {
  for (let i = 0; i < n; i++) { g.spawnTimer = -1e6; g.update(); }
};

const fresh = () => {
  const g = loadGame();
  g.startGame();
  g.spawnTimer = -1e6;
  return g;
};

console.log('=== Behavioural tests (real game code) ===\n');

// ---- Data integrity ----
console.log('Data integrity');
{
  const g = loadGame();
  const required = ['name', 'color', 'w', 'h', 'hp', 'speed', 'points', 'deathMsg', 'shape'];
  const missing = Object.entries(g.ENEMY_TYPES)
    .filter(([, t]) => required.some(f => t[f] === undefined))
    .map(([k]) => k);
  assert(missing.length === 0, `every enemy type has required fields (missing: ${missing})`);

  const known = new Set(Object.keys(g.ENEMY_TYPES));
  const bad = g.WAVES.flatMap(w => w.types).filter(t => !known.has(t));
  assert(bad.length === 0, `every wave references a real enemy type (bad: ${bad})`);

  const summoners = Object.values(g.ENEMY_TYPES).filter(t => t.summons);
  assert(summoners.every(t => known.has(t.summons) && t.summonCount > 0 && t.summonInterval > 0),
    'summoning bosses reference a real minion with sane counts');
}

// ---- Clippy exists and is a boss ----
console.log('\nClippy');
{
  const g = loadGame();
  const c = g.ENEMY_TYPES.clippy;
  assert(!!c, 'clippy enemy type exists');
  assert(c.boss === true, 'clippy is flagged as a boss');
  assert(c.hp >= 8, `clippy has boss-tier HP (${c.hp})`);
  assert(c.points > g.ENEMY_TYPES.jsBlob.points, 'clippy is worth more than a JS blob');
  assert(g.WAVES.some(w => w.types.includes('clippy')), 'clippy appears in at least one wave');
  assert(Array.isArray(g.CLIPPY_SUGGESTIONS) && g.CLIPPY_SUGGESTIONS.length > 1,
    'clippy has multiple suggestions');
  assert(g.CLIPPY_SUGGESTIONS.every(s => Array.isArray(s) && s.length > 0),
    'every suggestion is pre-split into lines');
}

// ---- Clippy summons minions, LINTER stops it ----
console.log('\nClippy summons');
{
  const g = fresh();
  const iv = g.ENEMY_TYPES.clippy.summonInterval;
  g.enemies = [];
  g.player.x = 700; g.player.y = 560; g.health = 99;
  g.spawnEnemyAt('clippy', 60, 60);
  tick(g, iv + 2);
  const minions = g.enemies.filter(e => e.type === 'dansFix').length;
  assert(minions === g.ENEMY_TYPES.clippy.summonCount,
    `clippy summons ${g.ENEMY_TYPES.clippy.summonCount} minions on interval (got ${minions})`);
  assert(g.enemies.some(e => e.type === 'clippy' && e.speechTimer > 0), 'clippy shows a speech bubble');

  const g2 = fresh();
  g2.enemies = [];
  g2.player.x = 700; g2.player.y = 560; g2.health = 99;
  g2.spawnEnemyAt('clippy', 60, 60);
  g2.activePowerup = 'freeze'; g2.powerupTimer = 1e6;
  tick(g2, iv * 3);
  assert(g2.enemies.filter(e => e.type === 'dansFix').length === 0,
    'LINTER (freeze) stops clippy summoning entirely');
}

// ---- One boss at a time ----
console.log('\nBoss spawn cap');
{
  // Every wave: no boss type ever exceeds one alive.
  const g = fresh();
  for (let w = 1; w <= g.WAVES.length; w++) {
    g.wave = w;
    g.enemies = [];
    const peak = {};
    for (let i = 0; i < 300; i++) {
      g.spawnEnemy();
      for (const e of g.enemies) {
        if (!g.ENEMY_TYPES[e.type].boss) continue;
        const n = g.enemies.filter(x => x.type === e.type).length;
        peak[e.type] = Math.max(peak[e.type] || 0, n);
      }
    }
    const over = Object.entries(peak).filter(([, n]) => n > 1);
    assert(over.length === 0,
      `wave ${w} (${g.WAVES[w - 1].name}): no duplicate bosses (peaks ${JSON.stringify(peak)})`);
    assert(g.enemies.length === 300, `wave ${w}: non-boss spawns continue while a boss is capped`);
  }

  // A surviving boss from an earlier wave must not starve out a later wave's
  // own boss — Clippy's wave has to be able to produce a Clippy.
  const g2 = fresh();
  const clippyWave = g2.WAVES.findIndex(w => w.types.includes('clippy')) + 1;
  g2.wave = clippyWave;
  g2.enemies = [];
  g2.spawnEnemyAt('sapIfElse', 50, 50);   // left over from SAP NIGHTMARE
  for (let i = 0; i < 300; i++) g2.spawnEnemy();
  assert(g2.enemies.some(e => e.type === 'clippy'),
    'a lingering SAP boss does not block Clippy from spawning in its own wave');
}

// ---- Bosses do not delete themselves on contact ----
console.log('\nBoss contact');
{
  for (const type of Object.keys(loadGame().ENEMY_TYPES)) {
    const g = fresh();
    const t = g.ENEMY_TYPES[type];
    if (!t.boss) continue;
    g.enemies = []; g.health = 5; g.score = 0; g.killLog = {};
    g.player.x = 400; g.player.y = 300;
    g.spawnEnemyAt(type, 405, 300);
    tick(g, 3);
    assert(g.enemies.length === 1 && g.enemies[0].hp === t.hp,
      `${type} survives a body-bump at full HP`);
    assert(g.health === 4, `${type} body-bump costs exactly one heart`);
    assert(g.score === 0, `${type} awards no points for a body-bump`);
  }

  // Regular enemies keep the original sacrifice-on-contact behaviour.
  const g = fresh();
  g.enemies = []; g.health = 5;
  g.player.x = 400; g.player.y = 300;
  g.spawnEnemyAt('jsBlob', 405, 300);
  tick(g, 2);
  assert(g.enemies.length === 0, 'a plain enemy still dies when it reaches the player');
  assert(g.health === 4, 'a plain enemy costs one heart');
}

// ---- Killing a boss credits score and the incident report ----
console.log('\nBoss kill crediting');
{
  const g = fresh();
  g.enemies = []; g.score = 0; g.killLog = {}; g.health = 99; g.floatingTexts = [];
  g.player.x = 400; g.player.y = 300; g.player.facing = 1;
  g.spawnEnemyAt('clippy', 465, 300);   // inside cane reach, outside body hitbox
  g.enemies[0].hp = 1;
  g.swingCane();
  tick(g, 10);
  assert(g.score === g.ENEMY_TYPES.clippy.points, `caning clippy awards ${g.ENEMY_TYPES.clippy.points} (got ${g.score})`);
  assert(g.killLog.clippy === 1, 'clippy is recorded in the incident report');
  assert(g.floatingTexts.some(t => t.text === g.ENEMY_TYPES.clippy.deathMsg), 'clippy death message shown');
}

// ---- Health never goes negative, gameOver fires once ----
console.log('\nDeath handling');
{
  const g = fresh();
  g.enemies = []; g.health = 1;
  g.player.x = 400; g.player.y = 300;
  ['jsBlob', 'memLeak', 'dansFix'].forEach(t => g.spawnEnemyAt(t, 402, 300));
  tick(g, 2);
  assert(g.health === 0, `health floors at 0 when several enemies land at once (got ${g.health})`);
  assert(g.gameRunning === false, 'game stops on death');
}

// ---- Fade uses each effect's own lifetime ----
console.log('\nParticle / text fading');
{
  const g = fresh();
  g.floatingTexts = []; g.particles = [];
  g.addText(100, 100, 'WAVE 7: PRODUCTION DEPLOY', 80, '#fff');
  g.addParticles(5, 100, 100, 4, 20, '#fff');
  assert(g.floatingTexts.every(t => t.maxLife === t.life), 'text records its own maxLife');
  assert(g.particles.every(p => p.maxLife === p.life), 'particles record their own maxLife');
  assert(g.floatingTexts.every(t => t.life / t.maxLife <= 1) &&
         g.particles.every(p => p.life / p.maxLife <= 1),
    'fade ratio never exceeds 1 (long-lived banners no longer overshoot alpha)');
}

// ---- Restart clears transient state ----
console.log('\nRestart hygiene');
{
  const g = fresh();
  g.screenShake = 12;
  g.caneSwinging = true; g.caneAngle = 1.2; g.caneTimer = 4;
  g.activePowerup = 'rage'; g.powerupTimer = 200;
  g.startGame();
  assert(g.screenShake === 0, 'screen shake reset on restart');
  assert(g.caneSwinging === false && g.caneAngle === 0 && g.caneTimer === 0, 'cane reset on restart');
  assert(g.activePowerup === null && g.powerupTimer === 0, 'powerup cleared on restart');
  assert(g.health === 5 && g.score === 0 && g.wave === 1, 'core stats reset on restart');
}

// ---- Powerups do not spawn under the player's feet ----
console.log('\nPowerup placement');
{
  const g = fresh();
  g.player.x = 400; g.player.y = 300;
  g.powerups = [];
  for (let i = 0; i < 400; i++) g.spawnPowerup();
  const tooClose = g.powerups.filter(p => Math.hypot(p.x - g.player.x, p.y - g.player.y) <= 30);
  assert(tooClose.length === 0,
    `no powerup spawns already inside the pickup radius (${tooClose.length} of 400 did)`);
}

// ---- Wave progression caps ----
console.log('\nWave progression');
{
  const g = fresh();
  g.wave = g.WAVES.length;
  g.waveTimer = g.WAVES[g.WAVES.length - 1].duration + 10;
  g.health = 99;
  g.enemies = [];
  tick(g, 3);
  assert(g.wave === g.WAVES.length, `wave stops at ${g.WAVES.length} for endless survival`);
}

// ---- Fixed timestep ----
console.log('\nFixed timestep');
{
  for (const hz of [60, 144]) {
    const g = fresh();
    const step = 1000 / hz;
    for (let t = step; t <= 1000 + step / 2; t += step) g.gameLoop(t);
    // ~60 simulation steps per wall-clock second regardless of refresh rate.
    assert(Math.abs(g.gameTick - 60) <= 2,
      `${hz}Hz display runs ~60 sim steps per second (got ${g.gameTick})`);
  }

  // A long stall must not replay the whole backlog at once, but must not
  // swallow the frame entirely either (a timestamp of exactly 0 once did).
  const g = fresh();
  g.gameLoop(0);
  g.gameLoop(30000);
  assert(g.gameTick > 0 && g.gameTick <= 6,
    `a 30s tab-out advances a little, not 30s worth (got ${g.gameTick})`);
}

// ---- Held keys released on blur ----
console.log('\nInput');
{
  const g = fresh();
  g.fire('document', 'keydown', { key: 'a', preventDefault() {} });
  assert(g.keys['a'] === true, 'keydown registers');
  g.fire('window', 'blur');
  assert(g.keys['a'] === false, 'blurring the window releases held keys');
}

console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed === 0) console.log('ALL BEHAVIOURAL TESTS PASSED!');
else process.exit(1);
