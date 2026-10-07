# Docker Registry GUI

Web interface for a private Docker Registry (Distribution v2/v3, OCI Distribution API),
built as a replacement for `joxit/docker-registry-ui`. Single page, three columns:
repository tree, tag table, tag detail drawer. A small Nitro backend proxies the registry,
holds the credentials and caches manifests, so the browser never talks to the registry.

Design decisions, API notes and the interactive mockup live in [docs/](docs/README.md).

## Layout

```
docs/                        documentation and mockup
gui/                         Nuxt 3 app (SPA) + Nitro API, with its Dockerfile
dev/registry/                local registry:2 for development, with a seed script
docker-compose.example.yml   deployment example
```

## Running

Production, with docker compose:

```sh
cp docker-compose.example.yml docker-compose.yml   # edit REGISTRY_URL etc.
docker compose up -d --build
```

Development:

```sh
docker compose -f dev/registry/docker-compose.yml up -d   # test registry on localhost:5500
sh dev/registry/seed.sh                                    # push sample images
cd gui
npm install
cp .env.example .env                                       # REGISTRY_URL=http://localhost:5500
npm run dev                                                # http://localhost:3000
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`
(`TEST_REGISTRY_URL=http://localhost:5500 npm test` also runs the integration tests).

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `REGISTRY_URL` | required | Registry base URL, e.g. `https://registry.example.com` |
| `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | empty | Credentials the backend uses towards the registry (basic auth, or the Bearer token flow when the registry asks for it) |
| `REGISTRY_TITLE` | host of `REGISTRY_URL` | Name shown in the top bar |
| `PULL_URL` | host of `REGISTRY_URL` | Prefix of the `docker pull` command |
| `DELETE_IMAGES` | `false` | Show the delete buttons. The registry itself needs `REGISTRY_STORAGE_DELETE_ENABLED=true` |
| `SHOW_TAG_COUNT` | `false` | Tag count per repository in the sidebar (one registry call per repository) |
| `CATALOG_MIN_BRANCHES` | `1` | Minimum number of images a namespace needs to become a folder in the sidebar |
| `CATALOG_MAX_BRANCHES` | `1` | How many `/` levels become nested folders |
| `CACHE_TTL_SECONDS` | `60` | Cache lifetime of the catalog and of each repository's tag table. Manifests are cached by digest for the lifetime of the process |
| `THEME` | `auto` | `auto` (follows the OS), `light` or `dark`. The user's toggle wins once used |
| `PORT` | `3000` | Listening port |

The variables are read when the container starts, so they can be changed without rebuilding.

## Behaviour worth knowing

- **Created, not pushed.** The only date the registry exposes is the image build date
  (`created` in the config blob). The interface never claims to know when a tag was pushed.
- **Deletion is by digest.** The registry has no per-tag delete: removing a tag removes the
  manifest, and with it every tag pointing at the same digest. The table shows shared digests
  (`= other-tag` badge) and the confirmation dialog lists what else goes away. Disk space is
  only reclaimed after `registry garbage-collect` on the registry.
- **Multi-arch tags** show their platforms in the table; size and layers in the drawer are per
  platform, with one tab each.
- **URL state.** `/?image=backend/api&tag=v2.6.0` is shareable. Expanded namespaces, theme and
  sort order are kept in the browser's localStorage.

## API

All endpoints are under `/api`, see [docs/03-architettura.md](docs/03-architettura.md).

| Method and path | Returns |
|---|---|
| `GET /api/registry/health` | `{ ok, title, pullUrl, deleteEnabled, ... }` |
| `GET /api/repositories` | `{ repositories: [{ name, tagCount? }] }` (`?refresh=1` bypasses the cache) |
| `GET /api/repositories/<name>/tags` | `{ name, tags: [{ tag, digest, size, platforms, created }], compressedSize, uniqueDigests }` |
| `GET /api/repositories/<name>/tags/<tag>` | the row plus `images[]` (layers, labels, config, Dockerfile per platform) and `sharedWith[]` |
| `DELETE /api/repositories/<name>/manifests/<digest>` | `{ deleted: true, tags: [...] }` |

## License note

No code from `joxit/docker-registry-ui` (AGPL-3.0) is used. The registry access layer is
written from the OCI Distribution and Image specifications.
