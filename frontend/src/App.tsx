import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore, useModalStore, useThemeStore } from '@/store';
import { Layout } from '@/components/layout/Layout';
import { AuthModal } from '@/components/modals/AuthModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AboutPage } from '@/pages/AboutPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { EstimatePage } from '@/pages/EstimatePage';
import { HomePage } from '@/pages/HomePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const { openSignIn } = useModalStore();

  useEffect(() => {
    if (!isAuthenticated) {
      openSignIn();
    }
  }, [isAuthenticated, openSignIn]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

export default function App() {
  const { hydrateUser } = useAuthStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    hydrateUser();
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/estimate"
              element={
                <ProtectedRoute>
                  <EstimatePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
        <AuthModal />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
