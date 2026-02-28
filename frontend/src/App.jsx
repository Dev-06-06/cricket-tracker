import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import ScorerPage from "./pages/ScorerPage";
import ScoreboardPage from "./pages/ScoreboardPage";
import UmpireSetupPage from "./pages/UmpireSetupPage";
import TossPage from "./pages/TossPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/view" element={<HomePage />} />
      <Route path="/umpire" element={<UmpireSetupPage />} />
      <Route path="/umpire/toss/:matchId" element={<TossPage />} />
      <Route path="/umpire/scorer/:matchId" element={<ScorerPage />} />
      <Route path="/scorer/:matchId" element={<ScorerPage />} />
      <Route path="/scoreboard/:matchId" element={<ScoreboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
