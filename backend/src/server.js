const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
dotenv.config();
const connectDB = require("./config/db");
const setupSockets = require("./sockets/matchSocket");

connectDB();

const app = express();
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((s) => s.trim())
  : ["http://localhost:5173"];
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const playerRoutes = require("./routes/playerRoutes");
const authRoutes = require("./routes/authRoutes");
const groupRoutes = require("./routes/groupRoutes");
const matchRoutes = require("./routes/matchRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/match", matchRoutes);
app.use("/api/players", playerRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

// JWT authentication middleware for Socket.IO
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Unauthorized: token missing"));
    }

    if (!process.env.JWT_SECRET) {
      return next(new Error("JWT_SECRET is not configured"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (error) {
    next(new Error("Unauthorized: invalid token"));
  }
});

setupSockets(io);

io.on("connection", (socket) => {
  console.log("New client connected: " + socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected: " + socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
