(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const playerCountSelect = document.getElementById('playerCount');
  const restartBtn = document.getElementById('restartBtn');
  const objectiveEl = document.getElementById('objective');
  const messageEl = document.getElementById('message');

  const W = canvas.width;
  const H = canvas.height;
  const TILE = 32;
  const keys = new Set();
  const touch = { up: false, down: false, left: false, right: false, attack: false, interact: false };

  const colors = {
    floorA: '#564451', floorB: '#4d3d49', floorCrack: '#3f323d', wall: '#2d2834', wallTop: '#6c5868', wallHi: '#8e7180', wallDark: '#1b1820',
    gold: '#e8b866', green: '#72b091', blue: '#75a9cb', red: '#c95c68', ink: '#f7e4bf', shadow: '#17131a99', slime: '#76bd72'
  };

  const controls = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', attack: 'KeyF', interact: 'KeyE' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', attack: 'Enter', interact: 'ShiftRight' },
    { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', attack: 'KeyO', interact: 'KeyP' }
  ];

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

  let state;
  let msgTimer = 0;
  let lastTime = performance.now();

  function createHero(name, x, y, palette, speed) {
    return { name, x, y, r: 14, hp: 5, maxHp: 5, speed, palette, dirX: 1, dirY: 0, attackCd: 0, hitFlash: 0, downTimer: 0, isAI: true, bob: Math.random() * Math.PI * 2 };
  }

  function resetGame() {
    const humans = Number(playerCountSelect.value || 1);
    state = {
      humans,
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
    state.heroes.forEach((h, i) => { h.isAI = i >= humans; });
    objectiveEl.textContent = 'Trova la leva, recupera la chiave e raggiungi il portale.';
    showMessage(humans === 1 ? 'Knight + 2 compagni AI' : humans === 2 ? 'Due eroi + Mage AI' : 'Tre giocatori locali');
  }

  function showMessage(text, seconds = 1.8) {
    messageEl.textContent = text;
    messageEl.classList.add('show');
    msgTimer = seconds;
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function near(a, b, range) { return dist(a, b) <= range; }

  function collidesCircleRect(x, y, r, rect) {
    const cx = clamp(x, rect.x, rect.x + rect.w);
    const cy = clamp(y, rect.y, rect.y + rect.h);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  }

  function activeWalls() {
    if (state.leverOn) return staticWalls;
    return staticWalls.concat([{ x: 616, y: 208, w: 36, h: 124 }]);
  }

  function tryMove(entity, dx, dy) {
    if (!dx && !dy) return;
    const walls = activeWalls();
    let nx = entity.x + dx;
    if (!walls.some(w => collidesCircleRect(nx, entity.y, entity.r, w))) entity.x = nx;
    let ny = entity.y + dy;
    if (!walls.some(w => collidesCircleRect(entity.x, ny, entity.r, w))) entity.y = ny;
  }

  function humanInput(index) {
    const c = controls[index];
    let x = (keys.has(c.right) ? 1 : 0) - (keys.has(c.left) ? 1 : 0);
    let y = (keys.has(c.down) ? 1 : 0) - (keys.has(c.up) ? 1 : 0);
    if (index === 0) {
      x += (touch.right ? 1 : 0) - (touch.left ? 1 : 0);
      y += (touch.down ? 1 : 0) - (touch.up ? 1 : 0);
    }
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len, moving: !!(x || y), attack: keys.has(c.attack) || (index === 0 && touch.attack), interact: keys.has(c.interact) || (index === 0 && touch.interact) };
  }

  function nearestAliveEnemy(hero, maxRange = Infinity) {
    let best = null, bestD = maxRange;
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const d = dist(hero, e);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  function nearestActiveHuman(hero) {
    let best = state.heroes[0], bestD = Infinity;
    for (let i = 0; i < state.humans; i++) {
      const h = state.heroes[i];
      if (h.downTimer > 0) continue;
      const d = dist(hero, h);
      if (d < bestD) { best = h; bestD = d; }
    }
    return best;
  }

  function attack(hero) {
    if (hero.attackCd > 0 || hero.downTimer > 0) return;
    hero.attackCd = 0.48;
    let hitAny = false;
    for (const e of state.enemies) {
      if (!e.alive || dist(hero, e) > 52) continue;
      const dot = ((e.x - hero.x) * hero.dirX + (e.y - hero.y) * hero.dirY) / Math.max(1, dist(hero, e));
      if (dot < -0.2) continue;
      e.hp -= 1;
      e.hit = 0.15;
      hitAny = true;
      spawnBurst(e.x, e.y, '#f1d18a', 7);
      const d = Math.max(1, dist(hero, e));
      tryMove(e, ((e.x - hero.x) / d) * 18, ((e.y - hero.y) / d) * 18);
      if (e.hp <= 0) { e.alive = false; spawnBurst(e.x, e.y, '#83c87d', 12); }
    }
    if (!hitAny) spawnBurst(hero.x + hero.dirX * 28, hero.y + hero.dirY * 28, '#d9c6a4', 3);
  }

  function interact(hero) {
    if (hero.downTimer > 0) return;
    if (!state.leverOn && near(hero, state.lever, 52)) {
      state.leverOn = true;
      objectiveEl.textContent = 'Il cancello è aperto. Cerca il forziere oltre la sala.';
      showMessage('CLACK! Il cancello si apre.');
      spawnBurst(state.lever.x, state.lever.y, colors.gold, 10);
      return;
    }
    if (state.leverOn && !state.chestOpen && near(hero, state.chest, 58)) {
      state.chestOpen = true;
      state.hasKey = true;
      objectiveEl.textContent = 'Hai la chiave antica. Raggiungi il portale a sud-est.';
      showMessage('Hai trovato la CHIAVE ANTICA!');
      spawnBurst(state.chest.x, state.chest.y - 12, '#ffe394', 14);
      return;
    }
    if (near(hero, state.portal, 62)) {
      if (!state.hasKey) {
        showMessage('Il portale è sigillato. Serve una chiave.');
      } else if (!state.complete) {
        state.complete = true;
        objectiveEl.textContent = 'Dungeon completato!';
        showMessage('TinyDungeon completato ✦', 4);
        spawnBurst(state.portal.x, state.portal.y, '#91d9c4', 26);
      }
    }
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
        showMessage(`${hero.name} è tornato in piedi.`);
      }
      return;
    }

    let mx = 0, my = 0, wantsAttack = false, wantsInteract = false;
    if (!hero.isAI) {
      const input = humanInput(index);
      mx = input.x; my = input.y; wantsAttack = input.attack; wantsInteract = input.interact;
    } else {
      const enemy = nearestAliveEnemy(hero, 112);
      const leader = nearestActiveHuman(hero);
      if (enemy) {
        const d = Math.max(1, dist(hero, enemy));
        if (d > 43) { mx = (enemy.x - hero.x) / d; my = (enemy.y - hero.y) / d; }
        else wantsAttack = true;
      } else if (leader) {
        const desired = index === 1 ? { x: -34, y: 34 } : { x: -34, y: -34 };
        const tx = leader.x + desired.x, ty = leader.y + desired.y;
        const d = Math.hypot(tx - hero.x, ty - hero.y);
        if (d > 28) { mx = (tx - hero.x) / d; my = (ty - hero.y) / d; }
      }
    }

    if (mx || my) {
      hero.dirX = mx; hero.dirY = my;
      tryMove(hero, mx * hero.speed * dt, my * hero.speed * dt);
    }
    if (wantsAttack) attack(hero);
    if (wantsInteract && !hero._interactHeld) interact(hero);
    hero._interactHeld = wantsInteract;
  }

  function updateEnemy(e, dt) {
    if (!e.alive) return;
    e.hit = Math.max(0, e.hit - dt);
    e.attackCd = Math.max(0, e.attackCd - dt);
    e.wobble += dt * 4;
    let target = null, bestD = 185;
    for (const h of state.heroes) {
      if (h.downTimer > 0) continue;
      const d = dist(e, h);
      if (d < bestD) { target = h; bestD = d; }
    }
    if (!target) return;
    const d = Math.max(1, dist(e, target));
    if (d > e.r + target.r + 3) {
      tryMove(e, ((target.x - e.x) / d) * e.speed * dt, ((target.y - e.y) / d) * e.speed * dt);
    } else if (e.attackCd <= 0) {
      e.attackCd = 1.25;
      target.hp -= 1;
      target.hitFlash = 0.22;
      spawnBurst(target.x, target.y, '#d56a70', 6);
      if (target.hp <= 0) {
        target.downTimer = 2.8;
        showMessage(`${target.name} è a terra…`);
      }
    }
  }

  function spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 25 + Math.random() * 65;
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .35 + Math.random() * .35, color, size: 2 + Math.floor(Math.random() * 3) });
    }
  }

  function updateParticles(dt) {
    for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .94; p.vy *= .94; p.life -= dt; }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function update(dt) {
    state.elapsed += dt;
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) messageEl.classList.remove('show');
    }
    if (!state.complete) {
      state.heroes.forEach((h, i) => updateHero(h, i, dt));
      state.enemies.forEach(e => updateEnemy(e, dt));
    }
    updateParticles(dt);
  }

  function pxRect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

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
    // Rugs and room accents.
    pxRect(54, 214, 162, 106, '#3f3f59');
    pxRect(60, 220, 150, 94, '#5b526f');
    for (let x = 66; x < 205; x += 18) pxRect(x, 230, 8, 74, '#76637d');
    pxRect(696, 355, 196, 104, '#3b594f');
    pxRect(702, 361, 184, 92, '#4e7262');
  }

  function drawWallRect(r) {
    pxRect(r.x, r.y, r.w, r.h, colors.wallDark);
    pxRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, colors.wall);
    if (r.w > r.h) {
      pxRect(r.x + 3, r.y + 3, r.w - 6, 7, colors.wallTop);
      for (let x = r.x + 10; x < r.x + r.w - 12; x += 36) pxRect(x, r.y + 12, 22, 4, '#554653');
    } else {
      pxRect(r.x + 3, r.y + 3, 7, r.h - 6, colors.wallTop);
      for (let y = r.y + 12; y < r.y + r.h - 12; y += 36) pxRect(r.x + 12, y, 4, 22, '#554653');
    }
  }

  function drawWalls() {
    staticWalls.forEach(drawWallRect);
    if (!state.leverOn) {
      pxRect(616, 208, 36, 124, '#17131b');
      for (let y = 211; y < 328; y += 22) {
        pxRect(620, y, 28, 8, '#9c7a55');
        pxRect(622, y + 2, 24, 2, '#d0a66f');
      }
    } else {
      pxRect(618, 205, 32, 7, '#9c7a55');
      pxRect(618, 328, 32, 7, '#9c7a55');
    }
  }

  function drawTorch(t, i) {
    pxRect(t.x - 3, t.y + 6, 6, 13, '#624331');
    pxRect(t.x - 5, t.y + 16, 10, 4, '#32241e');
    const f = Math.sin(state.elapsed * 7 + i) * 2;
    pxRect(t.x - 5, t.y - 2 + f, 10, 10, '#e57a45');
    pxRect(t.x - 3, t.y - 5 + f, 6, 10, '#f2b64d');
    pxRect(t.x - 1, t.y - 2 + f, 3, 6, '#fff0a1');
  }

  function drawDecor() {
    decor.torches.forEach(drawTorch);
    decor.mushrooms.forEach((m, i) => {
      pxRect(m.x - 2, m.y, 4, 7, '#d5c79f');
      pxRect(m.x - 6, m.y - 4, 12, 6, i % 2 ? '#b45c69' : '#7f6aa2');
      pxRect(m.x - 2, m.y - 3, 2, 2, '#f5c7b0');
    });
    decor.bones.forEach(b => {
      pxRect(b.x - 8, b.y, 16, 4, '#bcae91'); pxRect(b.x - 10, b.y - 2, 4, 8, '#bcae91'); pxRect(b.x + 7, b.y - 2, 4, 8, '#bcae91');
    });
  }

  function drawLever() {
    const l = state.lever;
    pxRect(l.x - 13, l.y + 8, 26, 8, '#2c2227');
    pxRect(l.x - 10, l.y + 5, 20, 6, '#7b6353');
    const ex = state.leverOn ? l.x + 8 : l.x - 8;
    pxRect(l.x - 2, l.y - 13, 4, 20, '#b7a17c');
    pxRect(Math.min(l.x, ex) - 1, l.y - 15, Math.abs(ex - l.x) + 3, 4, '#b7a17c');
    pxRect(ex - 4, l.y - 19, 8, 8, state.leverOn ? '#71b98d' : '#cf6b61');
  }

  function drawChest() {
    const c = state.chest;
    pxRect(c.x - 19, c.y - 4, 38, 25, '#39281f');
    pxRect(c.x - 16, c.y - 1, 32, 19, '#9a6139');
    if (!state.chestOpen) {
      pxRect(c.x - 16, c.y - 13, 32, 14, '#ba7944');
      pxRect(c.x - 13, c.y - 10, 26, 5, '#da9955');
    } else {
      pxRect(c.x - 16, c.y - 22, 32, 10, '#ba7944');
      pxRect(c.x - 13, c.y - 20, 26, 3, '#da9955');
    }
    pxRect(c.x - 3, c.y + 3, 6, 9, '#e4bd64');
  }

  function drawPortal() {
    const p = state.portal;
    const active = state.hasKey;
    const pulse = 2 + Math.sin(state.elapsed * 3) * 2;
    pxRect(p.x - 29, p.y + 22, 58, 9, '#29222e');
    pxRect(p.x - 24, p.y - 28, 10, 52, '#665776');
    pxRect(p.x + 14, p.y - 28, 10, 52, '#665776');
    pxRect(p.x - 19, p.y - 32, 38, 9, '#756582');
    pxRect(p.x - 13 - pulse, p.y - 20 - pulse, 26 + pulse * 2, 40 + pulse * 2, active ? '#61b59b66' : '#774f6866');
    pxRect(p.x - 8, p.y - 16, 16, 32, active ? '#8cdec1' : '#8a6375');
    pxRect(p.x - 4, p.y - 12, 8, 24, active ? '#d3f5d9' : '#b18a99');
  }

  function drawHero(h, index) {
    const down = h.downTimer > 0;
    const bob = down ? 0 : Math.round(Math.sin(h.bob) * 1);
    const x = Math.round(h.x), y = Math.round(h.y + bob);
    pxRect(x - 13, y + 10, 26, 8, colors.shadow);
    if (down) {
      pxRect(x - 16, y + 2, 31, 9, h.palette.body); pxRect(x + 7, y - 2, 9, 9, h.palette.skin); return;
    }
    const flash = h.hitFlash > 0;
    pxRect(x - 9, y + 8, 7, 10, h.palette.dark); pxRect(x + 2, y + 8, 7, 10, h.palette.dark);
    pxRect(x - 11, y - 5, 22, 18, flash ? '#fff1cf' : h.palette.body);
    pxRect(x - 8, y - 16, 16, 13, h.palette.skin);
    pxRect(x - 10, y - 18, 20, 6, h.palette.dark);
    pxRect(x - 7, y - 11, 3, 3, '#2b2530'); pxRect(x + 4, y - 11, 3, 3, '#2b2530');
    pxRect(x - 11, y + 1, 22, 3, h.palette.trim);
    if (index === 0) { // sword
      pxRect(x + 12, y - 2, 3, 18, '#c9ced0'); pxRect(x + 9, y + 8, 9, 3, '#e2c36d');
    } else if (index === 1) { // dagger/hood
      pxRect(x - 8, y - 20, 16, 5, h.palette.body); pxRect(x + 12, y + 3, 3, 11, '#d7d4c4');
    } else { // staff/hat
      pxRect(x - 9, y - 23, 18, 5, h.palette.body); pxRect(x - 4, y - 28, 8, 7, h.palette.body); pxRect(x + 13, y - 10, 3, 27, '#795637'); pxRect(x + 10, y - 15, 9, 9, '#75c6c0');
    }
    drawHearts(h, x, y - 34);
    if (h.isAI) {
      pxRect(x - 9, y + 24, 18, 7, '#17131bcc');
      ctx.fillStyle = '#c9bda5'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillText('AI', x, y + 30);
    }
    if (h.attackCd > .31) {
      ctx.strokeStyle = '#f0d191'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 31, Math.atan2(h.dirY, h.dirX) - .55, Math.atan2(h.dirY, h.dirX) + .55); ctx.stroke();
    }
  }

  function drawHearts(h, x, y) {
    const hp = Math.max(0, h.hp);
    for (let i = 0; i < h.maxHp; i++) {
      const xx = x - ((h.maxHp * 6) / 2) + i * 6;
      pxRect(xx, y, 4, 4, i < hp ? '#dc6470' : '#47343e');
    }
  }

  function drawEnemy(e) {
    if (!e.alive) return;
    const x = Math.round(e.x), y = Math.round(e.y + Math.sin(e.wobble) * 2);
    pxRect(x - 15, y + 9, 30, 7, colors.shadow);
    const body = e.hit > 0 ? '#eff2cb' : colors.slime;
    pxRect(x - 14, y - 6, 28, 16, body); pxRect(x - 10, y - 13, 20, 9, body);
    pxRect(x - 7, y - 5, 4, 4, '#22352a'); pxRect(x + 4, y - 5, 4, 4, '#22352a');
    pxRect(x - 3, y + 2, 6, 2, '#4e6d4f');
    for (let i = 0; i < e.maxHp; i++) pxRect(x - e.maxHp * 3 + i * 6, y - 21, 4, 3, i < e.hp ? '#d5656b' : '#49373d');
  }

  function drawParticles() {
    for (const p of state.particles) pxRect(p.x, p.y, p.size, p.size, p.color);
  }

  function drawHUD() {
    pxRect(38, 38, 192, 32, '#151219cc');
    ctx.textAlign = 'left'; ctx.fillStyle = '#f2ddb8'; ctx.font = 'bold 13px monospace';
    ctx.fillText(`SQUADRA ${state.humans}/3`, 50, 58);
    const alive = state.enemies.filter(e => e.alive).length;
    ctx.fillStyle = '#b9aa92'; ctx.fillText(`SLIME ${alive}`, 150, 58);
    if (state.hasKey) {
      pxRect(820, 42, 96, 28, '#151219cc');
      pxRect(831, 50, 12, 8, '#e4bd64'); pxRect(840, 47, 4, 14, '#e4bd64');
      ctx.fillStyle = '#f2ddb8'; ctx.fillText('CHIAVE', 850, 60);
    }
    if (state.complete) {
      pxRect(250, 218, 460, 105, '#17131bea');
      ctx.textAlign = 'center'; ctx.fillStyle = '#f3d38b'; ctx.font = 'bold 30px monospace'; ctx.fillText('DUNGEON COMPLETATO!', 480, 260);
      ctx.fillStyle = '#d1c3a8'; ctx.font = 'bold 14px monospace'; ctx.fillText('Una piccola avventura, non una corsa.', 480, 290);
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
    drawParticles();
    drawHUD();
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
  }, { passive: false });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.querySelectorAll('[data-touch]').forEach(btn => {
    const key = btn.dataset.touch;
    const on = e => { e.preventDefault(); touch[key] = true; };
    const off = e => { e.preventDefault(); touch[key] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });

  restartBtn.addEventListener('click', resetGame);
  playerCountSelect.addEventListener('change', resetGame);

  resetGame();
  requestAnimationFrame(frame);
})();
