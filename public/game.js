(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const restartBtn = document.getElementById('restartBtn');
  const objectiveEl = document.getElementById('objective');
  const messageEl = document.getElementById('message');
  const W = canvas.width;
  const H = canvas.height;
  const TILE = 32;
  const keys = new Set();
  const touch = { up: false, down: false, left: false, right: false, attack: false, interact: false };

  const colors = {
    floorA: '#564451', floorB: '#4d3d49', floorCrack: '#3f323d', wall: '#2d2834', wallTop: '#6c5868', wallDark: '#1b1820',
    gold: '#e8b866', shadow: '#17131a99', slime: '#76bd72'
  };

  const staticWalls = [
    { x: 0, y: 0, w: W, h: 28 }, { x: 0, y: H - 28, w: W, h: 28 }, { x: 0, y: 0, w: 28, h: H }, { x: W - 28, y: 0, w: 28, h: H },
    { x: 250, y: 28, w: 28, h: 150 }, { x: 250, y: 275, w: 28, h: 237 },
    { x: 430, y: 170, w: 150, h: 28 }, { x: 430, y: 340, w: 150, h: 28 },
    { x: 620, y: 28, w: 28, h: 180 }, { x: 620, y: 332, w: 28, h: 180 },
    { x: 730, y: 250, w: 110, h: 28 }
  ];

  const decor = {
    torches: [{ x: 94, y: 70 }, { x: 350, y: 70 }, { x: 535, y: 235 }, { x: 694, y: 78 }, { x: 882, y: 335 }],
    mushrooms: [{ x: 167, y: 427 }, { x: 198, y: 442 }, { x: 700, y: 452 }, { x: 716, y: 465 }],
    bones: [{ x: 375, y: 423 }, { x: 694, y: 175 }]
  };

  let mode = 'idle';
  let localSlot = 0;
  let connectedSlots = new Set([0]);
  let remoteInputs = {};
  let state = createState();
  let msgTimer = 0;
  let lastTime = performance.now();
  let netInputTimer = 0;
  let snapshotTimer = 0;

  function createHero(name, x, y, palette, speed) {
    return { name, x, y, r: 14, hp: 5, maxHp: 5, speed, palette, dirX: 1, dirY: 0, attackCd: 0, hitFlash: 0, downTimer: 0, isAI: true, bob: Math.random() * Math.PI * 2, _interactHeld: false };
  }

  function createState() {
    return {
      humans: 1,
      leverOn: false,
      chestOpen: false,
      hasKey: false,
      complete: false,
      elapsed: 0,
      particles: [],
      heroes: [
        createHero('Knight', 92, 267, { body: '#4778a8', trim: '#d8b36b', skin: '#f0c58f', dark: '#26334c' }, 116),
        createHero('Rogue', 124, 297, { body: '#6ea36b', trim: '#d8d0a2', skin: '#d9a879', dark: '#273b2f' }, 126),
        createHero('Mage', 124, 237, { body: '#845f9f', trim: '#78c0c1', skin: '#e7b98d', dark: '#382a4b' }, 108)
      ],
      enemies: [
        { x: 368, y: 120, r: 15, hp: 3, maxHp: 3, speed: 34, hit: 0, attackCd: 0, alive: true, wobble: 0 },
        { x: 516, y: 286, r: 16, hp: 4, maxHp: 4, speed: 31, hit: 0, attackCd: 0, alive: true, wobble: 2 },
        { x: 790, y: 393, r: 16, hp: 4, maxHp: 4, speed: 30, hit: 0, attackCd: 0, alive: true, wobble: 4 }
      ],
      lever: { x: 354, y: 420 },
      chest: { x: 772, y: 118 },
      portal: { x: 872, y: 430 }
    };
  }

  function resetWorld() {
    state = createState();
    remoteInputs = {};
    applyRosterFlags();
    updateObjective();
    showMessage(mode === 'solo' ? 'Knight + 2 compagni AI' : 'La spedizione comincia!');
  }

  function applyRosterFlags() {
    if (!state?.heroes) return;
    if (mode === 'solo') connectedSlots = new Set([0]);
    state.humans = connectedSlots.size;
    state.heroes.forEach((hero, index) => { hero.isAI = !connectedSlots.has(index); });
  }

  function updateObjective() {
    if (state.complete) objectiveEl.textContent = 'Dungeon completato!';
    else if (state.hasKey) objectiveEl.textContent = 'Hai la chiave antica. Raggiungi il portale a sud-est.';
    else if (state.leverOn) objectiveEl.textContent = 'Il cancello è aperto. Cerca il forziere oltre la sala.';
    else objectiveEl.textContent = 'Trova la leva, recupera la chiave e raggiungi il portale.';
  }

  function showMessage(text, seconds = 1.8) {
    messageEl.textContent = text;
    messageEl.classList.add('show');
    msgTimer = seconds;
  }

  function localInput() {
    let x = ((keys.has('KeyD') || keys.has('ArrowRight')) ? 1 : 0) - ((keys.has('KeyA') || keys.has('ArrowLeft')) ? 1 : 0);
    let y = ((keys.has('KeyS') || keys.has('ArrowDown')) ? 1 : 0) - ((keys.has('KeyW') || keys.has('ArrowUp')) ? 1 : 0);
    x += (touch.right ? 1 : 0) - (touch.left ? 1 : 0);
    y += (touch.down ? 1 : 0) - (touch.up ? 1 : 0);
    const length = Math.hypot(x, y) || 1;
    return {
      x: x / length,
      y: y / length,
      moving: !!(x || y),
      attack: keys.has('KeyF') || keys.has('Enter') || touch.attack,
      interact: keys.has('KeyE') || keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.interact
    };
  }

  function neutralInput() { return { x: 0, y: 0, moving: false, attack: false, interact: false }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function near(a, b, range) { return dist(a, b) <= range; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function collidesCircleRect(x, y, r, rect) {
    const cx = clamp(x, rect.x, rect.x + rect.w);
    const cy = clamp(y, rect.y, rect.y + rect.h);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy < r * r;
  }

  function activeWalls() {
    if (state.leverOn) return staticWalls;
    return staticWalls.concat([{ x: 616, y: 208, w: 36, h: 124 }]);
  }

  function tryMove(entity, dx, dy) {
    if (!dx && !dy) return;
    const walls = activeWalls();
    const nx = entity.x + dx;
    if (!walls.some(wall => collidesCircleRect(nx, entity.y, entity.r, wall))) entity.x = nx;
    const ny = entity.y + dy;
    if (!walls.some(wall => collidesCircleRect(entity.x, ny, entity.r, wall))) entity.y = ny;
  }

  function nearestAliveEnemy(hero, maxRange = Infinity) {
    let best = null;
    let bestDistance = maxRange;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const distance = dist(hero, enemy);
      if (distance < bestDistance) { best = enemy; bestDistance = distance; }
    }
    return best;
  }

  function nearestHuman(hero) {
    let best = null;
    let bestDistance = Infinity;
    for (const candidate of state.heroes) {
      if (candidate.isAI || candidate.downTimer > 0) continue;
      const distance = dist(hero, candidate);
      if (distance < bestDistance) { best = candidate; bestDistance = distance; }
    }
    return best || state.heroes[0];
  }

  function attack(hero) {
    if (hero.attackCd > 0 || hero.downTimer > 0) return;
    hero.attackCd = 0.48;
    let hit = false;
    for (const enemy of state.enemies) {
      if (!enemy.alive || dist(hero, enemy) > 52) continue;
      const dot = ((enemy.x - hero.x) * hero.dirX + (enemy.y - hero.y) * hero.dirY) / Math.max(1, dist(hero, enemy));
      if (dot < -0.2) continue;
      enemy.hp--;
      enemy.hit = 0.15;
      hit = true;
      spawnBurst(enemy.x, enemy.y, '#f1d18a', 7);
      if (enemy.hp <= 0) { enemy.alive = false; spawnBurst(enemy.x, enemy.y, '#83c87d', 12); }
    }
    if (!hit) spawnBurst(hero.x + hero.dirX * 28, hero.y + hero.dirY * 28, '#d9c6a4', 3);
  }

  function interact(hero) {
    if (hero.downTimer > 0) return;
    if (!state.leverOn && near(hero, state.lever, 52)) {
      state.leverOn = true;
      updateObjective();
      showMessage('CLACK! Il cancello si apre.');
      spawnBurst(state.lever.x, state.lever.y, colors.gold, 10);
      return;
    }
    if (state.leverOn && !state.chestOpen && near(hero, state.chest, 58)) {
      state.chestOpen = true;
      state.hasKey = true;
      updateObjective();
      showMessage('Hai trovato la CHIAVE ANTICA!');
      spawnBurst(state.chest.x, state.chest.y - 12, '#ffe394', 14);
      return;
    }
    if (near(hero, state.portal, 62)) {
      if (!state.hasKey) showMessage('Il portale è sigillato. Serve una chiave.');
      else if (!state.complete) {
        state.complete = true;
        updateObjective();
        showMessage('TinyDungeon completato ✦', 4);
        spawnBurst(state.portal.x, state.portal.y, '#91d9c4', 26);
      }
    }
  }

  function aiInput(hero, index) {
    const enemy = nearestAliveEnemy(hero, 112);
    if (enemy) {
      const distance = Math.max(1, dist(hero, enemy));
      if (distance > 43) return { x: (enemy.x - hero.x) / distance, y: (enemy.y - hero.y) / distance, moving: true, attack: false, interact: false };
      return { ...neutralInput(), attack: true };
    }
    const leader = nearestHuman(hero);
    const offset = index === 1 ? { x: -34, y: 34 } : { x: -34, y: -34 };
    const tx = leader.x + offset.x;
    const ty = leader.y + offset.y;
    const distance = Math.hypot(tx - hero.x, ty - hero.y);
    if (distance > 28) return { x: (tx - hero.x) / distance, y: (ty - hero.y) / distance, moving: true, attack: false, interact: false };
    return neutralInput();
  }

  function inputForHero(hero, index) {
    if (hero.isAI) return aiInput(hero, index);
    if (mode === 'solo' || (mode === 'host' && index === localSlot)) return localInput();
    if (mode === 'host') return remoteInputs[index] || neutralInput();
    return neutralInput();
  }

  function updateHero(hero, index, dt) {
    hero.attackCd = Math.max(0, hero.attackCd - dt);
    hero.hitFlash = Math.max(0, hero.hitFlash - dt);
    hero.bob += dt * 5;
    if (hero.downTimer > 0) {
      hero.downTimer -= dt;
      if (hero.downTimer <= 0) {
        hero.hp = hero.maxHp;
        hero.x = 104 + index * 22;
        hero.y = 255 + (index - 1) * 28;
      }
      return;
    }

    const input = inputForHero(hero, index);
    if (input.moving) {
      hero.dirX = input.x;
      hero.dirY = input.y;
      tryMove(hero, input.x * hero.speed * dt, input.y * hero.speed * dt);
    }
    if (input.attack) attack(hero);
    if (input.interact && !hero._interactHeld) interact(hero);
    hero._interactHeld = input.interact;
  }

  function updateEnemy(enemy, dt) {
    if (!enemy.alive) return;
    enemy.hit = Math.max(0, enemy.hit - dt);
    enemy.attackCd = Math.max(0, enemy.attackCd - dt);
    enemy.wobble += dt * 4;
    let target = null;
    let bestDistance = 185;
    for (const hero of state.heroes) {
      if (hero.downTimer > 0) continue;
      const distance = dist(enemy, hero);
      if (distance < bestDistance) { target = hero; bestDistance = distance; }
    }
    if (!target) return;
    const distance = Math.max(1, dist(enemy, target));
    if (distance > enemy.r + target.r + 3) {
      tryMove(enemy, ((target.x - enemy.x) / distance) * enemy.speed * dt, ((target.y - enemy.y) / distance) * enemy.speed * dt);
    } else if (enemy.attackCd <= 0) {
      enemy.attackCd = 1.25;
      target.hp--;
      target.hitFlash = 0.22;
      spawnBurst(target.x, target.y, '#d56a70', 6);
      if (target.hp <= 0) target.downTimer = 2.8;
    }
  }

  function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 65;
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .35, color, size: 2 + Math.floor(Math.random() * 3) });
    }
  }

  function updateParticles(dt) {
    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= .94;
      particle.vy *= .94;
      particle.life -= dt;
    }
    state.particles = state.particles.filter(particle => particle.life > 0);
  }

  function snapshot() {
    return {
      humans: state.humans,
      leverOn: state.leverOn,
      chestOpen: state.chestOpen,
      hasKey: state.hasKey,
      complete: state.complete,
      elapsed: state.elapsed,
      heroes: state.heroes.map(hero => ({ x: hero.x, y: hero.y, hp: hero.hp, dirX: hero.dirX, dirY: hero.dirY, attackCd: hero.attackCd, hitFlash: hero.hitFlash, downTimer: hero.downTimer, isAI: hero.isAI })),
      enemies: state.enemies.map(enemy => ({ x: enemy.x, y: enemy.y, hp: enemy.hp, hit: enemy.hit, attackCd: enemy.attackCd, alive: enemy.alive, wobble: enemy.wobble }))
    };
  }

  function applySnapshot(data) {
    if (!data || !Array.isArray(data.heroes) || !Array.isArray(data.enemies)) return;
    state.humans = Number(data.humans || 1);
    state.leverOn = !!data.leverOn;
    state.chestOpen = !!data.chestOpen;
    state.hasKey = !!data.hasKey;
    state.complete = !!data.complete;
    state.elapsed = Number(data.elapsed || state.elapsed);
    data.heroes.forEach((incoming, index) => {
      const hero = state.heroes[index];
      if (!hero) return;
      Object.assign(hero, incoming);
    });
    data.enemies.forEach((incoming, index) => {
      const enemy = state.enemies[index];
      if (!enemy) return;
      Object.assign(enemy, incoming);
    });
    updateObjective();
  }

  function update(dt) {
    if (mode === 'idle') return;
    state.elapsed += dt;
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) messageEl.classList.remove('show');
    }

    if (mode === 'guest') {
      netInputTimer -= dt;
      if (netInputTimer <= 0) {
        netInputTimer = .05;
        window.TinyDungeonNet?.sendInput(localInput());
      }
      updateParticles(dt);
      return;
    }

    if (!state.complete) {
      state.heroes.forEach((hero, index) => updateHero(hero, index, dt));
      state.enemies.forEach(enemy => updateEnemy(enemy, dt));
    }
    updateParticles(dt);

    if (mode === 'host') {
      snapshotTimer -= dt;
      if (snapshotTimer <= 0) {
        snapshotTimer = .05;
        window.TinyDungeonNet?.broadcastSnapshot(snapshot());
      }
    }
  }

  function pxRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function drawFloor() {
    pxRect(0, 0, W, H, '#241f28');
    for (let y = 28; y < H - 28; y += TILE) {
      for (let x = 28; x < W - 28; x += TILE) {
        const alt = ((x / TILE + y / TILE) | 0) % 2;
        pxRect(x, y, TILE, TILE, alt ? colors.floorA : colors.floorB);
        pxRect(x + 2, y + 2, TILE - 4, 1, '#67536155');
        if (((x * 7 + y * 13) % 101) < 7) {
          pxRect(x + 9, y + 18, 8, 2, colors.floorCrack);
          pxRect(x + 15, y + 16, 2, 5, colors.floorCrack);
        }
      }
    }
    pxRect(54, 214, 162, 106, '#3f3f59');
    pxRect(60, 220, 150, 94, '#5b526f');
    for (let x = 66; x < 205; x += 18) pxRect(x, 230, 8, 74, '#76637d');
    pxRect(696, 355, 196, 104, '#3b594f');
    pxRect(702, 361, 184, 92, '#4e7262');
  }

  function drawWallRect(rect) {
    pxRect(rect.x, rect.y, rect.w, rect.h, colors.wallDark);
    pxRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6, colors.wall);
    if (rect.w > rect.h) pxRect(rect.x + 3, rect.y + 3, rect.w - 6, 7, colors.wallTop);
    else pxRect(rect.x + 3, rect.y + 3, 7, rect.h - 6, colors.wallTop);
  }

  function drawWalls() {
    staticWalls.forEach(drawWallRect);
    if (!state.leverOn) {
      pxRect(616, 208, 36, 124, '#17131b');
      for (let y = 211; y < 328; y += 22) {
        pxRect(620, y, 28, 8, '#9c7a55');
        pxRect(622, y + 2, 24, 2, '#d0a66f');
      }
    }
  }

  function drawDecor() {
    decor.torches.forEach((torch, index) => {
      pxRect(torch.x - 3, torch.y + 6, 6, 13, '#624331');
      const flame = Math.sin(state.elapsed * 7 + index) * 2;
      pxRect(torch.x - 5, torch.y - 2 + flame, 10, 10, '#e57a45');
      pxRect(torch.x - 3, torch.y - 5 + flame, 6, 10, '#f2b64d');
    });
    decor.mushrooms.forEach((mushroom, index) => {
      pxRect(mushroom.x - 2, mushroom.y, 4, 7, '#d5c79f');
      pxRect(mushroom.x - 6, mushroom.y - 4, 12, 6, index % 2 ? '#b45c69' : '#7f6aa2');
    });
    decor.bones.forEach(bone => pxRect(bone.x - 8, bone.y, 16, 4, '#bcae91'));
  }

  function drawLever() {
    const lever = state.lever;
    pxRect(lever.x - 13, lever.y + 8, 26, 8, '#2c2227');
    pxRect(lever.x - 10, lever.y + 5, 20, 6, '#7b6353');
    const endX = state.leverOn ? lever.x + 8 : lever.x - 8;
    pxRect(lever.x - 2, lever.y - 13, 4, 20, '#b7a17c');
    pxRect(endX - 4, lever.y - 19, 8, 8, state.leverOn ? '#71b98d' : '#cf6b61');
  }

  function drawChest() {
    const chest = state.chest;
    pxRect(chest.x - 19, chest.y - 4, 38, 25, '#39281f');
    pxRect(chest.x - 16, chest.y - 1, 32, 19, '#9a6139');
    pxRect(chest.x - 16, chest.y + (state.chestOpen ? -22 : -13), 32, state.chestOpen ? 10 : 14, '#ba7944');
    pxRect(chest.x - 3, chest.y + 3, 6, 9, '#e4bd64');
  }

  function drawPortal() {
    const portal = state.portal;
    const active = state.hasKey;
    const pulse = 2 + Math.sin(state.elapsed * 3) * 2;
    pxRect(portal.x - 29, portal.y + 22, 58, 9, '#29222e');
    pxRect(portal.x - 24, portal.y - 28, 10, 52, '#665776');
    pxRect(portal.x + 14, portal.y - 28, 10, 52, '#665776');
    pxRect(portal.x - 19, portal.y - 32, 38, 9, '#756582');
    pxRect(portal.x - 13 - pulse, portal.y - 20 - pulse, 26 + pulse * 2, 40 + pulse * 2, active ? '#61b59b66' : '#774f6866');
    pxRect(portal.x - 8, portal.y - 16, 16, 32, active ? '#8cdec1' : '#8a6375');
  }

  function drawHero(hero, index) {
    const down = hero.downTimer > 0;
    const bob = down ? 0 : Math.round(Math.sin(hero.bob) * 1);
    const x = Math.round(hero.x);
    const y = Math.round(hero.y + bob);
    pxRect(x - 13, y + 10, 26, 8, colors.shadow);
    if (down) {
      pxRect(x - 16, y + 2, 31, 9, hero.palette.body);
      pxRect(x + 7, y - 2, 9, 9, hero.palette.skin);
      return;
    }
    pxRect(x - 9, y + 8, 7, 10, hero.palette.dark);
    pxRect(x + 2, y + 8, 7, 10, hero.palette.dark);
    pxRect(x - 11, y - 5, 22, 18, hero.hitFlash > 0 ? '#fff1cf' : hero.palette.body);
    pxRect(x - 8, y - 16, 16, 13, hero.palette.skin);
    pxRect(x - 10, y - 18, 20, 6, hero.palette.dark);
    pxRect(x - 11, y + 1, 22, 3, hero.palette.trim);
    if (index === 0) {
      pxRect(x + 12, y - 2, 3, 18, '#c9ced0');
      pxRect(x + 9, y + 8, 9, 3, '#e2c36d');
    } else if (index === 1) {
      pxRect(x - 8, y - 20, 16, 5, hero.palette.body);
      pxRect(x + 12, y + 3, 3, 11, '#d7d4c4');
    } else {
      pxRect(x - 9, y - 23, 18, 5, hero.palette.body);
      pxRect(x - 4, y - 28, 8, 7, hero.palette.body);
      pxRect(x + 13, y - 10, 3, 27, '#795637');
      pxRect(x + 10, y - 15, 9, 9, '#75c6c0');
    }
    for (let i = 0; i < hero.maxHp; i++) pxRect(x - 15 + i * 6, y - 34, 4, 4, i < Math.max(0, hero.hp) ? '#dc6470' : '#47343e');
    if (hero.isAI) {
      pxRect(x - 9, y + 24, 18, 7, '#17131bcc');
      ctx.fillStyle = '#c9bda5';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('AI', x, y + 30);
    }
    if (hero.attackCd > .31) {
      ctx.strokeStyle = '#f0d191';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 31, Math.atan2(hero.dirY, hero.dirX) - .55, Math.atan2(hero.dirY, hero.dirX) + .55);
      ctx.stroke();
    }
  }

  function drawEnemy(enemy) {
    if (!enemy.alive) return;
    const x = Math.round(enemy.x);
    const y = Math.round(enemy.y + Math.sin(enemy.wobble) * 2);
    pxRect(x - 15, y + 9, 30, 7, colors.shadow);
    const body = enemy.hit > 0 ? '#eff2cb' : colors.slime;
    pxRect(x - 14, y - 6, 28, 16, body);
    pxRect(x - 10, y - 13, 20, 9, body);
    pxRect(x - 7, y - 5, 4, 4, '#22352a');
    pxRect(x + 4, y - 5, 4, 4, '#22352a');
    for (let i = 0; i < enemy.maxHp; i++) pxRect(x - enemy.maxHp * 3 + i * 6, y - 21, 4, 3, i < enemy.hp ? '#d5656b' : '#49373d');
  }

  function drawHUD() {
    pxRect(38, 38, 208, 32, '#151219cc');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f2ddb8';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`SQUADRA ${state.humans}/3`, 50, 58);
    ctx.fillStyle = '#b9aa92';
    ctx.fillText(`SLIME ${state.enemies.filter(enemy => enemy.alive).length}`, 154, 58);
    if (state.hasKey) {
      pxRect(820, 42, 96, 28, '#151219cc');
      ctx.fillStyle = '#f2ddb8';
      ctx.fillText('CHIAVE', 850, 60);
    }
    if (state.complete) {
      pxRect(250, 218, 460, 105, '#17131bea');
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f3d38b';
      ctx.font = 'bold 30px monospace';
      ctx.fillText('DUNGEON COMPLETATO!', 480, 260);
      ctx.fillStyle = '#d1c3a8';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('Una piccola avventura, non una corsa.', 480, 290);
    }
  }

  function draw() {
    drawFloor();
    drawDecor();
    drawWalls();
    drawLever();
    drawChest();
    drawPortal();
    state.enemies.forEach(drawEnemy);
    state.heroes.forEach(drawHero);
    for (const particle of state.particles) pxRect(particle.x, particle.y, particle.size, particle.size, particle.color);
    drawHUD();
  }

  function frame(now) {
    const dt = Math.min(.033, (now - lastTime) / 1000 || 0);
    lastTime = now;
    update(dt);
    if (mode !== 'idle') draw();
    requestAnimationFrame(frame);
  }

  function setRoster(players) {
    connectedSlots = new Set((players || []).map(player => Number(player.slot)).filter(slotValue => slotValue >= 0 && slotValue <= 2));
    if (!connectedSlots.size) connectedSlots.add(0);
    applyRosterFlags();
  }

  window.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
  }, { passive: false });
  window.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  document.querySelectorAll('[data-touch]').forEach(button => {
    const key = button.dataset.touch;
    const on = event => { event.preventDefault(); touch[key] = true; };
    const off = event => { event.preventDefault(); touch[key] = false; };
    button.addEventListener('pointerdown', on);
    button.addEventListener('pointerup', off);
    button.addEventListener('pointercancel', off);
    button.addEventListener('pointerleave', off);
  });

  restartBtn.addEventListener('click', () => {
    if (mode === 'guest') {
      showMessage('Solo l’host può ricominciare la partita.');
      return;
    }
    resetWorld();
    if (mode === 'host') window.TinyDungeonNet?.requestRestart();
  });

  window.TinyDungeonNet?.registerGame({
    startSolo() {
      mode = 'solo';
      localSlot = 0;
      connectedSlots = new Set([0]);
      resetWorld();
    },
    startOnline(info) {
      localSlot = Number(info.slot || 0);
      mode = info.isHost ? 'host' : 'guest';
      setRoster(info.players);
      resetWorld();
      if (mode === 'guest') showMessage(`Sei l’eroe ${localSlot + 1}.`);
    },
    updateOnlineRoster(players) {
      if (mode === 'host' || mode === 'guest') setRoster(players);
    },
    receiveRemoteInput(slotValue, input) {
      if (mode !== 'host') return;
      remoteInputs[Number(slotValue)] = {
        x: clamp(Number(input?.x || 0), -1, 1),
        y: clamp(Number(input?.y || 0), -1, 1),
        moving: !!input?.moving,
        attack: !!input?.attack,
        interact: !!input?.interact
      };
    },
    receiveSnapshot(data) {
      if (mode === 'guest') applySnapshot(data);
    },
    restartOnline() {
      if (mode === 'guest') resetWorld();
    },
    networkClosed() {
      showMessage('Connessione alla stanza terminata.', 3);
      setTimeout(() => window.TinyDungeonNet?.returnToMenu(), 800);
    },
    returnToMenu() {
      mode = 'idle';
      keys.clear();
      Object.keys(touch).forEach(key => { touch[key] = false; });
    }
  });

  requestAnimationFrame(frame);
})();
