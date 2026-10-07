# 01 · Contesto e motivazioni

## Situazione attuale

Oggi usiamo l'immagine Docker Hub `joxit/docker-registry-ui` davanti al nostro registry privato.
È una SPA statica (Riot.js + riot-mui) servita da nginx. Node serve solo per la build.
A runtime c'è solo nginx, con uno script di entrypoint che fa `sed` delle variabili d'ambiente
dentro `index.html`.

Il browser chiama direttamente l'API v2 del registry. Questo comporta:

- problemi CORS: il registry risponde 401 alle richieste OPTIONS (preflight), e il progetto
  consiglia di mettere nginx come proxy (`NGINX_PROXY_PASS_URL`) oppure servire UI e registry
  sullo stesso dominio;
- autenticazione limitata a basic auth del browser;
- ogni client rifà tutte le chiamate al registry (manifest, config blob) e le mette in cache
  solo localmente.

## Problemi di usabilità riscontrati

1. **Stato perso nella navigazione.** Catalogo, lista tag e history sono tre pagine con cambio
   route completo. Lo stato "espanso" dei namespace vive solo in memoria del componente
   (`catalog-element.riot`), non in URL né in localStorage: tornando indietro è tutto collassato.
2. **Aspetto spento.** Palette grigio/blu desaturata, nessuna gerarchia visiva, card tutte uguali.
3. **Cancellazione poco chiara.** Il registry cancella per digest, non per tag: cancellare un tag
   cancella tutti i tag che puntano allo stesso manifest. La UI non lo mostra prima dell'azione
   (si scopre dalla FAQ).
4. **Selezione multipla nascosta.** La multi-cancellazione passa da una checkbox indeterminata
   nell'intestazione della tabella, con scorciatoie Alt+Click e Shift+Click non scopribili.

## Opzioni valutate

| Opzione | Pro | Contro |
|---|---|---|
| Fork di joxit/docker-registry-ui | Riuso completo, possibilità di contribuire upstream | Riot.js (libreria di nicchia), licenza AGPL-3.0, l'architettura solo-browser resta |
| Clone in repo privato + modifiche | Come sopra | Come sopra; stessa licenza |
| **Progetto nuovo (Nuxt + Nitro)** | Nessun vincolo AGPL se non si copia codice, backend che risolve CORS/auth/cache, stack già nostro | Riscrittura (~400 righe di logica API da rifare dalla spec OCI) |

**Scelta: progetto nuovo.** Motivazione principale: i problemi reali (CORS, credenziali, costo
delle chiamate) si risolvono con un backend, e la UX che vogliamo richiede comunque un layout
diverso da quello esistente.

## Nota sulla licenza

Il progetto originale è **AGPL-3.0**. Per uso interno un fork modificato è lecito, ma se
l'interfaccia venisse esposta a utenti esterni dovremmo pubblicare il sorgente modificato.
Nel progetto nuovo **non si copia codice** da joxit/docker-registry-ui. La logica di accesso
all'API si scrive dalla specifica pubblica (OCI Distribution Spec, Docker Registry HTTP API v2).
Il progetto originale si usa solo come riferimento di comportamento, non di implementazione.

## Riferimenti

- OCI Distribution Specification: https://github.com/opencontainers/distribution-spec
- OCI Image Specification (manifest, index, config): https://github.com/opencontainers/image-spec
- Docker Distribution (registry) : https://github.com/distribution/distribution
- Registry notifications (webhook): https://distribution.github.io/distribution/about/notifications/
