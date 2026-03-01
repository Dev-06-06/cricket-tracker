import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOngoingMatch } from "../services/api";

function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    let pollTimer = null;

    const openOngoingMatch = async () => {
      try {
        const response = await getOngoingMatch();
        if (!isMounted) return;

        if (response.match?._id) {
          navigate(`/scoreboard/${response.match._id}?viewer=1`, {
            replace: true,
          });
          return;
        }

        setError("No ongoing match right now.");
      } catch (requestError) {
        if (isMounted) {
          setError(requestError.message || "Unable to load live match");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          pollTimer = setTimeout(openOngoingMatch, 5000);
        }
      }
    };

    openOngoingMatch();

    return () => {
      isMounted = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [navigate]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-10">
      <section className="w-full rounded-xl border border-slate-200 bg-white p-6 text-center">
        {loading ? (
          <p className="text-slate-700">Opening ongoing match scoreboard...</p>
        ) : error ? (
          <div className="space-y-1">
            <p className="text-sm text-red-600">{error}</p>
            <p className="text-xs text-slate-500">
              Auto-refreshing every 5 seconds...
            </p>
          </div>
        ) : (
          <p className="text-slate-700">Redirecting to scoreboard...</p>
        )}
      </section>
    </main>
  );
}

export default HomePage;
