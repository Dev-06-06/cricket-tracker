import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const UMPIRE_PIN = "71845";
const UMPIRE_AUTH_KEY = "umpireModeUnlocked";

function UmpireLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const fromPath = location.state?.from;
  const redirectTo =
    typeof fromPath === "string" && fromPath.startsWith("/umpire")
      ? fromPath
      : "/umpire";

  useEffect(() => {
    if (sessionStorage.getItem(UMPIRE_AUTH_KEY) === "true") {
      navigate("/umpire", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (pin !== UMPIRE_PIN) {
      setError("Incorrect PIN");
      return;
    }

    sessionStorage.setItem(UMPIRE_AUTH_KEY, "true");
    navigate(redirectTo, { replace: true });
  };

  return (
    <main className="app-shell flex max-w-md items-center">
      <section className="panel w-full p-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Umpire Mode
        </h1>
        <p className="mt-2 text-sm text-slate-600">Enter PIN to continue.</p>

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 5));
              if (error) {
                setError("");
              }
            }}
            placeholder="Enter 5-digit PIN"
            className="field"
          />

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn btn-dark w-full">
            Enter Umpire Mode
          </button>
        </form>
      </section>
    </main>
  );
}

export { UMPIRE_AUTH_KEY };
export default UmpireLoginPage;
