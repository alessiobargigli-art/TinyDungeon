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

## Primo dungeon

La vertical slice comprende ora un dungeon completo da **8 stanze**, progettato secondo la regola "una stanza = un problema chiaro":

1. **La leva** — attivare il meccanismo che apre la porta.
2. **Le tre piastre** — occupazione simultanea; i bot aiutano automaticamente quando presenti.
3. **Il blocco runico** — spingere un blocco sul sigillo.
4. **Il ponte** — azionare la leva per attraversare l'acqua.
5. **La guardia** — combattimento leggero contro slime e scheletri.
6. **La chiave** — eliminare i custodi e recuperare la Chiave Antica.
7. **Le tre fiamme** — accendere le torce nell'ordine I, II, III.
8. **Il guardiano** — miniboss Golem di Pietra, lento e leggibile, poi portale finale.

Il progresso di stanza, puzzle, nemici, chiave, boss e personaggi è incluso negli snapshot multiplayer host-authoritative.

## Mobile / PWA

- gameplay ottimizzato per landscape;
- fullscreen quando supportato dal browser;
- installazione PWA su Android e browser compatibili;
- fallback "Aggiungi alla schermata Home" su iPhone/iPad;
- icona 16-bit dedicata;
- service worker con cache shell versionata.

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
  mobile.css
  config.js
  network.js
  game.js
  app.js
  manifest.webmanifest
  sw.js
  icons/
worker/
  package.json
  wrangler.jsonc
  src/index.js
```
