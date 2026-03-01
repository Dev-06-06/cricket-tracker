const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message || `Request failed with status ${response.status}`,
    );
  }

  if (!data?.success) {
    throw new Error(data?.message || "Request failed");
  }

  return data;
}

export function createMatch(payload) {
  return request("/api/match", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMatch(matchId) {
  return request(`/api/match/${matchId}`);
}

export { API_BASE_URL };
