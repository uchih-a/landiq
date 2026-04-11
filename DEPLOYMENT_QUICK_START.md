# 🚀 LandIQ Kenya - Render + Vercel Deployment

## Files Created for Deployment

```
📦 landiq-kenya/
├── 📄 DEPLOYMENT.md                    [→ Full deployment guide]
├── 📄 DEPLOYMENT_CHECKLIST.md          [→ Pre-flight checklist]
├── 🔧 deploy.sh                        [→ Automated setup script]
├── 📋 render.yaml                      [→ Render multi-service config]
├── frontend/
│   ├── 📄 vercel.json                  [→ Vercel build config]
│   └── 📄 .vercelignore                [→ Vercel ignore patterns]
├── backend/
│   ├── 📄 .env.production.example      [→ Prod env template]
│   └── Dockerfile                      [→ Production image]
├── .github/
│   └── workflows/
│       └── 📄 ci-cd.yml                [→ GitHub Actions pipeline]
```

---

## ⚡ 5-Minute Quick Start

### 1️⃣ Generate JWT Secret
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
# Copy the output — you'll need it
```

### 2️⃣ Create Render PostgreSQL Database
- Go to https://render.com → New + → PostgreSQL
- Name: `landiq-db`
- User: `landiq_user`
- Save the **internal database URL** (ends with `.c7.internal`)

### 3️⃣ Deploy Backend on Render
- Go to https://render.com → New + → Web Service
- Connect GitHub repo (`landiq-kenya`)
- Set environment variables:
  - `DATABASE_URL`: [from step 2]
  - `JWT_SECRET_KEY`: [from step 1]
  - `ALLOWED_ORIGINS`: `["https://landiq-kenya.vercel.app"]`
  - Other vars from `.env.production.example`
- Deploy!
- Wait 5-10 minutes, note the API URL: `https://landiq-api-xxxx.onrender.com`

### 4️⃣ Run Database Migrations
```bash
# In Render shell tab:
cd /app && alembic upgrade head
```

### 5️⃣ Deploy Frontend on Vercel
- Go to https://vercel.com → Import Project
- Select `landiq-kenya` repo
- Root directory: `./frontend`
- Set environment: `VITE_API_URL=https://landiq-api-xxxx.onrender.com/`
- Deploy!
- Wait 2-3 minutes, note the frontend URL: `https://landiq-kenya.vercel.app`

### 6️⃣ Test Everything
```bash
# Test backend
curl https://landiq-api-xxxx.onrender.com/api/v1/health

# Open in browser
https://landiq-kenya.vercel.app
```

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| **DEPLOYMENT.md** | Complete step-by-step guide with screenshots |
| **DEPLOYMENT_CHECKLIST.md** | Pre-deployment & post-deployment verification |
| **render.yaml** | Render configuration (advanced multi-service) |
| **frontend/vercel.json** | Vercel build config & redirects |
| **deploy.sh** | Automated setup script |
| **.github/workflows/ci-cd.yml** | Automated testing & Docker builds |

---

## 🌍 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Browser                             │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴──────────────┐
         │                          │
    ┌────▼─────┐            ┌──────▼──────┐
    │  Vercel  │            │   Render    │
    │(Frontend)│◄──API───────►(Backend)   │
    │          │            │             │
    │ React +  │            │  FastAPI +  │
    │  Vite    │            │  Python     │
    └──────────┘            │             │
                            │         ┌───▼────────┐
                            │         │ PostgreSQL │
                            └─────────►           │
                                      └───────────┘
                                   (Render DB)
```

---

## 💾 Hosting Costs (Monthly)

| Service | Plan | Price |
|---------|------|-------|
| Render PostgreSQL | Starter | $12 |
| Render Backend | Starter | $7 |
| Vercel Frontend | Free | **$0** |
| **Total** | | **$19** |

Upgrade backend to Standard ($25) only if you get > 100k requests/month.

---

## 🔐 Environment Variables Required

### Backend (Render)
```
DATABASE_URL                 # From Render PostgreSQL
JWT_SECRET_KEY              # Generated with: python3 -c "import secrets; print(secrets.token_hex(32))"
JWT_ALGORITHM               # HS256
ACCESS_TOKEN_EXPIRE_DAYS    # 7
ALLOWED_ORIGINS             # ["https://landiq-kenya.vercel.app"]
MODEL_DIR                   # ./ml_models
NOMINATIM_USER_AGENT        # landiq-kenya/1.0
APP_ENV                     # production
DEBUG                       # false
APP_VERSION                 # 1.0.0
```

### Frontend (Vercel)
```
VITE_API_URL                # https://landiq-api-xxxx.onrender.com/
```
**Important:** Include trailing `/`

---

## ✅ Verification Tests

### Backend Health Check
```bash
curl https://landiq-api-xxxx.onrender.com/api/v1/health
# Expected: {"status": "ok", "timestamp": "..."}
```

### API Documentation
```
https://landiq-api-xxxx.onrender.com/docs
```

### Database Connection
```bash
# Check in Render logs
psycopg2.connect(database_url) → Should succeed
```

### Frontend Load
```
https://landiq-kenya.vercel.app
```
Should load without CORS errors (check browser console F12)

---

## 🐛 Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| **CORS Error** | Add frontend URL to `ALLOWED_ORIGINS`, restart backend |
| **Database Connection Fails** | Use **internal** URL (`.c7.internal`), not external |
| **Model Not Found** | Ensure `ml_models/` directory in repo root |
| **Build Fails** | Check `package.json` is in `frontend/` directory |
| **API 503** | Backend still deploying (5-10 min), check Render logs |
| **Slow Predictions** | Render Starter might need upgrade, check logs |

---

## 📞 Support Resources

| Platform | Link |
|----------|------|
| Render Docs | https://render.com/docs |
| Vercel Docs | https://vercel.com/docs |
| FastAPI | https://fastapi.tiangolo.com |
| PostgreSQL | https://www.postgresql.org/docs |
| Vite | https://vitejs.dev/guide |

---

## 🎯 Next Steps After Deployment

1. **Monitor Performance**
   - Check Render metrics dashboard
   - Monitor Vercel analytics
   - Set up error alerts

2. **Security Hardening** (Optional)
   - Add rate limiting to API
   - Enable WAF on Render
   - Set up DDoS protection

3. **Custom Domain** (Optional)
   - Connect domain to Vercel frontend
   - Connect domain to Render backend
   - Set up SSL certificates

4. **Scaling** (If needed later)
   - Upgrade Render backend tier
   - Add caching layer (Redis)
   - Implement CDN

---

## 📊 Monitoring After Deploy

### Daily
- [ ] Check error rate in logs (should be < 1%)
- [ ] Verify API response times (< 500ms)
- [ ] Test user flows manually

### Weekly
- [ ] Review database size growth
- [ ] Check for security warnings
- [ ] Update dependencies if patches available

### Monthly
- [ ] Analyze usage patterns
- [ ] Review cost optimization opportunities
- [ ] Update documentation if needed

---

## 🎉 Deployment Complete!

Once all steps are verified ✅ in `DEPLOYMENT_CHECKLIST.md`, your app is live!

**Frontend:** https://landiq-kenya.vercel.app  
**Backend API:** https://landiq-api-xxxx.onrender.com  
**Database Dashboard:** https://dashboard.render.com  
**CI/CD:** https://github.com/YOUR_USERNAME/landiq-kenya/actions

---

**Questions?** Check `DEPLOYMENT.md` for detailed troubleshooting.
