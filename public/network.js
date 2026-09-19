(() => {
  'use strict';

  const menuScreen = document.getElementById('menuScreen');
  const lobbyScreen = document.getElementById('lobbyScreen');
  const gameScreen = document.getElementById('gameScreen');
  const nicknameInput = document.getElementById('nickname');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const menuStatus = document.getElementById('menuStatus');
  const lobbyStatus = document.getElementById('lobbyStatus');
  const roomCodeLabel = document.getElementById('roomCodeLabel');
  const roomTitle = document.getElementById('roomTitle');
  const playerList = document.getElementById('playerList');
  const startRoomBtn = document.getElementById('startRoomBtn');
  const roomBadge = document.getElementById('roomBadge');

  let socket = null;
  let adapter = null;
  let roomCode = '';
  let slot = 0;
  let isHost = false;
  let players = [];
  let started = false;
  let selectedHero = localStorage.getItem('tinyDungeon.hero') || 'warrior';
  let pendingAutoJoin = new URLSearchParams(location.search).get('room') || '';

  const storedName = localStorage.getItem('tinyDungeon.nickname');
  nicknameInput.value = storedName || `Avventuriero${Math.floor(10 + Math.random() * 90)}`;
  if (pendingAutoJoin) roomCodeInput.value = normalizeRoom(pendingAutoJoin);

  function normalizeRoom(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  function apiBase() {
    const configured = String(window.TINY_DUNGEON_CONFIG?.multiplayerApiBase || '').trim().replace(/\/$/, '');
    if (configured) return configured;
    if (location.hostname.endsWith('.workers.dev')) return location.origin;
    return '';
  }

  function saveNickname() {
    const value = nicknameInput.value.trim().slice(0, 18) || 'Avventuriero';
    nicknameInput.value = value;
    localStorage.setItem('tinyDungeon.nickname', value);
    return value;
  }

  function setScreen(name) {
    menuScreen.classList.toggle('hidden', name !== 'menu');
    lobbyScreen.classList.toggle('hidden', name !== 'lobby');
    gameScreen.classList.toggle('hidden', name !== 'game');
  }

  function setQueryRoom(code) {
    const url = new URL(location.href);
    if (code) url.searchParams.set('room', code);
    else url.searchParams.delete('room');
    history.replaceState({}, '', url);
  }

  function shareUrl() {
    const url = new URL(location.href);
    url.searchParams.set('room', roomCode);
    return url.toString();
  }

  const heroLabels = { warrior: 'GUERRIERO', archer: 'ARCIERE', mage: 'MAGO' };
  function setHeroPicker(containerId, hero, online = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const occupied = new Set(online ? players.filter(p => p.slot !== slot && p.hero).map(p => p.hero) : []);
    container.querySelectorAll('[data-hero]').forEach(button => {
      const value = button.dataset.hero;
      button.classList.toggle('selected', value === hero);
      button.disabled = occupied.has(value);
    });
  }
  function chooseHero(hero, online = false) {
    if (!heroLabels[hero]) return;
    selectedHero = hero; localStorage.setItem('tinyDungeon.hero', hero);
    setHeroPicker('soloHeroPicker', selectedHero, false);
    if (online) send({ type: 'hero', hero });
  }
  document.getElementById('soloHeroPicker')?.addEventListener('click', e => { const b=e.target.closest('[data-hero]'); if(b) chooseHero(b.dataset.hero); });
  document.getElementById('coopHeroPicker')?.addEventListener('click', e => { const b=e.target.closest('[data-hero]'); if(b && !b.disabled) chooseHero(b.dataset.hero, true); });
  setHeroPicker('soloHeroPicker', selectedHero, false);

  function renderLobby() {
    roomCodeLabel.textContent = roomCode || '------';
    roomTitle.textContent = isHost ? 'La tua stanza' : 'Stanza condivisa';
    playerList.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const player = players.find(p => p.slot === i);
      const row = document.createElement('div');
      row.className = `player-slot${player ? '' : ' empty'}`;
      if (player) {
        const you = player.slot === slot ? ' · TU' : '';
        const host = player.host ? ' · HOST' : '';
        row.innerHTML = `<span class="slot-name">${escapeHtml(player.name)}</span><span class="slot-meta">${player.hero ? heroLabels[player.hero] : 'SCEGLI EROE'}${host}${you}</span>`;
      } else {
        row.innerHTML = `<span class="slot-name">Compagno AI</span><span class="slot-meta">EROE ${i + 1} · SLOT LIBERO</span>`;
      }
      playerList.appendChild(row);
    }
    startRoomBtn.classList.toggle('hidden', !isHost);
    const me = players.find(p => p.slot === slot);
    if (me?.hero) selectedHero = me.hero;
    setHeroPicker('coopHeroPicker', selectedHero, true);
    startRoomBtn.disabled = !isHost || !socket || socket.readyState !== WebSocket.OPEN || players.some(p => !p.hero);
    lobbyStatus.textContent = `${players.length}/3 giocatori · gli slot liberi saranno gestiti dall'AI`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  async function createRoom() {
    const base = apiBase();
    if (!base) {
      menuStatus.textContent = 'Multiplayer non ancora configurato: imposta multiplayerApiBase in config.js.';
      return;
    }
    menuStatus.textContent = 'Creo la stanza…';
    try {
      const response = await fetch(`${base}/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: saveNickname() }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      await connectRoom(normalizeRoom(data.room));
    } catch (error) {
      menuStatus.textContent = `Impossibile creare la stanza (${error.message}).`;
    }
  }

  async function joinRoom(code) {
    const normalized = normalizeRoom(code);
    if (!normalized) {
      menuStatus.textContent = 'Inserisci un codice stanza.';
      return;
    }
    if (!apiBase()) {
      menuStatus.textContent = 'Multiplayer non ancora configurato: imposta multiplayerApiBase in config.js.';
      return;
    }
    menuStatus.textContent = 'Entro nella stanza…';
    await connectRoom(normalized);
  }

  function connectRoom(code) {
    return new Promise((resolve, reject) => {
      disconnect(false);
      roomCode = code;
      const name = saveNickname();
      const base = apiBase();
      const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
      const url = `${wsBase}/rooms/${encodeURIComponent(code)}/ws?name=${encodeURIComponent(name)}`;
      socket = new WebSocket(url);

      socket.addEventListener('open', () => {
        setQueryRoom(code);
        resolve();
      }, { once: true });

      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        handleMessage(message);
      });

      socket.addEventListener('close', event => {
        if (started) adapter?.networkClosed?.();
        else if (event.code !== 1000) menuStatus.textContent = event.reason || 'Connessione alla stanza terminata.';
        socket = null;
      });

      socket.addEventListener('error', () => {
        menuStatus.textContent = 'Errore di connessione alla stanza.';
        reject(new Error('WebSocket'));
      }, { once: true });
    });
  }

  function handleMessage(message) {
    switch (message.type) {
      case 'welcome':
        slot = message.slot;
        isHost = !!message.host;
        players = Array.isArray(message.players) ? message.players : [];
        roomCode = normalizeRoom(message.room || roomCode);
        started = false;
        setScreen('lobby');
        renderLobby();
        send({ type: 'hero', hero: selectedHero });
        break;
      case 'roster':
        players = Array.isArray(message.players) ? message.players : [];
        if (!started) renderLobby();
        adapter?.updateOnlineRoster?.(players);
        break;
      case 'hero-rejected':
        players = Array.isArray(message.players) ? message.players : players;
        lobbyStatus.textContent = 'Questo eroe è già stato scelto. Scegline un altro.';
        renderLobby();
        break;
      case 'start':
        players = Array.isArray(message.players) ? message.players : players;
        started = true;
        setScreen('game');
        roomBadge.textContent = `STANZA ${roomCode} · ${players.length}/3`;
        roomBadge.classList.remove('hidden');
        adapter?.startOnline?.({ room: roomCode, slot, isHost, players, hero: selectedHero });
        break;
      case 'input':
        if (isHost && started) adapter?.receiveRemoteInput?.(message.slot, message.input || {});
        break;
      case 'snapshot':
        if (!isHost && started) adapter?.receiveSnapshot?.(message.state);
        break;
      case 'restart':
        if (started) adapter?.restartOnline?.();
        break;
      case 'error':
        if (!started) {
          menuStatus.textContent = message.message || 'Impossibile entrare nella stanza.';
          setScreen('menu');
        }
        break;
    }
  }

  function disconnect(clearRoom = true) {
    if (socket) {
      try { socket.close(1000, 'leave'); } catch { /* noop */ }
      socket = null;
    }
    roomCode = '';
    players = [];
    isHost = false;
    started = false;
    if (clearRoom) setQueryRoom('');
  }

  function startSolo() {
    saveNickname();
    disconnect(true);
    roomBadge.classList.add('hidden');
    setScreen('game');
    adapter?.startSolo?.({ hero: selectedHero });
  }

  function returnToMenu() {
    disconnect(true);
    setScreen('menu');
    wizardStep2?.classList.add('hidden'); wizardStep1?.classList.remove('hidden');
    adapter?.returnToMenu?.();
  }

  function send(payload) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  const wizardStep1 = document.getElementById('wizardStep1');
  const wizardStep2 = document.getElementById('wizardStep2');
  document.getElementById('wizardNextBtn')?.addEventListener('click', () => {
    saveNickname();
    wizardStep1?.classList.add('hidden');
    wizardStep2?.classList.remove('hidden');
  });
  document.getElementById('wizardBackBtn')?.addEventListener('click', () => {
    wizardStep2?.classList.add('hidden');
    wizardStep1?.classList.remove('hidden');
  });

  document.getElementById('soloBtn').addEventListener('click', startSolo);
  document.getElementById('createRoomBtn').addEventListener('click', createRoom);
  document.getElementById('joinRoomBtn').addEventListener('click', () => joinRoom(roomCodeInput.value));
  roomCodeInput.addEventListener('input', () => { roomCodeInput.value = normalizeRoom(roomCodeInput.value); });
  roomCodeInput.addEventListener('keydown', event => { if (event.key === 'Enter') joinRoom(roomCodeInput.value); });
  document.getElementById('copyLinkBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      lobbyStatus.textContent = 'Link copiato negli appunti.';
    } catch {
      lobbyStatus.textContent = shareUrl();
    }
  });
  startRoomBtn.addEventListener('click', () => send({ type: 'start' }));
  document.getElementById('leaveRoomBtn').addEventListener('click', returnToMenu);
  document.getElementById('backMenuBtn').addEventListener('click', returnToMenu);

  window.TinyDungeonNet = {
    registerGame(gameAdapter) {
      adapter = gameAdapter;
      if (pendingAutoJoin) {
        const room = normalizeRoom(pendingAutoJoin);
        pendingAutoJoin = '';
        setTimeout(() => joinRoom(room), 0);
      }
    },
    sendInput(input) { if (!isHost && started) send({ type: 'input', input }); },
    broadcastSnapshot(state) { if (isHost && started) send({ type: 'snapshot', state }); },
    requestRestart() { if (isHost && started) send({ type: 'restart' }); },
    isOnline() { return started; },
    isHost() { return isHost; },
    localSlot() { return slot; },
    players() { return players.slice(); },
    returnToMenu
  };
})();
