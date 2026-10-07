# 05 · Backlog

## MVP (fase 1): sostituzione del container attuale

Obiettivo: stessa copertura funzionale di joxit/docker-registry-ui, con la UX del mockup.

- [ ] Scaffold Nuxt 3, `ssr: false`, TypeScript, ESLint
- [ ] `registryClient`: fetch con basic auth, header `Accept`, paginazione `Link`, gestione 401/404
- [ ] Parsing manifest / manifest list / config blob dalla spec OCI (con test unitari su fixture)
- [ ] Endpoint: health, repositories, tags, tag detail, delete
- [ ] Cache in memoria per digest e per immagine
- [ ] Sidebar con albero, espansione persistente, filtro
- [ ] Vista immagine: header, pull command, tabella tag, ordinamento, filtro
- [ ] Badge digest condiviso e badge newest
- [ ] Drawer dettaglio: layer, label, piattaforme, Dockerfile ricostruito
- [ ] Selezione multipla e dialog di cancellazione con avviso digest
- [ ] Stato in URL (`image`, `tag`), tema light/dark/auto
- [ ] Dockerfile multi-stage, immagine su registry privato, `docker-compose.example.yml`
- [ ] Variabili d'ambiente come da `03-architettura.md`
- [ ] Font serviti localmente

## Fase 2

- [ ] Overview con statistiche e "Recently created" (job periodico + cache)
- [ ] Conteggio tag in sidebar (`SHOW_TAG_COUNT`)
- [ ] Ricerca globale `Ctrl+K` su immagini e tag
- [ ] Autenticazione della GUI (basic auth via env, oppure header da reverse proxy SSO)
- [ ] Nascondere immagini senza tag (opzione)
- [ ] Paginazione client della tabella sopra una soglia (es. 200 tag)
- [ ] Multi-registry (selettore nella top bar, configurazione a lista)

## Nice to have (richiedono accesso oltre l'API del registry)

- [ ] **Spazio disco usato e quota.** L'API non lo espone. Opzioni:
  volume del registry montato in sola lettura e calcolo delle dimensioni dei blob;
  oppure metriche Prometheus del registry (`REGISTRY_HTTP_DEBUG_PROMETHEUS_ENABLED`).
- [ ] **Ultimo garbage collect e lancio GC dalla GUI.** Serve eseguire
  `registry garbage-collect` nel container del registry: possibile solo con accesso al
  Docker socket o con un sidecar che espone un endpoint. Da valutare con attenzione lato sicurezza.
- [ ] **Data di push reale e autore.** Sottoscrivere le notifications del registry
  (`REGISTRY_NOTIFICATIONS_ENDPOINTS`) su un endpoint Nitro e salvare gli eventi `push`
  in uno storage persistente (SQLite). Da lì anche un feed "attività" affidabile.
- [ ] **Scansione vulnerabilità**: integrazione con Trivy sui digest, risultati in drawer.
- [ ] **Policy di retention**: regole tipo "tieni gli ultimi N tag `v*`, elimina i `nightly-*`
  più vecchi di 14 giorni", con anteprima prima dell'esecuzione.
- [ ] Export CSV/JSON della lista tag.

## Fuori scope

- Push di immagini dalla GUI.
- Gestione utenti e permessi del registry (si fa sul registry o sul reverse proxy).
