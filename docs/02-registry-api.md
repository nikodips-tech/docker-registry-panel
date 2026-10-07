# 02 · Cosa dà l'API del registry

Riferimento per decidere cosa può stare in interfaccia. Tre categorie: **diretto** (una chiamata),
**derivato** (calcolo su più chiamate), **non disponibile** (serve altro).

## Endpoint usati

| Endpoint | Cosa ritorna | Note |
|---|---|---|
| `GET /v2/` | 200 se il registry risponde; header `Docker-Distribution-API-Version: registry/2.0` | Verifica connettività e autenticazione |
| `GET /v2/_catalog?n=N&last=X` | `{ repositories: [...] }` | Paginato via header `Link`. N max tipicamente 1000 |
| `GET /v2/<name>/tags/list?n=N&last=X` | `{ name, tags: [...] }` | Paginato. Una chiamata per immagine |
| `GET /v2/<name>/manifests/<ref>` | manifest o manifest list (index) | `ref` = tag o digest. Header `Accept` obbligatorio con i media type OCI e Docker v2 |
| `HEAD /v2/<name>/manifests/<ref>` | header `Docker-Content-Digest` | Economico: solo il digest, senza body |
| `GET /v2/<name>/blobs/<digest>` | blob | Lo usiamo solo per il **config blob** (JSON piccolo), mai per i layer |
| `DELETE /v2/<name>/manifests/<digest>` | 202 | Solo per digest, mai per tag. Richiede `REGISTRY_STORAGE_DELETE_ENABLED=true` sul registry |

Media type da mettere in `Accept` quando si chiede un manifest:

```
application/vnd.oci.image.index.v1+json
application/vnd.oci.image.manifest.v1+json
application/vnd.docker.distribution.manifest.list.v2+json
application/vnd.docker.distribution.manifest.v2+json
```

## Diretto

| Informazione | Da dove |
|---|---|
| Lista immagini | `_catalog` |
| Lista tag di un'immagine | `tags/list` |
| Digest di un tag | `HEAD manifests/<tag>` → `Docker-Content-Digest` |
| Piattaforme (multi-arch) | manifest list → `manifests[].platform` (`os/architecture[/variant]`) |
| Dimensione compressa | somma di `layers[].size` nel manifest (+ `config.size`) |
| Data di creazione | config blob → `created` (fallback: annotation `org.opencontainers.image.created`) |
| Label OCI | config blob → `config.Labels` |
| Comandi dei layer ("Dockerfile") | config blob → `history[].created_by` |
| Variabili d'ambiente, entrypoint, cmd, porte esposte, workdir | config blob → `config.*` |
| Cancellazione | `DELETE manifests/<digest>` |

Attenzione a `created`: è la **data di build** dell'immagine, non la data di push sul registry.
In interfaccia si chiama sempre **Created**, mai "pushed".

## Derivato (calcolo nostro)

| Informazione | Come | Costo |
|---|---|---|
| Tag che condividono un digest | raggruppa i tag per digest | 1 HEAD per tag |
| Numero di digest unici | come sopra | idem |
| Tag "più recente" | ordina per `created` | 1 manifest + 1 config per tag |
| Dimensione totale di un'immagine | somma dei layer **unici** tra tutti i tag | 1 manifest per tag |
| Conteggio tag nella sidebar | `tags/list` per ogni immagine | 1 chiamata per immagine |
| Statistiche overview (immagini, tag, digest unici) | aggrega quanto sopra su tutto il catalogo | tutte le chiamate sopra |
| "Recently created" (ultimi tag creati su tutto il registry) | ordina tutti i tag di tutte le immagini per `created` | tutte le chiamate sopra |
| Albero per namespace | split di `name` su `/` | zero |

Il costo è il punto: per un'immagine con 50 tag servono 50 manifest + 50 config blob. Per le
statistiche di overview serve tutto il registry. **Per questo le derivazioni stanno nel backend
Nitro con cache**, non nel browser. I manifest sono immutabili per digest, quindi la cache per
digest non scade mai; da invalidare è solo la mappa tag → digest.

## Non disponibile dall'API

| Informazione | Perché no | Alternativa (backlog) |
|---|---|---|
| Data di push | il registry non la registra nell'API | notifications (webhook) del registry salvate da noi |
| Spazio disco usato, quota | è sul filesystem del registry | volume condiviso in sola lettura, oppure metriche Prometheus del registry (`registry_storage_*`) |
| Ultimo garbage collect | idem, non esposto | log del GC, o lo lanciamo noi e registriamo quando |
| Versione del registry | non esposta | nessuna |
| Chi ha fatto push | non c'è | notifications includono `actor` se c'è auth token |

## Comportamenti del registry da gestire

- **DELETE per tag non esiste.** Si cancella il manifest per digest, e spariscono tutti i tag che
  lo referenziano. L'interfaccia deve mostrarlo **prima** della conferma.
- **La cancellazione non libera spazio.** Serve `registry garbage-collect` sul container del
  registry. Lo scriviamo nel messaggio di conferma.
- **Immagini "vuote".** Dopo aver cancellato tutti i tag, l'immagine resta nel `_catalog`
  finché non si rimuove la cartella a mano. Opzione: nascondere le immagini con zero tag.
- **Paginazione** del catalogo e dei tag via header `Link` (`rel="next"`).
- **Manifest list**: per ogni piattaforma c'è un manifest figlio con il suo config blob.
  Dimensione e layer vanno letti per piattaforma; la data di creazione dal primo figlio.
- **Autenticazione**: basic auth, oppure token (`WWW-Authenticate: Bearer realm=...`). Nel nostro
  caso le credenziali stanno nel backend: il browser non parla mai col registry.
