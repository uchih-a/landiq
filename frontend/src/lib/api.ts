import axios, { AxiosError } from 'axios';
import type {
  CountyStat,
  InvestmentCounty,
  MarketSummary,
  PredictionHistoryPage,
  PredictionRequest,
  PredictionResponse,
  ProximityData,
  ScoreData,
  SpatialListing,
  RawProximityData,
  Token,
  User,
} from '@/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('landiq_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle 401
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('landiq_token');
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: async (email: string, password: string): Promise<Token> => {
    const response = await api.post('/api/v1/auth/register', { email, password });
    return response.data;
  },

  login: async (email: string, password: string): Promise<Token> => {
    const response = await api.post('/api/v1/auth/login', { email, password });
    return response.data;
  },

  me: async (): Promise<User> => {
    const response = await api.get('/api/v1/auth/me');
    return response.data;
  },
};

// Prediction API
export const predictApi = {
  predict: async (payload: PredictionRequest): Promise<PredictionResponse> => {
    const response = await api.post('/api/v1/predict', payload);
    return response.data;
  },

  history: async (page = 1, limit = 10): Promise<PredictionHistoryPage> => {
    const response = await api.get('/api/v1/predict/history', {
      params: { page, limit },
    });
    return response.data;
  },
};

// Market API
export const marketApi = {
  summary: async (county?: string): Promise<MarketSummary> => {
    const response = await api.get('/api/v1/market/summary', {
      params: county ? { county } : undefined,
    });
    return response.data;
  },

  counties: async (county?: string): Promise<CountyStat[]> => {
    const response = await api.get('/api/v1/market/counties', {
      params: county ? { county } : undefined,
    });
    return response.data;
  },

  spatial: async (county?: string): Promise<SpatialListing[]> => {
    const response = await api.get('/api/v1/market/spatial', {
      params: county ? { county } : undefined,
    });
    return response.data;
  },

  proximityRaw: async (county?: string): Promise<any> => {
    const response = await api.get('/api/v1/market/proximity/raw', {
      params: county && county !== 'All' ? { county } : undefined,
    });
    return response.data;
  },

  proximity: async (county?: string): Promise<ProximityData> => {
    const response = await api.get('/api/v1/market/proximity', {
      params: county ? { county } : undefined,
    });
    return response.data;
  },

  scores: async (county?: string): Promise<ScoreData> => {
    const response = await api.get('/api/v1/market/scores', {
      params: county ? { county } : undefined,
    });
    return response.data;
  },

  bestInvestment: async (county?: string): Promise<InvestmentCounty[]> => {
    const response = await api.get('/api/v1/market/best-investment', {
      params: county ? { county } : undefined,
    });
    return response.data;
  },
};

export default api;
