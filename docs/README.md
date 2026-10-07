# Docker Registry GUI — documentazione

Interfaccia web per il nostro Docker Registry privato (Distribution v2/v3), costruita da zero
in sostituzione di [joxit/docker-registry-ui](https://github.com/Joxit/docker-registry-ui).

| Documento | Contenuto |
|---|---|
| [01-contesto-e-motivazioni.md](01-contesto-e-motivazioni.md) | Cosa facciamo oggi, perché lo rifacciamo, vincoli di licenza |
| [02-registry-api.md](02-registry-api.md) | Cosa espone l'API v2 del registry, cosa si deriva, cosa non esiste |
| [03-architettura.md](03-architettura.md) | Nuxt + Nitro: struttura, endpoint, cache, configurazione, deploy |
| [04-ui-e-interazioni.md](04-ui-e-interazioni.md) | Decisioni di design, layout, palette, comportamenti |
| [05-backlog.md](05-backlog.md) | MVP, fasi successive, nice to have |
| [mockup/index.html](mockup/index.html) | Mockup interattivo, HTML autonomo (apribile direttamente nel browser) |

## Stato

- 2026-10-07: analisi del progetto originale, mockup approvato come base, decisione per Nuxt + Nitro.
  Nessuna riga di codice applicativo ancora scritta.

## Come usare il mockup

Apri `docs/mockup/index.html` nel browser. Non serve un server. Il mockup è interattivo:
espandi i namespace nella sidebar, seleziona un'immagine, apri il dettaglio di un tag, spunta
più tag e prova la cancellazione. Lo stato di espansione, l'immagine selezionata e il tema
vengono salvati in localStorage per dimostrare il comportamento atteso dall'app reale.

I dati nel mockup sono finti. Ogni informazione mostrata è però ottenibile o derivabile
dall'API del registry: vedi [02-registry-api.md](02-registry-api.md).
