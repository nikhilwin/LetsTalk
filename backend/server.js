const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*", // allow any origin in dev, or specify frontend URL
        methods: ["GET", "POST"]
    }
});

let waitingUser = null;
// Map socket ID to room ID
const socketRoomMap = new Map();
let onlineCount = 0;

io.on('connection', (socket) => {
    onlineCount++;
    io.emit('online_count', onlineCount);
    console.log(`User connected: ${socket.id}. Total online: ${onlineCount}`);

    // When a user requests to start a chat
    socket.on('start_chat', () => {
        // If they are already in a room, they shouldn't start a new one directly w/o disconnecting
        if (socketRoomMap.has(socket.id)) return;

        if (waitingUser) {
            if (waitingUser.id === socket.id) return; // Can't match with self

            // Match found!
            const roomName = `room-${socket.id}-${waitingUser.id}`;

            socket.join(roomName);
            waitingUser.join(roomName);

            socketRoomMap.set(socket.id, roomName);
            socketRoomMap.set(waitingUser.id, roomName);

            // Notify both clients that chat has started
            io.to(roomName).emit('chat_start', {
                message: "You're now chatting with a random stranger. Say hi!"
            });

            waitingUser = null; // reset waiting queue
        } else {
            // No one waiting, this user becomes the waiting user
            waitingUser = socket;
            socket.emit('waiting', { message: 'Looking for someone you can chat with...' });
        }
    });

    // Handle incoming chat messages
    socket.on('chat_message', (msg) => {
        const roomName = socketRoomMap.get(socket.id);
        if (roomName) {
            // Broadcast to the specific room
            io.to(roomName).emit('chat_message', msg);
        }
    });

    // Handle typing indicator
    socket.on('typing', () => {
        const roomName = socketRoomMap.get(socket.id);
        if (roomName) {
            socket.to(roomName).emit('typing'); // broadcast to everyone in room EXCEPT sender
        }
    });

    // User explicitly stops the chat
    socket.on('stop_chat', () => {
        handleDisconnectOrStop(socket);
    });

    socket.on('disconnect', () => {
        onlineCount--;
        io.emit('online_count', onlineCount);
        console.log(`User disconnected: ${socket.id}. Total online: ${onlineCount}`);

        // If they were waiting, remove them from waiting queue
        if (waitingUser && waitingUser.id === socket.id) {
            waitingUser = null;
        }

        handleDisconnectOrStop(socket);
    });
});

function handleDisconnectOrStop(socket) {
    const roomName = socketRoomMap.get(socket.id);
    if (roomName) {
        // Determine the OTHER user in this room
        const clientsInRoom = io.sockets.adapter.rooms.get(roomName);
        if (clientsInRoom) {
            for (const clientId of clientsInRoom) {
                if (clientId !== socket.id) {
                    // Notify the stranger
                    io.to(clientId).emit('stranger_disconnected', {
                        message: "Stranger has disconnected."
                    });
                    socketRoomMap.delete(clientId);
                    io.sockets.sockets.get(clientId)?.leave(roomName);
                }
            }
        }

        // Remove self from room and map
        socket.leave(roomName);
        socketRoomMap.delete(socket.id);
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
