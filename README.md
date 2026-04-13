# LandIQ Kenya

AI-powered land valuation platform for Kenya. Get bank-grade land valuations in seconds using our MLP neural network model trained on 5796+ historical listings across 30 counties.

## Features

- **AI-Powered Valuations**: MLP neural network model with 71% R² accuracy
- **Geospatial Analysis**: Interactive maps showing land price distributions
- **Market Insights**: County-level statistics and investment opportunity rankings
- **User Authentication**: Secure JWT-based authentication
- **Prediction History**: Track and manage your land valuations

## Tech Stack

### Backend
- **Framework**: FastAPI (Python)
- **Database**: PostgreSQL with SQLAlchemy ORM
- **ML**: PyTorch (CPU-only), scikit-learn
- **Authentication**: JWT with bcrypt
- **Migrations**: Alembic

### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Charts**: Recharts, deck.gl
- **Maps**: MapLibre GL

## Prerequisites

- Docker Desktop
- Node.js 20+ (for local frontend development)
- Python 3.11+ (for local backend development)

## Setup

### 1. Clone and Navigate

```bash
git clone <repository-url>
cd landiq-kenya
```

### 2. Copy Model Artifacts

Place your model files in the `ml_models/` directory:
- `mlp_model.pt` - PyTorch model weights
- `mlp_scaler.pkl` - Feature scaler
- `mlp_feature_list.pkl` - Feature name list
- `mlp_hidden_layers.pkl` - Model architecture

```bash
cp /path/to/your/models/* ml_models/
```

### 3. Configure Environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set a secure JWT_SECRET_KEY (min 32 characters)
```

### 4. Start the Application

```bash
chmod +x scripts/start.sh
./scripts/start.sh
```

This will:
- Build Docker images
- Start PostgreSQL database
- Run database migrations
- Start backend, frontend, and nginx services

### 5. Seed Historical Data (Optional)

```bash
# After the application is running
python scripts/seed_historical.py --parquet /path/to/your/data.parquet
```

## Service URLs

After starting the application:

- **Frontend**: http://localhost:5173
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Via Nginx**: http://localhost

## Running Tests

### Backend Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

### Frontend Type Check

```bash
cd frontend
npm install
npm run type-check
```

## Project Structure

```
landiq-kenya/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/         # API endpoints
│   │   ├── core/        # Config, security
│   │   ├── db/          # Database session
│   │   ├── models/      # SQLAlchemy models
│   │   ├── schemas/     # Pydantic schemas
│   │   └── services/    # Business logic
│   ├── alembic/         # Database migrations
│   └── tests/           # Test suite
├── frontend/            # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── hooks/       # Custom hooks
│   │   ├── lib/         # Utilities, API client
│   │   ├── pages/       # Page components
│   │   ├── store/       # Zustand stores
│   │   └── types/       # TypeScript types
│   └── public/          # Static assets
├── ml_models/           # Model artifacts (gitignored)
├── nginx/               # Nginx configuration
└── scripts/             # Utility scripts
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user

### Predictions
- `POST /api/v1/predict` - Create land valuation (authenticated)
- `GET /api/v1/predict/history` - Get prediction history (authenticated)

### Market Data (Public)
- `GET /api/v1/market/summary` - Market summary
- `GET /api/v1/market/counties` - County statistics
- `GET /api/v1/market/spatial` - Spatial listing data
- `GET /api/v1/market/proximity` - Proximity analysis
- `GET /api/v1/market/scores` - Score analysis
- `GET /api/v1/market/best-investment` - Investment rankings

## Environment Variables

### Backend (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection URL | - |
| `JWT_SECRET_KEY` | Secret key for JWT (min 32 chars) | - |
| `JWT_ALGORITHM` | JWT algorithm | HS256 |
| `ACCESS_TOKEN_EXPIRE_DAYS` | Token expiry in days | 7 |
| `ALLOWED_ORIGINS` | CORS allowed origins | ["http://localhost:5173"] |
| `MODEL_DIR` | Path to model artifacts | ./ml_models |
| `APP_ENV` | Application environment | development |
| `DEBUG` | Enable debug mode | true |

### Frontend (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | http://localhost:8000 |

## License

MIT License - see LICENSE file for details.

## Acknowledgements

- Property24 Kenya for listing data
- OpenStreetMap for geocoding and amenities data
- Kenya National Bureau of Statistics for county boundaries
# landiq
# landiq
# landiq
