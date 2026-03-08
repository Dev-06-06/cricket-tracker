import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { API_BASE_URL } from "../services/api";

const TOKEN_STORAGE_KEY = "crictrack_token";
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => localStorage.getItem(TOKEN_STORAGE_KEY) || "",
  );
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem("crictrack_user");
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });

  const refreshUser = useCallback(async () => {
    if (!token) {
      setUser(null);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (response.ok && data?.success && data?.user) {
        setUser(data.user);
        localStorage.setItem("crictrack_user", JSON.stringify(data.user));
      }
    } catch {
      // Best-effort refresh only.
    }
  }, [token]);

  const login = useCallback((nextToken, userData) => {
    if (!nextToken) return;
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    if (userData) {
      localStorage.setItem("crictrack_user", JSON.stringify(userData));
      setUser(userData);
    }
    setToken(nextToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem("crictrack_user");
    setToken("");
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem("crictrack_user", JSON.stringify(updatedUser));
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadCurrentUser = async () => {
      if (!token) {
        if (isMounted) setUser(null);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        let data = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok || !data?.success || !data?.user) {
          throw new Error(data?.message || "Unable to authenticate user");
        }

        if (isMounted) {
          setUser(data.user);
        }
      } catch {
        if (isMounted) {
          logout();
        }
      }
    };

    loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, [token, logout]);

  const value = useMemo(
    () => ({
      user,
      token,
      login,
      logout,
      refreshUser,
      updateUser,
      isAuthenticated: Boolean(token),
    }),
    [user, token, login, logout, refreshUser, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
