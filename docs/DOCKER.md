# Docker installation

The multi-stage image builds shared contracts, the API, and the browser client. It runs as the unprivileged `node` user (UID 1000). nginx serves the UI and proxies `/api/` and `/ws` on port **8080**; Node listens internally on loopback port 8082. The container entrypoint fixes that internal address. Both processes are supervised and stopped together. Based on DanWahlin/ai-agent-board (MIT).

## Build and run locally

From the repository root, with Docker Engine and Compose v2 installed:

```bash
docker compose --profile app up --build -d app
curl --fail http://localhost:8080/api/health
docker compose logs app
```

Open [localhost:8080](http://localhost:8080). This starts the app only, using SQLite. `appdata` persists `/data/agentboard.db`, configuration, and cloned projects under `/data/agentboard/projects`. Stop with `docker compose --profile app down`; volumes survive unless explicitly removed with `-v`. Back up volumes before upgrades. Host bind mounts must be writable by UID 1000.

To use the release image after a release has been published:

```bash
docker pull ghcr.io/66hamidreza/ai-router-board:0.1.0
docker run -d --name ai-router-board \
  -p 127.0.0.1:8080:8080 \
  -v ai-router-board-data:/data \
  ghcr.io/66hamidreza/ai-router-board:0.1.0
```

Stable releases also receive `:latest`; pin a version or digest for controlled upgrades. Published platforms are `linux/amd64` and `linux/arm64`. The release workflow publishes only after the required gate succeeds; an image may not yet exist for an unpublished version.

## Credentials, agents, and access

No host credentials, `.env` files, database contents, or build artifacts are copied into the image. Pass server configuration using runtime `--env-file` (stored outside the repository), environment variables, or read-only key mounts. The free pool reads files rather than direct API-key environment variables:

```bash
docker run --rm -p 127.0.0.1:8080:8080 \
  -v ai-router-board-data:/data \
  --mount type=bind,src="$HOME/.config/llm",dst=/run/llm-keys,readonly \
  -e LLM_KEY_DIR=/run/llm-keys \
  ghcr.io/66hamidreza/ai-router-board:0.1.0
```

Key files (`groq.key`, `gemini.key`, `openrouter.key`) must be readable by container UID 1000 with mode 0600; their directory must permit traversal by that user. Restart after changes. Configure model overrides using `FREE_GROQ_MODEL`, `FREE_GEMINI_MODEL`, or `FREE_OPENROUTER_MODEL` if needed. Compose can use the same mount through a local override file.

The image does not install or authenticate host coding CLIs. Install required Linux CLI tools in a derived image and provide their credentials at runtime. Host CLI login is not automatically available inside a container. Set repository allowlists and `CONFIDENTIAL_REPO_ROOTS` using **container** paths. See [agent setup](fa/agents.md).

The prebuilt browser has no embedded `VITE_API_KEY`. Setting runtime `API_KEY` protects the API but requires a matching browser build; it cannot reconfigure already-built assets. Use an authenticated outer proxy for a shared deployment, or provide your own matched client build. Browser keys are visible to browser users. The healthcheck supplies runtime `API_KEY` to `/api/health` when configured; that endpoint is authenticated by the current middleware. Service tokens alone do not protect all browser routes.

Keep the published port on loopback. For access through another hostname, explicitly configure `ALLOWED_HOSTS`, `ALLOWED_ORIGINS`, TLS, and outer authentication. A container is not an agent sandbox. See [security policy](../SECURITY.md).

## Optional PostgreSQL

Plain `docker compose up -d db` retains the database-only workflow on loopback port 5433. Its default password, `agentboard-local-only`, is for local development only; override it before starting a shared deployment. A password change on an existing volume requires updating the database role as well.

For app and database together, set the password and matching connection URL in your shell (use a URL-encoded password in the URL):

```bash
export POSTGRES_PASSWORD='replace-with-a-local-password'
export DATABASE_URL='postgresql://agentboard:replace-with-a-local-password@db:5432/agentboard'
docker compose --profile app up --build -d db app
```

A host-run API instead uses `localhost:5433`. Start PostgreSQL before the API; if it is not yet ready, the app may restart until it can connect. SQLite and PostgreSQL data are not automatically migrated. The `pgdata` volume persists database contents.

## Validation and release

```bash
docker build -t ai-router-board:smoke .
docker run -d --name ai-router-board-smoke \
  -e AGENTBOARD_DISABLE_AGENT_STARTUP=1 \
  -p 127.0.0.1:8080:8080 ai-router-board:smoke
curl --fail --retry 15 --retry-delay 2 --retry-connrefused http://localhost:8080/api/health
curl --fail http://localhost:8080/
docker stop ai-router-board-smoke
docker rm -v ai-router-board-smoke
```

The image healthcheck tests the proxied API and expects `status: ok`. Tag releases `vMAJOR.MINOR.PATCH` with a matching root package version and changelog entry. The workflow runs the full gate, publishes version/latest tags to GHCR using `GITHUB_TOKEN`, and creates release notes with a source archive. Prereleases do not replace `latest`.

Next: [configuration](fa/configuration.md) · [routing](ROUTING.md) · [Persian installation](fa/install.md).
