import { useEffect, useCallback } from "react";
import { googleLogin } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

let googleInitialized = false;

export function useGoogleAuth(redirectTo = "/view") {
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleCredentialResponse = useCallback(
    async (response) => {
      try {
        const data = await googleLogin(response.credential);
        login(data.token, data.user);
        navigate(redirectTo, { replace: true });
      } catch (err) {
        console.error("Google login failed:", err.message);
        alert(
          "Google sign-in was blocked by your browser. " +
            "Please try email login or disable your browser shields for this site.",
        );
        return err.message;
      }
    },
    [login, navigate, redirectTo],
  );

  const initGoogleButton = useCallback(
    (buttonElementId) => {
      if (!window.google) return;

      const render = () => {
        if (!window.google) return;

        if (!googleInitialized) {
          window.google.accounts.id.initialize({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse,
            itp_support: true,
          });
          googleInitialized = true;
        }

        const el = document.getElementById(buttonElementId);
        if (!el) return;
        window.google.accounts.id.renderButton(el, {
          theme: "filled_black",
          size: "large",
          width: 400,
          text: "continue_with",
          shape: "rectangular",
        });
      };

      render();
    },
    [handleCredentialResponse],
  );

  return { initGoogleButton };
}
