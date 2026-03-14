require('dotenv').config();
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
    origin: process.env.FRONTEND_URL || "*", 
    methods: ["GET", "POST"]
  }
});

let waitingUser = null; 
// Map socket ID to room ID
const socketRoomMap = new Map();

// Map socket ID to Display Name
const connectedUsers = new Map();
// Array of recent users { id, name, timestamp }
let recentUsers = [];
const MAX_RECENT_USERS = 15;

let onlineCount = 0;

function broadcastUserLists() {
  const activeUsersList = Array.from(connectedUsers.values());
  io.emit('user_lists_update', {
    activeUsers: activeUsersList,
    recentUsers: recentUsers
  });
}

io.on('connection', (socket) => {
  onlineCount++;
  io.emit('online_count', onlineCount);
  console.log(`User connected: ${socket.id}. Total online: ${onlineCount}`);

  // When a user sets their display name
  socket.on('set_name', (name) => {
    connectedUsers.set(socket.id, name);
    
    // Add to recent users, maintaining max size
    const newUserEntry = {
      id: socket.id,
      name: name,
      joinedAt: new Date().toISOString()
    };
    
    // Remove if they are already in the recent list (e.g. they reconnected) to avoid duplicates
    recentUsers = recentUsers.filter(u => u.name !== name);
    recentUsers.unshift(newUserEntry);
    if (recentUsers.length > MAX_RECENT_USERS) {
      recentUsers.pop();
    }

    broadcastUserLists();
  });

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

      const waitingUserName = connectedUsers.get(waitingUser.id) || "Stranger";
      const currentUserName = connectedUsers.get(socket.id) || "Stranger";

      // Notify the current user who they matched with
      socket.emit('chat_start', {
        message: `You're now chatting with ${waitingUserName}. Say hi!`,
        strangerName: waitingUserName
      });

      // Notify the waiting user who they matched with
      waitingUser.emit('chat_start', {
        message: `You're now chatting with ${currentUserName}. Say hi!`,
        strangerName: currentUserName
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
    
    // Remote from active users
    if (connectedUsers.has(socket.id)) {
      connectedUsers.delete(socket.id);
      broadcastUserLists();
    }

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
    const disconnectedUserName = connectedUsers.get(socket.id) || "Stranger";

    if (clientsInRoom) {
       for (const clientId of clientsInRoom) {
         if (clientId !== socket.id) {
           // Notify the stranger
           io.to(clientId).emit('stranger_disconnected', {
             message: `${disconnectedUserName} has disconnected.`
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
