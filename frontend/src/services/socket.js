import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000";

export function createMatchSocket() {
  return io(SOCKET_URL, {
    transports: ["websocket"],
  });
}
