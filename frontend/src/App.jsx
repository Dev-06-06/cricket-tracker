import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import ScorerPage from "./pages/ScorerPage";
import ScoreboardPage from "./pages/ScoreboardPage";
import UmpireSetupPage from "./pages/UmpireSetupPage";
import UmpireScorerPage from "./pages/UmpireScorerPage";
import TossPage from "./pages/TossPage";
import PlayerProfilesPage from "./pages/PlayerProfilesPage";
import GroupsPage from "./pages/GroupsPage";
import UserProfilePage from "./pages/UserProfilePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProtectedRoute from "./routes/ProtectedRoute";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/view"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/umpire"
        element={
          <ProtectedRoute>
            <UmpireSetupPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/umpire/toss/:matchId"
        element={
          <ProtectedRoute>
            <TossPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/umpire/scorer/:matchId"
        element={
          <ProtectedRoute>
            <UmpireScorerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scorer/:matchId"
        element={
          <ProtectedRoute>
            <ScorerPage />
          </ProtectedRoute>
        }
      />
      <Route path="/scoreboard/:matchId" element={<ScoreboardPage />} />
      <Route
        path="/players"
        element={
          <ProtectedRoute>
            <PlayerProfilesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/groups"
        element={
          <ProtectedRoute>
            <GroupsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <UserProfilePage />
          </ProtectedRoute>
        }
      />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
