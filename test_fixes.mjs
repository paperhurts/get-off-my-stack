import { readFileSync } from 'fs';

const html = readFileSync('index.html', 'utf8');
let passed = 0, failed = 0;

function assert(condition, name) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ FAIL: ${name}`); }
}

// Assertions about what the code does shouldn't trip over comments that merely
// describe the thing being asserted against. Keeps `//` out, leaves URLs alone.
const stripComments = (s) => s
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/([^:'"])\/\/.*$/gm, '$1');

// ---- ENEMY_TYPES (for computation tests) ----
const ENEMY_TYPES = {
  jsBlob: { w: 30, h: 30, hp: 1 },
  dansFix: { w: 18, h: 18, hp: 1 },
  sapIfElse: { w: 60, h: 50, hp: 8 },
  memLeak: { w: 20, h: 20, hp: 1 },
  texture4k: { w: 45, h: 45, hp: 4 },
};

// Read straight out of the source so this can't drift from the game.
const WAVES_LENGTH = (html.match(/^\s*\{ name: '[^']+', types: \[/gm) || []).length;

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
  assert(WAVES_LENGTH > 0, `Parsed ${WAVES_LENGTH} waves from source`);

  let wave = WAVES_LENGTH;
  if (wave < WAVES_LENGTH) { wave++; }
  assert(wave === WAVES_LENGTH, 'Final wave does NOT increment past max');

  let wave2 = WAVES_LENGTH - 1;
  if (wave2 < WAVES_LENGTH) { wave2++; }
  assert(wave2 === WAVES_LENGTH, 'Penultimate wave still progresses to the last');

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
  assert(blockCase.includes('updateTextureCache(gameTick)'),
    'Block calls updateTextureCache with the global tick (per-enemy timer thrashed the cache)');
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

// ---- TEST #12: CSS font-family declarations are valid ----
console.log('\n#12: font-family uses straight quotes (curly quotes void the declaration)');
{
  const curly = (html.match(/font-family:[^;]*[‘’][^;]*;/g) || []);
  assert(curly.length === 0, `No smart quotes in font-family (found ${curly.length})`);
  const decls = (html.match(/font-family:[^;]+;/g) || []);
  assert(decls.length > 0, `Found ${decls.length} font-family declarations`);
  assert(decls.every(d => !/[‘’“”]/.test(d)),
    'Every font-family declaration is free of typographic quotes');
  // Canvas font strings too — ctx.font silently ignores an unparseable value.
  const canvasFonts = (html.match(/ctx\.font\s*=\s*'[^']+'/g) || []);
  assert(canvasFonts.every(f => !/[‘’“”]/.test(f)),
    'Every ctx.font string is free of typographic quotes');
}

// ---- TEST #13: fixed timestep ----
console.log('\n#13: Game loop is frame-rate independent');
{
  assert(html.includes('const FRAME_MS = 1000 / 60'), 'Source defines a fixed 60Hz timestep');
  assert(html.includes('frameAccumulator'), 'Source accumulates elapsed time');
  assert(html.includes('MAX_CATCHUP_STEPS'), 'Source bounds catch-up steps (no spiral of death)');
  assert(html.includes('lastFrameTime === null'), 'Uses a null sentinel, not a falsy 0 check');
  assert(/requestAnimationFrame\(gameLoop\);\s*$/m.test(html.trim()) || html.includes('requestAnimationFrame(gameLoop);'),
    'Loop is kicked off through requestAnimationFrame');
}

// ---- TEST #14: multi-touch joystick ----
console.log('\n#14: Joystick tracks its own finger');
{
  assert(html.includes('joystickTouchId'), 'Joystick tracks a touch identifier');
  const jsStart = html.indexOf('if (joystickZone)');
  const jsEnd = html.indexOf('if (smackBtn)');
  const jsBlock = html.substring(jsStart, jsEnd);
  assert(!stripComments(jsBlock).includes('e.touches[0]'),
    'No blind e.touches[0] (grabbed the SMACK finger when both were down)');
  assert(jsBlock.includes('changedTouches'), 'Uses changedTouches for start/end');
}

// ---- TEST #15: bosses survive contact ----
console.log('\n#15: Bosses are not deleted by walking into them');
{
  assert(html.includes('boss: true'), 'Boss types are flagged');
  const collision = html.substring(html.indexOf('// Hit player'), html.indexOf('// Remove dead enemies'));
  assert(collision.includes('if (type.boss)'), 'Collision branches on boss');
  assert(collision.includes('enemy.hit = 30'), 'Bosses get knockback i-frames instead of dying');
  assert(collision.includes('enemy.hp = 0'), 'Regular enemies still die on contact');
  assert(html.includes('ENEMY_TYPES[typeKey].boss && enemies.some'), 'Boss spawns are capped at one alive');
}

// ---- TEST #16: particle/text fade uses real lifetimes ----
console.log('\n#16: Fading uses each effect\'s own lifetime');
{
  assert(html.includes('p.life / p.maxLife'), 'Particles fade against maxLife');
  assert(html.includes('t.life / t.maxLife'), 'Floating texts fade against maxLife');
  assert(!html.includes('p.life / 30'), 'No hardcoded /30 particle fade');
  assert(!html.includes('t.life / 40'), 'No hardcoded /40 text fade');
  assert(html.includes('function addParticles') && html.includes('function addText'),
    'Spawning goes through helpers that record maxLife');
}

// ---- TEST #17: restart clears transient state ----
console.log('\n#17: startGame() clears transient state');
{
  const sg = html.substring(html.indexOf('function startGame()'), html.indexOf('function gameOver()'));
  ['screenShake = 0', 'caneSwinging = false', 'caneAngle = 0', 'caneTimer = 0',
   'lastFrameTime = null', 'frameAccumulator = 0'].forEach(frag => {
    assert(sg.includes(frag), `startGame() resets ${frag.split(' ')[0]}`);
  });
}

// ---- TEST #18: Clippy ----
console.log('\n#18: Clippy boss');
{
  assert(html.includes('clippy: {'), 'clippy enemy type defined');
  assert(html.includes('CLIPPY_SUGGESTIONS'), 'Clippy has a suggestion list');
  assert(html.includes("case 'clippy':"), 'drawEnemy handles the clippy shape');
  assert(html.includes('function drawClippy'), 'Clippy has its own renderer');
  assert(html.includes('function drawSpeechBubble'), 'Speech bubble renderer exists');
  assert(html.includes("name: 'OFFICE ASSISTANT'"), 'Clippy gets a dedicated wave');
  assert(html.includes("activePowerup !== 'freeze'"), 'LINTER suppresses the summon');
  assert(!stripComments(html).includes('ctx.roundRect'), 'Speech bubble avoids roundRect (would throw on old engines)');
}

// ---- TEST #19: keys released on blur ----
console.log('\n#19: Held keys released on window blur');
{
  assert(html.includes("window.addEventListener('blur'"), 'Blur handler registered');
  assert(html.includes('for (const k in keys) keys[k] = false'), 'Blur clears every held key');
}

// ---- TEST #20: dead code removed ----
console.log('\n#20: Dead code removed / put to use');
{
  assert(!html.includes('targetX:'), 'Unused targetX removed from spawned enemies');
  assert(!html.includes('targetY:'), 'Unused targetY removed from spawned enemies');
  assert(html.includes('player.walkFrame]'), 'walkFrame is actually used when drawing legs');
}

// ---- TEST #21: sprite mirroring ----
console.log('\n#21: Player sprite mirrors as a whole');
{
  const fn = html.substring(html.indexOf('function drawPixelChar'), html.indexOf('function drawEnemy'));
  assert(fn.includes('ctx.scale(facing, 1)'), 'drawPixelChar mirrors via ctx.scale');
  // Negating an x offset moves a rect's anchor without mirroring it, which is
  // what detached the hair from the head when facing left.
  assert(!/fillRect\(\s*-?\d+(\.\d+)?\s*\*\s*facing/.test(fn),
    'No fillRect anchored on a negated facing offset');
  assert(!stripComments(fn).includes('* facing'),
    'No per-part facing multipliers left in the sprite');
}

// ---- TEST #22: cane arc ----
console.log('\n#22: Cane hitbox is an arc around the player');
{
  assert(html.includes('const CANE_RANGE ='), 'Cane range is a named constant');
  assert(html.includes('const CANE_CLOSE ='), 'Close-range bubble is a named constant');
  const fn = html.substring(html.indexOf('function checkCaneHit'), html.indexOf('function update()'));
  assert(!fn.includes('const caneX'),
    'Hit test no longer uses a circle offset ahead of the player (left a dead zone on his own body)');
  assert(fn.includes('enemy.x - player.x') && fn.includes('player.y'),
    'Hit test measures from the player');
  assert(fn.includes('dx * player.facing'), 'Hit test uses a forward half-disc');
  assert(fn.includes('CANE_CLOSE'), 'Close range ignores facing');
  assert(html.includes('function faceNearestTarget'), 'Swinging can turn you toward a target behind');
  assert(html.includes('CANE_ACTIVE_FROM') && html.includes('CANE_ACTIVE_TO'),
    'Swing is live across a frame window, not a single frame');
  assert(!html.includes('if (caneTimer === 6) checkCaneHit()'), 'Single-frame hit check removed');
  const drawFn = html.substring(html.indexOf('function draw()'));
  assert(drawFn.includes('Swing arc'), 'The arc is drawn so the hitbox is visible');
}

// ---- SUMMARY ----
console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
if (failed === 0) console.log('ALL TESTS PASSED!');
else { console.log('Some tests FAILED!'); process.exit(1); }
