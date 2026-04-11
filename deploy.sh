#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════════════════
# LandIQ Kenya - Rapid Deployment Script
# Usage: ./deploy.sh
# ═══════════════════════════════════════════════════════════════════════════

echo "🚀 LandIQ Kenya Deployment Script"
echo "=================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git not found. Please install Git.${NC}"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 not found. Please install Python 3.11+${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 20+${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites met${NC}"
echo ""

# Generate JWT Secret
echo "🔐 Generating JWT Secret..."
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
echo -e "${GREEN}✅ JWT_SECRET generated${NC}"
echo ""

# Create backend production env file
echo "📝 Creating production environment file..."
cat > backend/.env.production << EOF
DATABASE_URL=postgresql+asyncpg://landiq_user:SET_YOUR_DB_PASSWORD@dpg-xxx.c7.internal:5432/landiq_db
JWT_SECRET_KEY=$JWT_SECRET
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_DAYS=7
ALLOWED_ORIGINS=["https://landiq-kenya.vercel.app"]
MODEL_DIR=./ml_models
NOMINATIM_USER_AGENT=landiq-kenya/1.0
APP_ENV=production
DEBUG=false
APP_VERSION=1.0.0
EOF

echo -e "${GREEN}✅ Created backend/.env.production${NC}"
echo "   ⚠️  Update DATABASE_URL with your Render database credentials"
echo ""

# Git operations
echo "📦 Preparing for push..."

if ! git status --porcelain | grep -q .; then
    echo "ℹ️  Working directory clean - no changes to commit"
else
    echo "📝 Staging changes..."
    git add -A
    git commit -m "Deploy: production configuration ready"
    echo -e "${GREEN}✅ Changes committed${NC}"
fi

echo ""
echo "📤 Pushing to GitHub..."
git push origin main
echo -e "${GREEN}✅ Pushed to GitHub${NC}"
echo ""

# Summary
echo "═════════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Deployment Checklist Complete!${NC}"
echo "═════════════════════════════════════════════════════════════════════════"
echo ""
echo "🔑 Your JWT Secret:"
echo "   $JWT_SECRET"
echo ""
echo "📋 Next Steps:"
echo "   1. Go to https://render.com and create a PostgreSQL database"
echo "   2. Deploy backend on Render with DATABASE_URL from step 1"
echo "   3. Set JWT_SECRET_KEY to: $JWT_SECRET"
echo "   4. Go to https://vercel.com and deploy frontend"
echo "   5. Set VITE_API_URL to your Render backend URL"
echo ""
echo "📚 Full guide: See DEPLOYMENT.md"
echo ""
