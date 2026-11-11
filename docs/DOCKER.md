# Docker Deployment

The full SafeOS Guardian stack runs from one command. Compose builds the images,
starts Ollama, downloads and caches the vision models, then starts the API and UI
in dependency order.

```bash
cd safeos
cp .env.example .env        # optional: fill in only the keys you want
docker compose up -d --build
```

Then open:

| Service | URL | Notes |
| --- | --- | --- |
| UI (Guardian) | http://localhost:3000 | Next.js static export served by nginx |
| API | http://localhost:3001 | Express + Socket.io + BullMQ |
| API health | http://localhost:3001/health | Used by the container healthcheck |
| Ollama | http://localhost:11434 | Local vision-model inference |

## Run from prebuilt images (no build)

To run SafeOS without cloning the repo or building anything, use the published
GHCR images. This pulls `ghcr.io/framerslab/safeos-api` and `…/safeos-ui`:

```bash
curl -O https://raw.githubusercontent.com/framerslab/safeos/master/docker-compose.ghcr.yml
docker compose -f docker-compose.ghcr.yml up -d
```

Pin a version with `SAFEOS_TAG` (default `latest`); add `-f docker-compose.gpu.yml`
on an NVIDIA host. The images are published from `master` by
`.github/workflows/docker-publish.yml` for `linux/amd64` and `linux/arm64`, so a
64-bit Raspberry Pi (or any arm64 host) pulls the same tags as a PC. A pull
request that changes the Dockerfile or anything copied into the images builds
both images for both platforms without pushing. The `safeos-ui` image bakes an API URL of
`http://localhost:3001` (Next inlines `NEXT_PUBLIC_*` at build time), which is
correct for local trial; a production deployment builds the UI with its own URL.

## What `up` does, in order

Compose gates each service on the previous one so a cold start is deterministic:

```
ollama (healthy)
  -> ollama-pull   downloads the configured models into the cache, then exits 0
       -> api      boots; ensureModels() finds the models already cached, so it
                   does not block, and the healthcheck on /health passes
            -> ui  nginx serves the static export once the API is healthy
```

`ollama-pull` is a one-shot container. On the first run it downloads the models;
on later runs `ollama pull` is a fast no-op because the layers are already in the
`ollama-models` volume.

## Architecture

- **Backend** (`src/`): runs the TypeScript sources directly through `tsx`. The
  package is ESM (`"type": "module"`) with bundler-style extensionless imports
  (`moduleResolution: "bundler"`), so the compiled `dist/` is not runnable by
  `node` on its own. `tsx` is the same runtime `npm run dev` uses. No backend
  compile step is needed for the image.
- **Frontend** (`apps/guardian-ui`): a Next.js static export (`output: 'export'`).
  `next build` emits `out/`, which nginx serves. `next start` does not serve an
  exported app and is not used.
- **Ollama**: serves the local vision models. Models live in the named volume
  `ollama-models` so they survive restarts and rebuilds.

## Models

The three tiers are defined in [`src/lib/ollama/models.ts`](../src/lib/ollama/models.ts):

| Model | Tier | Download | RAM | Pulled by default |
| --- | --- | --- | --- | --- |
| `moondream` | triage | ~1.7 GB | ~2 GB | yes |
| `llava:7b` | analysis | ~4 GB | ~8 GB | yes |
| `llama3.2-vision:11b` | complex | ~7 GB | ~16 GB | no |

The default set (`moondream llava:7b`) matches the two models the backend uses for
triage and analysis. The 11B model is left out of the default because it needs a
16 GB host to run without swapping.

### Choosing which models to cache

Set `OLLAMA_MODELS` in `.env` (space or comma separated):

```env
# Minimal: fast triage only (~830 MB)
OLLAMA_MODELS=moondream

# Default: triage + detailed analysis
OLLAMA_MODELS=moondream llava:7b

# Everything, including complex scene understanding (needs ~16 GB RAM)
OLLAMA_MODELS=moondream llava:7b llama3.2-vision:11b
```

Pull or add models later without restarting the stack:

```bash
# Through the running Ollama container
docker compose exec ollama ollama pull llama3.2-vision:11b

# Or, on a host that has the ollama CLI
OLLAMA_MODELS="moondream llava:7b llama3.2-vision:11b" ./scripts/pull-ollama-models.sh
```

## GPU

The base stack runs Ollama on CPU, which works everywhere including macOS. On a
Linux host with an NVIDIA GPU and the NVIDIA Container Toolkit, layer the GPU
override on top:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build
```

## Optional services

```bash
# Redis (BullMQ scaling / rate limiting)
docker compose --profile with-redis up -d
```

## Building images individually

Each stage in the [`Dockerfile`](../Dockerfile) is a named target:

```bash
docker build --target backend     -t safeos-api .
docker build --target frontend    -t safeos-ui \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_WS_URL=wss://api.example.com .
docker build --target development -t safeos-dev .
```

`NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` are inlined into the frontend
bundle at build time, so pass them as build args when the API is not on
`http://localhost:3001`.

## Production

`docker-compose.prod.yml` fronts the API with Caddy (automatic HTTPS) and runs the
same `ollama` + `ollama-pull` model-caching flow. Set `SAFEOS_DOMAIN` and
`CORS_ORIGIN` in `.env`, then:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f
```

The production UI is published separately as a static site (GitHub Pages at
safeos.sh). To self-host the UI alongside the API instead, run the base
`docker-compose.yml`, which includes the nginx `ui` service, and point
`NEXT_PUBLIC_API_URL` at the public API URL.

## Browser-side models

The PWA also runs in-browser detection through TensorFlow.js (`coco-ssd`) and
Transformers.js (`@xenova/transformers`, ONNX). Those weights are fetched by the
browser from their CDNs on first use and then cached by the service worker, so the
app keeps working offline after the first load. They are independent of the Ollama
models above and need no server-side download.

## Useful commands

```bash
docker compose ps                       # service status
docker compose logs -f api              # follow backend logs
docker compose logs -f ollama-pull      # watch model downloads
docker compose exec ollama ollama list  # what is cached
docker compose down                     # stop (keeps volumes/models)
docker compose down -v                  # stop and delete volumes (re-downloads models)
```

## Troubleshooting

- **UI can't reach the API.** `NEXT_PUBLIC_API_URL` is baked at build time. If you
  changed it, rebuild the UI: `docker compose up -d --build ui`.
- **`api` never becomes healthy.** Check `docker compose logs api`. If it is stuck
  pulling a model, confirm `ollama-pull` finished: `docker compose logs ollama-pull`.
- **Out of memory on `llava:7b` / `llama3.2-vision:11b`.** Drop back to
  `OLLAMA_MODELS=moondream` or give the host more RAM.
- **Slow inference on CPU.** Expected. Use the GPU override on an NVIDIA host, or
  rely on the cloud fallback by setting `OPENROUTER_API_KEY` / `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY`.
