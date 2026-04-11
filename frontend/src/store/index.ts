import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DashboardTab, Theme, User } from '@/types';
import { authApi } from '@/lib/api';

// Auth Store
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hydrateUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const token = await authApi.login(email, password);
          localStorage.setItem('landiq_token', token.access_token);
          const user = await authApi.me();
          set({ user, token: token.access_token, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },

      register: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const token = await authApi.register(email, password);
          localStorage.setItem('landiq_token', token.access_token);
          const user = await authApi.me();
          set({ user, token: token.access_token, isAuthenticated: true });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: () => {
        localStorage.removeItem('landiq_token');
        set({ user: null, token: null, isAuthenticated: false });
      },

      hydrateUser: async () => {
        const token = localStorage.getItem('landiq_token');
        if (!token) return;

        set({ isLoading: true });
        try {
          const user = await authApi.me();
          set({ user, token, isAuthenticated: true });
        } catch {
          localStorage.removeItem('landiq_token');
          set({ user: null, token: null, isAuthenticated: false });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'landiq-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);

// Theme Store
interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',

      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
        set({ theme: newTheme });
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
      },
    }),
    {
      name: 'landiq-theme',
    }
  )
);

// Modal Store
interface ModalState {
  isOpen: boolean;
  mode: 'signin' | 'register';
  openSignIn: () => void;
  openRegister: () => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isOpen: false,
  mode: 'signin',

  openSignIn: () => set({ isOpen: true, mode: 'signin' }),
  openRegister: () => set({ isOpen: true, mode: 'register' }),
  closeModal: () => set({ isOpen: false }),
}));

// Dashboard Store
interface DashboardState {
  activeTab: DashboardTab;
  countyFilter: string | null;
  setTab: (tab: DashboardTab) => void;
  setCountyFilter: (county: string | null) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeTab: 'market',
  countyFilter: null,

  setTab: (tab) => set({ activeTab: tab }),
  setCountyFilter: (county) => set({ countyFilter: county }),
}));
