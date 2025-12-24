import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoadingSpinner, Sidebar, MobileNav, ErrorBoundary } from './components';
import {
  Dashboard,
  Login,
  Register,
  StudyDetail,
  ParticipantList,
  BatchExecutions,
  Settings,
  CreateStudy,
  EnrollmentConfig,
  SurveyBuilder,
} from './pages';

// Protected route wrapper with responsive layout
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="lg:flex">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content area - offset for sidebar on desktop */}
      <div className="flex-1 lg:ml-64">
        {children}
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/study/:id"
        element={
          <ProtectedRoute>
            <StudyDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/participants/:studyId"
        element={
          <ProtectedRoute>
            <ParticipantList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/batches"
        element={
          <ProtectedRoute>
            <BatchExecutions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/studies/new"
        element={
          <ProtectedRoute>
            <CreateStudy />
          </ProtectedRoute>
        }
      />
      <Route
        path="/studies/:studyId/enrollment"
        element={
          <ProtectedRoute>
            <EnrollmentConfig />
          </ProtectedRoute>
        }
      />
      <Route
        path="/studies/:studyId/surveys/new"
        element={
          <ProtectedRoute>
            <SurveyBuilder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/studies/:studyId/surveys/:surveyId/edit"
        element={
          <ProtectedRoute>
            <SurveyBuilder />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

// Get basename from Vite's base config for production deployment
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
