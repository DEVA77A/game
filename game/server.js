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
    // FIX: Allow both transports for maximum compatibility
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['polling', 'websocket'],
    allowUpgrades: true
});

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Fix Favicon 404
app.get('/favicon.ico', (req, res) => res.status(204).end());

// MongoDB Connection with robust reconnection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stickman_fighter';
let isDbConnected = false;
let dbConnectionAttempts = 0;
const MAX_DB_ATTEMPTS = 3;

// MongoDB connection options for staying connected
const mongoOptions = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    retryWrites: true,
    retryReads: true
};

const connectDB = async () => {
    if (dbConnectionAttempts >= MAX_DB_ATTEMPTS) {
        console.log('MongoDB: Max connection attempts reached. Running in Memory-Only mode.');
        return;
    }
    
    dbConnectionAttempts++;
    try {
        await mongoose.connect(MONGODB_URI, mongoOptions);
        console.log('MongoDB Connected Successfully');
        isDbConnected = true;
        dbConnectionAttempts = 0; // Reset on successful connection
    } catch (err) {
        console.log(`MongoDB connection attempt ${dbConnectionAttempts}/${MAX_DB_ATTEMPTS} failed`);
        isDbConnected = false;
        
        if (dbConnectionAttempts >= MAX_DB_ATTEMPTS) {
            console.log('MongoDB not available - Running in Memory-Only mode (game works fine without DB)');
        }
    }
};

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
    console.log('MongoDB connection established');
    isDbConnected = true;
    dbConnectionAttempts = 0;
});

mongoose.connection.on('error', (err) => {
    if (dbConnectionAttempts < MAX_DB_ATTEMPTS) {
        console.log('MongoDB connection error:', err.message);
    }
    isDbConnected = false;
});

mongoose.connection.on('disconnected', () => {
    isDbConnected = false;
    // Only try to reconnect if we were previously connected
    if (dbConnectionAttempts === 0 && dbConnectionAttempts < MAX_DB_ATTEMPTS) {
        console.log('MongoDB disconnected. Attempting to reconnect...');
        setTimeout(connectDB, 5000);
    }
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
    isDbConnected = true;
    dbConnectionAttempts = 0;
});

