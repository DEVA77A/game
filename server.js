require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stickman_fighter';
let isDbConnected = false;

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('MongoDB Connected');
        isDbConnected = true;
    })
    .catch(err => {
        console.log('MongoDB not found - Running in Memory-Only mode (Multiplayer will still work!)');
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

// Game State Management
const rooms = {}; // In-memory game state for performance

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Create Room
    socket.on('createRoom', async () => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // 1. Setup In-Memory State (Always works)
        rooms[roomId] = {
            roomId: roomId,
            players: [socket.id],
            status: 'waiting',
            scores: { [socket.id]: 0 }
        };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        console.log(`Room ${roomId} created by ${socket.id} (Memory)`);

        // 2. Try MongoDB Persistence (Optional)
        if (isDbConnected) {
            try {
                const newRoom = new Room({
                    roomId,
                    players: [socket.id],
                    status: 'waiting'
                });
                await newRoom.save();
            } catch (err) {
                console.error("DB Save Error (Ignored):", err.message);
            }
        }
    });

    // Join Room
    socket.on('joinRoom', async (roomId) => {
        // 1. Check Memory First
        const room = rooms[roomId];

        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }
        
        if (room.status !== 'waiting' || room.players.length >= 2) {
            socket.emit('error', 'Room is full or active');
            return;
        }

        // Update Memory State
        room.players.push(socket.id);
        room.status = 'active';
        room.scores[socket.id] = 0;
        socket.join(roomId);

        // Update DB if connected
        if (isDbConnected) {
            try {
                await Room.updateOne({ roomId }, { 
                    $push: { players: socket.id },
                    $set: { status: 'active' }
                });
            } catch (e) { console.error("DB Update Error (Ignored)"); }
        }

        // Assign Player Numbers
        const p1 = room.players[0];
        const p2 = room.players[1];

        io.to(p1).emit('gameStart', { role: 'p1', opponent: p2 });
        io.to(p2).emit('gameStart', { role: 'p2', opponent: p1 });
        
        console.log(`Player ${socket.id} joined room ${roomId}`);
    });

    // Player Input Relay
    socket.on('playerInput', (data) => {
        // Broadcast to the other player in the room
        socket.to(data.roomId).emit('remoteInput', data.inputState);
    });

    // State Synchronization (Anti-Lag / Anti-Desync)
    // P1 sends authoritative state to P2 to fix positions
    socket.on('syncState', (data) => {
        socket.to(data.roomId).emit('syncState', data.state);
    });

    // Game Over / Round End (Simple relay for now, can be authoritative)
    socket.on('roundResult', (data) => {
        // data: { roomId, winner: 'p1' | 'p2' }
        // In a full authoritative server, we would calculate this.
        // For this hybrid, we trust the clients or P1.
        io.to(data.roomId).emit('syncRound', data);
    });

    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);
        // Find room and clean up
        // This is a simplified cleanup. In production, handle reconnects.
        const room = await Room.findOne({ players: socket.id });
        if (room) {
            io.to(room.roomId).emit('playerDisconnected');
            await Room.deleteOne({ _id: room._id });
            delete rooms[room.roomId];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
