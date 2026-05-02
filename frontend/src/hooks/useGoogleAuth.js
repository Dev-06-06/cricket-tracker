import { useEffect, useCallback } from "react";
import { googleLogin } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

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
        // Return error so the calling component can show it
        return err.message;
      }
    },
    [login, navigate, redirectTo],
  );

  const initGoogleButton = useCallback(
    (buttonElementId) => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        ux_mode: "redirect",
        redirect_uri: window.location.origin,
      });
      window.google.accounts.id.renderButton(
        document.getElementById(buttonElementId),
        {
          theme: "filled_black",
          size: "large",
          width: 400,
          text: "continue_with",
          shape: "rectangular",
        },
      );
    },
    [handleCredentialResponse],
  );

  return { initGoogleButton };
}
