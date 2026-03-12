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
import RequireAuth from "./routes/RequireAuth";

function App() {
  return (
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
            <UmpireSetupPage />
          </RequireAuth>
        }
      />
      <Route
        path="/umpire/toss/:matchId"
        element={
          <RequireAuth>
            <TossPage />
          </RequireAuth>
        }
      />
      <Route
        path="/umpire/scorer/:matchId"
        element={
          <RequireAuth>
            <UmpireScorerPage />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
