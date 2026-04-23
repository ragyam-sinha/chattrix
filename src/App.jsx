import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/useAuthStore';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import AppShell from './pages/AppShell';

export default function App() {
  const { user, loading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={user.isOnboarded ? '/app' : '/onboarding'} /> : <LoginPage />}
      />
      <Route
        path="/onboarding"
        element={
          !user ? <Navigate to="/login" /> :
          user.isOnboarded ? <Navigate to="/app" /> :
          <OnboardingPage />
        }
      />
      <Route
        path="/app/*"
        element={
          !user ? <Navigate to="/login" /> :
          !user.isOnboarded ? <Navigate to="/onboarding" /> :
          <AppShell />
        }
      />
      <Route path="*" element={<Navigate to={user ? (user.isOnboarded ? '/app' : '/onboarding') : '/login'} />} />
    </Routes>
  );
}
