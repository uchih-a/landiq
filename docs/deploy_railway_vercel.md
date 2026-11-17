# Deployment: Railway (backend) + Vercel (frontend)

## Backend — Railway

### 1. Push to GitHub

Railway deploys from a GitHub repo. Ensure the `Dockerfile` is at the repo root.

### 2. Create a Railway project

- Connect the GitHub repo
- Railway detects the `Dockerfile` and builds it
- Set environment variables in the Railway dashboard:

| Variable | Value |
|---|---|
| `APP_ENV` | `production` |
| `LOG_LEVEL` | `INFO` |
| `PORT` | (Railway sets this automatically) |
| `ARTIFACTS_DIR` | `/app/artifacts` |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` |
| `ALLOWED_ORIGINS_REGEX` | `https://kenya-land-val-.*\.vercel\.app` |

### 3. Mount artifacts as a volume

Railway supports persistent volumes. Mount the artifacts directory at
`/app/artifacts` (read-only). Upload model files via the Railway CLI:

```bash
railway volume add
railway upload ./artifacts/ /app/artifacts
```

### 4. Health check

Railway uses the `HEALTHCHECK` in the Dockerfile. The endpoint is
`GET /api/v1/health`.

## Frontend — Vercel

The frontend is a separate project deployed to Vercel. It calls the
Railway backend via HTTPS.

### Environment variables (Vercel dashboard)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://your-backend.up.railway.app/api/v1` |

### Preview URLs

Vercel generates preview URLs like `https://kenya-land-val-abc123.vercel.app`.
The backend's `ALLOWED_ORIGINS_REGEX` pattern matches these so CORS works
on every preview deployment.

## Local development with Podman

### Rootless Podman

Podman runs rootless by default on Linux. No special configuration needed
for building or running the container.

### SELinux volume labels

On SELinux-enabled systems (Fedora, RHEL), add `:z` or `:Z` to volume
mounts so the container can read the host directory:

```yaml
# compose.yaml
volumes:
  - ./artifacts:/app/artifacts:ro,z   # shared label
  # or
  - ./artifacts:/app/artifacts:ro,Z   # private label
```

- `:z` — shared: multiple containers can read/write
- `:Z` — private: only this container can access

For read-only model files, `:z` is sufficient.
