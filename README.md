# TinyDungeon

TinyDungeon è un piccolo dungeon crawler cooperativo 16-bit pensato per 1-3 giocatori, con ritmo tranquillo, piccoli puzzle, combattimenti leggeri e compagni AI per gli slot non occupati.

## Architettura

TinyDungeon viene distribuito **solo su Cloudflare Workers**.

Un singolo deployment pubblica:

- il frontend statico da `public/` tramite Cloudflare Workers Static Assets;
- il backend realtime da `worker/src/index.js`;
- le stanze multiplayer tramite Durable Objects e WebSocket;
- lo stato di coordinamento della room nello stesso Durable Object.

Frontend e multiplayer condividono lo stesso origin, quindi non serve configurare URL esterni o usare GitHub Pages.

## Modalità

- **Solo**: 1 giocatore + 2 compagni AI.
- **Stanza online**: fino a 3 giocatori umani; gli slot liberi restano AI.
- Il creatore della stanza è l'host autorevole della simulazione.
- Gli altri giocatori inviano input; l'host distribuisce snapshot dello stato.
- Il link della stanza contiene `?room=CODICE` ed è copiabile dalla lobby.

## Sviluppo locale

```bash
cd worker
npm install
npm run dev
```

Wrangler serve sia gli asset in `../public` sia le API/WebSocket del Worker.

## Deploy Cloudflare

```bash
cd worker
npm install
npm run deploy
```

Il file `worker/wrangler.jsonc` è la source of truth del deployment. Il servizio si chiama `tinydungeon` e include nello stesso deploy Static Assets + Durable Object `Room`.

Dopo il deploy non è necessario modificare `config.js`: il client usa automaticamente `window.location.origin` per creare e raggiungere le stanze multiplayer.

## Struttura

```text
public/
  index.html
  styles.css
  config.js
  network.js
  game.js
worker/
  package.json
  wrangler.jsonc
  src/index.js
```

## Vertical slice

La slice attuale include tre eroi, AI semplice, slime, leva, cancello, forziere, chiave, portale, controlli desktop/touch, menu iniziale e lobby condivisibile.
