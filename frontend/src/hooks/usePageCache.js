import { useCallback } from "react";

export default function usePageCache(key, maxAgeSeconds = 120) {
  const get = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const fetchedAt = parsed?.fetchedAt;
      if (!fetchedAt) return null;

      const ageSeconds = (Date.now() - fetchedAt) / 1000;
      if (ageSeconds > maxAgeSeconds) return null;

      return parsed.data;
    } catch {
      return null;
    }
  }, [key, maxAgeSeconds]);

  const set = useCallback(
    (data) => {
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({ data, fetchedAt: Date.now() }),
        );
      } catch {}
    },
    [key],
  );

  const clear = useCallback(() => {
    sessionStorage.removeItem(key);
  }, [key]);

  return { get, set, clear };
}
