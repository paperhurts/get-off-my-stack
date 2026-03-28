import { readFileSync } from 'fs';

const html = readFileSync('index.html', 'utf8');
let passed = 0, failed = 0;

function assert(condition, name) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ FAIL: ${name}`); }
}

// ---- ENEMY_TYPES (for computation tests) ----
const ENEMY_TYPES = {
  jsBlob: { w: 30, h: 30, hp: 1 },
  dansFix: { w: 18, h: 18, hp: 1 },
  sapIfElse: { w: 60, h: 50, hp: 8 },
  memLeak: { w: 20, h: 20, hp: 1 },
  texture4k: { w: 45, h: 45, hp: 4 },
};

const WAVES_LENGTH = 6;

console.log('=== Running Fix Tests ===\n');

// ---- TEST #9: Dead enemies cannot damage player ----
console.log('#9: Dead enemies cannot damage player');
{
  const enemy = { type: 'jsBlob', x: 400, y: 500, hp: 0, hit: 0 };
  const player = { x: 400, y: 500 };
  let health = 5;
  const type = ENEMY_TYPES[enemy.type];
  const edx = player.x - enemy.x;
  const edy = player.y - enemy.y;
  const elen = Math.sqrt(edx*edx + edy*edy);
  const hitDist = (type.w + type.h) / 4 + 10;
  if (elen < hitDist && enemy.hit <= 0 && enemy.hp > 0) { health--; }
  assert(health === 5, 'Dead enemy (hp=0) does NOT damage player');
}
{
  const enemy = { type: 'jsBlob', x: 400, y: 500, hp: 1, hit: 0 };
  const player = { x: 400, y: 500 };
  let health = 5;
  const type = ENEMY_TYPES[enemy.type];
  const edx = player.x - enemy.x;
  const edy = player.y - enemy.y;
  const elen = Math.sqrt(edx*edx + edy*edy);
  const hitDist = (type.w + type.h) / 4 + 10;
  if (elen < hitDist && enemy.hit <= 0 && enemy.hp > 0) { health--; }
  assert(health === 4, 'Live enemy (hp=1) DOES damage player');
}
// Verify the fix is in the source
assert(html.includes('&& enemy.hp > 0) {'), 'Source contains enemy.hp > 0 guard');

// ---- TEST #11: CSS universal selector ----
console.log('\n#11: CSS universal selector');
assert(html.includes('* { margin: 0; padding: 0; box-sizing: border-box; }'), 'CSS has * selector');
assert(!html.includes('- { margin: 0; padding: 0; box-sizing: border-box; }'), 'Broken - selector removed');

// ---- TEST #3: Collision radius scales with enemy size ----
console.log('\n#3: Collision radius scales with enemy size');
{
  const danHit = (18 + 18) / 4 + 10;
  assert(danHit === 19, "Dan's Fix hitDist = 19 (smaller than old 25)");
  const blobHit = (30 + 30) / 4 + 10;
  assert(blobHit === 25, 'JS Blob hitDist = 25 (same as old)');
  const bossHit = (60 + 50) / 4 + 10;
  assert(bossHit === 37.5, 'SAP Boss hitDist = 37.5 (larger than old 25)');
  assert(html.includes('const hitDist = (type.w + type.h) / 4 + 10;'), 'Source uses scaled hitDist formula');
}

// ---- TEST #6: Cached DOM elements ----
console.log('\n#6: Cached DOM elements');
{
  assert(html.includes("const scoreEl = document.getElementById('score-display')"), 'scoreEl cached');
  assert(html.includes("const healthEl = document.getElementById('health-display')"), 'healthEl cached');
  assert(html.includes("const waveEl = document.getElementById('wave-display')"), 'waveEl cached');
  assert(html.includes("const powerupEl = document.getElementById('powerup-display')"), 'powerupEl cached');
  assert(html.includes('scoreEl.textContent'), 'update() uses scoreEl');
  assert(html.includes('healthEl.textContent'), 'update() uses healthEl');
  assert(html.includes('waveEl.textContent'), 'update() uses waveEl');
  assert(html.includes('powerupEl.textContent'), 'update() uses powerupEl');

  // Ensure old calls removed from update()
  const updateSection = html.substring(html.indexOf('function update()'));
  const updateBody = updateSection.substring(0, updateSection.indexOf('function draw()'));
  assert(!updateBody.includes("document.getElementById('score-display')"), 'No getElementById in update() for score');
  assert(!updateBody.includes("document.getElementById('health-display')"), 'No getElementById in update() for health');
  assert(!updateBody.includes("document.getElementById('powerup-display')"), 'No getElementById in update() for powerup');
}

// ---- TEST #8: draw() guarded ----
console.log('\n#8: draw() guarded when game inactive');
{
  const drawFn = html.substring(html.indexOf('function draw()'));
  const drawStart = drawFn.substring(0, 120);
  assert(drawStart.includes('if (!gameRunning) return'), 'draw() has gameRunning guard');
}

// ---- TEST #4: Knockback clamped ----
console.log('\n#4: Knockback clamped to canvas bounds');
{
  // Simulate knockback near right edge
  let ex = 790;
  const angle = 0;
  ex = Math.max(0, Math.min(800, ex + Math.cos(angle) * 20));
  assert(ex === 800, 'X clamped to 800 at right edge');

  let ey = 5;
  const angle2 = -Math.PI / 2;
  ey = Math.max(0, Math.min(600, ey + Math.sin(angle2) * 20));
  assert(ey === 0, 'Y clamped to 0 at top edge');

  assert(html.includes('Math.max(0, Math.min(800, enemy.x + Math.cos(angle) * 20))'), 'Source clamps X');
  assert(html.includes('Math.max(0, Math.min(600, enemy.y + Math.sin(angle) * 20))'), 'Source clamps Y');
}

// ---- TEST #5: Wave counter capped ----
console.log('\n#5: Wave counter capped at WAVES.length');
{
  let wave = 6;
  if (wave < WAVES_LENGTH) { wave++; }
  assert(wave === 6, 'Wave 6 does NOT increment past max');

  let wave2 = 5;
  if (wave2 < WAVES_LENGTH) { wave2++; }
  assert(wave2 === 6, 'Wave 5 still progresses to 6');

  assert(html.includes('wave < WAVES.length)'), 'Source caps wave at WAVES.length');
}

// ---- TEST #1: globalAlpha leak removed ----
console.log('\n#1: globalAlpha leak in drip enemy removed');
{
  const dripStart = html.indexOf("case 'drip':");
  const dripEnd = html.indexOf('break;', dripStart);
  const dripCase = html.substring(dripStart, dripEnd);
  assert(!dripCase.includes('ctx.globalAlpha = 1'), 'No globalAlpha = 1 in drip case');
  assert(dripCase.includes('ctx.globalAlpha *='), 'Drip still multiplies alpha for translucency');
}

// ---- TEST #2: Variable shadowing fixed ----
console.log('\n#2: Variable shadowing (spd -> enemySpd)');
{
  const enemyStart = html.indexOf('// Enemy update');
  const enemyEnd = html.indexOf('// Remove dead enemies');
  const enemyBlock = html.substring(enemyStart, enemyEnd);
  assert(enemyBlock.includes('let enemySpd'), 'Uses enemySpd variable');
  assert(enemyBlock.includes('* enemySpd'), 'Movement uses enemySpd');
  assert(!enemyBlock.includes('let spd'), 'No shadowed "let spd" in enemy block');
}

// ---- TEST #7: Texture offscreen canvas ----
console.log('\n#7: Texture enemy uses offscreen canvas');
{
  assert(html.includes("const texCanvas = document.createElement('canvas')"), 'Offscreen canvas created');
  assert(html.includes('function updateTextureCache'), 'updateTextureCache function exists');
  const blockStart = html.indexOf("case 'block':");
  const blockEnd = html.indexOf('break;', blockStart);
  const blockCase = html.substring(blockStart, blockEnd);
  assert(blockCase.includes('updateTextureCache(enemy.timer)'), 'Block calls updateTextureCache');
  assert(blockCase.includes('ctx.drawImage(texCanvas'), 'Block draws from cached canvas');
  assert(!blockCase.includes('for (let px'), 'Block no longer has nested pixel loop');
}

// ---- TEST #10: innerHTML replaced ----
console.log('\n#10: innerHTML replaced with safe DOM construction');
{
  const goStart = html.indexOf('function gameOver()');
  const goEnd = html.indexOf('// Start game loop');
  const goBody = html.substring(goStart, goEnd);
  assert(!goBody.includes('.innerHTML'), 'gameOver() does not use innerHTML');
  assert(goBody.includes('appendChild'), 'Uses appendChild');
  assert(goBody.includes('createTextNode'), 'Uses createTextNode');
  assert(goBody.includes("createElement('br')"), 'Uses createElement for line breaks');
}

// ---- SUMMARY ----
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed === 0) console.log('ALL TESTS PASSED!');
else { console.log('Some tests FAILED!'); process.exit(1); }
