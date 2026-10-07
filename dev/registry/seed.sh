#!/bin/sh
# Seeds the local test registry (dev/registry/docker-compose.yml) with:
#  - backend/api: a small image built here, pushed under several tags, two of
#    which share the same digest (v1.0.0 == latest), plus an older build
#  - infra/alpine: a multi-arch manifest list copied from Docker Hub
#  - alpine (no namespace): single-arch image
# Requires: docker with buildx, registry listening on localhost:5500.
set -eu
REG="${REG:-localhost:5500}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "== backend/api (built locally, multiple tags, shared digest)"
docker build -q -t "$REG/backend/api:v1.0.0" \
  --build-arg VERSION=1.0.0 --build-arg REVISION=a1b2c3d \
  -f "$HERE/Dockerfile.sample" "$HERE"
docker tag "$REG/backend/api:v1.0.0" "$REG/backend/api:latest"
docker push "$REG/backend/api:v1.0.0"
docker push "$REG/backend/api:latest"

# an older, different build (different digest)
docker build -q -t "$REG/backend/api:v0.9.0" \
  --build-arg VERSION=0.9.0 --build-arg REVISION=9f8e7d6 --build-arg EXTRA=old \
  -f "$HERE/Dockerfile.sample" "$HERE"
docker push "$REG/backend/api:v0.9.0"

echo "== backend/worker (single tag)"
docker tag "$REG/backend/api:v0.9.0" "$REG/backend/worker:main"
docker push "$REG/backend/worker:main"

echo "== infra/alpine (multi-arch index copied from Docker Hub)"
docker buildx imagetools create -t "$REG/infra/alpine:3.20" -t "$REG/infra/alpine:latest" alpine:3.20
docker buildx imagetools create -t "$REG/infra/alpine:3.19" alpine:3.19

echo "== alpine (top-level, single-arch)"
docker tag alpine:3.19 "$REG/alpine:3.19"
docker push "$REG/alpine:3.19"
docker tag busybox:1.36 "$REG/busybox:1.36"
docker push "$REG/busybox:1.36"

echo "== catalog"
curl -s "http://$REG/v2/_catalog"; echo
