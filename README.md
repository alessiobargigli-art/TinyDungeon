# TinyDungeon

TinyDungeon è un piccolo dungeon crawler cooperativo 16-bit pensato per 1-3 giocatori.

## Visione

- vista top-down 16-bit
- ritmo tranquillo, leggibile e adatto anche a bambini
- stanze compatte con piccoli puzzle, leve, chiavi, casse e combattimenti leggeri
- 1 giocatore + 2 compagni AI, 2 giocatori + 1 AI, oppure 3 giocatori umani
- nessun ruolo obbligatorio: tutti possono muoversi, combattere e interagire
- sessioni brevi, idealmente 10-15 minuti

## Modalità

### Solo

`Gioca da solo` avvia subito il dungeon con il Knight controllato dal giocatore e Rogue/Mage gestiti dall'AI.

### Multiplayer online

Il menu permette di creare una stanza o entrare con un codice. Ogni stanza supporta fino a 3 giocatori:

- il creatore è l'host
- gli slot non occupati sono gestiti dall'AI
- il link contiene `?room=CODICE` ed è condivisibile con il pulsante `Copia link`
- aprendo il link il client prova automaticamente a entrare nella stanza
- l'host avvia la partita dalla lobby

Il modello è host-authoritative: l'host simula mondo, nemici e AI; gli altri client inviano gli input e ricevono snapshot dello stato. Il relay realtime è un Cloudflare Worker con un Durable Object per stanza.

## Client statico

La root del repository può essere pubblicata direttamente con GitHub Pages. Per l'avvio locale:

```bash
python -m http.server 8080
```

Poi aprire `http://localhost:8080`.

## Backend Cloudflare

Il backend si trova in `worker/`.

```bash
cd worker
npm install
npx wrangler login
npm run deploy
```

Dopo il deploy, copiare l'URL HTTPS restituito da Wrangler in `config.js`:

```js
window.TINY_DUNGEON_CONFIG = {
  multiplayerApiBase: 'https://tinydungeon-room.<account>.workers.dev'
};
```

Endpoint principali:

- `GET /health`
- `POST /rooms`
- `GET /rooms/:code/ws` con upgrade WebSocket

La configurazione usa Durable Objects con storage SQLite e lifecycle dichiarativo tramite `exports` in `worker/wrangler.jsonc`.

## Vertical slice

La slice corrente contiene:

- mini-dungeon giocabile con leva, cancello, forziere, chiave e portale
- tre eroi 16-bit: Knight, Rogue e Mage
- controlli desktop e touch
- slime lenti e combattimento leggero
- compagni AI per gli slot liberi
- menu iniziale, lobby e stanze condivisibili
