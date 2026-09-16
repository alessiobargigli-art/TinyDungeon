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
    gold: '#e8b866', shadow: '#17131a99', slime: '#76bd72', water: '#3c6070', rune: '#78c0c1', red: '#c95c68'
  };

  const ROOM_COUNT = 8;
  const ROOM_NAMES = ['La leva', 'Le tre piastre', 'Il blocco runico', 'Il ponte', 'La guardia', 'La chiave', 'Le tre fiamme', 'Il guardiano'];
  const spawn = [{ x: 92, y: 270 }, { x: 126, y: 304 }, { x: 126, y: 236 }];
  const commonWalls = [
    { x: 0, y: 0, w: W, h: 28 }, { x: 0, y: H - 28, w: W, h: 28 },
    { x: 0, y: 0, w: 28, h: H }, { x: W - 28, y: 0, w: 28, h: H }
  ];

  const roomDecor = [
    [{ x: 120, y: 82 }, { x: 500, y: 82 }, { x: 820, y: 420 }],
    [{ x: 100, y: 90 }, { x: 855, y: 90 }],
    [{ x: 130, y: 420 }, { x: 830, y: 100 }],
    [{ x: 115, y: 90 }, { x: 830, y: 90 }, { x: 830, y: 435 }],
    [{ x: 95, y: 90 }, { x: 480, y: 90 }, { x: 850, y: 90 }],
    [{ x: 120, y: 430 }, { x: 820, y: 95 }],
    [{ x: 110, y: 90 }, { x: 850, y: 90 }, { x: 480, y: 440 }],
    [{ x: 110, y: 90 }, { x: 850, y: 90 }, { x: 110, y: 440 }, { x: 850, y: 440 }]
  ];

  let mode = 'idle';
  let localSlot = 0;
  let connectedSlots = new Set([0]);
  let remoteInputs = {};
  let state = createState(0, false);
  let msgTimer = 0;
  let lastTime = performance.now();
  let netInputTimer = 0;
  let snapshotTimer = 0;

  function createHero(name, index, palette, speed) {
    return { name, x: spawn[index].x, y: spawn[index].y, r: 14, hp: 5, maxHp: 5, speed, palette, dirX: 1, dirY: 0, attackCd: 0, hitFlash: 0, downTimer: 0, isAI: true, bob: index * 1.7, _interactHeld: false };
  }

  function createEnemy(type, x, y, hp, speed, extra = {}) {
    const defaults = {
      slime: { r: 16, color: '#76bd72', damage: 1 },
      skeleton: { r: 15, color: '#d8ccb1', damage: 1 },
      bat: { r: 13, color: '#9a78aa', damage: 1 },
      golem: { r: 30, color: '#a77d5d', damage: 2 }
    }[type];
    return { type, x, y, r: defaults.r, hp, maxHp: hp, speed, color: defaults.color, damage: defaults.damage, hit: 0, attackCd: 0, alive: true, wobble: Math.random() * 6, ...extra };
  }

  function roomEnemies(roomIndex) {
    if (roomIndex === 4) return [
      createEnemy('slime', 430, 170, 3, 32), createEnemy('slime', 530, 360, 3, 31), createEnemy('slime', 690, 250, 4, 30),
      createEnemy('skeleton', 610, 140, 4, 38), createEnemy('skeleton', 760, 390, 4, 38)
    ];
    if (roomIndex === 5) return [createEnemy('bat', 520, 170, 2, 58), createEnemy('skeleton', 610, 360, 4, 36)];
    if (roomIndex === 7) return [createEnemy('golem', 650, 270, 14, 24, { attackCd: .8 })];
    return [];
  }

  function createState(roomIndex = 0, keepKey = false) {
    return {
      humans: 1,
      roomIndex,
      roomSolved: false,
      complete: false,
      hasKey: keepKey,
      elapsed: 0,
      roomElapsed: 0,
      particles: [],
      heroes: [
        createHero('Knight', 0, { body: '#4778a8', trim: '#d8b36b', skin: '#f0c58f', dark: '#26334c' }, 116),
        createHero('Rogue', 1, { body: '#6ea36b', trim: '#d8d0a2', skin: '#d9a879', dark: '#273b2f' }, 126),
        createHero('Mage', 2, { body: '#845f9f', trim: '#78c0c1', skin: '#e7b98d', dark: '#382a4b' }, 108)
      ],
      enemies: roomEnemies(roomIndex),
      leverOn: false,
      bridgeOn: false,
      chestOpen: false,
      plates: [
        { x: 520, y: 150, active: false }, { x: 520, y: 270, active: false }, { x: 520, y: 390, active: false }
      ],
      block: { x: 390, y: 270, r: 24 },
      blockTarget: { x: 700, y: 270, r: 30 },
      torches: [
        { x: 360, y: 155, lit: false }, { x: 610, y: 270, lit: false }, { x: 360, y: 385, lit: false }
      ],
      torchProgress: 0,
      exit: { x: 870, y: 270 }
    };
  }

  function resetWorld() {
    state = createState(0, false);
    remoteInputs = {};
    applyRosterFlags();
    updateObjective();
    showMessage(mode === 'solo' ? 'Il primo dungeon comincia.' : 'La spedizione comincia!');
  }

  function enterRoom(index) {
    const key = state.hasKey;
    const humans = state.humans;
    state = createState(index, key);
    state.humans = humans;
    applyRosterFlags();
    updateObjective();
    showMessage(`STANZA ${index + 1}/8 · ${ROOM_NAMES[index]}`, 2.2);
  }

  function advanceRoom() {
    if (state.roomIndex < ROOM_COUNT - 1) enterRoom(state.roomIndex + 1);
    else {
      state.complete = true;
      updateObjective();
      showMessage('TinyDungeon completato ✦', 4);
      spawnBurst(480, 270, '#91d9c4', 30);
    }
  }

  function applyRosterFlags() {
    if (!state?.heroes) return;
    if (mode === 'solo') connectedSlots = new Set([0]);
    state.humans = connectedSlots.size;
    state.heroes.forEach((hero, index) => { hero.isAI = !connectedSlots.has(index); });
  }

  function updateObjective() {
    if (state.complete) {
      objectiveEl.textContent = 'Dungeon completato!';
      return;
    }
    const objectives = [
      state.roomSolved ? 'La porta è aperta. Raggiungila.' : 'Aziona la leva per aprire la porta.',
      state.roomSolved ? 'Le tre piastre sono attive. Porta aperta.' : 'Tenete occupate contemporaneamente le tre piastre.',
      state.roomSolved ? 'Il blocco è sul sigillo. Porta aperta.' : 'Spingi il blocco di pietra sul sigillo runico.',
      state.roomSolved ? 'Il ponte è stabile. Attraversate.' : 'Aziona la leva per far emergere il ponte.',
      state.roomSolved ? 'La sala è sicura. Proseguite.' : 'Sconfiggi i guardiani della sala.',
      state.roomSolved ? 'Hai la chiave antica. Prosegui.' : 'Sconfiggi i custodi e apri il forziere.',
      state.roomSolved ? 'Le tre fiamme rispondono. Prosegui.' : `Accendi le fiamme nell’ordine I · II · III (${state.torchProgress}/3).`,
      state.roomSolved ? 'Il Guardiano è caduto. Entra nel portale.' : 'Sconfiggi il Guardiano di Pietra.'
    ];
    objectiveEl.textContent = objectives[state.roomIndex];
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
      x: x / length, y: y / length, moving: !!(x || y),
      attack: keys.has('KeyF') || keys.has('Enter') || touch.attack,
      interact: keys.has('KeyE') || keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.interact
    };
  }

  function neutralInput() { return { x: 0, y: 0, moving: false, attack: false, interact: false }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function near(a, b, range) { return dist(a, b) <= range; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function collidesCircleRect(x, y, r, rect) {
    const cx = clamp(x, rect.x, rect.x + rect.w);
    const cy = clamp(y, rect.y, rect.y + rect.h);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  }

  function roomWalls() {
    const walls = [...commonWalls];
    if (state.roomIndex === 0 && !state.leverOn) walls.push({ x: 620, y: 28, w: 28, h: H - 56 });
    if (state.roomIndex === 2) {
      walls.push({ x: 270, y: 28, w: 28, h: 150 }, { x: 270, y: 360, w: 28, h: 152 });
      walls.push({ x: 760, y: 28, w: 28, h: 150 }, { x: 760, y: 360, w: 28, h: 152 });
    }
    if (state.roomIndex === 3) {
      if (!state.bridgeOn) walls.push({ x: 425, y: 28, w: 150, h: H - 56 });
      else {
        walls.push({ x: 425, y: 28, w: 150, h: 190 });
        walls.push({ x: 425, y: 322, w: 150, h: 190 });
      }
    }
    if (state.roomIndex === 4) walls.push({ x: 455, y: 210, w: 50, h: 120 });
    if (state.roomIndex === 7) {
      walls.push({ x: 330, y: 28, w: 28, h: 140 }, { x: 330, y: 372, w: 28, h: 140 });
    }
    return walls;
  }

  function canMoveCircle(x, y, r) {
    return !roomWalls().some(wall => collidesCircleRect(x, y, r, wall));
  }

  function tryPushBlock(hero, nx, ny, dx, dy) {
    if (state.roomIndex !== 2) return false;
    const block = state.block;
    if (Math.hypot(nx - block.x, ny - block.y) >= hero.r + block.r) return false;
    const bx = block.x + dx * .85;
    const by = block.y + dy * .85;
    if (!canMoveCircle(bx, by, block.r) || bx < 330 || bx > 760 || by < 75 || by > 465) return true;
    block.x = bx; block.y = by;
    if (!state.roomSolved && near(block, state.blockTarget, 28)) {
      state.roomSolved = true;
      showMessage('Il sigillo runico si illumina.');
      spawnBurst(block.x, block.y, colors.rune, 14);
      updateObjective();
    }
    return false;
  }

  function tryMove(entity, dx, dy) {
    if (!dx && !dy) return;
    const isHero = state.heroes.includes(entity);
    let nx = entity.x + dx;
    if (isHero && tryPushBlock(entity, nx, entity.y, dx, 0)) nx = entity.x;
    if (canMoveCircle(nx, entity.y, entity.r)) entity.x = nx;
    let ny = entity.y + dy;
    if (isHero && tryPushBlock(entity, entity.x, ny, 0, dy)) ny = entity.y;
    if (canMoveCircle(entity.x, ny, entity.r)) entity.y = ny;
  }

  function nearestAliveEnemy(hero, maxRange = Infinity) {
    let best = null, bestDistance = maxRange;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const d = dist(hero, enemy);
      if (d < bestDistance) { best = enemy; bestDistance = d; }
    }
    return best;
  }

  function nearestHuman(hero) {
    let best = null, bestDistance = Infinity;
    for (const candidate of state.heroes) {
      if (candidate.isAI || candidate.downTimer > 0) continue;
      const d = dist(hero, candidate);
      if (d < bestDistance) { best = candidate; bestDistance = d; }
    }
    return best || state.heroes[0];
  }

  function attack(hero) {
    if (hero.attackCd > 0 || hero.downTimer > 0) return;
    hero.attackCd = 0.48;
    let hitAny = false;
    for (const enemy of state.enemies) {
      if (!enemy.alive || dist(hero, enemy) > 58) continue;
      const d = Math.max(1, dist(hero, enemy));
      const dot = ((enemy.x - hero.x) * hero.dirX + (enemy.y - hero.y) * hero.dirY) / d;
      if (dot < -0.2) continue;
      enemy.hp -= 1;
      enemy.hit = .16;
      hitAny = true;
      spawnBurst(enemy.x, enemy.y, '#f1d18a', enemy.type === 'golem' ? 5 : 7);
      if (enemy.hp <= 0) {
        enemy.alive = false;
        spawnBurst(enemy.x, enemy.y, enemy.color, enemy.type === 'golem' ? 28 : 12);
      }
    }
    if (!hitAny) spawnBurst(hero.x + hero.dirX * 28, hero.y + hero.dirY * 28, '#d9c6a4', 3);
  }

  function interact(hero) {
    if (hero.downTimer > 0) return;
    const room = state.roomIndex;

    if (room === 0 && !state.leverOn && near(hero, { x: 360, y: 270 }, 55)) {
      state.leverOn = true; state.roomSolved = true;
      showMessage('CLACK! La porta si apre.'); spawnBurst(360, 270, colors.gold, 12); updateObjective(); return;
    }

    if (room === 3 && !state.bridgeOn && near(hero, { x: 260, y: 390 }, 55)) {
      state.bridgeOn = true; state.roomSolved = true;
      showMessage('Il ponte emerge dall’acqua.'); spawnBurst(500, 270, colors.rune, 16); updateObjective(); return;
    }

    if (room === 5 && !state.chestOpen && near(hero, { x: 700, y: 270 }, 60)) {
      if (state.enemies.some(e => e.alive)) { showMessage('I custodi proteggono ancora il forziere.'); return; }
      state.chestOpen = true; state.hasKey = true; state.roomSolved = true;
      showMessage('Hai trovato la CHIAVE ANTICA!'); spawnBurst(700, 260, '#ffe394', 18); updateObjective(); return;
    }

    if (room === 6) {
      for (let i = 0; i < state.torches.length; i++) {
        const torch = state.torches[i];
        if (!near(hero, torch, 52)) continue;
        if (i === state.torchProgress) {
          torch.lit = true; state.torchProgress++;
          showMessage(['Prima fiamma.', 'Seconda fiamma.', 'Le tre fiamme rispondono!'][i]);
          spawnBurst(torch.x, torch.y, '#f2b64d', 10);
          if (state.torchProgress === 3) state.roomSolved = true;
        } else {
          state.torchProgress = 0;
          state.torches.forEach(t => { t.lit = false; });
          showMessage('Le rune si spengono. Ricomincia da I.');
        }
        updateObjective(); return;
      }
    }

    if (near(hero, state.exit, 64)) {
      if (!state.roomSolved) { showMessage('La porta è ancora sigillata.'); return; }
      if (room === 7 && !state.hasKey) { showMessage('Il portale richiede la Chiave Antica.'); return; }
      advanceRoom();
    }
  }

  function aiInput(hero, index) {
    if (state.roomIndex === 1 && !state.roomSolved) {
      const plate = state.plates[index];
      if (plate) {
        const d = Math.max(1, dist(hero, plate));
        if (d > 12) return { x: (plate.x - hero.x) / d, y: (plate.y - hero.y) / d, moving: true, attack: false, interact: false };
        return neutralInput();
      }
    }

    const enemy = nearestAliveEnemy(hero, 125);
    if (enemy) {
      const d = Math.max(1, dist(hero, enemy));
      if (d > 46) return { x: (enemy.x - hero.x) / d, y: (enemy.y - hero.y) / d, moving: true, attack: false, interact: false };
      return { ...neutralInput(), attack: true };
    }

    const leader = nearestHuman(hero);
    const offset = index === 1 ? { x: -38, y: 38 } : { x: -38, y: -38 };
    const tx = leader.x + offset.x, ty = leader.y + offset.y;
    const d = Math.hypot(tx - hero.x, ty - hero.y);
    if (d > 30) return { x: (tx - hero.x) / d, y: (ty - hero.y) / d, moving: true, attack: false, interact: false };
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
        hero.hp = hero.maxHp; hero.x = spawn[index].x; hero.y = spawn[index].y;
      }
      return;
    }
    const input = inputForHero(hero, index);
    if (input.moving) {
      hero.dirX = input.x; hero.dirY = input.y;
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
    enemy.wobble += dt * (enemy.type === 'bat' ? 7 : 4);
    let target = null, bestDistance = enemy.type === 'golem' ? 220 : 185;
    for (const hero of state.heroes) {
      if (hero.downTimer > 0) continue;
      const d = dist(enemy, hero);
      if (d < bestDistance) { target = hero; bestDistance = d; }
    }
    if (!target) return;
    const d = Math.max(1, dist(enemy, target));
    if (d > enemy.r + target.r + 3) {
      tryMove(enemy, ((target.x - enemy.x) / d) * enemy.speed * dt, ((target.y - enemy.y) / d) * enemy.speed * dt);
    } else if (enemy.attackCd <= 0) {
      enemy.attackCd = enemy.type === 'golem' ? 1.55 : 1.25;
      target.hp -= enemy.damage;
      target.hitFlash = .24;
      spawnBurst(target.x, target.y, colors.red, enemy.type === 'golem' ? 10 : 6);
      if (target.hp <= 0) target.downTimer = 2.8;
    }
  }

  function evaluateRoom() {
    if (state.roomIndex === 1) {
      state.plates.forEach(plate => {
        plate.active = state.heroes.some(hero => hero.downTimer <= 0 && near(hero, plate, 23));
      });
      if (!state.roomSolved && state.plates.every(p => p.active)) {
        state.roomSolved = true; showMessage('Le tre piastre sono attive!'); spawnBurst(520, 270, colors.rune, 18); updateObjective();
      }
    }
    if ((state.roomIndex === 4 || state.roomIndex === 7) && !state.roomSolved && state.enemies.length && state.enemies.every(e => !e.alive)) {
      state.roomSolved = true;
      showMessage(state.roomIndex === 7 ? 'Il Guardiano è caduto.' : 'La sala è sicura.');
      updateObjective();
    }
  }

  function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, speed = 25 + Math.random() * 65;
      state.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .35 + Math.random() * .35, color, size: 2 + Math.floor(Math.random() * 3) });
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; p.life -= dt; }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function snapshot() {
    return {
      humans: state.humans, roomIndex: state.roomIndex, roomSolved: state.roomSolved, complete: state.complete, hasKey: state.hasKey,
      elapsed: state.elapsed, roomElapsed: state.roomElapsed, leverOn: state.leverOn, bridgeOn: state.bridgeOn, chestOpen: state.chestOpen,
      torchProgress: state.torchProgress,
      plates: state.plates.map(p => ({ active: p.active })),
      torches: state.torches.map(t => ({ lit: t.lit })),
      block: { x: state.block.x, y: state.block.y },
      heroes: state.heroes.map(h => ({ x: h.x, y: h.y, hp: h.hp, dirX: h.dirX, dirY: h.dirY, attackCd: h.attackCd, hitFlash: h.hitFlash, downTimer: h.downTimer, isAI: h.isAI })),
      enemies: state.enemies.map(e => ({ type: e.type, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, speed: e.speed, color: e.color, damage: e.damage, hit: e.hit, attackCd: e.attackCd, alive: e.alive, wobble: e.wobble }))
    };
  }

  function applySnapshot(data) {
    if (!data || !Array.isArray(data.heroes) || !Array.isArray(data.enemies)) return;
    if (Number(data.roomIndex) !== state.roomIndex) state = createState(Number(data.roomIndex), !!data.hasKey);
    state.humans = Number(data.humans || 1); state.roomSolved = !!data.roomSolved; state.complete = !!data.complete; state.hasKey = !!data.hasKey;
    state.elapsed = Number(data.elapsed || 0); state.roomElapsed = Number(data.roomElapsed || 0); state.leverOn = !!data.leverOn; state.bridgeOn = !!data.bridgeOn; state.chestOpen = !!data.chestOpen;
    state.torchProgress = Number(data.torchProgress || 0);
    if (data.block) Object.assign(state.block, data.block);
    if (Array.isArray(data.plates)) data.plates.forEach((p, i) => { if (state.plates[i]) state.plates[i].active = !!p.active; });
    if (Array.isArray(data.torches)) data.torches.forEach((t, i) => { if (state.torches[i]) state.torches[i].lit = !!t.lit; });
    data.heroes.forEach((incoming, i) => { if (state.heroes[i]) Object.assign(state.heroes[i], incoming); });
    state.enemies = data.enemies.map(incoming => ({ ...incoming }));
    updateObjective();
  }

  function update(dt) {
    if (mode === 'idle') return;
    state.elapsed += dt; state.roomElapsed += dt;
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) messageEl.classList.remove('show'); }

    if (mode === 'guest') {
      netInputTimer -= dt;
      if (netInputTimer <= 0) { netInputTimer = .05; window.TinyDungeonNet?.sendInput(localInput()); }
      updateParticles(dt); return;
    }

    if (!state.complete) {
      state.heroes.forEach((hero, index) => updateHero(hero, index, dt));
      state.enemies.forEach(enemy => updateEnemy(enemy, dt));
      evaluateRoom();
    }
    updateParticles(dt);

    if (mode === 'host') {
      snapshotTimer -= dt;
      if (snapshotTimer <= 0) { snapshotTimer = .05; window.TinyDungeonNet?.broadcastSnapshot(snapshot()); }
    }
  }

  function pxRect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

  function drawFloor() {
    pxRect(0, 0, W, H, '#241f28');
    const tint = ['#564451', '#51465d', '#4f4651', '#40505c', '#51434a', '#4e4659', '#55464a', '#493e42'][state.roomIndex];
    for (let y = 28; y < H - 28; y += TILE) {
      for (let x = 28; x < W - 28; x += TILE) {
        const alt = ((x / TILE + y / TILE) | 0) % 2;
        pxRect(x, y, TILE, TILE, alt ? tint : colors.floorB);
        pxRect(x + 2, y + 2, TILE - 4, 1, '#79647533');
        if (((x * 7 + y * 13 + state.roomIndex * 17) % 101) < 6) {
          pxRect(x + 9, y + 18, 8, 2, colors.floorCrack); pxRect(x + 15, y + 16, 2, 5, colors.floorCrack);
        }
      }
    }
  }

  function drawWallRect(r) {
    pxRect(r.x, r.y, r.w, r.h, colors.wallDark); pxRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, colors.wall);
    if (r.w > r.h) pxRect(r.x + 3, r.y + 3, r.w - 6, 7, colors.wallTop); else pxRect(r.x + 3, r.y + 3, 7, r.h - 6, colors.wallTop);
  }

  function drawRoomSpecials() {
    const room = state.roomIndex;
    if (room === 0) drawLever({ x: 360, y: 270 }, state.leverOn);
    if (room === 1) {
      state.plates.forEach((p, i) => {
        pxRect(p.x - 26, p.y - 18, 52, 36, '#29252f');
        pxRect(p.x - 21, p.y - 13, 42, 26, p.active ? '#6ab59d' : '#72596e');
        ctx.fillStyle = p.active ? '#e9ffdc' : '#d9c6a4'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(['I', 'II', 'III'][i], p.x, p.y + 5);
      });
    }
    if (room === 2) {
      const target = state.blockTarget, block = state.block;
      pxRect(target.x - 32, target.y - 32, 64, 64, '#29464a'); pxRect(target.x - 23, target.y - 23, 46, 46, '#467c78');
      pxRect(block.x - 23, block.y - 23, 46, 46, '#443a40'); pxRect(block.x - 19, block.y - 19, 38, 38, '#8a746c'); pxRect(block.x - 11, block.y - 5, 22, 10, '#b19579');
    }
    if (room === 3) {
      pxRect(425, 28, 150, H - 56, colors.water);
      for (let y = 48; y < H - 40; y += 32) pxRect(440, y, 120, 3, '#7eb0b555');
      if (state.bridgeOn) { pxRect(425, 220, 150, 102, '#604936'); for (let x = 432; x < 570; x += 20) pxRect(x, 224, 14, 94, '#8f6948'); }
      drawLever({ x: 260, y: 390 }, state.bridgeOn);
    }
    if (room === 5) drawChest({ x: 700, y: 270 }, state.chestOpen);
    if (room === 6) {
      state.torches.forEach((t, i) => {
        drawFloorTorch(t, t.lit);
        ctx.fillStyle = '#dbc99f'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(['I', 'II', 'III'][i], t.x, t.y + 42);
      });
    }
    drawExit();
  }

  function drawLever(p, on) {
    pxRect(p.x - 13, p.y + 8, 26, 8, '#2c2227'); pxRect(p.x - 10, p.y + 5, 20, 6, '#7b6353');
    const endX = on ? p.x + 9 : p.x - 9; pxRect(p.x - 2, p.y - 13, 4, 20, '#b7a17c'); pxRect(endX - 4, p.y - 19, 8, 8, on ? '#71b98d' : '#cf6b61');
  }

  function drawChest(p, open) {
    pxRect(p.x - 19, p.y - 4, 38, 25, '#39281f'); pxRect(p.x - 16, p.y - 1, 32, 19, '#9a6139');
    pxRect(p.x - 16, p.y + (open ? -22 : -13), 32, open ? 10 : 14, '#ba7944'); pxRect(p.x - 3, p.y + 3, 6, 9, '#e4bd64');
  }

  function drawFloorTorch(t, lit) {
    pxRect(t.x - 10, t.y + 9, 20, 7, '#43382f'); pxRect(t.x - 5, t.y - 4, 10, 16, '#7c5f43');
    if (lit) { pxRect(t.x - 7, t.y - 16, 14, 14, '#e57a45'); pxRect(t.x - 4, t.y - 20, 8, 14, '#f2b64d'); }
  }

  function drawExit() {
    const p = state.exit;
    const open = state.roomSolved;
    const final = state.roomIndex === 7;
    pxRect(p.x - 28, p.y - 48, 56, 96, '#211c26');
    pxRect(p.x - 21, p.y - 41, 42, 82, final ? '#665776' : '#6e584d');
    pxRect(p.x - 13, p.y - 31, 26, 62, open ? (final ? '#71bfa8' : '#8b7458') : '#3b3038');
    if (open) { const pulse = Math.round(Math.sin(state.elapsed * 4) * 3); pxRect(p.x - 7 - pulse, p.y - 22 - pulse, 14 + pulse * 2, 44 + pulse * 2, final ? '#9ce6c5aa' : '#d1a86a66'); }
  }

  function drawDecor() {
    roomDecor[state.roomIndex].forEach((torch, i) => {
      pxRect(torch.x - 3, torch.y + 6, 6, 13, '#624331');
      const flame = Math.sin(state.elapsed * 7 + i) * 2;
      pxRect(torch.x - 5, torch.y - 2 + flame, 10, 10, '#e57a45'); pxRect(torch.x - 3, torch.y - 5 + flame, 6, 10, '#f2b64d');
    });
  }

  function drawHero(hero, index) {
    const down = hero.downTimer > 0, bob = down ? 0 : Math.round(Math.sin(hero.bob) * 1), x = Math.round(hero.x), y = Math.round(hero.y + bob);
    pxRect(x - 13, y + 10, 26, 8, colors.shadow);
    if (down) { pxRect(x - 16, y + 2, 31, 9, hero.palette.body); pxRect(x + 7, y - 2, 9, 9, hero.palette.skin); return; }
    pxRect(x - 9, y + 8, 7, 10, hero.palette.dark); pxRect(x + 2, y + 8, 7, 10, hero.palette.dark);
    pxRect(x - 11, y - 5, 22, 18, hero.hitFlash > 0 ? '#fff1cf' : hero.palette.body); pxRect(x - 8, y - 16, 16, 13, hero.palette.skin); pxRect(x - 10, y - 18, 20, 6, hero.palette.dark); pxRect(x - 11, y + 1, 22, 3, hero.palette.trim);
    if (index === 0) { pxRect(x + 12, y - 2, 3, 18, '#c9ced0'); pxRect(x + 9, y + 8, 9, 3, '#e2c36d'); }
    else if (index === 1) { pxRect(x - 8, y - 20, 16, 5, hero.palette.body); pxRect(x + 12, y + 3, 3, 11, '#d7d4c4'); }
    else { pxRect(x - 9, y - 23, 18, 5, hero.palette.body); pxRect(x - 4, y - 28, 8, 7, hero.palette.body); pxRect(x + 13, y - 10, 3, 27, '#795637'); pxRect(x + 10, y - 15, 9, 9, '#75c6c0'); }
    for (let i = 0; i < hero.maxHp; i++) pxRect(x - 15 + i * 6, y - 34, 4, 4, i < Math.max(0, hero.hp) ? '#dc6470' : '#47343e');
    if (hero.isAI) { pxRect(x - 9, y + 24, 18, 7, '#17131bcc'); ctx.fillStyle = '#c9bda5'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillText('AI', x, y + 30); }
    if (hero.attackCd > .31) { ctx.strokeStyle = '#f0d191'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 31, Math.atan2(hero.dirY, hero.dirX) - .55, Math.atan2(hero.dirY, hero.dirX) + .55); ctx.stroke(); }
  }

  function drawEnemy(e) {
    if (!e.alive) return;
    const x = Math.round(e.x), y = Math.round(e.y + Math.sin(e.wobble) * (e.type === 'bat' ? 5 : 2));
    pxRect(x - e.r, y + e.r * .55, e.r * 2, Math.max(5, e.r * .35), colors.shadow);
    const body = e.hit > 0 ? '#fff0cc' : e.color;
    if (e.type === 'slime') {
      pxRect(x - 14, y - 6, 28, 16, body); pxRect(x - 10, y - 13, 20, 9, body); pxRect(x - 7, y - 5, 4, 4, '#22352a'); pxRect(x + 4, y - 5, 4, 4, '#22352a');
    } else if (e.type === 'skeleton') {
      pxRect(x - 8, y - 18, 16, 14, body); pxRect(x - 10, y - 5, 20, 16, '#6b6257'); pxRect(x - 5, y - 13, 3, 3, '#29242a'); pxRect(x + 3, y - 13, 3, 3, '#29242a');
    } else if (e.type === 'bat') {
      pxRect(x - 9, y - 5, 18, 12, body); pxRect(x - 22, y - 10, 14, 9, body); pxRect(x + 8, y - 10, 14, 9, body); pxRect(x - 4, y - 1, 3, 3, '#f0d187'); pxRect(x + 2, y - 1, 3, 3, '#f0d187');
    } else {
      pxRect(x - 26, y - 20, 52, 46, body); pxRect(x - 20, y - 33, 40, 20, '#7c5d48'); pxRect(x - 13, y - 24, 7, 7, '#f0b35e'); pxRect(x + 6, y - 24, 7, 7, '#f0b35e'); pxRect(x - 34, y - 12, 12, 33, '#6e5547'); pxRect(x + 22, y - 12, 12, 33, '#6e5547');
    }
    const bars = Math.min(e.maxHp, 14);
    for (let i = 0; i < bars; i++) pxRect(x - bars * 3 + i * 6, y - e.r - 13, 4, 3, i < Math.ceil((e.hp / e.maxHp) * bars) ? '#d5656b' : '#49373d');
  }

  function drawHUD() {
    pxRect(38, 38, 280, 32, '#151219cc'); ctx.textAlign = 'left'; ctx.fillStyle = '#f2ddb8'; ctx.font = 'bold 13px monospace';
    ctx.fillText(`STANZA ${state.roomIndex + 1}/8 · ${ROOM_NAMES[state.roomIndex].toUpperCase()}`, 50, 58);
    pxRect(38, 76, 170, 26, '#151219aa'); ctx.fillStyle = '#b9aa92'; ctx.font = 'bold 11px monospace'; ctx.fillText(`SQUADRA ${state.humans}/3`, 50, 94);
    if (state.hasKey) { pxRect(820, 42, 96, 28, '#151219cc'); ctx.fillStyle = '#f2ddb8'; ctx.fillText('CHIAVE', 850, 60); }
    if (state.complete) {
      pxRect(250, 205, 460, 130, '#17131bea'); ctx.textAlign = 'center'; ctx.fillStyle = '#f3d38b'; ctx.font = 'bold 30px monospace'; ctx.fillText('DUNGEON COMPLETATO!', 480, 250);
      ctx.fillStyle = '#d1c3a8'; ctx.font = 'bold 14px monospace'; ctx.fillText('Otto stanze. Un piccolo viaggio insieme.', 480, 282); ctx.fillText('Ricomincia dal menu per una nuova spedizione.', 480, 307);
    }
  }

  function draw() {
    drawFloor(); drawDecor(); roomWalls().forEach(drawWallRect); drawRoomSpecials();
    state.enemies.forEach(drawEnemy); state.heroes.forEach(drawHero);
    state.particles.forEach(p => pxRect(p.x, p.y, p.size, p.size, p.color)); drawHUD();
  }

  function frame(now) {
    const dt = Math.min(.033, (now - lastTime) / 1000 || 0); lastTime = now; update(dt); if (mode !== 'idle') draw(); requestAnimationFrame(frame);
  }

  function setRoster(players) {
    connectedSlots = new Set((players || []).map(p => Number(p.slot)).filter(v => v >= 0 && v <= 2));
    if (!connectedSlots.size) connectedSlots.add(0); applyRosterFlags();
  }

  window.addEventListener('keydown', e => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); keys.add(e.code); }, { passive: false });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.querySelectorAll('[data-touch]').forEach(button => {
    const key = button.dataset.touch;
    const on = e => { e.preventDefault(); touch[key] = true; };
    const off = e => { e.preventDefault(); touch[key] = false; };
    button.addEventListener('pointerdown', on); button.addEventListener('pointerup', off); button.addEventListener('pointercancel', off); button.addEventListener('pointerleave', off);
  });

  restartBtn.addEventListener('click', () => {
    if (mode === 'guest') { showMessage('Solo l’host può ricominciare la partita.'); return; }
    resetWorld(); if (mode === 'host') window.TinyDungeonNet?.requestRestart();
  });

  window.TinyDungeonNet?.registerGame({
    startSolo() { mode = 'solo'; localSlot = 0; connectedSlots = new Set([0]); resetWorld(); },
    startOnline(info) { localSlot = Number(info.slot || 0); mode = info.isHost ? 'host' : 'guest'; setRoster(info.players); resetWorld(); if (mode === 'guest') showMessage(`Sei l’eroe ${localSlot + 1}.`); },
    updateOnlineRoster(players) { if (mode === 'host' || mode === 'guest') setRoster(players); },
    receiveRemoteInput(slotValue, input) { if (mode === 'host') remoteInputs[Number(slotValue)] = { ...neutralInput(), ...input }; },
    receiveSnapshot(data) { if (mode === 'guest') applySnapshot(data); },
    restartOnline() { if (mode === 'guest') resetWorld(); },
    networkClosed() { showMessage('Connessione alla stanza terminata.', 3); },
    returnToMenu() { mode = 'idle'; keys.clear(); }
  });

  requestAnimationFrame(frame);
})();
