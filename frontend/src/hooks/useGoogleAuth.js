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
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        itp_support: true,
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
