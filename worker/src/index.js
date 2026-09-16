import { DurableObject } from 'cloudflare:workers';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders }
  });
}

function roomCode() {
  let value = '';
  for (let i = 0; i < 6; i++) value += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return value;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    if (request.method === 'POST' && url.pathname === '/rooms') {
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = roomCode();
        const stub = env.ROOMS.getByName(code);
        const response = await stub.fetch('https://room.internal/init', { method: 'POST' });
        if (response.status === 201) return json({ room: code }, 201);
      }
      return json({ error: 'Impossibile creare la stanza.' }, 503);
    }

    const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{4,8})\/ws$/i);
    if (request.method === 'GET' && match) {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return json({ error: 'WebSocket upgrade richiesto.' }, 426);
      }
      const code = match[1].toUpperCase();
      const stub = env.ROOMS.getByName(code);
      return stub.fetch(request);
    }

    if (url.pathname === '/health') return json({ ok: true, service: 'tinydungeon-room' });
    return json({ error: 'Not found' }, 404);
  }
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.sessions = new Map();
    for (const ws of ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (attachment) this.sessions.set(ws, attachment);
    }
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/init') {
      const initialized = await this.ctx.storage.get('initialized');
      if (initialized) return new Response('exists', { status: 409 });
      await this.ctx.storage.put({ initialized: true, started: false });
      return new Response('created', { status: 201 });
    }

    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('WebSocket upgrade required', { status: 426 });
    }

    const initialized = await this.ctx.storage.get('initialized');
    if (!initialized) return new Response('Room not found', { status: 404 });
    if (await this.ctx.storage.get('started')) return new Response('Game already started', { status: 409 });
    if (this.sessions.size >= 3) return new Response('Room full', { status: 409 });

    const usedSlots = new Set([...this.sessions.values()].map(session => session.slot));
    const slot = [0, 1, 2].find(value => !usedSlots.has(value));
    const host = this.sessions.size === 0;
    const rawName = url.searchParams.get('name') || 'Avventuriero';
    const name = rawName.replace(/[<>]/g, '').trim().slice(0, 18) || 'Avventuriero';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const attachment = { id: crypto.randomUUID(), name, slot, host };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);
    this.sessions.set(server, attachment);

    server.send(JSON.stringify({ type: 'welcome', room: this.roomFromUrl(request.url), slot, host, players: this.roster() }));
    this.broadcast({ type: 'roster', players: this.roster() });

    return new Response(null, { status: 101, webSocket: client });
  }

  roomFromUrl(value) {
    const match = new URL(value).pathname.match(/^\/rooms\/([A-Z0-9]{4,8})\/ws$/i);
    return match ? match[1].toUpperCase() : '';
  }

  roster() {
    return [...this.sessions.values()]
      .map(({ name, slot, host }) => ({ name, slot, host }))
      .sort((a, b) => a.slot - b.slot);
  }

  broadcast(payload, except = null) {
    const text = JSON.stringify(payload);
    for (const ws of this.sessions.keys()) {
      if (ws === except) continue;
      try { ws.send(text); } catch { /* stale socket */ }
    }
  }

  hostSocket() {
    for (const [ws, session] of this.sessions) if (session.host) return ws;
    return null;
  }

  async webSocketMessage(ws, raw) {
    const session = this.sessions.get(ws) || ws.deserializeAttachment();
    if (!session || typeof raw !== 'string') return;

    let message;
    try { message = JSON.parse(raw); } catch { return; }

    if (message.type === 'start' && session.host) {
      await this.ctx.storage.put('started', true);
      this.broadcast({ type: 'start', players: this.roster() });
      return;
    }

    if (message.type === 'input' && !session.host) {
      const host = this.hostSocket();
      if (host) host.send(JSON.stringify({ type: 'input', slot: session.slot, input: message.input || {} }));
      return;
    }

    if (message.type === 'snapshot' && session.host) {
      this.broadcast({ type: 'snapshot', state: message.state }, ws);
      return;
    }

    if (message.type === 'restart' && session.host) this.broadcast({ type: 'restart' });
  }

  async webSocketClose(ws, code, reason) {
    const session = this.sessions.get(ws) || ws.deserializeAttachment();
    this.sessions.delete(ws);
    try { ws.close(code, reason); } catch { /* already closed */ }

    if (session?.host) {
      await this.ctx.storage.put('started', false);
      this.broadcast({ type: 'error', message: 'L’host ha lasciato la stanza.' });
      for (const peer of this.sessions.keys()) {
        try { peer.close(1012, 'Host left'); } catch { /* noop */ }
      }
      this.sessions.clear();
      return;
    }

    this.broadcast({ type: 'roster', players: this.roster() });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011, 'WebSocket error');
  }
}
