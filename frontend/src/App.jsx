import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import ScorerPage from "./pages/ScorerPage";
import ScoreboardPage from "./pages/ScoreboardPage";
import UmpireSetupPage from "./pages/UmpireSetupPage";
import UmpireScorerPage from "./pages/UmpireScorerPage";
import TossPage from "./pages/TossPage";
import PlayerProfilesPage from "./pages/PlayerProfilesPage";
import UmpireLoginPage, { UMPIRE_AUTH_KEY } from "./pages/UmpireLoginPage";

function RequireUmpireAuth() {
  const location = useLocation();
  const isUnlocked = sessionStorage.getItem(UMPIRE_AUTH_KEY) === "true";

  if (!isUnlocked) {
    return (
      <Navigate
        to="/umpire/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/view" element={<HomePage />} />
      <Route path="/umpire/login" element={<UmpireLoginPage />} />
      <Route element={<RequireUmpireAuth />}>
        <Route path="/umpire" element={<UmpireSetupPage />} />
        <Route path="/umpire/toss/:matchId" element={<TossPage />} />
        <Route path="/umpire/scorer/:matchId" element={<UmpireScorerPage />} />
        <Route path="/scorer/:matchId" element={<ScorerPage />} />
      </Route>
      <Route path="/scoreboard/:matchId" element={<ScoreboardPage />} />
      <Route path="/players" element={<PlayerProfilesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
