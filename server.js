require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    // FIX: Optimize for low latency
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket', 'polling'],
    allowUpgrades: true
});

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Fix Favicon 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stickman_fighter';
let isDbConnected = false;

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('MongoDB Connected');
        isDbConnected = true;
    })
    .catch(err => {
        console.log('MongoDB not found - Running in Memory-Only mode');
        isDbConnected = false;
    });

// Room Schema
const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    players: [String], // Socket IDs
    status: { type: String, default: 'waiting' }, // waiting, active, finished
    createdAt: { type: Date, default: Date.now }
});

const Room = mongoose.model('Room', roomSchema);

// In-memory game state
const rooms = {}; 

// Constants
const TICK_RATE = 30; // Server updates 30 times per second

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create Room
    socket.on('createRoom', async () => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        rooms[roomId] = {
            roomId: roomId,
            players: [socket.id],
            status: 'waiting',
            gameState: null // Will hold authoritative state
        };
        
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        console.log(`Room ${roomId} created by ${socket.id}`);

        if (isDbConnected) {
            try {
                await new Room({ roomId, players: [socket.id], status: 'waiting' }).save();
            } catch (e) { console.error("DB Save Error:", e.message); }
        }
    });

    // Join Room
    socket.on('joinRoom', async (roomId) => {
        const room = rooms[roomId];

        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (room.status !== 'waiting' || room.players.length >= 2) {
            socket.emit('error', 'Room is full or active');
            return;
        }

        room.players.push(socket.id);
        room.status = 'active';
        socket.join(roomId);

        if (isDbConnected) {
            try {
                await Room.updateOne({ roomId }, { $push: { players: socket.id }, $set: { status: 'active' } });
            } catch (e) { console.error("DB Update Error:", e.message); }
        }

        // Assign Roles
        const p1 = room.players[0];
        const p2 = room.players[1];

        // Initialize Server-Side Game State for Authority
        room.gameState = {
            p1: { x: 200, y: 480, health: 100, state: 'idle', facing: 1 },
            p2: { x: 800, y: 480, health: 100, state: 'idle', facing: -1 },
            timer: 60,
            round: 1,
            p1Wins: 0,
            p2Wins: 0
        };

        io.to(p1).emit('gameStart', { role: 'p1', opponent: p2, initialState: room.gameState });
        io.to(p2).emit('gameStart', { role: 'p2', opponent: p1, initialState: room.gameState });
        
        console.log(`Player ${socket.id} joined room ${roomId}`);
    });

    // Multiplayer: Handle Player Input (Input Relay + Server Validation)
    socket.on('playerInput', (data) => {
        const { roomId, inputState } = data;
        const room = rooms[roomId];
        if (!room || room.status !== 'active') return;

        // Relay input to opponent immediately for responsiveness (Client Prediction)
        socket.to(roomId).emit('remoteInput', inputState);

        // In a full authoritative server, we would process physics here.
        // For this hybrid approach to fix latency, we relay inputs but also sync critical state periodically.
    });

    // Multiplayer: Sync State (Host Authority or Server Authority)
    // Here we accept the Host (P1) as the authority for physics to avoid complex server-side physics engine implementation in this snippet.
    // P1 calculates physics and sends state. Server broadcasts it to P2 to correct desync.
    socket.on('syncState', (data) => {
        const { roomId, state } = data;
        const room = rooms[roomId];
        if (room) {
            room.gameState = state; // Update server cache
            socket.to(roomId).emit('syncState', state); // Broadcast to P2
        }
    });

    // Multiplayer: Round End / Game Over
    socket.on('roundResult', (data) => {
        const { roomId, winner } = data;
        io.to(roomId).emit('roundResult', { winner });
    });

    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);
        // Find room and clean up
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.players.includes(socket.id)) {
                io.to(roomId).emit('playerDisconnected');
                delete rooms[roomId];
                if (isDbConnected) {
                    await Room.deleteOne({ roomId });
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
