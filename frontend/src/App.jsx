import { Navigate, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ScorerPage from "./pages/ScorerPage";
import ScoreboardPage from "./pages/ScoreboardPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/scorer/:matchId" element={<ScorerPage />} />
      <Route path="/scoreboard/:matchId" element={<ScoreboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
