# TinyDungeon

TinyDungeon è un piccolo dungeon crawler cooperativo 16-bit pensato per 1-3 giocatori.

## Visione

- vista top-down 16-bit
- ritmo tranquillo, leggibile e adatto anche a bambini
- stanze compatte con piccoli puzzle, leve, chiavi, casse e combattimenti leggeri
- 1 giocatore + 2 compagni AI, 2 giocatori + 1 AI, oppure 3 giocatori umani
- nessun ruolo obbligatorio: tutti possono muoversi, combattere e interagire
- sessioni brevi, idealmente 10-15 minuti
- client statico compatibile con GitHub Pages; multiplayer online previsto tramite Cloudflare in una fase successiva

## Vertical slice iniziale

La prima slice punta a validare il feeling del gioco prima di introdurre networking e sistemi persistenti:

- una stanza/mini-dungeon giocabile
- tre eroi differenziati visivamente
- controlli desktop e touch
- interazioni ambientali
- nemici semplici e non frenetici
- compagni AI base
- stile grafico 16-bit disegnato direttamente su Canvas

## Avvio locale

Il progetto è statico. È sufficiente servire la root con un web server HTTP, per esempio:

```bash
python -m http.server 8080
```

Poi aprire `http://localhost:8080`.
