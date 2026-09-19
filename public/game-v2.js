(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const restartBtn = document.getElementById('restartBtn');
  const objectiveEl = document.getElementById('objective');
  const messageEl = document.getElementById('message');
  const difficultySelect = document.getElementById('difficultySelect');
  const gameMenuMapNameEl = document.getElementById('gameMenuMapName');
  const gameMenuCampaignEl = document.getElementById('gameMenuCampaign');
  const W = canvas.width;
  const H = canvas.height;
  const TILE = 32;
  const keys = new Set();
  const touch = { up: false, down: false, left: false, right: false, attack: false, interact: false };

  const sfxVolumeSlider = document.getElementById('sfxVolumeSlider');
  const sfxVolumeValue = document.getElementById('sfxVolumeValue');
  const musicVolumeSlider = document.getElementById('musicVolumeSlider');
  const musicVolumeValue = document.getElementById('musicVolumeValue');
  const muteBtn = document.getElementById('muteBtn');
  // Audio profile v2: old builds stored much louder defaults on iPad/PWA.
  // Migrate once, then never overwrite the player's later adjustments.
  const AUDIO_PROFILE_KEY = 'tinyDungeon.audioProfile';
  if (localStorage.getItem(AUDIO_PROFILE_KEY) !== '2') {
    const oldMusic = Number(localStorage.getItem('tinyDungeon.musicVolume'));
    const oldSfx = Number(localStorage.getItem('tinyDungeon.sfxVolume'));
    if (!Number.isFinite(oldMusic) || oldMusic > .12) localStorage.setItem('tinyDungeon.musicVolume', '.03');
    if (!Number.isFinite(oldSfx) || oldSfx > .7) localStorage.setItem('tinyDungeon.sfxVolume', '.35');
    localStorage.setItem(AUDIO_PROFILE_KEY, '2');
  }
  let sfxVolume = Math.max(0, Math.min(1, Number(localStorage.getItem('tinyDungeon.sfxVolume') ?? .35)));
  let musicVolume = Math.max(0, Math.min(1, Number(localStorage.getItem('tinyDungeon.musicVolume') ?? .03)));
  let audioMuted = localStorage.getItem('tinyDungeon.muted') === 'true';
  let audioCtx = null;
  function audio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, duration, type = 'square', volume = .035, slideTo = null, delay = 0) {
    try {
      const ac = audio(), now = ac.currentTime + delay, osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, now);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      gain.gain.setValueAtTime(audioMuted ? 0.0001 : Math.max(0.0001, Math.min(1, volume * sfxVolume * 1.35)), now); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(gain); gain.connect(ac.destination); osc.start(now); osc.stop(now + duration);
    } catch (_) { /* Audio is optional when browser autoplay policy blocks it. */ }
  }
  function sfx(name) {
    if (name === 'sword') { tone(210, .055, 'square', .04, 120); tone(760, .035, 'triangle', .025, 430, .025); }
    else if (name === 'shield') { tone(115, .09, 'square', .045, 70); tone(330, .045, 'triangle', .02, 180); }
    else if (name === 'bow') { tone(520, .055, 'triangle', .03, 180); tone(980, .025, 'square', .012, 620, .015); }
    else if (name === 'arrowHit') { tone(190, .045, 'triangle', .025, 105); tone(1100, .018, 'square', .012, 600); }
    else if (name === 'mageCharge') { tone(180, .16, 'sine', .018, 620); tone(310, .13, 'triangle', .012, 920, .08); }
    else if (name === 'lightning') { tone(1450, .06, 'sawtooth', .035, 180); tone(820, .12, 'square', .025, 90, .025); }
  }

  let dungeonMusic = null;
  let dungeonMusicTrack = '';
  let previousDungeonMusicTrack = '';
  let musicManifest = null;

  async function loadMusicManifest() {
    if (musicManifest) return musicManifest;
    try {
      const response = await fetch('./music/manifest.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('manifest');
      const data = await response.json();
      musicManifest = Array.isArray(data.tracks) ? data.tracks.filter(name => typeof name === 'string' && name.trim()) : [];
    } catch (_) { musicManifest = []; }
    return musicManifest;
  }

  function playDungeonMusicFromLoadedManifest() {
    const tracks = musicManifest || [];
    if (!tracks.length) return false;
    if (!dungeonMusic) {
      const choices = tracks.length > 1 ? tracks.filter(track => track !== previousDungeonMusicTrack) : tracks;
      dungeonMusicTrack = choices[Math.floor(Math.random() * choices.length)] || tracks[0];
      previousDungeonMusicTrack = dungeonMusicTrack;
      dungeonMusic = new Audio(`./music/${encodeURIComponent(dungeonMusicTrack)}`);
      dungeonMusic.loop = true; dungeonMusic.volume = audioMuted ? 0 : musicVolume * musicVolume; dungeonMusic.preload = 'auto';
    }
    dungeonMusic.play().catch(() => {});
    return true;
  }

  function changeDungeonMusicForLevel() {
    if (!musicManifest?.length) { startDungeonMusic(); return; }
    if (dungeonMusic) { dungeonMusic.pause(); dungeonMusic.currentTime = 0; }
    dungeonMusic = null;
    dungeonMusicTrack = '';
    playDungeonMusicFromLoadedManifest();
  }

  async function startDungeonMusic() {
    if (playDungeonMusicFromLoadedManifest()) return;
    await loadMusicManifest();
    playDungeonMusicFromLoadedManifest();
  }

  function unlockDungeonAudio() {
    // Mobile Safari/Chrome require media playback to start inside a user gesture.
    // The manifest is preloaded while the menu is visible, so this call stays synchronous.
    playDungeonMusicFromLoadedManifest();
    try { audio(); } catch (_) { /* optional WebAudio unlock */ }
  }

  loadMusicManifest();
  document.addEventListener('pointerdown', unlockDungeonAudio, { once: true, passive: true });
  document.addEventListener('keydown', unlockDungeonAudio, { once: true });

  function stopDungeonMusic() {
    if (dungeonMusic) { dungeonMusic.pause(); dungeonMusic.currentTime = 0; }
    dungeonMusic = null; dungeonMusicTrack = '';
  }

  function applyAudioSettings() {
    if (dungeonMusic) dungeonMusic.volume = audioMuted ? 0 : musicVolume * musicVolume;
    if (sfxVolumeSlider) sfxVolumeSlider.value = String(Math.round(sfxVolume * 100));
    if (sfxVolumeValue) sfxVolumeValue.textContent = `${Math.round(sfxVolume * 100)}%`;
    if (musicVolumeSlider) musicVolumeSlider.value = String(Math.round(musicVolume * 100));
    if (musicVolumeValue) musicVolumeValue.textContent = `${Math.round(musicVolume * 100)}%`;
    if (muteBtn) {
      muteBtn.textContent = audioMuted ? '🔇 Muto' : '🔊 Audio';
      muteBtn.setAttribute('aria-pressed', audioMuted ? 'true' : 'false');
    }
  }

  sfxVolumeSlider?.addEventListener('input', () => {
    sfxVolume = Number(sfxVolumeSlider.value) / 100;
    localStorage.setItem('tinyDungeon.sfxVolume', String(sfxVolume));
    applyAudioSettings();
  });
  musicVolumeSlider?.addEventListener('input', () => {
    musicVolume = Number(musicVolumeSlider.value) / 100;
    localStorage.setItem('tinyDungeon.musicVolume', String(musicVolume));
    applyAudioSettings();
  });
  muteBtn?.addEventListener('click', () => {
    audioMuted = !audioMuted;
    localStorage.setItem('tinyDungeon.muted', String(audioMuted));
    applyAudioSettings();
    if (!audioMuted) unlockDungeonAudio();
  });
  applyAudioSettings();

  document.querySelectorAll('[data-menu-tab]').forEach(tab => tab.addEventListener('click', () => {
    const name = tab.dataset.menuTab;
    document.querySelectorAll('[data-menu-tab]').forEach(item => {
      const active = item === tab;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-menu-panel]').forEach(panel => panel.classList.toggle('hidden', panel.dataset.menuPanel !== name));
  }));

  const colors = {
    floorB: '#4d3d49', floorCrack: '#3f323d', wall: '#2d2834', wallTop: '#6c5868', wallDark: '#1b1820',
    gold: '#e8b866', shadow: '#17131a99', water: '#3c6070', rune: '#78c0c1', red: '#c95c68'
  };

  const spawn = [{ x: 92, y: 270 }, { x: 126, y: 304 }, { x: 126, y: 236 }];

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
    explore: {
      label: 'ESPLORAZIONE', accent: '#8fd3a8', tints: ['#45534f', '#4c4f5b', '#43545b', '#514b58', '#4b5548', '#535044', '#45505a', '#51464c'],
      rooms: [
        { name: 'Il corridoio perduto', type: 'maze', world: { width: 1920, height: 1080 }, startSolved: true, spawn: [{x:90,y:540},{x:125,y:575},{x:125,y:505}], exit: {x:1820,y:540}, extraWalls: [
          {x:350,y:28,w:32,h:310},{x:350,y:510,w:32,h:542},{x:700,y:28,w:32,h:570},{x:700,y:770,w:32,h:282},{x:1050,y:28,w:32,h:300},{x:1050,y:500,w:32,h:552},{x:1400,y:28,w:32,h:590},{x:1400,y:790,w:32,h:262}
        ], enemies: [['slime',520,420,3,32],['bat',880,720,2,56],['skeleton',1220,360,4,36],['slime',1580,700,3,32]], objective: 'Esplora il dungeon e raggiungi la porta a est.' },
        { name: 'Le sale gemelle', type: 'maze', world: { width: 1920, height: 1080 }, startSolved: true, spawn: [{x:100,y:160},{x:135,y:195},{x:135,y:125}], exit: {x:1810,y:920}, extraWalls: [
          {x:300,y:260,w:520,h:32},{x:300,y:260,w:32,h:430},{x:560,y:500,w:520,h:32},{x:1048,y:260,w:32,h:272},{x:850,y:760,w:650,h:32},{x:1468,y:420,w:32,h:372}
        ], enemies: [['bat',460,400,2,58],['slime',760,680,3,33],['skeleton',1180,610,4,38],['bat',1540,830,2,60]], objective: 'Attraversa le sale collegate e trova l’uscita.' },
        { name: 'Il serpente di pietra', type: 'maze', world: { width: 1920, height: 1080 }, startSolved: true, spawn: [{x:95,y:540},{x:130,y:575},{x:130,y:505}], exit: {x:1815,y:540}, extraWalls: [
          {x:280,y:28,w:32,h:650},{x:520,y:400,w:32,h:652},{x:760,y:28,w:32,h:650},{x:1000,y:400,w:32,h:652},{x:1240,y:28,w:32,h:650},{x:1480,y:400,w:32,h:652}
        ], enemies: [['slime',400,820,4,34],['bat',650,220,3,60],['skeleton',900,820,5,39],['bat',1130,220,3,60],['skeleton',1380,820,5,39],['slime',1650,250,4,34]], objective: 'Segui il percorso di pietra fino alla porta.' },
        { name: 'Le quattro corti', type: 'maze', world: { width: 1920, height: 1080 }, startSolved: true, spawn: [{x:100,y:100},{x:135,y:135},{x:170,y:100}], exit: {x:1810,y:970}, extraWalls: [
          {x:470,y:28,w:32,h:360},{x:470,y:560,w:32,h:492},{x:940,y:220,w:32,h:640},{x:1410,y:28,w:32,h:360},{x:1410,y:560,w:32,h:492},
          {x:500,y:520,w:300,h:32},{x:1110,y:520,w:300,h:32}
        ], enemies: [['slime',650,250,4,34],['skeleton',780,760,5,40],['bat',1120,300,3,62],['skeleton',1300,760,5,40],['bat',1600,450,3,62]], objective: 'Supera le quattro corti e raggiungi l’uscita.' },
        { name: 'La cripta lunga', type: 'maze', world: { width: 1920, height: 1080 }, startSolved: true, spawn: [{x:100,y:540},{x:135,y:575},{x:135,y:505}], exit: {x:1810,y:540}, extraWalls: [
          {x:300,y:200,w:500,h:32},{x:300,y:848,w:500,h:32},{x:800,y:200,w:32,h:260},{x:800,y:620,w:32,h:260},
          {x:1080,y:200,w:520,h:32},{x:1080,y:848,w:520,h:32},{x:1080,y:200,w:32,h:260},{x:1080,y:620,w:32,h:260}
        ], enemies: [['skeleton',500,540,5,40],['bat',760,540,3,62],['slime',960,350,4,34],['slime',960,730,4,34],['skeleton',1320,540,5,40],['bat',1570,540,3,62]], objective: 'Percorri la cripta e trova la porta oltre i guardiani.' },
        { name: 'Il dedalo delle torce', type: 'maze', world: { width: 1920, height: 1080 }, startSolved: true, spawn: [{x:100,y:900},{x:135,y:935},{x:135,y:865}], exit: {x:1810,y:150}, extraWalls: [
          {x:320,y:180,w:32,h:872},{x:620,y:28,w:32,h:720},{x:920,y:300,w:32,h:752},{x:1220,y:28,w:32,h:720},{x:1520,y:300,w:32,h:752}
        ], enemies: [['bat',470,850,3,64],['skeleton',770,180,5,41],['bat',1070,850,3,64],['skeleton',1370,180,5,41],['slime',1670,500,4,35]], objective: 'Risali il dedalo fino alla porta illuminata.' },
        { name: 'La via dei guardiani', type: 'maze', world: { width: 1920, height: 1080 }, startSolved: true, spawn: [{x:100,y:540},{x:135,y:575},{x:135,y:505}], exit: {x:1810,y:540}, extraWalls: [
          {x:380,y:28,w:32,h:390},{x:380,y:610,w:32,h:442},{x:760,y:250,w:32,h:802},{x:1140,y:28,w:32,h:802},{x:1520,y:250,w:32,h:802}
        ], enemies: [['skeleton',550,520,6,42],['bat',900,180,4,66],['slime',980,850,5,36],['skeleton',1300,520,6,42],['bat',1680,850,4,66]], objective: 'Trova un varco tra i guardiani e raggiungi la porta.' },
        { name: 'Il grande labirinto', type: 'maze', world: { width: 1920, height: 1080 }, startSolved: true, requiresKey: false, spawn: [{x:100,y:100},{x:135,y:135},{x:170,y:100}], exit: {x:1810,y:970}, extraWalls: [
          {x:280,y:28,w:32,h:500},{x:280,y:700,w:32,h:352},{x:560,y:250,w:32,h:802},{x:840,y:28,w:32,h:620},{x:840,y:820,w:32,h:232},
          {x:1120,y:250,w:32,h:802},{x:1400,y:28,w:32,h:620},{x:1400,y:820,w:32,h:232},{x:1680,y:250,w:32,h:500}
        ], enemies: [['skeleton',430,620,6,43],['bat',700,150,4,67],['slime',980,760,5,37],['skeleton',1260,520,6,43],['bat',1540,760,4,67],['golem',1690,900,12,24]], objective: 'Attraversa il Grande Labirinto e raggiungi il portale finale.' }
      ]
    },
    maze: {
      label: 'LABIRINTI', accent: '#c9a7ff', tints: ['#41394d','#40394f','#3c3a50','#393b51','#373c52','#353d53','#333e54','#303f55'],
      rooms: [
        { name:'Il piccolo dedalo', type:'maze', world:{width:1280,height:720}, startSolved:true, spawn:[{x:90,y:100},{x:125,y:135},{x:125,y:70}], exit:{x:1190,y:620}, extraWalls:[
          {x:280,y:28,w:32,h:330},{x:280,y:500,w:32,h:192},{x:560,y:180,w:32,h:512},{x:840,y:28,w:32,h:390},{x:840,y:550,w:32,h:142}
        ], enemies:[['slime',430,140,3,33],['bat',700,560,2,58],['skeleton',1030,330,4,38]], objective:'Trova l’uscita del piccolo dedalo.' },
        { name:'I corridoi storti', type:'maze', world:{width:1520,height:840}, startSolved:true, spawn:[{x:90,y:740},{x:125,y:775},{x:125,y:705}], exit:{x:1430,y:100}, extraWalls:[
          {x:250,y:160,w:32,h:652},{x:500,y:28,w:32,h:590},{x:750,y:220,w:32,h:592},{x:1000,y:28,w:32,h:590},{x:1250,y:220,w:32,h:592}
        ], enemies:[['slime',380,650,3,34],['bat',620,170,3,60],['skeleton',870,650,4,39],['bat',1120,170,3,60]], objective:'Risali i corridoi fino alla porta.' },
        { name:'La spirale', type:'maze', world:{width:1760,height:990}, startSolved:true, spawn:[{x:100,y:100},{x:135,y:135},{x:170,y:100}], exit:{x:1660,y:890}, extraWalls:[
          {x:260,y:180,w:1200,h:32},{x:260,y:180,w:32,h:610},{x:260,y:758,w:1000,h:32},{x:1228,y:380,w:32,h:410},{x:480,y:380,w:780,h:32},{x:480,y:380,w:32,h:210},{x:480,y:558,w:540,h:32}
        ], enemies:[['slime',390,300,4,34],['bat',700,680,3,61],['skeleton',940,290,5,40],['bat',1180,680,3,62],['slime',1500,470,4,35]], objective:'Segui la spirale senza perdere la strada.' },
        { name:'Le sei camere', type:'maze', world:{width:2000,height:1120}, startSolved:true, spawn:[{x:100,y:560},{x:135,y:595},{x:135,y:525}], exit:{x:1900,y:560}, extraWalls:[
          {x:330,y:28,w:32,h:400},{x:330,y:600,w:32,h:492},{x:660,y:250,w:32,h:842},{x:990,y:28,w:32,h:400},{x:990,y:600,w:32,h:492},{x:1320,y:250,w:32,h:842},{x:1650,y:28,w:32,h:400},{x:1650,y:600,w:32,h:492}
        ], enemies:[['skeleton',480,520,5,40],['slime',800,850,4,35],['bat',820,180,3,63],['skeleton',1150,520,5,41],['bat',1480,180,3,64],['slime',1800,850,4,36]], objective:'Attraversa le sei camere infestate.' },
        { name:'Il dedalo sommerso', type:'maze', world:{width:2240,height:1260}, startSolved:true, spawn:[{x:100,y:1160},{x:135,y:1195},{x:135,y:1125}], exit:{x:2140,y:100}, extraWalls:[
          {x:300,y:220,w:32,h:1012},{x:620,y:28,w:32,h:900},{x:940,y:330,w:32,h:902},{x:1260,y:28,w:32,h:900},{x:1580,y:330,w:32,h:902},{x:1900,y:28,w:32,h:900},
          {x:300,y:600,w:180,h:32}
        ], enemies:[['bat',460,1080,4,64],['skeleton',780,180,5,42],['slime',1100,1050,5,36],['bat',1420,180,4,65],['skeleton',1740,1050,6,42],['bat',2050,450,4,66]], objective:'Attraversa il dedalo sommerso e risali a nord.' },
        { name:'La rete oscura', type:'maze', world:{width:2520,height:1420}, startSolved:true, spawn:[{x:100,y:100},{x:135,y:135},{x:170,y:100}], exit:{x:2420,y:1320}, extraWalls:[
          {x:360,y:28,w:32,h:560},{x:360,y:760,w:32,h:632},{x:720,y:260,w:32,h:1132},{x:1080,y:28,w:32,h:560},{x:1080,y:760,w:32,h:632},{x:1440,y:260,w:32,h:1132},{x:1800,y:28,w:32,h:560},{x:1800,y:760,w:32,h:632},{x:2160,y:260,w:32,h:900}
        ], enemies:[['slime',520,650,5,36,{group:'packA',combatRole:'front'}],['bat',850,180,4,66],['skeleton',1000,1150,6,43,{group:'packA',combatRole:'ranged'}],['bat',1280,650,4,67],['skeleton',1640,1150,6,44,{group:'packB',combatRole:'ranged'}],['slime',1950,650,5,37,{group:'packB',combatRole:'front'}],['bat',2300,1100,4,68]], objective:'Trova la via attraverso la rete oscura.' },
        { name:'Il labirinto dei guardiani', type:'maze', world:{width:2840,height:1600}, startSolved:true, spawn:[{x:100,y:800},{x:135,y:835},{x:135,y:765}], exit:{x:2740,y:800}, extraWalls:[
          {x:350,y:28,w:32,h:600},{x:350,y:800,w:32,h:772},{x:700,y:300,w:32,h:1272},{x:1050,y:28,w:32,h:600},{x:1050,y:800,w:32,h:772},{x:1400,y:300,w:32,h:1272},{x:1750,y:28,w:32,h:600},{x:1750,y:800,w:32,h:772},{x:2100,y:300,w:32,h:1272},{x:2450,y:28,w:32,h:600},{x:2450,y:800,w:32,h:772}
        ], enemies:[['skeleton',520,760,6,44],['bat',850,180,4,68],['slime',900,1350,5,38,{group:'packA',combatRole:'front'}],['skeleton',1220,760,7,45,{group:'packA',combatRole:'ranged'}],['bat',1570,1350,5,69],['skeleton',1920,760,7,45,{group:'packB',combatRole:'ranged'}],['slime',2260,1350,6,39,{group:'packB',combatRole:'front'}],['bat',2600,350,5,70]], objective:'Supera i guardiani e trova l’uscita.' },
        { name:'Il labirinto infinito', type:'maze', world:{width:3200,height:1800}, startSolved:true, spawn:[{x:100,y:100},{x:135,y:135},{x:170,y:100}], exit:{x:3100,y:1700}, extraWalls:[
          {x:320,y:200,w:32,h:1572},{x:640,y:28,w:32,h:1350},{x:960,y:350,w:32,h:1422},{x:1280,y:28,w:32,h:1350},{x:1600,y:350,w:32,h:1422},{x:1920,y:28,w:32,h:1350},{x:2240,y:350,w:32,h:1422},{x:2560,y:28,w:32,h:1350},{x:2880,y:350,w:32,h:1200},
          {x:640,y:900,w:180,h:32},{x:1280,y:650,w:180,h:32},{x:1920,y:1100,w:180,h:32},{x:2560,y:700,w:180,h:32}
        ], enemies:[['skeleton',470,1500,7,46],['bat',800,180,5,70],['slime',1100,1500,6,40,{group:'packA',combatRole:'front'}],['skeleton',1450,800,7,47,{group:'packA',combatRole:'ranged'}],['bat',1770,1500,5,71],['skeleton',2100,500,8,47,{group:'packB',combatRole:'ranged'}],['slime',2420,1500,6,40,{group:'packB',combatRole:'front'}],['bat',2750,500,5,72],['golem',3020,1550,14,25]], objective:'Attraversa il Labirinto Infinito e raggiungi il portale.' }
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
,
    maze2: {
      label:'DEDALI ARCANI', accent:'#b88cff', tints:['#443d55','#3d4c55','#4c4054','#3d514d','#51443d','#413d55','#4c3d49','#3c4554'],
      rooms:[
        {name:'Il bivio spezzato',type:'arcaneMaze',world:{width:1500,height:900},startSolved:true,requiresKey:false,spawn:[{x:90,y:450},{x:125,y:480},{x:125,y:420}],exit:{x:1400,y:450},extraWalls:[{x:300,y:180,w:32,h:540},{x:300,y:180,w:360,h:32},{x:300,y:688,w:360,h:32},{x:630,y:360,w:32,h:360},{x:850,y:28,w:32,h:310},{x:850,y:520,w:32,h:352},{x:1080,y:180,w:300,h:32},{x:1080,y:688,w:300,h:32}],breakableWalls:[{x:630,y:180,w:32,h:180,hp:3}],enemies:[['slime',520,450,4,34,{group:'a',combatRole:'front'}],['skeleton',560,390,5,39,{group:'a',combatRole:'ranged'}]],objective:'Trova il varco nel dedalo. Alcuni muri possono cedere.'},
        {name:'Le porte delle rune',type:'arcaneMaze',world:{width:1700,height:1000},startSolved:true,requiresKey:false,spawn:[{x:100,y:120},{x:135,y:150},{x:135,y:90}],exit:{x:1600,y:880},extraWalls:[{x:260,y:260,w:620,h:32},{x:260,y:260,w:32,h:520},{x:520,y:470,w:620,h:32},{x:1108,y:260,w:32,h:232},{x:820,y:740,w:620,h:32},{x:1408,y:470,w:32,h:302}],mazeLevers:[{x:420,y:650,gate:'g1'}],gates:[{id:'g1',x:880,y:260,w:32,h:210}],enemies:[['slime',680,620,4,34,{group:'a',combatRole:'front'}],['skeleton',740,570,5,40,{group:'a',combatRole:'ranged'}],['bat',790,650,5,60,{group:'a',combatRole:'ranged'}]],objective:'Trova la leva che apre il passaggio runico.'},
        {name:'I cerchi gemelli',type:'arcaneMaze',world:{width:1900,height:1100},startSolved:true,requiresKey:false,spawn:[{x:100,y:550},{x:135,y:580},{x:135,y:520}],exit:{x:1800,y:550},extraWalls:[{x:300,y:180,w:500,h:32},{x:300,y:180,w:32,h:740},{x:300,y:888,w:500,h:32},{x:768,y:180,w:32,h:300},{x:768,y:650,w:32,h:270},{x:1050,y:180,w:520,h:32},{x:1050,y:180,w:32,h:300},{x:1050,y:650,w:32,h:270},{x:1050,y:888,w:520,h:32},{x:1538,y:180,w:32,h:740}],teleports:[{x:520,y:550,to:1},{x:1320,y:550,to:0}],enemies:[['slime',930,500,5,35,{group:'a',combatRole:'front'}],['skeleton',980,430,5,41,{group:'a',combatRole:'ranged'}],['bat',980,570,5,61,{group:'a',combatRole:'ranged'}]],objective:'Usa i portali per attraversare i due anelli.'},
        {name:'Il muro falso',type:'arcaneMaze',world:{width:2100,height:1200},startSolved:true,requiresKey:false,spawn:[{x:100,y:100},{x:135,y:130},{x:135,y:70}],exit:{x:2000,y:1100},extraWalls:[{x:260,y:220,w:700,h:32},{x:260,y:220,w:32,h:700},{x:500,y:460,w:700,h:32},{x:1168,y:220,w:32,h:262},{x:500,y:900,w:700,h:32},{x:1450,y:220,w:32,h:720},{x:1450,y:900,w:420,h:32},{x:1838,y:500,w:32,h:432}],breakableWalls:[{x:1168,y:482,w:32,h:220,hp:4},{x:1450,y:700,w:32,h:200,hp:4}],enemies:[['slime',850,700,5,35,{group:'a',combatRole:'front'}],['skeleton',910,640,6,42,{group:'a',combatRole:'ranged'}],['slime',1600,650,5,35,{group:'b',combatRole:'front'}],['bat',1660,590,6,62,{group:'b',combatRole:'ranged'}]],objective:'Apriti una scorciatoia abbattendo i muri fragili.'},
        {name:'La croce arcana',type:'arcaneMaze',world:{width:2300,height:1300},startSolved:true,requiresKey:false,spawn:[{x:100,y:650},{x:135,y:680},{x:135,y:620}],exit:{x:2200,y:650},extraWalls:[{x:350,y:250,w:32,h:800},{x:350,y:250,w:600,h:32},{x:350,y:1018,w:600,h:32},{x:918,y:250,w:32,h:300},{x:918,y:750,w:32,h:300},{x:1250,y:250,w:32,h:300},{x:1250,y:750,w:32,h:300},{x:1250,y:250,w:600,h:32},{x:1250,y:1018,w:600,h:32},{x:1818,y:250,w:32,h:800}],mazeLevers:[{x:650,y:650,gate:'g1'},{x:1550,y:650,gate:'g2'}],gates:[{id:'g1',x:918,y:550,w:32,h:200},{id:'g2',x:1250,y:550,w:32,h:200}],teleports:[{x:650,y:400,to:1},{x:1550,y:900,to:0}],enemies:[['slime',1080,650,6,36,{group:'a',combatRole:'front'}],['skeleton',1130,580,6,42,{group:'a',combatRole:'ranged'}],['bat',1130,720,6,63,{group:'a',combatRole:'ranged'}]],objective:'Leve e portali aprono la croce del dedalo.'},
        {name:'Le tre imboscate',type:'arcaneMaze',world:{width:2500,height:1450},startSolved:true,requiresKey:false,spawn:[{x:100,y:725},{x:135,y:755},{x:135,y:695}],exit:{x:2400,y:725},extraWalls:[{x:300,y:180,w:32,h:1090},{x:300,y:180,w:550,h:32},{x:300,y:1238,w:550,h:32},{x:818,y:400,w:32,h:870},{x:1100,y:180,w:32,h:800},{x:1100,y:180,w:550,h:32},{x:1618,y:180,w:32,h:800},{x:1900,y:400,w:32,h:870},{x:1900,y:1238,w:400,h:32}],breakableWalls:[{x:818,y:180,w:32,h:220,hp:5}],teleports:[{x:600,y:700,to:1},{x:1450,y:1050,to:0}],enemies:[['slime',650,500,6,36,{group:'a',combatRole:'front'}],['skeleton',710,450,6,43,{group:'a',combatRole:'ranged'}],['slime',1350,650,6,36,{group:'b',combatRole:'front'}],['bat',1410,590,6,64,{group:'b',combatRole:'ranged'}],['slime',2100,800,7,37,{group:'c',combatRole:'front'}],['skeleton',2160,740,7,44,{group:'c',combatRole:'ranged'}],['bat',2160,860,7,65,{group:'c',combatRole:'ranged'}]],objective:'Supera tre squadre coordinate nel grande dedalo.'},
        {name:'Il nodo impossibile',type:'arcaneMaze',world:{width:2800,height:1600},startSolved:true,requiresKey:false,spawn:[{x:100,y:800},{x:135,y:830},{x:135,y:770}],exit:{x:2700,y:800},extraWalls:[{x:300,y:220,w:700,h:32},{x:300,y:220,w:32,h:1160},{x:300,y:1348,w:700,h:32},{x:968,y:220,w:32,h:430},{x:968,y:850,w:32,h:530},{x:1250,y:420,w:32,h:960},{x:1250,y:420,w:650,h:32},{x:1868,y:220,w:32,h:232},{x:1868,y:650,w:32,h:730},{x:2150,y:220,w:32,h:950},{x:2150,y:220,w:400,h:32}],mazeLevers:[{x:650,y:800,gate:'g1'}],gates:[{id:'g1',x:968,y:650,w:32,h:200}],breakableWalls:[{x:1868,y:452,w:32,h:198,hp:5}],teleports:[{x:1450,y:700,to:1},{x:2350,y:1250,to:0}],enemies:[['slime',1100,1050,7,37,{group:'a',combatRole:'front'}],['skeleton',1160,990,7,44,{group:'a',combatRole:'ranged'}],['bat',1160,1110,7,65,{group:'a',combatRole:'ranged'}],['slime',2050,800,7,38,{group:'b',combatRole:'front'}],['skeleton',2110,740,8,45,{group:'b',combatRole:'ranged'}],['bat',2110,860,8,66,{group:'b',combatRole:'ranged'}]],objective:'Sciogli il nodo usando ogni meccanismo imparato.'},
        {name:'Il dedalo del custode',type:'arcaneMaze',world:{width:3200,height:1800},startSolved:false,requiresKey:false,spawn:[{x:100,y:900},{x:135,y:930},{x:135,y:870}],exit:{x:3100,y:900},extraWalls:[{x:320,y:220,w:32,h:1360},{x:320,y:220,w:700,h:32},{x:320,y:1548,w:700,h:32},{x:988,y:450,w:32,h:1130},{x:1250,y:220,w:32,h:1050},{x:1250,y:220,w:650,h:32},{x:1868,y:220,w:32,h:1050},{x:2150,y:450,w:32,h:1130},{x:2150,y:1548,w:700,h:32},{x:2818,y:220,w:32,h:1360}],mazeLevers:[{x:650,y:900,gate:'g1'}],gates:[{id:'g1',x:988,y:250,w:32,h:200}],breakableWalls:[{x:1868,y:1270,w:32,h:278,hp:6}],teleports:[{x:1450,y:900,to:1},{x:2450,y:500,to:0}],enemies:[['slime',1550,700,8,38,{group:'a',combatRole:'front'}],['skeleton',1610,640,8,46,{group:'a',combatRole:'ranged'}],['bat',1610,760,8,67,{group:'a',combatRole:'ranged'}],['golem',2650,900,22,27]],objective:'Apri il dedalo e sconfiggi il Custode finale.'}
      ]
    }  };

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
  let playerHeroBySlot = new Map([[0, 0]]);
  let remoteInputs = {};
  let difficulty = normalizeDifficulty(difficultySelect?.value || localStorage.getItem('tinyDungeon.difficulty') || 'easy');
  let state = createState(0, false);
  let msgTimer = 0;
  let lastTime = performance.now();
  let netInputTimer = 0;
  let snapshotTimer = 0;
  const camera = { x: 0, y: 0 };

  function normalizeDifficulty(value) { return CAMPAIGNS[value] ? value : 'easy'; }
  function campaign() { return CAMPAIGNS[difficulty]; }
  function roomConfig() { return campaign().rooms[state.roomIndex]; }
  function difficultyLabel() { return campaign().label; }
  function worldSize() {
    const world = roomConfig()?.world;
    return { width: Math.max(W, Number(world?.width) || W), height: Math.max(H, Number(world?.height) || H) };
  }
  function roomSpawn(index) { return (roomConfig()?.spawn || spawn)[index] || spawn[index]; }
  function commonWalls() {
    const world = worldSize();
    return [
      { x: 0, y: 0, w: world.width, h: 28 }, { x: 0, y: world.height - 28, w: world.width, h: 28 },
      { x: 0, y: 0, w: 28, h: world.height }, { x: world.width - 28, y: 0, w: 28, h: world.height }
    ];
  }

  function createHero(name, index, palette, speed, cfg) {
    const start = (cfg.spawn || spawn)[index] || spawn[index];
    const maxHp = index === 2 ? 3 : 5;
    return { name, role: index === 0 ? 'warrior' : index === 1 ? 'archer' : 'mage', x: start.x, y: start.y, r: 14, hp: maxHp, maxHp, speed, palette, dirX: 1, dirY: 0, attackCd: 0, charge: 0, charging: false, hitFlash: 0, downTimer: 0, isAI: true, bob: index * 1.7, _interactHeld: false };
  }

  function createEnemy(spec) {
    const [type, x, y, hp, speed, extra = {}] = spec;
    const defaults = ENEMY_DEFAULTS[type];
    const hpMultiplier = difficulty === 'hard' ? 1.45 : difficulty === 'medium' ? 1.3 : difficulty === 'explore' ? 1.25 : 1.2;
    const boostedHp = Math.max(2, Math.ceil(hp * hpMultiplier));
    const boostedSpeed = speed * (difficulty === 'hard' ? 1.12 : difficulty === 'medium' ? 1.08 : 1.05);
    const boss = type === 'golem';
    const elite = !boss && (boostedHp >= 7 || extra.combatRole === 'ranged');
    return { type, x, y, r: defaults.r, hp: boss ? Math.ceil(boostedHp * 2.25) : boostedHp, maxHp: boss ? Math.ceil(boostedHp * 2.25) : boostedHp, speed: boostedSpeed, color: defaults.color, damage: defaults.damage, hit: 0, attackCd: 0, alive: true, wobble: Math.random() * 6, boss, elite, specialCd: boss ? 4 + Math.random() * 2 : elite ? 2.5 + Math.random() * 2 : 0, special: '', specialCharge: 0, specialData: null, ...extra };
  }

  function createState(roomIndex = 0, keepKey = false) {
    const cfg = CAMPAIGNS[difficulty].rooms[roomIndex];
    return {
      difficulty, humans: 1, roomIndex, roomSolved: !!cfg.startSolved, complete: false, hasKey: keepKey,
      elapsed: 0, roomElapsed: 0, particles: [], projectiles: [], effects: [], timedRemaining: cfg.timed || 0,
      heroes: [
        createHero('Knight', 0, { body: '#4778a8', trim: '#d8b36b', skin: '#f0c58f', dark: '#26334c' }, 160, cfg),
        createHero('Archer', 1, { body: '#6ea36b', trim: '#d8d0a2', skin: '#d9a879', dark: '#273b2f' }, 172, cfg),
        createHero('Mage', 2, { body: '#845f9f', trim: '#78c0c1', skin: '#e7b98d', dark: '#382a4b' }, 150, cfg)
      ],
      enemies: (cfg.enemies || []).map(createEnemy),
      levers: (cfg.levers || []).map(p => ({ ...p, on: false })),
      bridgeOn: false,
      chestOpen: false,
      plates: (cfg.plates || []).map(p => ({ ...p, active: false })),
      blocks: (cfg.blocks || []).map(b => ({ x: b.x, y: b.y, r: 24, target: { x: b.tx, y: b.ty, r: 30 }, solved: false })),
      torches: (cfg.torches || []).map(p => ({ ...p, lit: false })),
      mazeLevers: (cfg.mazeLevers || []).map(p => ({ ...p, on: false })),
      breakableWalls: (cfg.breakableWalls || []).map((w,i) => ({ ...w, id:i, hp:w.hp || 3, alive:true })),
      teleportCooldown: 0,
      torchProgress: 0,
      exit: cfg.exit ? { ...cfg.exit } : { x: 870, y: 270 }
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
    showMessage(`${difficultyLabel()} · STANZA ${index + 1}/${campaign().rooms.length} · ${roomConfig().name}`, 2.2);
    changeDungeonMusicForLevel();
  }

  function advanceRoom() {
    if (state.roomIndex < campaign().rooms.length - 1) enterRoom(state.roomIndex + 1);
    else {
      state.complete = true;
      updateObjective();
      showMessage(`${difficultyLabel()} completato ✦`, 4);
      spawnBurst(480, 270, campaign().accent, 30);
    }
  }

  function heroIndex(role) { return role === 'archer' ? 1 : role === 'mage' ? 2 : 0; }
  function applyRosterFlags() {
    if (!state?.heroes) return;
    const humanHeroes = new Set(playerHeroBySlot.values());
    state.humans = humanHeroes.size;
    state.heroes.forEach((hero, index) => { hero.isAI = !humanHeroes.has(index); });
  }

  function allEnemiesDead() { return !state.enemies.length || state.enemies.every(e => !e.alive); }

  function updateGameMenuInfo() {
    if (gameMenuMapNameEl) gameMenuMapNameEl.textContent = roomConfig().name;
    if (gameMenuCampaignEl) gameMenuCampaignEl.textContent = `${difficultyLabel()} · STANZA ${state.roomIndex + 1}/${campaign().rooms.length}`;
  }

  function updateObjective() {
    updateGameMenuInfo();
    if (state.complete) { objectiveEl.textContent = `${difficultyLabel()} completato!`; return; }
    const cfg = roomConfig();
    if (state.roomSolved) { objectiveEl.textContent = state.roomIndex === campaign().rooms.length - 1 ? 'Il portale è aperto. Entra.' : 'La porta è aperta. Raggiungila.'; return; }
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
    const walls = [...commonWalls(), ...(cfg.extraWalls || [])];
    if (state?.breakableWalls) walls.push(...state.breakableWalls.filter(w => w.alive));
    if (cfg.gates && state?.mazeLevers) for (const gate of cfg.gates) {
      const lever = state.mazeLevers.find(l => l.gate === gate.id);
      if (!lever?.on) walls.push(gate);
    }
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
      return true;
    }
    return false;
  }

  function heroOverlapsBlock(hero, x, y) {
    return roomConfig().type === 'blocks' && state.blocks.some(block => Math.hypot(x - block.x, y - block.y) < hero.r + block.r);
  }

  function tryMove(entity, dx, dy) {
    if (!dx && !dy) return;
    const isHero = state.heroes.includes(entity);
    let nx = entity.x + dx;
    if (isHero && !entity.isAI && tryPushBlock(entity, nx, entity.y, dx, 0)) nx = entity.x;
    if (canMoveCircle(nx, entity.y, entity.r) && (!isHero || entity.isAI || !heroOverlapsBlock(entity, nx, entity.y))) entity.x = nx;
    let ny = entity.y + dy;
    if (isHero && !entity.isAI && tryPushBlock(entity, entity.x, ny, 0, dy)) ny = entity.y;
    if (canMoveCircle(entity.x, ny, entity.r) && (!isHero || entity.isAI || !heroOverlapsBlock(entity, entity.x, ny))) entity.y = ny;
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

  function damageEnemy(enemy, amount, color = '#f1d18a') {
    if (!enemy?.alive) return;
    enemy.hp -= amount; enemy.hit = .16;
    spawnBurst(enemy.x, enemy.y, color, enemy.type === 'golem' ? 5 : 7);
    if (enemy.hp <= 0) { enemy.alive = false; spawnBurst(enemy.x, enemy.y, enemy.color, enemy.type === 'golem' ? 28 : 12); }
  }

  function attack(hero) {
    if (hero.attackCd > 0 || hero.downTimer > 0) return;
    if (hero.role === 'mage') {
      if (!hero.charging) { hero.charging = true; hero.charge = 0; sfx('mageCharge'); }
      return;
    }
    if (hero.role === 'archer') {
      hero.attackCd = .42; sfx('bow');
      const len = Math.hypot(hero.dirX, hero.dirY) || 1;
      const dx = hero.dirX / len, dy = hero.dirY / len;
      state.projectiles.push({ kind: 'arrow', x: hero.x + dx * 22, y: hero.y + dy * 22, vx: dx * 430, vy: dy * 430, dirX: dx, dirY: dy, life: 2.2, stuck: 0 });
      return;
    }

    hero.attackCd = .48; sfx('sword');
    let hitAny = false;
    for (const enemy of state.enemies) {
      if (!enemy.alive || dist(hero, enemy) > 58) continue;
      const d = Math.max(1, dist(hero, enemy));
      const dot = ((enemy.x - hero.x) * hero.dirX + (enemy.y - hero.y) * hero.dirY) / d;
      if (dot < -.2) continue;
      damageEnemy(enemy, 1); hitAny = true;
      const push = enemy.type === 'golem' ? 7 : 15;
      tryMove(enemy, ((enemy.x - hero.x) / d) * push, ((enemy.y - hero.y) / d) * push);
    }
    if (hero.role === 'warrior') {
      for (const wall of state.breakableWalls || []) {
        if (!wall.alive) continue;
        const cx=clamp(hero.x,wall.x,wall.x+wall.w), cy=clamp(hero.y,wall.y,wall.y+wall.h);
        if (Math.hypot(hero.x-cx,hero.y-cy)>62) continue;
        wall.hp--; hitAny=true; spawnBurst(cx,cy,'#b69a78',8);
        if(wall.hp<=0){wall.alive=false;spawnBurst(cx,cy,'#d0b18b',22);showMessage('CRASH! Il muro cede.');}
        break;
      }
    }
    if (!hitAny) spawnBurst(hero.x + hero.dirX * 28, hero.y + hero.dirY * 28, '#d9c6a4', 3);
  }

  function fireMage(hero) {
    hero.charging = false; hero.charge = 0; hero.attackCd = .65; sfx('lightning');
    const enemy = nearestAliveEnemy(hero, 270);
    if (!enemy) { spawnBurst(hero.x, hero.y - 12, '#75c6ff', 5); return; }
    state.effects.push({ kind: 'lightning', x1: hero.x, y1: hero.y - 8, x2: enemy.x, y2: enemy.y, life: .18 });
    damageEnemy(enemy, 1, '#8bdcff');
  }

  function projectileHitsObject(p) {
    if (roomWalls().some(w => collidesCircleRect(p.x, p.y, 3, w))) return true;
    if (state.blocks.some(b => dist(p, b) <= b.r + 3)) return true;
    const cfg = roomConfig();
    const props = [...state.levers, ...state.torches];
    if (cfg.chest) props.push(cfg.chest);
    if (cfg.bridgeLever) props.push(cfg.bridgeLever);
    return props.some(o => dist(p, o) <= 15);
  }

  function updateCombatEffects(dt) {
    for (const p of state.projectiles) {
      if (p.stuck > 0) { p.stuck -= dt; p.life = p.stuck; continue; }
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      let hit = false;
      if (p.kind === 'enemyArrow') {
        for (const hero of state.heroes) {
          if (hero.downTimer > 0 || dist(p, hero) > hero.r + 5) continue;
          hurtHero(hero, 1, '#e7b66c'); hit = true; break;
        }
      } else {
        for (const enemy of state.enemies) {
          if (!enemy.alive || dist(p, enemy) > enemy.r + 5) continue;
          damageEnemy(enemy, 1, '#e7d5a8'); hit = true; break;
        }
      }
      if (!hit && p.kind !== 'enemyArrow') {
        const wall=(state.breakableWalls||[]).find(w=>w.alive&&collidesCircleRect(p.x,p.y,4,w));
        if(wall){wall.hp--;hit=true;spawnBurst(p.x,p.y,'#b69a78',6);if(wall.hp<=0){wall.alive=false;spawnBurst(p.x,p.y,'#d0b18b',18);showMessage('CRASH! Il muro cede.');}}
      }
      if (hit || projectileHitsObject(p)) { p.vx = 0; p.vy = 0; p.stuck = .5; sfx('arrowHit'); }
    }
    state.projectiles = state.projectiles.filter(p => p.life > 0);
    for (const e of state.effects) {
      e.life -= dt;
      if (e.damagePending && e.life <= .12) {
        e.damagePending = false;
        if (e.kind === 'enemyLightning') {
          const target = state.heroes.filter(h=>h.downTimer<=0).sort((a,b)=>Math.hypot(a.x-e.x2,a.y-e.y2)-Math.hypot(b.x-e.x2,b.y-e.y2))[0];
          if (target && Math.hypot(target.x-e.x2,target.y-e.y2)<55) hurtHero(target,1,'#9ee7ff');
        } else if (e.kind === 'shockwave') {
          state.heroes.forEach(h=>{if(h.downTimer<=0&&Math.hypot(h.x-e.x,h.y-e.y)<e.r) hurtHero(h,1,'#f0c060');});
        }
      }
      if (e.kind === 'meteor' && e.life <= .12 && !e.impacted) {
        e.impacted=true; state.heroes.forEach(h=>{if(h.downTimer<=0&&Math.hypot(h.x-e.x,h.y-e.y)<e.r) hurtHero(h,1,'#ff8b55');}); spawnBurst(e.x,e.y,'#ff9b55',18);
      }
    }
    state.effects = state.effects.filter(e => e.life > 0);
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

    if (cfg.type === 'arcaneMaze') {
      for (const lever of state.mazeLevers || []) {
        if (lever.on || !near(hero,lever,55)) continue;
        lever.on=true; showMessage('CLACK! Un passaggio si apre.'); spawnBurst(lever.x,lever.y,colors.gold,12); return;
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
      if (state.roomIndex === campaign().rooms.length - 1 && roomConfig().requiresKey !== false && !state.hasKey) { showMessage('Il portale richiede la Chiave Antica.'); return; }
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

    const desiredRange = hero.role === 'mage' ? 215 : hero.role === 'archer' ? 175 : 46;
    const searchRange = hero.role === 'mage' ? 270 : hero.role === 'archer' ? 240 : 135;
    const enemy = nearestAliveEnemy(hero, searchRange);
    if (enemy) {
      const d = Math.max(1, dist(hero, enemy));
      hero.dirX = (enemy.x - hero.x) / d; hero.dirY = (enemy.y - hero.y) / d;
      if (d > desiredRange) return { x: hero.dirX, y: hero.dirY, moving: true, attack: false, interact: false };
      return { ...neutralInput(), attack: true };
    }

    const leader = nearestHuman(hero);
    const offset = index === 1 ? { x: -24, y: 24 } : { x: -24, y: -24 };
    const tx = leader.x + offset.x, ty = leader.y + offset.y;
    const d = Math.hypot(tx - hero.x, ty - hero.y);
    if (d > 18) return { x: (tx - hero.x) / d, y: (ty - hero.y) / d, moving: true, attack: false, interact: false, catchUp: d > 95 };
    return neutralInput();
  }

  function inputForHero(hero, index) {
    if (hero.isAI) return aiInput(hero, index);
    if (index === localSlot) return localInput();
    if (mode === 'host') {
      const remoteSlot = [...playerHeroBySlot.entries()].find(([, heroIdx]) => heroIdx === index)?.[0];
      return remoteInputs[remoteSlot] || neutralInput();
    }
    return neutralInput();
  }

  function updateHero(hero, index, dt) {
    hero.attackCd = Math.max(0, hero.attackCd - dt); hero.hitFlash = Math.max(0, hero.hitFlash - dt); hero.bob += dt * 5;
    if (hero.role === 'mage' && hero.charging) {
      hero.charge = Math.min(1, hero.charge + dt / .9);
      if (hero.charge >= 1) fireMage(hero);
    }
    if (hero.downTimer > 0) {
      hero.downTimer -= dt;
      if (hero.downTimer <= 0) { hero.hp = hero.maxHp; hero.x = roomSpawn(index).x; hero.y = roomSpawn(index).y; }
      return;
    }
    const input = inputForHero(hero, index);
    if (input.moving) { hero.dirX = input.x; hero.dirY = input.y; const moveSpeed = input.catchUp ? hero.speed * 1.18 : hero.speed; tryMove(hero, input.x * moveSpeed * dt, input.y * moveSpeed * dt); }
    if (state.teleportCooldown > 0) state.teleportCooldown=Math.max(0,state.teleportCooldown-dt);
    if (input.moving && state.teleportCooldown<=0 && roomConfig().teleports?.length) {
      const ports=roomConfig().teleports;
      for(let pi=0;pi<ports.length;pi++){const p=ports[pi];if(Math.hypot(hero.x-p.x,hero.y-p.y)<28){const dest=ports[p.to];if(dest){hero.x=dest.x;hero.y=dest.y;state.teleportCooldown=.7;spawnBurst(dest.x,dest.y,'#b88cff',14);}break;}}
    }
    if (input.attack) attack(hero);
    if (input.interact && !hero._interactHeld) interact(hero);
    hero._interactHeld = input.interact;
  }

  function hurtHero(hero, amount, color = colors.red) {
    if (!hero || hero.downTimer > 0) return;
    hero.hp -= amount; hero.hitFlash = .24; spawnBurst(hero.x, hero.y, color, 8);
    if (hero.hp <= 0) hero.downTimer = 2.8;
  }

  function startBossSpecial(enemy) {
    const choices = ['meteors', 'wind', 'charge', 'storm', 'shockwave'];
    enemy.special = choices[Math.floor(Math.random() * choices.length)];
    enemy.specialCharge = enemy.special === 'meteors' || enemy.special === 'storm' ? 2.6 : 2.1;
    const target = state.heroes.filter(h => h.downTimer <= 0).sort((a,b) => dist(enemy,a)-dist(enemy,b))[0];
    enemy.specialData = target ? { x: target.x, y: target.y } : { x: enemy.x, y: enemy.y };
    const labels = { meteors:'PIOGGIA DI METEORE', wind:'VENTO DEVASTANTE', charge:'CARICA DEL TITANO', storm:'TEMPESTA DI FULMINI', shockwave:'ONDA D’URTO' };
    showMessage(`⚠ ${labels[enemy.special]} · PREPARATI!`, enemy.specialCharge);
  }

  function resolveBossSpecial(enemy) {
    const kind = enemy.special, world = worldSize();
    if (kind === 'meteors') {
      for (const hero of state.heroes) {
        if (hero.downTimer > 0) continue;
        const ox = (Math.random()-.5)*90, oy=(Math.random()-.5)*90;
        state.effects.push({kind:'meteor',x:hero.x+ox,y:hero.y+oy,life:.65,r:38});
      }
    } else if (kind === 'wind') {
      for (const hero of state.heroes) {
        if (hero.downTimer > 0) continue;
        const d=Math.max(1,dist(enemy,hero)); tryMove(hero,((hero.x-enemy.x)/d)*135,((hero.y-enemy.y)/d)*135);
      }
      state.effects.push({kind:'wind',x:enemy.x,y:enemy.y,life:.65,r:240});
    } else if (kind === 'charge') {
      const t=enemy.specialData||{x:enemy.x,y:enemy.y}; const d=Math.max(1,Math.hypot(t.x-enemy.x,t.y-enemy.y));
      for(let n=0;n<10;n++) tryMove(enemy,((t.x-enemy.x)/d)*18,((t.y-enemy.y)/d)*18);
      state.heroes.forEach(h=>{if(h.downTimer<=0&&dist(enemy,h)<70) hurtHero(h,2,'#f0a060');});
      state.effects.push({kind:'shockwave',x:enemy.x,y:enemy.y,life:.5,r:75});
    } else if (kind === 'storm') {
      state.heroes.filter(h=>h.downTimer<=0).forEach(h=>state.effects.push({kind:'enemyLightning',x1:enemy.x,y1:enemy.y,x2:h.x,y2:h.y,life:.3,damagePending:true}));
    } else if (kind === 'shockwave') {
      state.effects.push({kind:'shockwave',x:enemy.x,y:enemy.y,life:.55,r:150,damagePending:true});
    }
    enemy.special=''; enemy.specialData=null; enemy.specialCd=5+Math.random()*3;
  }

  function updateEnemy(enemy, dt) {
    if (!enemy.alive) return;
    enemy.hit=Math.max(0,enemy.hit-dt); enemy.attackCd=Math.max(0,enemy.attackCd-dt); enemy.wobble+=dt*(enemy.type==='bat'?7:4);
    if (enemy.special) { enemy.specialCharge-=dt; if(enemy.specialCharge<=0) resolveBossSpecial(enemy); return; }
    if (enemy.specialCd>0) enemy.specialCd-=dt;
    let target=null,bestDistance=enemy.boss?420:enemy.elite?330:195;
    for(const hero of state.heroes){if(hero.downTimer>0)continue;const d=dist(enemy,hero);if(d<bestDistance){target=hero;bestDistance=d;}}
    if(!target)return;
    if (enemy.boss && enemy.specialCd<=0) { startBossSpecial(enemy); return; }
    const d=Math.max(1,dist(enemy,target));
    const ranged = enemy.combatRole === 'ranged' || (enemy.elite && enemy.type !== 'slime');
    if (ranged && d < 145) {
      const dx=(enemy.x-target.x)/d,dy=(enemy.y-target.y)/d;
      tryMove(enemy,dx*enemy.speed*dt*.60,dy*enemy.speed*dt*.60);
      return;
    }
    if (ranged && enemy.group) {
      const front = state.enemies.find(e=>e.alive&&e.group===enemy.group&&e.combatRole==='front');
      if (front && dist(enemy,front)>230) {
        const fd=Math.max(1,dist(enemy,front)); tryMove(enemy,((front.x-enemy.x)/fd)*enemy.speed*dt*.65,((front.y-enemy.y)/fd)*enemy.speed*dt*.65);
      }
    }
    if(enemy.elite && enemy.specialCd<=0 && d>90){
      if(enemy.type==='skeleton'){
        const dx=(target.x-enemy.x)/d,dy=(target.y-enemy.y)/d;
        state.projectiles.push({kind:'enemyArrow',x:enemy.x+dx*20,y:enemy.y+dy*20,vx:dx*270,vy:dy*270,dirX:dx,dirY:dy,life:2.4,stuck:0});
      } else {
        state.effects.push({kind:'enemyLightning',x1:enemy.x,y1:enemy.y,x2:target.x,y2:target.y,life:.28,damagePending:true});
      }
      enemy.specialCd=3+Math.random()*2; return;
    }
    if(d>enemy.r+target.r+3) tryMove(enemy,((target.x-enemy.x)/d)*enemy.speed*dt,((target.y-enemy.y)/d)*enemy.speed*dt);
    else {
      if(target.role==='warrior'){const ex=(enemy.x-target.x)/d,ey=(enemy.y-target.y)/d,facing=target.dirX*ex+target.dirY*ey;if(facing>.35){tryMove(enemy,ex*7,ey*7);if(enemy.attackCd<=0)sfx('shield');}}
      if(enemy.attackCd<=0){enemy.attackCd=enemy.boss?1.7:1.25;hurtHero(target,enemy.damage);}
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
    } else if (cfg.type === 'arcaneMaze') {
      if (!cfg.startSolved && allEnemiesDead()) state.roomSolved = true;
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
      levers: state.levers.map(l => ({ on: l.on })),
      mazeLevers: (state.mazeLevers||[]).map(l=>({on:l.on})), breakableWalls:(state.breakableWalls||[]).map(w=>({hp:w.hp,alive:w.alive})), plates: state.plates.map(p => ({ active: p.active })), torches: state.torches.map(t => ({ lit: t.lit })),
      blocks: state.blocks.map(b => ({ x: b.x, y: b.y, solved: b.solved })),
      heroes: state.heroes.map(h => ({ x: h.x, y: h.y, hp: h.hp, dirX: h.dirX, dirY: h.dirY, attackCd: h.attackCd, charge: h.charge, charging: h.charging, hitFlash: h.hitFlash, downTimer: h.downTimer, isAI: h.isAI })),
      projectiles: state.projectiles.map(p => ({ ...p })), effects: state.effects.map(e => ({ ...e })),
      enemies: state.enemies.map(e => ({ type:e.type,x:e.x,y:e.y,r:e.r,hp:e.hp,maxHp:e.maxHp,speed:e.speed,color:e.color,damage:e.damage,hit:e.hit,attackCd:e.attackCd,alive:e.alive,wobble:e.wobble,boss:e.boss,elite:e.elite,specialCd:e.specialCd,special:e.special,specialCharge:e.specialCharge,specialData:e.specialData,group:e.group,combatRole:e.combatRole }))
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
    state.projectiles = Array.isArray(data.projectiles) ? data.projectiles.map(p => ({ ...p })) : [];
    state.effects = Array.isArray(data.effects) ? data.effects.map(e => ({ ...e })) : [];
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
    updateCombatEffects(dt);
    updateParticles(dt);

    if (mode === 'host') {
      snapshotTimer -= dt;
      if (snapshotTimer <= 0) { snapshotTimer = .05; window.TinyDungeonNet?.broadcastSnapshot(snapshot()); }
    }
  }

  function pxRect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }

  function updateCamera() {
    const hero = state.heroes?.[localSlot] || state.heroes?.[0];
    const world = worldSize();
    if (!hero) { camera.x = 0; camera.y = 0; return; }
    camera.x = clamp(hero.x - W / 2, 0, Math.max(0, world.width - W));
    camera.y = clamp(hero.y - H / 2, 0, Math.max(0, world.height - H));
  }

  function drawFloor() {
    const world = worldSize();
    pxRect(0, 0, world.width, world.height, '#241f28');
    const tint = campaign().tints[state.roomIndex];
    const startX = Math.max(28, Math.floor((camera.x - TILE) / TILE) * TILE);
    const startY = Math.max(28, Math.floor((camera.y - TILE) / TILE) * TILE);
    const endX = Math.min(world.width - 28, camera.x + W + TILE);
    const endY = Math.min(world.height - 28, camera.y + H + TILE);
    for (let y = startY; y < endY; y += TILE) {
      for (let x = startX; x < endX; x += TILE) {
        const alt = ((x / TILE + y / TILE) | 0) % 2;
        pxRect(x, y, TILE, TILE, alt ? tint : colors.floorB);
        pxRect(x + 2, y + 2, TILE - 4, 2, '#ffffff08');
        if (((x * 3 + y * 5) / TILE) % 11 === 0) pxRect(x + 9, y + 19, 10, 2, colors.floorCrack);
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
    if (cfg.type === 'arcaneMaze') {
      (state.breakableWalls||[]).filter(w=>w.alive).forEach(w=>{pxRect(w.x,w.y,w.w,w.h,'#70594e');for(let y=w.y+8;y<w.y+w.h;y+=18)pxRect(w.x+4,y,Math.max(4,w.w-8),3,'#a18470');});
      (state.mazeLevers||[]).forEach(l=>drawLever(l,l.on));
      (cfg.teleports||[]).forEach((p,i)=>{ctx.strokeStyle=i%2?'#70d7d0':'#b88cff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,22+Math.sin(state.elapsed*4+i)*3,0,Math.PI*2);ctx.stroke();});
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
    const p = state.exit, open = state.roomSolved, final = state.roomIndex === campaign().rooms.length - 1;
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
    if (index === 0) {
      pxRect(x + 12, y - 2, 3, 18, '#c9ced0'); pxRect(x + 9, y + 8, 9, 3, '#e2c36d');
      pxRect(x - 17, y - 4, 7, 18, '#687c91'); pxRect(x - 15, y - 2, 3, 14, '#aab5bd');
    } else if (index === 1) {
      pxRect(x - 8, y - 20, 16, 5, hero.palette.body);
      ctx.strokeStyle = '#c89b5d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 11, y, 12, -1.35, 1.35); ctx.stroke();
      pxRect(x + 8, y - 13, 2, 27, '#d7d4c4');
    } else {
      pxRect(x - 9, y - 23, 18, 5, hero.palette.body); pxRect(x - 4, y - 28, 8, 7, hero.palette.body); pxRect(x + 13, y - 10, 3, 27, '#795637'); pxRect(x + 10, y - 15, 9, 9, '#75c6c0');
    }
    for (let i = 0; i < hero.maxHp; i++) pxRect(x - 15 + i * 6, y - 34, 4, 4, i < Math.max(0, hero.hp) ? '#dc6470' : '#47343e');
    if (hero.role === 'mage' && hero.charging) {
      pxRect(x - 20, y - 43, 40, 6, '#17131bcc'); pxRect(x - 18, y - 41, 36 * hero.charge, 2, '#75c6ff');
    }
    if (hero.isAI) { pxRect(x - 9, y + 24, 18, 7, '#17131bcc'); ctx.fillStyle = '#c9bda5'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center'; ctx.fillText('AI', x, y + 30); }
    if (hero.role === 'warrior' && hero.attackCd > .31) { ctx.strokeStyle = '#f0d191'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 31, Math.atan2(hero.dirY, hero.dirX) - .55, Math.atan2(hero.dirY, hero.dirX) + .55); ctx.stroke(); }
  }

  function drawProjectile(p) {
    const angle = Math.atan2(p.dirY, p.dirX), len = 22;
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(angle);
    pxRect(-len / 2, -1, len, 2, '#d8c69a'); pxRect(7, -3, 5, 6, '#d8d4c4'); pxRect(-11, -4, 4, 3, '#8b5f4a'); pxRect(-11, 1, 4, 3, '#8b5f4a');
    ctx.restore();
  }

  function drawEffect(e) {
    if (e.kind === 'meteor') { ctx.strokeStyle='#ff725c'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,Math.PI*2); ctx.stroke(); pxRect(e.x-5,e.y-45*e.life,10,10,'#ffb04f'); return; }
    if (e.kind === 'wind') { ctx.strokeStyle='#bcecff99'; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(e.x,e.y,e.r*(1-e.life),0,Math.PI*2); ctx.stroke(); return; }
    if (e.kind === 'shockwave') { ctx.strokeStyle='#ffd277'; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(e.x,e.y,e.r*(1-e.life),0,Math.PI*2); ctx.stroke(); return; }
    if (e.kind !== 'lightning' && e.kind !== 'enemyLightning') return;
    ctx.strokeStyle = e.kind === 'enemyLightning' ? '#d7a4ff' : '#9ee7ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(e.x1, e.y1);
    const steps = 5;
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = e.x1 + (e.x2 - e.x1) * t, y = e.y1 + (e.y2 - e.y1) * t;
      ctx.lineTo(x + (i % 2 ? 7 : -7), y + (i % 2 ? -5 : 5));
    }
    ctx.lineTo(e.x2, e.y2); ctx.stroke();
  }

  function drawEnemy(e) {
    if (!e.alive) return;
    const x = Math.round(e.x), y = Math.round(e.y + Math.sin(e.wobble) * (e.type === 'bat' ? 5 : 2));
    if (e.boss) {
      ctx.strokeStyle = '#d7a4ff66'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(Math.round(e.x), Math.round(e.y), 420, 0, Math.PI * 2); ctx.stroke();
    }
    pxRect(x - e.r, y + e.r * .55, e.r * 2, Math.max(5, e.r * .35), colors.shadow); const body = e.hit > 0 ? '#fff0cc' : e.color;
    if (e.type === 'slime') { pxRect(x - 14, y - 6, 28, 16, body); pxRect(x - 10, y - 13, 20, 9, body); pxRect(x - 7, y - 5, 4, 4, '#22352a'); pxRect(x + 4, y - 5, 4, 4, '#22352a'); }
    else if (e.type === 'skeleton') { pxRect(x - 8, y - 18, 16, 14, body); pxRect(x - 10, y - 5, 20, 16, '#6b6257'); pxRect(x - 5, y - 13, 3, 3, '#29242a'); pxRect(x + 3, y - 13, 3, 3, '#29242a'); }
    else if (e.type === 'bat') { pxRect(x - 9, y - 5, 18, 12, body); pxRect(x - 22, y - 10, 14, 9, body); pxRect(x + 8, y - 10, 14, 9, body); pxRect(x - 4, y - 1, 3, 3, '#f0d187'); pxRect(x + 2, y - 1, 3, 3, '#f0d187'); }
    else { pxRect(x - 26, y - 20, 52, 46, body); pxRect(x - 20, y - 33, 40, 20, '#7c5d48'); pxRect(x - 13, y - 24, 7, 7, '#f0b35e'); pxRect(x + 6, y - 24, 7, 7, '#f0b35e'); pxRect(x - 34, y - 12, 12, 33, '#6e5547'); pxRect(x + 22, y - 12, 12, 33, '#6e5547'); }
    if (e.special) {
      const max = e.special === 'meteors' || e.special === 'storm' ? 2.6 : 2.1;
      const progress = Math.max(0, 1 - e.specialCharge / max);
      pxRect(x-34,y-e.r-23,68,7,'#1a141ccc'); pxRect(x-32,y-e.r-21,64*progress,3,'#ffb24d');
    } else if (e.elite) { pxRect(x-4,y-e.r-23,8,8,'#b68cff'); }
    const bars = Math.min(e.maxHp, 14);
    for (let i = 0; i < bars; i++) pxRect(x - bars * 3 + i * 6, y - e.r - 13, 4, 3, i < Math.ceil((e.hp / e.maxHp) * bars) ? '#d5656b' : '#49373d');
  }

  function drawHUD() {
    pxRect(38, 38, 355, 32, '#151219cc'); ctx.textAlign = 'left'; ctx.fillStyle = campaign().accent; ctx.font = 'bold 13px monospace';
    ctx.fillText(`${difficultyLabel()} · STANZA ${state.roomIndex + 1}/${campaign().rooms.length} · ${roomConfig().name.toUpperCase()}`, 50, 58);
    pxRect(38, 76, 170, 26, '#151219aa'); ctx.fillStyle = '#b9aa92'; ctx.font = 'bold 11px monospace'; ctx.fillText(`SQUADRA ${state.humans}/3`, 50, 94);
    if (state.hasKey) { pxRect(820, 42, 96, 28, '#151219cc'); ctx.fillStyle = '#f2ddb8'; ctx.fillText('CHIAVE', 850, 60); }
    if (state.complete) {
      pxRect(250, 205, 460, 130, '#17131bea'); ctx.textAlign = 'center'; ctx.fillStyle = campaign().accent; ctx.font = 'bold 30px monospace'; ctx.fillText(`${difficultyLabel()} COMPLETATO!`, 480, 250);
      ctx.fillStyle = '#d1c3a8'; ctx.font = 'bold 14px monospace'; ctx.fillText('Otto stanze superate insieme.', 480, 282); ctx.fillText('Scegli un’altra difficoltà dal menu.', 480, 307);
    }
  }

  function draw() {
    updateCamera();
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-Math.round(camera.x), -Math.round(camera.y));
    drawFloor(); drawDecor(); roomWalls().forEach(drawWallRect); drawRoomSpecials(); state.enemies.forEach(drawEnemy); state.projectiles.forEach(drawProjectile); state.effects.forEach(drawEffect); state.heroes.forEach(drawHero); state.particles.forEach(p => pxRect(p.x, p.y, p.size, p.size, p.color));
    ctx.restore();
    drawHUD();
  }

  function frame(now) {
    const dt = Math.min(.033, (now - lastTime) / 1000 || 0); lastTime = now; update(dt); if (mode !== 'idle') draw(); requestAnimationFrame(frame);
  }

  function setRoster(players) {
    connectedSlots = new Set((players || []).map(p => Number(p.slot)).filter(v => v >= 0 && v <= 2));
    playerHeroBySlot = new Map((players || []).filter(p => p.hero).map(p => [Number(p.slot), heroIndex(p.hero)]));
    applyRosterFlags();
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
    startSolo(info = {}) { chooseDifficulty(difficultySelect?.value || difficulty); mode = 'solo'; localSlot = heroIndex(info.hero); connectedSlots = new Set([0]); playerHeroBySlot = new Map([[0, localSlot]]); stopDungeonMusic(); resetWorld(); startDungeonMusic(); },
    startOnline(info) {
      const networkSlot = Number(info.slot || 0); mode = info.isHost ? 'host' : 'guest';
      if (info.isHost) chooseDifficulty(difficultySelect?.value || difficulty);
      setRoster(info.players); localSlot = playerHeroBySlot.get(networkSlot) ?? heroIndex(info.hero); stopDungeonMusic(); resetWorld(); startDungeonMusic();
      if (mode === 'guest') showMessage(`Giochi come ${state.heroes[localSlot].name}. Attendo la difficoltà dell’host…`);
    },
    updateOnlineRoster(players) { if (mode === 'host' || mode === 'guest') setRoster(players); },
    receiveRemoteInput(slotValue, input) { if (mode === 'host') remoteInputs[Number(slotValue)] = { ...neutralInput(), ...input }; },
    receiveSnapshot(data) { if (mode === 'guest') applySnapshot(data); },
    restartOnline() { if (mode === 'guest') resetWorld(); },
    networkClosed() { showMessage('Connessione alla stanza terminata.', 3); },
    returnToMenu() { mode = 'idle'; keys.clear(); stopDungeonMusic(); }
  });

  requestAnimationFrame(frame);
})();
