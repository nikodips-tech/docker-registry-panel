# Docker Registry Panel

A fast, single-page web panel for private Docker / OCI registries (Distribution v2/v3).
Browse repositories and tags, inspect manifests, layers and multi-arch platforms, see which tags
share a digest, and delete safely.

The panel has its own small backend that talks to the registry, so the browser never does:
no CORS to configure, no registry credentials in the browser, manifests cached by digest.

Source code, screenshots and issues on [GitHub](https://github.com/nikodips-tech/docker-registry-panel).

## Quick start

```sh
docker run -d --name registry-panel -p 8080:3000 \
  -e REGISTRY_URL=https://registry.example.com \
  -e REGISTRY_USERNAME=admin \
  -e REGISTRY_PASSWORD=secret \
  -e DELETE_IMAGES=true \
  dipstech/docker-registry-panel:latest
```

Open http://localhost:8080.

### docker compose

```yaml
services:
  registry-panel:
    image: dipstech/docker-registry-panel:latest
    restart: unless-stopped
    environment:
      REGISTRY_URL: https://registry.example.com
      REGISTRY_USERNAME: ${REGISTRY_USERNAME}
      REGISTRY_PASSWORD: ${REGISTRY_PASSWORD}
      DELETE_IMAGES: "true"
    ports:
      - "8080:3000"
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `REGISTRY_URL` | **required** | Registry base URL, e.g. `https://registry.example.com` |
| `REGISTRY_USERNAME` | | Username the panel uses towards the registry |
| `REGISTRY_PASSWORD` | | Password the panel uses towards the registry |
| `REGISTRY_TITLE` | host of `REGISTRY_URL` | Name shown in the top bar |
| `PULL_URL` | host of `REGISTRY_URL` | Prefix of the `docker pull` commands |
| `DELETE_IMAGES` | `false` | Show delete actions. The registry needs `REGISTRY_STORAGE_DELETE_ENABLED=true` |
| `SHOW_TAG_COUNT` | `false` | Tag count per repository in the sidebar |
| `CATALOG_MIN_BRANCHES` | `1` | Minimum images a namespace needs to become a folder |
| `CATALOG_MAX_BRANCHES` | `1` | How many `/` levels become nested folders |
| `CACHE_TTL_SECONDS` | `60` | Cache lifetime of the catalog and tag lists |
| `THEME` | `auto` | `auto`, `light` or `dark` |
| `PORT` | `3000` | Listening port inside the container |

## Notes

- The container runs as the unprivileged `node` user and has a healthcheck on `/api/registry/health`.
- The panel has no login of its own: run it on an internal network or behind an authenticating proxy.
- Basic auth and Bearer token registries are supported.
- The registry deletes manifests by digest: every tag pointing at the same digest is removed together.
  The panel warns before you confirm. Run `registry garbage-collect` afterwards to free disk space.
- The dates shown are image build dates (`created`); the registry API does not record push dates.
