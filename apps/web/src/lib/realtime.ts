import { io, type Socket } from "socket.io-client";

export const apiOrigin =
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  (process.env.NODE_ENV === "production"
    ? "https://openseat-api.onrender.com"
    : "http://localhost:4000");

export function createEventSocket(eventId: string): Socket {
  const socket = io(`${apiOrigin}/rt`, { transports: ["websocket"] });
  socket.on("connect", () => {
    socket.emit("join", { eventId });
  });
  return socket;
}
