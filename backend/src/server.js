const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const connectDB = require('./config/db');
const setupSockets = require('./sockets/matchSocket');

connectDB();

const app = express();
app.use(cors());
app.use(express.json());
const matchRoutes = require('./routes/matchRoutes');
app.use('/api/match', matchRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

setupSockets(io);

io.on('connection', (socket) => {
  console.log('New client connected: ' + socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected: ' + socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
