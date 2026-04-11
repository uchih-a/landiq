# Production Deployment Checklist

## 🔐 Security & Credentials

- [ ] Generated strong JWT_SECRET_KEY (32+ hex characters)
- [ ] Database password is strong and unique
- [ ] No credentials committed to GitHub (check .gitignore)
- [ ] Environment variables not exposed in logs
- [ ] `DEBUG=false` in production
- [ ] `ALLOWED_ORIGINS` only includes legitimate domains

## 🗄️ Database Setup (Render)

- [ ] PostgreSQL instance created on Render
- [ ] Database name: `landiq_db`
- [ ] Database user: `landiq_user`
- [ ] Strong password set
- [ ] Internal connection string copied (ends with `.c7.internal`)
- [ ] Backups configured (7+ days)
- [ ] Connection pooling enabled

## 🔧 Backend Setup (Render)

- [ ] GitHub repository connected to Render
- [ ] Docker build configured correctly
- [ ] Health check endpoint working: `/api/v1/health`
- [ ] All environment variables set correctly
- [ ] `DATABASE_URL` uses internal connection string
- [ ] `ALLOWED_ORIGINS` includes frontend domain
- [ ] Build succeeds without errors
- [ ] Service deployed and healthy (green indicator)

## 🗂️ Database Migrations

- [ ] Alembic migrations run successfully
- [ ] `0001_initial_schema.py` applied
- [ ] `0002_remove_deprecated_model_columns.py` applied
- [ ] All tables created and verified

## 📦 ML Model Files

- [ ] All 6 model files present in `ml_models/`:
  - [ ] `mlp_model.pt`
  - [ ] `mlp_scaler.pkl`
  - [ ] `mlp_feature_list.pkl`
  - [ ] `mlp_hidden_layers.pkl`
  - [ ] `mlp_county_mean_map.pkl`
  - [ ] `mlp_global_mean.pkl`
- [ ] Model files are not in `.gitignore` (or forced add with LFS)
- [ ] Total model size acceptable for deployment

## 🌐 Frontend Setup (Vercel)

- [ ] Project imported from GitHub
- [ ] Framework detected as Vite
- [ ] Root directory set to `./frontend`
- [ ] `VITE_API_URL` environment variable set (with trailing `/`)
- [ ] Build succeeds: `npm run build`
- [ ] Build output is `dist/` directory
- [ ] Auto-deploy on push enabled

## 🔌 API Connectivity

- [ ] Frontend can connect to backend API
- [ ] CORS headers configured correctly
- [ ] API health endpoint responds: `GET /api/v1/health`
- [ ] API documentation accessible: `GET /docs`
- [ ] Authentication endpoints working
- [ ] Prediction endpoints working

## ✅ Feature Verification

- [ ] User registration works
- [ ] User login works
- [ ] Prediction creation works
- [ ] ML model inference runs without errors
- [ ] Feature breakdown returns 10+ features
- [ ] Price calculations correct
- [ ] Prediction history retrieval works

## 🖥️ Monitoring & Alerts

- [ ] Render metrics dashboard accessible
- [ ] Vercel deployment logs accessible
- [ ] Error tracking enabled (optional: Sentry/Rollbar)
- [ ] Log aggregation configured (optional)
- [ ] Uptime monitoring configured (optional: UptimeRobot)

## 🔒 SSL/HTTPS

- [ ] Both Render and Vercel using HTTPS
- [ ] SSL certificates valid
- [ ] Mixed content warnings resolved
- [ ] Security headers set correctly

## 📄 Documentation

- [ ] `DEPLOYMENT.md` updated with actual URLs
- [ ] `README.md` includes production links
- [ ] API documentation published
- [ ] Troubleshooting guide reviewed
- [ ] Team has deployment docs

## 🧪 Testing

- [ ] All unit tests passing locally
- [ ] Integration tests passing
- [ ] End-to-end test in production (create prediction)
- [ ] Load test (optional): Simulate concurrent requests
- [ ] Browser compatibility tested

## 🔄 Rollback Plan

- [ ] Previous stable version tagged in Git
- [ ] Database backups verified on Render
- [ ] Rollback procedure documented
- [ ] Estimated rollback time: < 5 minutes

## 📊 Post-Deployment

- [ ] Monitor logs for first 1 hour
- [ ] Check error rates (should be ~0%)
- [ ] Verify API response times (< 500ms)
- [ ] Test all user flows manually
- [ ] Share deployment link with team
- [ ] Document any issues encountered

## 🎉 Launch Complete

- [ ] Team notified of live status
- [ ] Users notified (if applicable)
- [ ] Monitoring active
- [ ] Support procedures in place
- [ ] Congratulations! 🚀

---

## Quick Reference URLs

| Component | URL |
|-----------|-----|
| Frontend | https://landiq-kenya.vercel.app |
| Backend API | https://api-landiq.onrender.com |
| Render Dashboard | https://dashboard.render.com |
| Vercel Dashboard | https://vercel.com/dashboard |
| GitHub Repo | https://github.com/YOUR_USERNAME/landiq-kenya |

---

## Emergency Contacts

- Render Support: https://render.com/support
- Vercel Support: https://vercel.com/support
- Status Page: https://status.render.com, https://www.vercelstatus.com

---

**Last Deployed:** [Date]
**Deployed By:** [Name]
**Version:** 1.0.0
