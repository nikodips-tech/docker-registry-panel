# 03 · Architettura

## Scelta: Nuxt 3 + Nitro, SSR disattivato

- **Frontend**: Nuxt in modalità SPA (`ssr: false`). È una console interna, non serve rendering
  lato server né indicizzazione. Meno complessità, nessun problema di hydration.
- **Backend**: Nitro (il server integrato di Nuxt), cartella `server/`. Fa da proxy verso il
  registry, tiene le credenziali, fa cache e calcola le aggregazioni.
- **Un solo container** in produzione: `node` che serve sia i file statici sia le API.
  Sostituisce uno a uno il container `joxit/docker-registry-ui` nel compose.

```
browser ──HTTP──► Nitro (/api/*) ──HTTP + credenziali──► registry (/v2/*)
                   │
                   └── cache (memoria, opzionale Redis)
```

Il browser **non parla mai col registry**. Spariscono CORS, preflight 401, basic auth del browser.

## Struttura del progetto

```
docker-registry-gui/
├── docs/                     ← questa documentazione
├── app/                      (o root di Nuxt, a seconda della convenzione scelta)
│   ├── pages/
│   │   └── index.vue         ← unica pagina: layout a tre colonne, stato in query string
│   ├── components/
│   │   ├── TopBar.vue
│   │   ├── RepoTree.vue      ← sidebar, gestisce espansione e selezione
│   │   ├── Overview.vue      ← statistiche quando nessuna immagine è selezionata
│   │   ├── ImageHeader.vue   ← nome, chips, comando pull
│   │   ├── TagTable.vue      ← tabella, selezione multipla, ordinamento, filtro
│   │   ├── TagDrawer.vue     ← dettaglio tag: layer, digest, label
│   │   └── DeleteDialog.vue
│   ├── composables/
│   │   ├── useRegistry.ts    ← wrapper tipizzato delle API /api/*
│   │   └── useUiState.ts     ← stato persistente (espansione, tema) ↔ localStorage + URL
│   └── assets/css/tokens.css ← variabili colore/tipografia (vedi 04)
├── server/
│   ├── api/
│   │   ├── registry/health.get.ts
│   │   ├── repositories.get.ts
│   │   ├── repositories/[...name]/tags.get.ts
│   │   ├── repositories/[...name]/tags/[tag].get.ts
│   │   ├── repositories/[...name]/manifests/[digest].delete.ts
│   │   └── stats.get.ts
│   ├── utils/
│   │   ├── registryClient.ts ← fetch verso il registry con auth, Accept, paginazione Link
│   │   ├── manifest.ts       ← parsing manifest / index / config blob (dalla spec OCI)
│   │   └── cache.ts
│   └── middleware/auth.ts    ← (fase 2) autenticazione utenti della GUI
├── nuxt.config.ts
├── Dockerfile
└── docker-compose.example.yml
```

## Endpoint Nitro

Tutti sotto `/api`. Il nome dell'immagine può contenere `/`, da cui le route catch-all.

| Metodo e path | Risposta | Note |
|---|---|---|
| `GET /api/registry/health` | `{ ok, url, deleteEnabled }` | Chiama `GET /v2/` |
| `GET /api/repositories` | `[{ name, tagCount? }]` | Catalogo completo (segue la paginazione). `tagCount` solo se `SHOW_TAG_COUNT=true` |
| `GET /api/repositories/<name>/tags` | `[{ tag, digest, size, platforms[], created }]` | La vista tabella. Manifest + config per ogni tag, in parallelo con limite di concorrenza, risultato in cache |
| `GET /api/repositories/<name>/tags/<tag>` | `{ ...riga, digestFull, layers[], labels{}, config{}, history[] }` | Il drawer |
| `DELETE /api/repositories/<name>/manifests/<digest>` | `{ deleted: true, tags: [...] }` | Ritorna i tag rimossi. Invalida la cache dell'immagine |
| `GET /api/stats` | `{ images, namespaces, tags, uniqueDigests, lastCreated, recent[] }` | Overview. Calcolato in background e messo in cache; la prima richiesta può rispondere con `partial: true` |

## Cache

- **Per digest** (manifest e config blob): immutabili, TTL infinito, limite di dimensione LRU.
- **Per immagine** (lista tag con righe risolte): TTL breve (es. 60 s), invalidata da DELETE
  e da un bottone "Refresh".
- **Catalogo**: TTL breve.
- **Stats**: ricalcolate da un job periodico (`nitro` task o `setInterval` all'avvio),
  così `/api/stats` risponde sempre subito.
- Implementazione: `unstorage` (già in Nitro) con driver memoria; driver Redis opzionale
  via variabile d'ambiente se un giorno servono più repliche.

## Configurazione (variabili d'ambiente)

Stesso spirito dell'immagine attuale, così la migrazione nel compose è immediata.

| Variabile | Default | Significato |
|---|---|---|
| `REGISTRY_URL` | obbligatoria | es. `https://registry.example.com` |
| `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | vuoti | Credenziali che Nitro usa verso il registry |
| `REGISTRY_TITLE` | hostname di `REGISTRY_URL` | Nome mostrato nella top bar |
| `PULL_URL` | hostname di `REGISTRY_URL` | Prefisso per il comando `docker pull` |
| `DELETE_IMAGES` | `false` | Abilita i bottoni di cancellazione |
| `SHOW_TAG_COUNT` | `false` | Conteggio tag nella sidebar (una chiamata per immagine) |
| `CATALOG_MIN_BRANCHES` / `CATALOG_MAX_BRANCHES` | `1` / `1` | Profondità di raggruppamento per `/` nella sidebar |
| `CACHE_TTL_SECONDS` | `60` | TTL per liste tag e catalogo |
| `THEME` | `auto` | `auto`, `light`, `dark` |
| `PORT` | `3000` | Porta di ascolto |

## Autenticazione della GUI

Fase 1: nessuna (la GUI sta in rete interna, come oggi). Fase 2: middleware Nitro con una delle
opzioni: basic auth configurata via env, oppure header di un reverse proxy con SSO (es.
`X-Forwarded-User`). Le credenziali del registry restano comunque solo lato server.

## Deploy

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
```

```yaml
services:
  registry-panel:
    image: dipstech/docker-registry-panel:latest
    environment:
      REGISTRY_URL: https://registry.example.com
      REGISTRY_USERNAME: ${REGISTRY_USERNAME}
      REGISTRY_PASSWORD: ${REGISTRY_PASSWORD}
      DELETE_IMAGES: "true"
    ports:
      - "8080:3000"
```

## Stato in URL e persistenza

- URL: `/?image=backend/api&tag=v2.6.0` (immagine selezionata e tag aperto nel drawer).
  Condivisibile, e il tasto indietro del browser funziona.
- localStorage: namespace espansi, tema, ordinamento preferito, filtro colonne.
- Lo stato espanso **non dipende dalla navigazione** perché non si cambia pagina: la sidebar
  resta montata sempre.