// Initial connection
connectDB();

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

    const cleanupRoomForSocket = async (socketId, reason = 'disconnect') => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (!room || !room.players || !room.players.includes(socketId)) continue;

            // Notify the other player (if any) and tear down the room.
            socket.to(roomId).emit('opponentLeft', { reason });
            // Backwards compatibility
            socket.to(roomId).emit('playerDisconnected');

            // Clear any rematch timers
            if (room.rematchInterval) {
                clearInterval(room.rematchInterval);
                room.rematchInterval = null;
            }
            room.rematchReady = null;
            room.rematchExpiresAt = 0;

            delete rooms[roomId];
            if (isDbConnected) {
                try { await Room.deleteOne({ roomId }); } catch (e) {}
            }
            break;
        }
    };

    // Create Room
    socket.on('createRoom', async (data) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const maxWins = (data && data.maxWins) ? Math.min(Math.max(data.maxWins, 2), 4) : 2; // Clamp between 2-4
        const characterId = (data && data.characterId) ? data.characterId : 'ice'; // Player's selected character
        
        rooms[roomId] = {
            roomId: roomId,
            players: [socket.id],
            characters: { [socket.id]: characterId }, // Store character selections
            status: 'waiting',
            gameState: null, // Will hold authoritative state
            matchId: 0,
            maxWins: maxWins, // Custom rounds setting
            rematchReady: new Set(),
            rematchInterval: null,
            rematchExpiresAt: 0
        };
        
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, maxWins });
        console.log(`[CREATE] Room ${roomId} created by ${socket.id} (Best of ${maxWins * 2 - 1}, Character: ${characterId})`);
        console.log(`[ROOMS] Active rooms: ${Object.keys(rooms).join(', ') || 'none'}`);

        if (isDbConnected) {
            try {
                await new Room({ roomId, players: [socket.id], status: 'waiting' }).save();
            } catch (e) { console.error("DB Save Error:", e.message); }
        }
    });

    // Leave Room (intentional)
    socket.on('leaveRoom', async (data) => {
        const { roomId } = data || {};
        if (!roomId) return;
        const room = rooms[roomId];
        if (!room) return;
        if (!room.players.includes(socket.id)) return;

        await cleanupRoomForSocket(socket.id, 'leave');
    });

    // Join Room
    socket.on('joinRoom', async (data) => {
        // Support both old format (string roomId) and new format (object with roomId and characterId)
        const roomId = typeof data === 'string' ? data : (data && data.roomId);
        const characterId = (typeof data === 'object' && data.characterId) ? data.characterId : 'ice';
        
        console.log(`[JOIN] Attempt - Socket: ${socket.id}, RoomId: "${roomId}", Data type: ${typeof data}`);
        console.log(`[JOIN] Available rooms: [${Object.keys(rooms).join(', ')}]`);
        
        if (!roomId) {
            console.log(`[JOIN] ERROR: No room ID provided`);
            socket.emit('error', 'Invalid room code');
            return;
        }
        
        const room = rooms[roomId];

        if (!room) {
            console.log(`[JOIN] ERROR: Room "${roomId}" not found in rooms object`);
            socket.emit('error', 'Room not found');
            return;
        }
        
        console.log(`[JOIN] Room found - Status: ${room.status}, Players: ${room.players.length}`);
        
        if (room.status !== 'waiting' || room.players.length >= 2) {
            console.log(`[JOIN] ERROR: Room is full or not waiting`);
            socket.emit('error', 'Room is full or already started');
            return;
        }

        room.players.push(socket.id);
        room.characters = room.characters || {};
        room.characters[socket.id] = characterId; // Store P2's character selection
        room.status = 'active';
        socket.join(roomId);
        
        console.log(`[JOIN] SUCCESS - ${socket.id} joined room ${roomId}`);

        if (isDbConnected) {
            try {
                await Room.updateOne({ roomId }, { $push: { players: socket.id }, $set: { status: 'active' } });
            } catch (e) { console.error("DB Update Error:", e.message); }
        }

        // Assign Roles
        const p1 = room.players[0];
        const p2 = room.players[1];
        
        // Get character IDs
        const p1CharId = room.characters[p1] || 'ice';
        const p2CharId = room.characters[p2] || 'ice';

        // Initialize Server-Side Game State for Authority
        room.gameState = {
            p1: { x: 200, y: 480, health: 100, state: 'idle', facing: 1, characterId: p1CharId },
            p2: { x: 800, y: 480, health: 100, state: 'idle', facing: -1, characterId: p2CharId },
            timer: 60,
            round: 1,
            p1Wins: 0,
            p2Wins: 0
        };

        // Start first match id (used to ignore late packets from previous matches)
        room.matchId = (room.matchId || 0) + 1;

        const maxWins = room.maxWins || 2;
        // Send both players' characters so each client can set them up correctly
        console.log(`[GAME] Starting game for room ${roomId} - P1: ${p1} (${p1CharId}), P2: ${p2} (${p2CharId})`);
        
        io.to(p1).emit('gameStart', { 
            role: 'p1', 
            opponent: p2, 
            initialState: room.gameState, 
            matchId: room.matchId, 
            maxWins,
            p1CharId: p1CharId,
            p2CharId: p2CharId
        });
        io.to(p2).emit('gameStart', { 
            role: 'p2', 
            opponent: p1, 
            initialState: room.gameState, 
            matchId: room.matchId, 
            maxWins,
            p1CharId: p1CharId,
            p2CharId: p2CharId
        });
        
        console.log(`[GAME] gameStart emitted to both players`);
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
    
    // Multiplayer: Pause synchronization
    // Either player can pause/resume and it syncs to the other
    socket.on('pause', (data) => {
        const { roomId, paused } = data || {};
        const room = rooms[roomId];
        if (!room || room.status !== 'active') return;
        if (!room.players.includes(socket.id)) return;
        
        // Relay pause state to the other player
        socket.to(roomId).emit('pause', { paused });
    });

    // Multiplayer: Sync State (Host Authority or Server Authority)
    // Here we accept the Host (P1) as the authority for physics to avoid complex server-side physics engine implementation in this snippet.
    // P1 calculates physics and sends state. Server broadcasts it to P2 to correct desync.
    socket.on('syncState', (data) => {
        const { roomId, state, matchId, mapIndex } = data || {};
        const room = rooms[roomId];
        if (room) {
            room.gameState = state; // Update server cache
            if (typeof mapIndex === 'number') room.mapIndex = mapIndex; // Cache map index
            const mid = (typeof matchId === 'number') ? matchId : room.matchId;
            socket.to(roomId).emit('syncState', { state, serverTime: Date.now(), matchId: mid, mapIndex: room.mapIndex }); // Broadcast to P2
        }
    });

    // P2 -> P1: Client position/state snapshots (helps host-side hit detection)
    socket.on('clientState', (data) => {
        const { roomId, state, matchId } = data || {};
        const room = rooms[roomId];
        if (!room || room.status !== 'active') return;
        const mid = (typeof matchId === 'number') ? matchId : room.matchId;
        socket.to(roomId).emit('clientState', { id: socket.id, state, matchId: mid });
    });

    // Host -> P2: projectile replication (visual)
    socket.on('spawnProjectile', (data) => {
        const { roomId, x, y, facing, owner } = data || {};
        const room = rooms[roomId];
        if (!room || room.status !== 'active') return;
        socket.to(roomId).emit('spawnProjectile', { x, y, facing, owner });
    });

    // Host -> P2: projectile clash event (epic collision effect)
    socket.on('projectileClash', (data) => {
        const { roomId, x, y, color1, color2, matchId } = data || {};
        const room = rooms[roomId];
        if (!room || room.status !== 'active') return;
        socket.to(roomId).emit('projectileClash', { x, y, color1, color2, matchId });
    });

    // Multiplayer: Round End / Game Over
    socket.on('roundResult', (data) => {
        const { roomId, winner } = data;
        io.to(roomId).emit('roundResult', { winner });
    });

    // Multiplayer: Rematch handshake
    // Both players must click rematch within 10 seconds.
    socket.on('rematchReady', (data) => {
        const { roomId } = data || {};
        if (!roomId) return;
        const room = rooms[roomId];
        if (!room || !room.players || room.players.length < 2) return;
        if (!room.players.includes(socket.id)) return;

        if (!room.rematchReady) room.rematchReady = new Set();
        room.rematchReady.add(socket.id);

        const emitStatus = () => {
            const secondsLeft = Math.max(0, Math.ceil((room.rematchExpiresAt - Date.now()) / 1000));
            io.to(roomId).emit('rematchStatus', {
                readyIds: Array.from(room.rematchReady),
                secondsLeft
            });
            return secondsLeft;
        };

        // Start timer window if not already active
        if (!room.rematchInterval) {
            room.rematchExpiresAt = Date.now() + 10000;
            room.rematchInterval = setInterval(() => {
                const secondsLeft = emitStatus();
                if (room.rematchReady && room.rematchReady.size >= 2) {
                    clearInterval(room.rematchInterval);
                    room.rematchInterval = null;
                    room.rematchReady = new Set();
                    room.rematchExpiresAt = 0;
                    room.matchId = (room.matchId || 0) + 1;
                    io.to(roomId).emit('rematchStart', { matchId: room.matchId });
                    return;
                }
                if (secondsLeft <= 0) {
                    clearInterval(room.rematchInterval);
                    room.rematchInterval = null;
                    room.rematchReady = new Set();
                    room.rematchExpiresAt = 0;
                    io.to(roomId).emit('rematchCancelled');
                }
            }, 1000);
        }

        // Immediate status update
        emitStatus();

        // If both ready immediately
        if (room.rematchReady.size >= 2) {
            clearInterval(room.rematchInterval);
            room.rematchInterval = null;
            room.rematchReady = new Set();
            room.rematchExpiresAt = 0;
            room.matchId = (room.matchId || 0) + 1;
            io.to(roomId).emit('rematchStart', { matchId: room.matchId });
        }
    });

    socket.on('disconnect', async () => {
        console.log('User disconnected:', socket.id);
        await cleanupRoomForSocket(socket.id, 'disconnect');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
