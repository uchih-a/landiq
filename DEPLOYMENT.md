# LandIQ Kenya - Deployment Guide (Render + Vercel)

## 📋 Overview

This guide walks you through deploying the LandIQ Kenya app on:
- **Backend & Database**: Render.com
- **Frontend**: Vercel

Total deployment time: ~30-45 minutes

---

## 🔐 Pre-Deployment Checklist

- [ ] GitHub account with repo pushed
- [ ] Render.com account
- [ ] Vercel account
- [ ] Secure JWT secret (32+ characters)
- [ ] Strong database password
- [ ] All ML model files in `ml_models/` directory

---

## 🚀 Part 1: Deploy Backend on Render

### Step 1.1: Push to GitHub

```bash
cd /path/to/landiq-kenya
git add .
git commit -m "Ready for production deployment"
git push origin main
```

### Step 1.2: Create PostgreSQL Database on Render

1. **Go to [render.com](https://render.com)** → Sign up/Log in
2. **Dashboard** → New + → PostgreSQL
3. **Configure:**
   - Name: `landiq-db`
   - Database: `landiq_db`
   - User: `landiq_user`
   - Region: Choose closest to your users
   - Plan: **Starter** (minimal cost, $12/month)
4. **Click Create Database**
5. **Once created, copy the Internal Database URL** (looks like: `postgresql://landiq_user:...@dpg-xxx.onrender.com/landiq_db`)
   - Store this — you'll need it for the backend service

**DO NOT USE the external connection string** (ends with `?sslmode=require`) — use the internal one.

### Step 1.3: Deploy Backend Service on Render

1. **Dashboard** → New + → Web Service
2. **Connect Repository:**
   - Select your GitHub repo (`landiq-kenya`)
   - Branch: `main`
3. **Configure Service:**
   - Name: `landiq-api`
   - Environment: `Docker`
   - Build Command: Leave empty (Docker handles it)
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
   - Plan: **Starter** ($7/month)
   - Region: Same as database
4. **Environment Variables** — Add these in the environment section:

```
DATABASE_URL = postgresql+asyncpg://landiq_user:YOUR_DB_PASSWORD@dpg-xxx.c7.internal:5432/landiq_db

JWT_SECRET_KEY = [Generate with Python: python -c "import secrets; print(secrets.token_hex(32))"]

JWT_ALGORITHM = HS256

ACCESS_TOKEN_EXPIRE_DAYS = 7

ALLOWED_ORIGINS = ["https://landiq-kenya.vercel.app"]

MODEL_DIR = ./ml_models

NOMINATIM_USER_AGENT = landiq-kenya/1.0

APP_ENV = production

DEBUG = false

APP_VERSION = 1.0.0
```

5. **Advanced Settings:**
   - Health Check Path: `/api/v1/health`
   - Auto-Deploy: ON
   - Max instances: 3
6. **Click Create Web Service**

**⏳ Render will build and deploy** (5-10 minutes)

Once deployed, note your API URL: `https://landiq-api-xxxx.onrender.com`

### Step 1.4: Run Database Migrations

Once the backend is running:

```bash
# SSH into Render (click "Connect" button on Render dashboard)
# Then run:
cd /app && alembic upgrade head
```

Or use Render's Shell tab to execute:
```bash
./app/alembic upgrade head
```

---

## 🌐 Part 2: Deploy Frontend on Vercel

### Step 2.1: Deploy to Vercel

1. **Go to [vercel.com](https://vercel.com)** → Sign up/Log in with GitHub
2. **Import Project:**
   - Import Git Repository → Select `landiq-kenya`
   - Framework Preset: `Vite`
   - Root Directory: `./frontend`
3. **Environment Variables** — Add:

```
VITE_API_URL = https://landiq-api-xxxx.onrender.com/
```
**Note the trailing `/` — this is important!**

4. **Deploy** → Vercel will build and deploy (2-3 minutes)

Once deployed, note your frontend URL: `https://landiq-kenya.vercel.app`

### Step 2.2: Update Backend CORS Origins

Go back to Render Dashboard for `landiq-api`:
1. Settings → Environment
2. Update `ALLOWED_ORIGINS`:
```
["https://landiq-kenya.vercel.app", "https://yourdomain.com"]
```
3. Deploy again (manual trigger or auto-deploy on code push)

---

## 🧪 Part 3: Verification

### Test Backend Health

```bash
curl https://landiq-api-xxxx.onrender.com/api/v1/health
```

Expected response:
```json
{"status": "ok", "timestamp": "2024-04-11T12:00:00Z"}
```

### Test Frontend

1. Open `https://landiq-kenya.vercel.app` in browser
2. Try creating a prediction
3. Check browser console for errors (F12 → Console)

### Check API Logs

**Render Dashboard:**
- Click `landiq-api` service
- View Logs tab to debug issues

**Vercel Dashboard:**
- Click your project
- View Deployments → Logs

---

## 🔧 Troubleshooting

### ❌ "Cannot connect to database"
- Verify `DATABASE_URL` uses internal URL (`.c7.internal:5432`)
- Check DB user and password match Render PostgreSQL config
- Run migrations: `alembic upgrade head`

### ❌ "CORS error in browser"
- Add frontend URL to backend `ALLOWED_ORIGINS`
- Restart backend service on Render
- Clear browser cache (Cmd+Shift+Delete)

### ❌ "Model artifacts not found"
- Ensure `ml_models/` directory in repo root
- Check files:
  - `mlp_model.pt`
  - `mlp_scaler.pkl`
  - `mlp_feature_list.pkl`
  - `mlp_hidden_layers.pkl`
  - `mlp_county_mean_map.pkl`
  - `mlp_global_mean.pkl`

### ❌ "API endpoint returns 503"
- Backend service may still be deploying (takes 5-10 min)
- Check Render Logs for build errors
- Verify `healthcheck` passes

### ❌ "Vercel build fails"
- Check that `package.json` is in `./frontend/` directory
- Verify `VITE_API_URL` is set correctly with trailing `/`
- Check Vercel logs for specific error

---

## 📊 Monitoring & Maintenance

### Render

**View Logs:**
```
Dashboard → Service → Logs
```

**Monitor Performance:**
```
Dashboard → Service → Metrics
```

**Update Code:**
- Push to GitHub `main` branch
- Render auto-deploys if autoDeploy is ON
- Deployment takes ~5-10 minutes

### Vercel

**View Logs:**
```
Dashboard → Project → Deployments → [Latest] → Logs
```

**Manual Redeploy:**
```
Dashboard → Project → Deployments → [Latest] → Redeploy
```

---

## 💰 Estimated Monthly Costs

| Service | Plan | Cost |
|---------|------|------|
| Render PostgreSQL | Starter | $12 |
| Render Backend | Starter | $7 |
| Vercel Frontend | Free | $0 |
| **Total** | | **$19/month** |

---

## 🔒 Security Best Practices

1. ✅ Keep `JWT_SECRET_KEY` secure (never commit to repo)
2. ✅ Use `DEBUG=false` in production
3. ✅ Regularly update dependencies for security patches
4. ✅ Monitor API logs for suspicious activity
5. ✅ Use strong database passwords
6. ✅ Set `ALLOWED_ORIGINS` only to legitimate domains

---

## 📝 Custom Domain (Optional)

### Render Backend
1. Dashboard → Service → Settings → Custom Domain
2. Add your domain (e.g., `api.yourdomain.com`)
3. Follow DNS setup instructions

### Vercel Frontend
1. Dashboard → Project → Settings → Domains
2. Add your domain (e.g., `yourdomain.com`)
3. Follow DNS setup instructions

---

## 🆘 Quick Support

- **Render Support:** https://render.com/docs
- **Vercel Support:** https://vercel.com/docs
- **FastAPI Docs:** https://fastapi.tiangolo.com
- **Vite Docs:** https://vitejs.dev

---

## ✅ Deployment Success Checklist

- [ ] PostgreSQL running on Render
- [ ] Backend service deployed and healthy on Render
- [ ] Database migrations applied
- [ ] Frontend deployed on Vercel
- [ ] API calls working from frontend
- [ ] CORS configured correctly
- [ ] ML model artifacts loaded
- [ ] Authentication working
- [ ] Predictions working end-to-end
- [ ] Monitoring/logging reviewed
