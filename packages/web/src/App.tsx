import { Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './context/SessionContext';
import Session from './pages/Session';
import Join from './pages/Join';
import EnrollmentPortal from './pages/EnrollmentPortal';
import Evaluate from './pages/Evaluate';
import LoadingSpinner from './components/LoadingSpinner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/join" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      {/* Enrollment Portal (public) */}
      <Route path="/enroll/:slug" element={<EnrollmentPortal />} />

      {/* Session routes */}
      <Route path="/join" element={<Join />} />
      <Route path="/join/:code" element={<Join />} />
      <Route
        path="/session/:code"
        element={
          <ProtectedRoute>
            <Session />
          </ProtectedRoute>
        }
      />
      {/* Evaluation routes */}
      <Route path="/evaluate/:sessionId" element={<Evaluate />} />
      {/* Redirect old /session to /join */}
      <Route path="/session" element={<Navigate to="/join" replace />} />
      <Route path="/" element={<Navigate to="/join" replace />} />
    </Routes>
  );
}

export default App;
