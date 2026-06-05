# wreislab-nestjs-template

NestJS backend template for WReisLab — JWT/OIDC authentication via Pocket ID, RBAC by groups, Prometheus metrics, structured logs for Loki.

## Stack

| Layer | Library |
|---|---|
| Framework | NestJS 10 + Fastify |
| Auth | passport-jwt + jwks-rsa |
| Logs | nestjs-pino + pino + pino-http |
| Metrics | prom-client |
| Docs | @nestjs/swagger |
| Config | @nestjs/config + joi |
| Tests | Jest |
| Runtime | Node 20 |

## Quick Start

```bash
cp .env.example .env
# Edit .env with your values
pnpm install
pnpm dev
```

App runs at `http://localhost:3000`.
Swagger UI at `http://localhost:3000/docs`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | HTTP port |
| `APP_NAME` | required | Application name |
| `APP_VERSION` | `1.0.0` | Application version |
| `LOG_LEVEL` | `info` | Pino log level |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `SWAGGER_ENABLED` | `true` | Enable Swagger UI at /docs |
| `METRICS_ENABLED` | `true` | Enable Prometheus /metrics |
| `OIDC_ISSUER_URL` | required | OIDC provider base URL |
| `OIDC_AUDIENCE` | _(empty)_ | Expected JWT audience — leave empty to skip validation |
| `OIDC_JWKS_URI` | _(empty)_ | JWKS endpoint — auto-discovered if empty |
| `JWT_GROUPS_CLAIM` | `groups` | JWT claim name for user groups |

## Pocket ID Configuration

### Finding the correct issuer

The `OIDC_ISSUER_URL` must match **exactly** the `issuer` field in the discovery document:

```bash
curl https://auth.wreislab.com/.well-known/openid-configuration | jq .issuer
```

Use the returned value (including or excluding trailing slash) as `OIDC_ISSUER_URL`.

### Configuring audience

After first login, decode the JWT at [jwt.io](https://jwt.io) and check the `aud` field.

- If `aud` is present: set `OIDC_AUDIENCE` to match exactly
- If `aud` is absent: leave `OIDC_AUDIENCE` empty (validation is skipped)

### Configuring groups claim

Check the decoded JWT for the groups field name. Default is `groups`.
Adjust `JWT_GROUPS_CLAIM` if Pocket ID uses a different claim name.

## Endpoints

| Method | Path | Auth | Groups Required |
|---|---|---|---|
| GET | /public | ❌ | — |
| GET | /health | ❌ | — |
| GET | /metrics | ❌ | — |
| GET | /docs | ❌ | — |
| GET | /auth/me | ✅ JWT | any |
| POST | /auth/logout | ❌ | — (stateless) |
| GET | /viewer | ✅ JWT | viewer, user, admin |
| GET | /user | ✅ JWT | user, admin |
| GET | /admin | ✅ JWT | admin |

**401** — missing or invalid token  
**403** — valid token, insufficient group

## Testing Endpoints

```bash
# Public endpoints
curl http://localhost:3000/public
curl http://localhost:3000/health
curl http://localhost:3000/metrics

# Authenticated (get token from frontend first)
TOKEN="<paste access_token here>"

curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/auth/me
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/viewer
```

## Decoding a JWT Token

```bash
# Decode payload (no verification)
echo "<token>" | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

Check these fields:
- `iss` → must match `OIDC_ISSUER_URL`
- `aud` → set as `OIDC_AUDIENCE` or leave empty
- `sub` → user identifier
- `email`, `name` → user info
- `groups` → RBAC groups (or adjust `JWT_GROUPS_CLAIM`)
- `exp` → expiry timestamp

## Running Tests

```bash
pnpm test           # unit tests
pnpm test:e2e       # end-to-end tests
```

Tests use mocked guards — no real Pocket ID connection required.

## Docker

### Build and run locally

```bash
docker build -t wreislab-nestjs-template .
docker run -p 3000:3000 --env-file .env wreislab-nestjs-template
```

### Docker Compose

```bash
docker compose up
```

## Dokploy Deployment

```
Project/App:      wreislab-nestjs-template
Build method:     Dockerfile
Dockerfile path:  Dockerfile
Port:             3000
Healthcheck:      /health

Environment variables: set all from .env.example in Dokploy UI

LAN access:  http://api-template.192.168.1.106.sslip.io
External:    https://api-template.wreislab.com
```

Set `CORS_ORIGIN` to the frontend URL in production:
```
CORS_ORIGIN=https://react-template.wreislab.com
```

## Prometheus

Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: wreislab-nestjs-template
    static_configs:
      - targets: ["api-template.192.168.1.106.sslip.io:80"]
    metrics_path: /metrics
```

Available metrics:
- `http_requests_total{method,path,status_code}`
- `http_request_duration_seconds{method,path,status_code}`
- `http_requests_in_flight`
- Default Node.js process metrics (memory, CPU, event loop)

## Loki / Alloy

Logs are emitted as JSON to stdout. Alloy collects them via Docker log driver.

Example Alloy config snippet:
```hcl
loki.source.docker "wreislab" {
  host = "unix:///var/run/docker.sock"
  targets = discovery.docker.containers.targets
  labels = {
    job = "wreislab-nestjs-template",
  }
  forward_to = [loki.write.default.receiver]
}
```

Useful log fields: `service`, `environment`, `reqId`, `method`, `url`, `statusCode`, `responseTime`, `userSub`.

## Troubleshooting

### 401 Unauthorized

- Check `Authorization: Bearer <token>` header format
- Token may be expired — get a fresh one from the frontend
- Verify `OIDC_ISSUER_URL` matches the `iss` claim in the token exactly
- Verify `OIDC_AUDIENCE` matches the `aud` claim (or leave empty if aud is absent)

### 403 Forbidden

- Token is valid but user lacks required group
- Check user's groups in Pocket ID admin panel
- Decode token and verify `groups` claim is present
- Adjust `JWT_GROUPS_CLAIM` if groups are under a different claim name

### JWKS not found

- Verify `OIDC_JWKS_URI=https://auth.wreislab.com/.well-known/jwks.json` is reachable
- Check network connectivity from the backend container to Pocket ID
- Look at startup logs for `JWKS URI set from config` or `JWKS URI discovered`

### Token without groups

1. Confirm the frontend requests `openid profile email groups` scope
2. Confirm the user belongs to at least one group in Pocket ID
3. Check the UserInfo endpoint: `GET https://auth.wreislab.com/api/oidc/userinfo` with the Bearer token
4. Adjust `JWT_GROUPS_CLAIM` if the groups claim has a different name

## Adapting This Template

To use this as a starting point for a new NestJS API:

1. Rename `APP_NAME` in `.env`
2. Add your feature modules in `src/`
3. Use `@Public()` for open endpoints
4. Use `@Groups('admin')` + `@UseGuards(GroupsGuard)` for RBAC
5. Use `@CurrentUser() user: AuthenticatedUser` to access user data
6. Add a database module (PostgreSQL, etc.) in `docker-compose.yml`
7. Update the `Dockerfile` if additional build steps are needed
