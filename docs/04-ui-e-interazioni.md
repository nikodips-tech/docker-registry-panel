# 04 · UI e interazioni

Riferimento visivo: [mockup/index.html](mockup/index.html). Questo documento spiega le scelte.

## Layout: tre colonne, una sola pagina

```
┌──────────────────────────────────────────────────────────────────┐
│ Top bar: logo · registry selezionato · ricerca globale · tema    │
├─────────────┬───────────────────────────────────┬────────────────┤
│ Sidebar     │ Contenuto                         │ Drawer         │
│ albero repo │ overview  OPPURE  immagine + tag  │ dettaglio tag  │
│ sempre      │                                   │ (apribile)     │
│ visibile    │                                   │                │
└─────────────┴───────────────────────────────────┴────────────────┘
```

Sostituisce le tre pagine dell'app originale (catalogo → tag → history). Benefici:

- la sidebar non viene mai smontata, quindi l'espansione dei namespace non si perde;
- il dettaglio di un tag si apre a fianco della tabella, senza perdere la lista;
- cancellare un tag aggiorna la tabella in posto.

A larghezza telefono le colonne si impilano (flex-wrap): sidebar, contenuto, drawer.

## Sidebar

- Intestazione con conteggio (`12 images · 4 namespaces`) e filtro locale.
- Namespace come gruppi espandibili (icona cartella, chevron ruotato), immagini come foglie
  con badge del numero di tag (solo se `SHOW_TAG_COUNT=true`).
- L'immagine selezionata è evidenziata con sfondo accent-soft.
- Profondità di raggruppamento configurabile come oggi (`CATALOG_MIN/MAX_BRANCHES`).

## Overview (nessuna immagine selezionata)

- Titolo: hostname del registry; sottotitolo: `Registry API v2 · delete enabled`.
- Quattro tile: Images, Tags, Unique digests, Last created. Tutti derivabili (vedi 02).
- **Recently created**: gli ultimi tag creati su tutto il registry, ordinati per data `created`
  del config blob, cliccabili (aprono immagine e drawer). Risponde alla domanda "cos'è stato
  pubblicato di recente?" senza girare le immagini una per una. Richiede la cache lato server.

## Vista immagine

- Breadcrumb `registry / namespace`, nome immagine in monospace.
- Chips: numero tag, numero digest, dimensione compressa totale (layer unici), `created <tempo>`
  del tag più recente.
- Box con comando `docker pull` del tag più recente e bottone copia.
- Toolbar: filtro tag, ordinamento (Newest / Name, con ordinamento numerico naturale per i tag
  di versione), contatore `N of M tags`.

## Tabella tag

Colonne: checkbox · Tag · Digest · Size · Platforms · Created · azioni.

- Il tag più recente ha il badge verde **newest**.
- Se più tag puntano allo stesso digest, accanto al digest compare un badge ambra `= latest`
  (lista degli altri tag). È l'informazione che oggi manca e che rende sorprendente la
  cancellazione.
- Azioni per riga: copia pull, dettaglio (apre il drawer), elimina.
- Selezione multipla: checkbox per riga, checkbox "seleziona visibili" in intestazione.
  Appena c'è una selezione compare la barra `N selected · Clear · Delete`.
- La riga aperta nel drawer ha sfondo surface2, quella selezionata accent-soft.

## Drawer dettaglio tag

- Created, Size, digest completo (selezionabile).
- Avviso ambra se il digest è condiviso: "Same digest as X. Deleting one deletes both."
- Azioni: Copy pull, Dockerfile (ricostruito dall'history), Elimina.
- Tab per piattaforma (multi-arch), lista layer numerata con comando e dimensione, label OCI.

## Dialog di cancellazione

- Titolo con numero di tag e immagine, elenco dei tag, avviso:
  "The registry deletes by digest. Every tag that points at the same digest is removed too.
  Run garbage collection afterwards to free disk space."
- Dopo la conferma: DELETE per ogni digest unico (non per tag), poi refresh della tabella.

## Tema e tipografia

Font: **IBM Plex Sans** (testo) e **IBM Plex Mono** (nomi immagine, tag, digest, comandi).
Da servire localmente in produzione, non da Google Fonts.

| Token | Light | Dark |
|---|---|---|
| bg | `#F3F5F8` | `#0E1217` |
| surface | `#FFFFFF` | `#151B23` |
| surface2 | `#EBEFF4` | `#1D2530` |
| border | `#D9DFE8` | `#2A3442` |
| text | `#141A22` | `#E8EDF3` |
| muted | `#56626F` | `#9AA7B5` |
| accent | `#1F4FE0` | `#6C8CFF` |
| accent-soft | `#E4EBFF` | `#1E2A4A` |
| accent-text | `#1A43C2` | `#A9BCFF` |
| danger | `#C62828` | `#F28B8B` |
| ok | `#1B7F4B` | `#5BD08A` |
| warn | `#8A5200` | `#F2B35B` |
| topbar | `#0F172A` | `#090D13` |

Tema: `auto` segue `prefers-color-scheme`, con toggle manuale salvato in localStorage.
Contrasto testo ≥ 4.5:1 su tutte le combinazioni usate.

## Copy dell'interfaccia

Inglese, come la terminologia Docker (`tag`, `digest`, `manifest`, `pull`). Si evita
"pushed": l'unica data disponibile è `created`.

## Accessibilità minima

- Elementi cliccabili sono `<button>` o `<a>`, mai `div` con handler.
- Bottoni solo-icona hanno `aria-label`.
- Gruppi della sidebar hanno `aria-expanded`, l'immagine selezionata `aria-current`.
- Il dialog ha `role="dialog"` e `aria-modal`.
- Scorciatoie: `Ctrl+K` per la ricerca globale (da implementare).
