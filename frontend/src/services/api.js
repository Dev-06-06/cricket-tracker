const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const { headers: _headers, ...restOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...restOptions,
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

function withGroupId(path, groupId) {
  if (!groupId) return path;

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}groupId=${encodeURIComponent(groupId)}`;
}

export function createMatch(payload) {
  return request("/api/match", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createUpcomingMatch(payload, token) {
  return request("/api/match/upcoming", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload),
  });
}

export function getGroupPlayers(groupId, token) {
  return request(`/api/groups/${groupId}/players`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getGroupPlayersWithStats(groupId, token) {
  return request(`/api/players/by-group/${groupId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function addGroupPlayer(groupId, playerId, token) {
  return request(`/api/groups/${groupId}/players`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ playerId }),
  });
}

export function removeGroupPlayer(groupId, playerId, token) {
  return request(`/api/groups/${groupId}/players/${playerId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getMatch(matchId) {
  return request(`/api/match/${matchId}`);
}

export function getOngoingMatch() {
  return request("/api/match/ongoing");
}

export function getUpcomingMatches(groupId, token) {
  return request(withGroupId("/api/match/upcoming", groupId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function getLiveMatches(groupId, token) {
  return request(withGroupId("/api/match/live", groupId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function getCompletedMatches(groupId, token) {
  return request(withGroupId("/api/match/completed", groupId), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function startMatch(matchId, token) {
  return request(`/api/match/${matchId}/start`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function deleteMatch(matchId) {
  return request(`/api/match/${matchId}`, {
    method: "DELETE",
  });
}

export function getPlayers() {
  return request("/api/players");
}

export function loginUser(payload) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function registerUser(payload) {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMyGroups(token) {
  return request("/api/groups", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function createGroup(payload, token) {
  return request("/api/groups", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function joinGroup(payload, token) {
  return request("/api/groups/join", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export function leaveGroup(groupId, token) {
  return request(`/api/groups/${groupId}/leave`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function updateMyProfile(payload, token) {
  return request("/api/auth/profile", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export { API_BASE_URL };
