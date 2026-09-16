(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const restartBtn = document.getElementById('restartBtn');
  const objectiveEl = document.getElementById('objective');
  const messageEl = document.getElementById('message');
  const difficultySelect = document.getElementById('difficultySelect');
  const W = canvas.width;
  const H = canvas.height;
  const TILE = 32;
  const keys = new Set();
  const touch = { up: false, down: false, left: false, right: false, attack: false, interact: false };

  const colors = {
    floorB: '#4d3d49', floorCrack: '#3f323d', wall: '#2d2834', wallTop: '#6c5868', wallDark: '#1b1820',
    gold: '#e8b866', shadow: '#17131a99', water: '#3c6070', rune: '#78c0c1', red: '#c95c68'
  };

  const spawn = [{ x: 92, y: 270 }, { x: 126, y: 304 }, { x: 126, y: 236 }];
  const commonWalls = [
    { x: 0, y: 0, w: W, h: 28 }, { x: 0, y: H - 28, w: W, h: 28 },
    { x: 0, y: 0, w: 28, h: H }, { x: W - 28, y: 0, w: 28, h: H }
  ];

  const ENEMY_DEFAULTS = {
    slime: { r: 16, color: '#76bd72', damage: 1 },
    skeleton: { r: 15, color: '#d8ccb1', damage: 1 },
    bat: { r: 13, color: '#9a78aa', damage: 1 },
    golem: { r: 30, color: '#a77d5d', damage: 2 }
  };

  const CAMPAIGNS = {
    easy: {
      label: 'FACILE', accent: '#78c0c1', tints: ['#564451', '#51465d', '#4f4651', '#40505c', '#51434a', '#4e4659', '#55464a', '#493e42'],
      rooms: [
        { name: 'La leva', type: 'lever', levers: [{ x: 360, y: 270 }], gateX: 620, objective: 'Aziona la leva per aprire la porta.' },
        { name: 'Le tre piastre', type: 'plates', plates: [{ x: 520, y: 150 }, { x: 520, y: 270 }, { x: 520, y: 390 }], objective: 'Tenete occupate contemporaneamente le tre piastre.' },
        { name: 'Il blocco runico', type: 'blocks', blocks: [{ x: 390, y: 270, tx: 700, ty: 270 }], objective: 'Spingi il blocco di pietra sul sigillo runico.' },
        { name: 'Il ponte', type: 'bridge', bridgeLever: { x: 260, y: 390 }, objective: 'Aziona la leva per far emergere il ponte.' },
        { name: 'La guardia', type: 'battle', enemies: [
          ['slime', 430, 170, 3, 32], ['slime', 530, 360, 3, 31], ['slime', 690, 250, 4, 30], ['skeleton', 610, 140, 4, 38], ['skeleton', 760, 390, 4, 38]
        ], objective: 'Sconfiggi i guardiani della sala.' },
        { name: 'La chiave', type: 'key', chest: { x: 700, y: 270 }, enemies: [['bat', 520, 170, 2, 58], ['skeleton', 610, 360, 4, 36]], objective: 'Sconfiggi i custodi e apri il forziere.' },
        { name: 'Le tre fiamme', type: 'torches', torches: [{ x: 360, y: 155 }, { x: 610, y: 270 }, { x: 360, y: 385 }], sequence: [0, 1, 2], objective: 'Accendi le fiamme nell’ordine I · II · III.' },
        { name: 'Il guardiano', type: 'boss', enemies: [['golem', 650, 270, 14, 24]], objective: 'Sconfiggi il Guardiano di Pietra.' }
      ]
    },
    medium: {
      label: 'MEDIA', accent: '#e8b866', tints: ['#514451', '#4b4559', '#4c4c55', '#3d5360', '#524146', '#51475f', '#5c4947', '#4a3b3d'],
      rooms: [
        { name: 'Le due rune', type: 'lever', levers: [{ x: 350, y: 180 }, { x: 350, y: 360 }], gateX: 650, enemies: [['bat', 540, 270, 3, 60]], requiresClear: true, objective: 'Attiva entrambe le rune e libera la sala.' },
        { name: 'Piastre sorvegliate', type: 'plates', plates: [{ x: 560, y: 155 }, { x: 560, y: 270 }, { x: 560, y: 385 }], enemies: [['slime', 680, 175, 4, 34], ['skeleton', 720, 365, 5, 40]], requiresClear: true, objective: 'Sconfiggi i custodi, poi occupate insieme le tre piastre.' },
        { name: 'I due massi', type: 'blocks', blocks: [{ x: 390, y: 190, tx: 700, ty: 190 }, { x: 390, y: 350, tx: 700, ty: 350 }], objective: 'Porta entrambi i massi sui rispettivi sigilli.' },
        { name: 'Il ponte spezzato', type: 'bridge', bridgeLever: { x: 250, y: 405 }, enemies: [['bat', 320, 145, 3, 62], ['skeleton', 740, 390, 5, 40]], requiresClear: true, objective: 'Apri il ponte e sconfiggi i custodi rimasti.' },
        { name: 'Sala delle ossa', type: 'battle', enemies: [
          ['skeleton', 420, 145, 5, 40], ['skeleton', 560, 390, 5, 40], ['skeleton', 720, 180, 5, 42], ['slime', 490, 300, 4, 34], ['slime', 690, 340, 4, 34], ['bat', 610, 120, 3, 62]
        ], objective: 'Ripulisci la Sala delle Ossa.' },
        { name: 'Scrigno sigillato', type: 'key', chest: { x: 735, y: 270 }, enemies: [['skeleton', 500, 150, 5, 41], ['skeleton', 500, 390, 5, 41], ['bat', 620, 170, 3, 64], ['bat', 620, 370, 3, 64]], objective: 'Abbatti i quattro custodi e apri lo scrigno.' },
        { name: 'Rune invertite', type: 'torches', torches: [{ x: 340, y: 145 }, { x: 610, y: 145 }, { x: 610, y: 395 }, { x: 340, y: 395 }], sequence: [2, 0, 3, 1], objective: 'Leggi le rune: III · I · IV · II.' },
        { name: 'Guardiano rinforzato', type: 'boss', enemies: [['golem', 660, 270, 20, 26], ['bat', 560, 150, 3, 62], ['bat', 560, 390, 3, 62]], objective: 'Sconfiggi il Guardiano e i suoi rinforzi.' }
      ]
    },
    hard: {
      label: 'DIFFICILE', accent: '#d85c68', tints: ['#4d3c47', '#493f55', '#47454f', '#354b58', '#4b393e', '#493f58', '#51403f', '#403236'],
      rooms: [
        { name: 'Il doppio sigillo', type: 'lever', levers: [{ x: 345, y: 145 }, { x: 345, y: 270 }, { x: 345, y: 395 }], timed: 6, gateX: 675, objective: 'Attiva i tre sigilli entro sei secondi.' },
        { name: 'Piastre sotto assedio', type: 'plates', plates: [{ x: 565, y: 145 }, { x: 565, y: 270 }, { x: 565, y: 395 }], enemies: [['skeleton', 710, 145, 6, 44], ['skeleton', 710, 395, 6, 44], ['bat', 700, 270, 4, 67], ['slime', 440, 270, 5, 36]], requiresClear: true, objective: 'Resisti all’assedio, poi attiva le tre piastre insieme.' },
        { name: 'Labirinto dei massi', type: 'blocks', blocks: [{ x: 360, y: 180, tx: 720, ty: 180 }, { x: 360, y: 360, tx: 720, ty: 360 }], extraWalls: [
          { x: 500, y: 28, w: 28, h: 145 }, { x: 500, y: 367, w: 28, h: 145 }, { x: 610, y: 170, w: 28, h: 200 }
        ], objective: 'Guida entrambi i massi nel labirinto fino ai sigilli.' },
        { name: 'Ponte dei custodi', type: 'bridge', bridgeLever: { x: 235, y: 400 }, enemies: [['skeleton', 330, 145, 6, 44], ['skeleton', 720, 145, 6, 44], ['skeleton', 720, 395, 6, 44], ['bat', 610, 360, 4, 68]], requiresClear: true, objective: 'Apri il ponte e abbatti tutti i custodi.' },
        { name: 'La cripta', type: 'battle', enemies: [
          ['skeleton', 400, 125, 6, 45], ['skeleton', 400, 415, 6, 45], ['skeleton', 590, 155, 6, 46], ['skeleton', 590, 385, 6, 46],
          ['slime', 520, 270, 5, 37], ['slime', 735, 270, 5, 37], ['bat', 690, 120, 4, 68], ['bat', 690, 420, 4, 68]
        ], objective: 'Attraversa la cripta senza lasciare guardiani alle spalle.' },
        { name: 'Chiave del profondo', type: 'key', chest: { x: 765, y: 270 }, enemies: [['golem', 610, 270, 10, 25], ['skeleton', 500, 150, 6, 44], ['skeleton', 500, 390, 6, 44], ['bat', 680, 145, 4, 68], ['bat', 680, 395, 4, 68]], objective: 'Sconfiggi il custode maggiore e conquista la Chiave del Profondo.' },
        { name: 'Fiamme cieche', type: 'torches', torches: [{ x: 325, y: 140 }, { x: 625, y: 140 }, { x: 625, y: 400 }, { x: 325, y: 400 }], sequence: [1, 3, 0, 2], enemies: [['bat', 760, 270, 4, 67]], requiresClear: true, objective: 'Sconfiggi il guardiano e segui l’ordine II · IV · I · III.' },
        { name: 'Guardiani gemelli', type: 'boss', enemies: [['golem', 625, 190, 16, 27], ['golem', 625, 350, 16, 27], ['bat', 760, 130, 4, 68], ['bat', 760, 410, 4, 68]], objective: 'Sconfiggi i due Guardiani Gemelli.' }
      ]
    }
  };

  const decorTemplates = [
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
  let difficulty = normalizeDifficulty(difficultySelect?.value || localStorage.getItem('tinyDungeon.difficulty') || 'easy');
  let state = createState(0, false);
  let msgTimer = 0;
  let lastTime = performance.now();
  let netInputTimer = 0;
  let snapshotTimer = 0;

  function normalizeDifficulty(value) { return CAMPAIGNS[value] ? value : 'easy'; }
  function campaign() { return CAMPAIGNS[difficulty]; }
  function roomConfig() { return campaign().rooms[state.roomIndex]; }
  function difficultyLabel() { return campaign().label; }

  function createHero(name, index, palette, speed) {
    return { name, x: spawn[index].x, y: spawn[index].y, r: 14, hp: 5, maxHp: 5, speed, palette, dirX: 1, dirY: 0, attackCd: 0, hitFlash: 0, downTimer: 0, isAI: true, bob: index * 1.7, _interactHeld: false };
  }

  function createEnemy(spec) {
    const [type, x, y, hp, speed, extra = {}] = spec;
    const defaults = ENEMY_DEFAULTS[type];
    return { type, x, y, r: defaults.r, hp, maxHp: hp, speed, color: defaults.color, damage: defaults.damage, hit: 0, attackCd: 0, alive: true, wobble: Math.random() * 6, ...extra };
  }

  function createState(roomIndex = 0, keepKey = false) {
    const cfg = CAMPAIGNS[difficulty].rooms[roomIndex];
    return {
      difficulty, humans: 1, roomIndex, roomSolved: false, complete: false, hasKey: keepKey,
      elapsed: 0, roomElapsed: 0, particles: [], timedRemaining: cfg.timed || 0,
      heroes: [
        createHero('Knight', 0, { body: '#4778a8', trim: '#d8b36b', skin: '#f0c58f', dark: '#26334c' }, 116),
        createHero('Rogue', 1, { body: '#6ea36b', trim: '#d8d0a2', skin: '#d9a879', dark: '#273b2f' }, 126),
        createHero('Mage', 2, { body: '#845f9f', trim: '#78c0c1', skin: '#e7b98d', dark: '#382a4b' }, 108)
      ],
      enemies: (cfg.enemies || []).map(createEnemy),
      levers: (cfg.levers || []).map(p => ({ ...p, on: false })),
      bridgeOn: false,
      chestOpen: false,
      plates: (cfg.plates || []).map(p => ({ ...p, active: false })),
      blocks: (cfg.blocks || []).map(b => ({ x: b.x, y: b.y, r: 24, target: { x: b.tx, y: b.ty, r: 30 }, solved: false })),
      torches: (cfg.torches || []).map(p => ({ ...p, lit: false })),
      torchProgress: 0,
      exit: { x: 870, y: 270 }
    };
  }

  function chooseDifficulty(value) {
    difficulty = normalizeDifficulty(value);
    localStorage.setItem('tinyDungeon.difficulty', difficulty);
    if (difficultySelect) difficultySelect.value = difficulty;
  }

  function resetWorld() {
    state = createState(0, false);
    remoteInputs = {};
    applyRosterFlags();
    updateObjective();
    showMessage(`${difficultyLabel()} · ${mode === 'solo' ? 'La spedizione comincia.' : 'Il gruppo entra nel dungeon.'}`, 2.2);
  }

  function enterRoom(index) {
    const key = state.hasKey;
    const humans = state.humans;
    state = createState(index, key);
    state.humans = humans;
    applyRosterFlags();
    updateObjective();
    showMessage(`${difficultyLabel()} · STANZA ${index + 1}/8 · ${roomConfig().name}`, 2.2);
  }

  function advanceRoom() {
    if (state.roomIndex < 7) enterRoom(state.roomIndex + 1);
    else {
      state.complete = true;
      updateObjective();
      showMessage(`${difficultyLabel()} completato ✦`, 4);
      spawnBurst(480, 270, campaign().accent, 30);
    }
  }

  function applyRosterFlags() {
    if (!state?.heroes) return;
    if (mode === 'solo') connectedSlots = new Set([0]);
    state.humans = connectedSlots.size;
    state.heroes.forEach((hero, index) => { hero.isAI = !connectedSlots.has(index); });
  }

  function allEnemiesDead() { return !state.enemies.length || state.enemies.every(e => !e.alive); }

  function updateObjective() {
    if (state.complete) { objectiveEl.textContent = `${difficultyLabel()} completato!`; return; }
    const cfg = roomConfig();
    if (state.roomSolved) { objectiveEl.textContent = state.roomIndex === 7 ? 'Il portale è aperto. Entra.' : 'La porta è aperta. Raggiungila.'; return; }
    if (cfg.type === 'torches') objectiveEl.textContent = `${cfg.objective} (${state.torchProgress}/${state.torches.length})`;
    else if (cfg.timed && state.levers.some(l => l.on)) objectiveEl.textContent = `${cfg.objective} ${Math.max(0, state.timedRemaining).toFixed(1)}s`;
    else objectiveEl.textContent = cfg.objective;
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
    return { x: x / length, y: y / length, moving: !!(x || y), attack: keys.has('KeyF') || keys.has('Enter') || touch.attack, interact: keys.has('KeyE') || keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.interact };
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
    const cfg = roomConfig();
    const walls = [...commonWalls, ...(cfg.extraWalls || [])];
    if (cfg.type === 'lever' && cfg.gateX && !state.roomSolved) walls.push({ x: cfg.gateX, y: 28, w: 28, h: H - 56 });
    if (cfg.type === 'blocks') {
      walls.push({ x: 270, y: 28, w: 28, h: 145 }, { x: 270, y: 367, w: 28, h: 145 });
      walls.push({ x: 790, y: 28, w: 28, h: 145 }, { x: 790, y: 367, w: 28, h: 145 });
    }
    if (cfg.type === 'bridge') {
      if (!state.bridgeOn) walls.push({ x: 425, y: 28, w: 150, h: H - 56 });
      else { walls.push({ x: 425, y: 28, w: 150, h: 190 }); walls.push({ x: 425, y: 322, w: 150, h: 190 }); }
    }
    if (cfg.type === 'battle') walls.push({ x: 455, y: 210, w: 50, h: 120 });
    if (cfg.type === 'boss') walls.push({ x: 330, y: 28, w: 28, h: 140 }, { x: 330, y: 372, w: 28, h: 140 });
    return walls;
  }

  function canMoveCircle(x, y, r) { return !roomWalls().some(wall => collidesCircleRect(x, y, r, wall)); }

  function tryPushBlock(hero, nx, ny, dx, dy) {
    if (roomConfig().type !== 'blocks') return false;
    for (const block of state.blocks) {
      if (block.solved || Math.hypot(nx - block.x, ny - block.y) >= hero.r + block.r) continue;
      const bx = block.x + dx * .85, by = block.y + dy * .85;
      if (!canMoveCircle(bx, by, block.r) || bx < 315 || bx > 780 || by < 65 || by > 475) return true;
      block.x = bx; block.y = by;
      if (near(block, block.target, 28)) {
        block.solved = true; block.x = block.target.x; block.y = block.target.y;
        spawnBurst(block.x, block.y, colors.rune, 14);
        showMessage('Un sigillo runico si illumina.');
      }
      return false;
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
      enemy.hp -= 1; enemy.hit = .16; hitAny = true;
      spawnBurst(enemy.x, enemy.y, '#f1d18a', enemy.type === 'golem' ? 5 : 7);
      if (enemy.hp <= 0) { enemy.alive = false; spawnBurst(enemy.x, enemy.y, enemy.color, enemy.type === 'golem' ? 28 : 12); }
    }
    if (!hitAny) spawnBurst(hero.x + hero.dirX * 28, hero.y + hero.dirY * 28, '#d9c6a4', 3);
  }

  function interact(hero) {
    if (hero.downTimer > 0) return;
    const cfg = roomConfig();

    if (cfg.type === 'lever') {
      for (const lever of state.levers) {
        if (lever.on || !near(hero, lever, 55)) continue;
        if (!state.levers.some(l => l.on) && cfg.timed) state.timedRemaining = cfg.timed;
        lever.on = true;
        showMessage('CLACK! Un sigillo risponde.'); spawnBurst(lever.x, lever.y, colors.gold, 10);
        evaluateRoom(); updateObjective(); return;
      }
    }

    if (cfg.type === 'bridge' && !state.bridgeOn && near(hero, cfg.bridgeLever, 55)) {
      state.bridgeOn = true; showMessage('Il ponte emerge dall’acqua.'); spawnBurst(500, 270, colors.rune, 16); evaluateRoom(); updateObjective(); return;
    }

    if (cfg.type === 'key' && !state.chestOpen && near(hero, cfg.chest, 60)) {
      if (!allEnemiesDead()) { showMessage('I custodi proteggono ancora il forziere.'); return; }
      state.chestOpen = true; state.hasKey = true; state.roomSolved = true;
      showMessage('Hai trovato la CHIAVE ANTICA!'); spawnBurst(cfg.chest.x, cfg.chest.y - 10, '#ffe394', 18); updateObjective(); return;
    }

    if (cfg.type === 'torches') {
      for (let i = 0; i < state.torches.length; i++) {
        const torch = state.torches[i];
        if (!near(hero, torch, 52)) continue;
        const expected = cfg.sequence[state.torchProgress];
        if (i === expected) {
          torch.lit = true; state.torchProgress++;
          showMessage(state.torchProgress === state.torches.length ? 'Le rune rispondono!' : `Fiamma ${state.torchProgress}.`);
          spawnBurst(torch.x, torch.y, '#f2b64d', 10);
        } else {
          state.torchProgress = 0; state.torches.forEach(t => { t.lit = false; }); showMessage('Le rune si spengono. Ricomincia la sequenza.');
        }
        evaluateRoom(); updateObjective(); return;
      }
    }

    if (near(hero, state.exit, 64)) {
      if (!state.roomSolved) { showMessage('La porta è ancora sigillata.'); return; }
      if (state.roomIndex === 7 && !state.hasKey) { showMessage('Il portale richiede la Chiave Antica.'); return; }
      advanceRoom();
    }
  }

  function aiInput(hero, index) {
    const cfg = roomConfig();
    if (cfg.type === 'plates' && !state.roomSolved && allEnemiesDead()) {
      const plate = state.plates[index];
      if (plate) {
        const d = Math.max(1, dist(hero, plate));
        if (d > 12) return { x: (plate.x - hero.x) / d, y: (plate.y - hero.y) / d, moving: true, attack: false, interact: false };
        return neutralInput();
      }
    }

    const enemy = nearestAliveEnemy(hero, 135);
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
    hero.attackCd = Math.max(0, hero.attackCd - dt); hero.hitFlash = Math.max(0, hero.hitFlash - dt); hero.bob += dt * 5;
    if (hero.downTimer > 0) {
      hero.downTimer -= dt;
      if (hero.downTimer <= 0) { hero.hp = hero.maxHp; hero.x = spawn[index].x; hero.y = spawn[index].y; }
      return;
    }
    const input = inputForHero(hero, index);
    if (input.moving) { hero.dirX = input.x; hero.dirY = input.y; tryMove(hero, input.x * hero.speed * dt, input.y * hero.speed * dt); }
    if (input.attack) attack(hero);
    if (input.interact && !hero._interactHeld) interact(hero);
    hero._interactHeld = input.interact;
  }

  function updateEnemy(enemy, dt) {
    if (!enemy.alive) return;
    enemy.hit = Math.max(0, enemy.hit - dt); enemy.attackCd = Math.max(0, enemy.attackCd - dt); enemy.wobble += dt * (enemy.type === 'bat' ? 7 : 4);
    let target = null, bestDistance = enemy.type === 'golem' ? 230 : 195;
    for (const hero of state.heroes) {
      if (hero.downTimer > 0) continue;
      const d = dist(enemy, hero);
      if (d < bestDistance) { target = hero; bestDistance = d; }
    }
    if (!target) return;
    const d = Math.max(1, dist(enemy, target));
    if (d > enemy.r + target.r + 3) tryMove(enemy, ((target.x - enemy.x) / d) * enemy.speed * dt, ((target.y - enemy.y) / d) * enemy.speed * dt);
    else if (enemy.attackCd <= 0) {
      enemy.attackCd = enemy.type === 'golem' ? 1.55 : 1.25;
      target.hp -= enemy.damage; target.hitFlash = .24; spawnBurst(target.x, target.y, colors.red, enemy.type === 'golem' ? 10 : 6);
      if (target.hp <= 0) target.downTimer = 2.8;
    }
  }

  function evaluateRoom() {
    const cfg = roomConfig();
    const clearOkay = !cfg.requiresClear || allEnemiesDead();

    if (cfg.type === 'lever') {
      const allOn = state.levers.length && state.levers.every(l => l.on);
      if (allOn && clearOkay) state.roomSolved = true;
    } else if (cfg.type === 'plates') {
      state.plates.forEach(plate => { plate.active = state.heroes.some(hero => hero.downTimer <= 0 && near(hero, plate, 23)); });
      if (state.plates.every(p => p.active) && clearOkay) state.roomSolved = true;
    } else if (cfg.type === 'blocks') {
      if (state.blocks.length && state.blocks.every(b => b.solved) && clearOkay) state.roomSolved = true;
    } else if (cfg.type === 'bridge') {
      if (state.bridgeOn && clearOkay) state.roomSolved = true;
    } else if (cfg.type === 'battle' || cfg.type === 'boss') {
      if (allEnemiesDead()) state.roomSolved = true;
    } else if (cfg.type === 'torches') {
      if (state.torchProgress === state.torches.length && clearOkay) state.roomSolved = true;
    }

    if (state.roomSolved) updateObjective();
  }

  function updateTimedLever(dt) {
    const cfg = roomConfig();
    if (cfg.type !== 'lever' || !cfg.timed || state.roomSolved || !state.levers.some(l => l.on)) return;
    state.timedRemaining -= dt;
    if (state.timedRemaining <= 0 && !state.levers.every(l => l.on)) {
      state.levers.forEach(l => { l.on = false; }); state.timedRemaining = cfg.timed;
      showMessage('Tempo scaduto. I sigilli si spengono.');
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
      difficulty, humans: state.humans, roomIndex: state.roomIndex, roomSolved: state.roomSolved, complete: state.complete, hasKey: state.hasKey,
      elapsed: state.elapsed, roomElapsed: state.roomElapsed, timedRemaining: state.timedRemaining, bridgeOn: state.bridgeOn, chestOpen: state.chestOpen, torchProgress: state.torchProgress,
      levers: state.levers.map(l => ({ on: l.on })), plates: state.plates.map(p => ({ active: p.active })), torches: state.torches.map(t => ({ lit: t.lit })),
      blocks: state.blocks.map(b => ({ x: b.x, y: b.y, solved: b.solved })),
      heroes: state.heroes.map(h => ({ x: h.x, y: h.y, hp: h.hp, dirX: h.dirX, dirY: h.dirY, attackCd: h.attackCd, hitFlash: h.hitFlash, downTimer: h.downTimer, isAI: h.isAI })),
      enemies: state.enemies.map(e => ({ type: e.type, x: e.x, y: e.y, r: e.r, hp: e.hp, maxHp: e.maxHp, speed: e.speed, color: e.color, damage: e.damage, hit: e.hit, attackCd: e.attackCd, alive: e.alive, wobble: e.wobble }))
    };
  }

  function applySnapshot(data) {
    if (!data || !Array.isArray(data.heroes) || !Array.isArray(data.enemies)) return;
    const incomingDifficulty = normalizeDifficulty(data.difficulty || difficulty);
    const roomChanged = incomingDifficulty !== difficulty || Number(data.roomIndex) !== state.roomIndex;
    if (incomingDifficulty !== difficulty) chooseDifficulty(incomingDifficulty);
    if (roomChanged) state = createState(Number(data.roomIndex), !!data.hasKey);
    state.humans = Number(data.humans || 1); state.roomSolved = !!data.roomSolved; state.complete = !!data.complete; state.hasKey = !!data.hasKey;
    state.elapsed = Number(data.elapsed || 0); state.roomElapsed = Number(data.roomElapsed || 0); state.timedRemaining = Number(data.timedRemaining || 0); state.bridgeOn = !!data.bridgeOn; state.chestOpen = !!data.chestOpen; state.torchProgress = Number(data.torchProgress || 0);
    if (Array.isArray(data.levers)) data.levers.forEach((p, i) => { if (state.levers[i]) state.levers[i].on = !!p.on; });
    if (Array.isArray(data.plates)) data.plates.forEach((p, i) => { if (state.plates[i]) state.plates[i].active = !!p.active; });
    if (Array.isArray(data.torches)) data.torches.forEach((t, i) => { if (state.torches[i]) state.torches[i].lit = !!t.lit; });
    if (Array.isArray(data.blocks)) data.blocks.forEach((b, i) => { if (state.blocks[i]) Object.assign(state.blocks[i], b); });
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
      updateTimedLever(dt); evaluateRoom(); updateObjective();
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
    const tint = campaign().tints[state.roomIndex];
    for (let y = 28; y < H - 28; y += TILE) {
      for (let x = 28; x < W - 28; x += TILE) {
        const alt = ((x / TILE + y / TILE) | 0) % 2;
        pxRect(x, y, TILE, TILE, alt ? tint : colors.floorB);
        pxRect(x + 2, y + 2, TILE - 4, 1, '#79647533');
        if (((x * 7 + y * 13 + state.roomIndex * 17) % 101) < 6) { pxRect(x + 9, y + 18, 8, 2, colors.floorCrack); pxRect(x + 15, y + 16, 2, 5, colors.floorCrack); }
      }
    }
  }

  function drawWallRect(r) {
    pxRect(r.x, r.y, r.w, r.h, colors.wallDark); pxRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, colors.wall);
    if (r.w > r.h) pxRect(r.x + 3, r.y + 3, r.w - 6, 7, colors.wallTop); else pxRect(r.x + 3, r.y + 3, 7, r.h - 6, colors.wallTop);
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

  function drawRoomSpecials() {
    const cfg = roomConfig();
    if (cfg.type === 'lever') state.levers.forEach(lever => drawLever(lever, lever.on));
    if (cfg.type === 'plates') {
      state.plates.forEach((p, i) => {
        pxRect(p.x - 26, p.y - 18, 52, 36, '#29252f'); pxRect(p.x - 21, p.y - 13, 42, 26, p.active ? '#6ab59d' : '#72596e');
        ctx.fillStyle = p.active ? '#e9ffdc' : '#d9c6a4'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(['I', 'II', 'III'][i] || String(i + 1), p.x, p.y + 5);
      });
    }
    if (cfg.type === 'blocks') {
      state.blocks.forEach(block => {
        const target = block.target;
        pxRect(target.x - 32, target.y - 32, 64, 64, '#29464a'); pxRect(target.x - 23, target.y - 23, 46, 46, '#467c78');
        pxRect(block.x - 23, block.y - 23, 46, 46, block.solved ? '#4f756f' : '#443a40'); pxRect(block.x - 19, block.y - 19, 38, 38, '#8a746c'); pxRect(block.x - 11, block.y - 5, 22, 10, '#b19579');
      });
    }
    if (cfg.type === 'bridge') {
      pxRect(425, 28, 150, H - 56, colors.water);
      for (let y = 48; y < H - 40; y += 32) pxRect(440, y, 120, 3, '#7eb0b555');
      if (state.bridgeOn) { pxRect(425, 220, 150, 102, '#604936'); for (let x = 432; x < 570; x += 20) pxRect(x, 224, 14, 94, '#8f6948'); }
      drawLever(cfg.bridgeLever, state.bridgeOn);
    }
    if (cfg.type === 'key') drawChest(cfg.chest, state.chestOpen);
    if (cfg.type === 'torches') {
      state.torches.forEach((t, i) => {
        drawFloorTorch(t, t.lit); ctx.fillStyle = '#dbc99f'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(['I', 'II', 'III', 'IV'][i], t.x, t.y + 42);
      });
    }
    drawExit();
  }

  function drawExit() {
    const p = state.exit, open = state.roomSolved, final = state.roomIndex === 7;
    pxRect(p.x - 28, p.y - 48, 56, 96, '#211c26'); pxRect(p.x - 21, p.y - 41, 42, 82, final ? '#665776' : '#6e584d'); pxRect(p.x - 13, p.y - 31, 26, 62, open ? (final ? '#71bfa8' : '#8b7458') : '#3b3038');
    if (open) { const pulse = Math.round(Math.sin(state.elapsed * 4) * 3); pxRect(p.x - 7 - pulse, p.y - 22 - pulse, 14 + pulse * 2, 44 + pulse * 2, final ? '#9ce6c5aa' : '#d1a86a66'); }
  }

  function drawDecor() {
    decorTemplates[state.roomIndex].forEach((torch, i) => {
      pxRect(torch.x - 3, torch.y + 6, 6, 13, '#624331'); const flame = Math.sin(state.elapsed * 7 + i) * 2;
      pxRect(torch.x - 5, torch.y - 2 + flame, 10, 10, '#e57a45'); pxRect(torch.x - 3, torch.y - 5 + flame, 6, 10, '#f2b64d');
    });
  }

  function drawHero(hero, index) {
    const down = hero.downTimer > 0, bob = down ? 0 : Math.round(Math.sin(hero.bob) * 1), x = Math.round(hero.x), y = Math.round(hero.y + bob);
    pxRect(x - 13, y + 10, 26, 8, colors.shadow);
    if (down) { pxRect(x - 16, y + 2, 31, 9, hero.palette.body); pxRect(x + 7, y - 2, 9, 9, hero.palette.skin); return; }
    pxRect(x - 9, y + 8, 7, 10, hero.palette.dark); pxRect(x + 2, y + 8, 7, 10, hero.palette.dark); pxRect(x - 11, y - 5, 22, 18, hero.hitFlash > 0 ? '#fff1cf' : hero.palette.body); pxRect(x - 8, y - 16, 16, 13, hero.palette.skin); pxRect(x - 10, y - 18, 20, 6, hero.palette.dark); pxRect(x - 11, y + 1, 22, 3, hero.palette.trim);
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
    pxRect(x - e.r, y + e.r * .55, e.r * 2, Math.max(5, e.r * .35), colors.shadow); const body = e.hit > 0 ? '#fff0cc' : e.color;
    if (e.type === 'slime') { pxRect(x - 14, y - 6, 28, 16, body); pxRect(x - 10, y - 13, 20, 9, body); pxRect(x - 7, y - 5, 4, 4, '#22352a'); pxRect(x + 4, y - 5, 4, 4, '#22352a'); }
    else if (e.type === 'skeleton') { pxRect(x - 8, y - 18, 16, 14, body); pxRect(x - 10, y - 5, 20, 16, '#6b6257'); pxRect(x - 5, y - 13, 3, 3, '#29242a'); pxRect(x + 3, y - 13, 3, 3, '#29242a'); }
    else if (e.type === 'bat') { pxRect(x - 9, y - 5, 18, 12, body); pxRect(x - 22, y - 10, 14, 9, body); pxRect(x + 8, y - 10, 14, 9, body); pxRect(x - 4, y - 1, 3, 3, '#f0d187'); pxRect(x + 2, y - 1, 3, 3, '#f0d187'); }
    else { pxRect(x - 26, y - 20, 52, 46, body); pxRect(x - 20, y - 33, 40, 20, '#7c5d48'); pxRect(x - 13, y - 24, 7, 7, '#f0b35e'); pxRect(x + 6, y - 24, 7, 7, '#f0b35e'); pxRect(x - 34, y - 12, 12, 33, '#6e5547'); pxRect(x + 22, y - 12, 12, 33, '#6e5547'); }
    const bars = Math.min(e.maxHp, 14);
    for (let i = 0; i < bars; i++) pxRect(x - bars * 3 + i * 6, y - e.r - 13, 4, 3, i < Math.ceil((e.hp / e.maxHp) * bars) ? '#d5656b' : '#49373d');
  }

  function drawHUD() {
    pxRect(38, 38, 355, 32, '#151219cc'); ctx.textAlign = 'left'; ctx.fillStyle = campaign().accent; ctx.font = 'bold 13px monospace';
    ctx.fillText(`${difficultyLabel()} · STANZA ${state.roomIndex + 1}/8 · ${roomConfig().name.toUpperCase()}`, 50, 58);
    pxRect(38, 76, 170, 26, '#151219aa'); ctx.fillStyle = '#b9aa92'; ctx.font = 'bold 11px monospace'; ctx.fillText(`SQUADRA ${state.humans}/3`, 50, 94);
    if (state.hasKey) { pxRect(820, 42, 96, 28, '#151219cc'); ctx.fillStyle = '#f2ddb8'; ctx.fillText('CHIAVE', 850, 60); }
    if (state.complete) {
      pxRect(250, 205, 460, 130, '#17131bea'); ctx.textAlign = 'center'; ctx.fillStyle = campaign().accent; ctx.font = 'bold 30px monospace'; ctx.fillText(`${difficultyLabel()} COMPLETATO!`, 480, 250);
      ctx.fillStyle = '#d1c3a8'; ctx.font = 'bold 14px monospace'; ctx.fillText('Otto stanze superate insieme.', 480, 282); ctx.fillText('Scegli un’altra difficoltà dal menu.', 480, 307);
    }
  }

  function draw() {
    drawFloor(); drawDecor(); roomWalls().forEach(drawWallRect); drawRoomSpecials(); state.enemies.forEach(drawEnemy); state.heroes.forEach(drawHero); state.particles.forEach(p => pxRect(p.x, p.y, p.size, p.size, p.color)); drawHUD();
  }

  function frame(now) {
    const dt = Math.min(.033, (now - lastTime) / 1000 || 0); lastTime = now; update(dt); if (mode !== 'idle') draw(); requestAnimationFrame(frame);
  }

  function setRoster(players) {
    connectedSlots = new Set((players || []).map(p => Number(p.slot)).filter(v => v >= 0 && v <= 2));
    if (!connectedSlots.size) connectedSlots.add(0); applyRosterFlags();
  }

  difficultySelect?.addEventListener('change', () => chooseDifficulty(difficultySelect.value));
  if (difficultySelect) difficultySelect.value = difficulty;

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
    startSolo() { chooseDifficulty(difficultySelect?.value || difficulty); mode = 'solo'; localSlot = 0; connectedSlots = new Set([0]); resetWorld(); },
    startOnline(info) {
      localSlot = Number(info.slot || 0); mode = info.isHost ? 'host' : 'guest';
      if (info.isHost) chooseDifficulty(difficultySelect?.value || difficulty);
      setRoster(info.players); resetWorld(); if (mode === 'guest') showMessage(`Sei l’eroe ${localSlot + 1}. Attendo la difficoltà dell’host…`);
    },
    updateOnlineRoster(players) { if (mode === 'host' || mode === 'guest') setRoster(players); },
    receiveRemoteInput(slotValue, input) { if (mode === 'host') remoteInputs[Number(slotValue)] = { ...neutralInput(), ...input }; },
    receiveSnapshot(data) { if (mode === 'guest') applySnapshot(data); },
    restartOnline() { if (mode === 'guest') resetWorld(); },
    networkClosed() { showMessage('Connessione alla stanza terminata.', 3); },
    returnToMenu() { mode = 'idle'; keys.clear(); }
  });

  requestAnimationFrame(frame);
})();
