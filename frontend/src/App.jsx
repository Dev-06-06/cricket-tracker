import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import RequireAuth from "./routes/RequireAuth";
import ErrorBoundary from "./components/ErrorBoundary";

const HomePage = lazy(() => import("./pages/HomePage"));
const UmpireSetupPage = lazy(() => import("./pages/UmpireSetupPage"));
const UmpireScorerPage = lazy(() => import("./pages/UmpireScorerPage"));
const ScorerPage = lazy(() => import("./pages/ScorerPage"));
const TossPage = lazy(() => import("./pages/TossPage"));
const ScoreboardPage = lazy(() => import("./pages/ScoreboardPage"));
const GroupsPage = lazy(() => import("./pages/GroupsPage"));
const PlayerProfilesPage = lazy(() => import("./pages/PlayerProfilesPage"));
const UserProfilePage = lazy(() => import("./pages/UserProfilePage"));

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#0d1117]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#f97316] border-t-transparent" />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/view"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/umpire"
          element={
            <RequireAuth>
              <ErrorBoundary>
                <UmpireSetupPage />
              </ErrorBoundary>
            </RequireAuth>
          }
        />
        <Route
          path="/umpire/toss/:matchId"
          element={
            <RequireAuth>
              <ErrorBoundary>
                <TossPage />
              </ErrorBoundary>
            </RequireAuth>
          }
        />
        <Route
          path="/umpire/scorer/:matchId"
          element={
            <RequireAuth>
              <ErrorBoundary>
                <UmpireScorerPage />
              </ErrorBoundary>
            </RequireAuth>
          }
        />
        <Route
          path="/scorer/:matchId"
          element={
            <RequireAuth>
              <ScorerPage />
            </RequireAuth>
          }
        />
        <Route path="/scoreboard/:matchId" element={<ScoreboardPage />} />
        <Route
          path="/players"
          element={
            <RequireAuth>
              <PlayerProfilesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/groups"
          element={
            <RequireAuth>
              <GroupsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <UserProfilePage />
            </RequireAuth>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
