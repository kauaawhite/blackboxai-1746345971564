const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const MESSAGES_HISTORY_FILE = path.join(__dirname, 'messagesHistory.json');
const UNDELIVERED_MESSAGES_FILE = path.join(__dirname, 'undeliveredMessages.json');

// Load persisted data or initialize empty
let messagesHistory = {};
let undeliveredMessages = {};

try {
  if (fs.existsSync(MESSAGES_HISTORY_FILE)) {
    const data = fs.readFileSync(MESSAGES_HISTORY_FILE, 'utf-8');
    messagesHistory = JSON.parse(data);
  }
} catch (err) {
  console.error('Failed to load messagesHistory:', err);
}

try {
  if (fs.existsSync(UNDELIVERED_MESSAGES_FILE)) {
    const data = fs.readFileSync(UNDELIVERED_MESSAGES_FILE, 'utf-8');
    undeliveredMessages = JSON.parse(data);
  }
} catch (err) {
  console.error('Failed to load undeliveredMessages:', err);
}

// Helper to save messagesHistory to file
function saveMessagesHistory() {
  fs.writeFile(MESSAGES_HISTORY_FILE, JSON.stringify(messagesHistory, null, 2), (err) => {
    if (err) console.error('Failed to save messagesHistory:', err);
  });
}

// Helper to save undeliveredMessages to file
function saveUndeliveredMessages() {
  fs.writeFile(UNDELIVERED_MESSAGES_FILE, JSON.stringify(undeliveredMessages, null, 2), (err) => {
    if (err) console.error('Failed to save undeliveredMessages:', err);
  });
}

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Allowed users
const allowedUsers = new Set(['user1', 'user2']);

// Simple in-memory user store and socket mapping
const users = {};
const sockets = {};
const onlineUsers = new Set();

// Global error handlers to prevent server crash
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle socket connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle login event with password
  socket.on('login', (data) => {
    try {
      if (!data || typeof data !== 'object') {
        socket.emit('errorMessage', 'Invalid login data.');
        return;
      }
      const { username, password } = data;
      const allowedUsers = {
        user1: 'password1',
        user2: 'password2'
      };

      if (!allowedUsers.hasOwnProperty(username)) {
        socket.emit('errorMessage', 'Invalid username. Only user1 and user2 are allowed.');
        return;
      }

      if (allowedUsers[username] !== password) {
        socket.emit('errorMessage', 'Incorrect password.');
        return;
      }

      // Check if username already logged in
      if (Object.values(users).includes(username)) {
        socket.emit('errorMessage', 'User already logged in.');
        return;
      }

      users[socket.id] = username;
      sockets[username] = socket.id;
      onlineUsers.add(username);
      console.log(`User logged in: ${username} with socket id ${socket.id}`);

      // Notify user of login success
      socket.emit('loginSuccess', username);

      // Notify chat partner that this user is online
      const chatPartner = username === 'user1' ? 'user2' : 'user1';
      const partnerSocketId = sockets[chatPartner];
      if (partnerSocketId) {
        io.to(partnerSocketId).emit('partnerOnlineStatus', { username: username, online: true });
      }

      // Deliver undelivered messages if any
      if (undeliveredMessages[username]) {
        undeliveredMessages[username].forEach((msg) => {
          socket.emit('receiveMessage', msg);
        });
        delete undeliveredMessages[username];
        saveUndeliveredMessages();
      }

      // Send full message history to user
      if (messagesHistory[username]) {
        messagesHistory[username].forEach((msg) => {
          socket.emit('receiveMessage', msg);
        });
      }
    } catch (err) {
      console.error('Error in login handler:', err);
      socket.emit('errorMessage', 'Internal server error during login.');
    }
  });

  // WebRTC signaling events for video/audio calls
  socket.on('webrtc-offer', (data) => {
    const { to, offer } = data;
    const toSocketId = sockets[to];
    if (toSocketId) {
      io.to(toSocketId).emit('webrtc-offer', { from: users[socket.id], offer });
    }
  });

  socket.on('webrtc-answer', (data) => {
    const { to, answer } = data;
    const toSocketId = sockets[to];
    if (toSocketId) {
      io.to(toSocketId).emit('webrtc-answer', { from: users[socket.id], answer });
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const { to, candidate } = data;
    const toSocketId = sockets[to];
    if (toSocketId) {
      io.to(toSocketId).emit('webrtc-ice-candidate', { from: users[socket.id], candidate });
    }
  });

  // Handle sending message
  const { v4: uuidv4 } = require('uuid');

  socket.on('sendMessage', (data) => {
    try {
      const from = users[socket.id];
      if (!data || !data.to || !from) {
        socket.emit('errorMessage', 'Invalid message data.');
        return;
      }
      const messageId = uuidv4();
      const timestamp = new Date();
      const msgPayload = { from, timestamp, messageId };

      if (data.message) {
        msgPayload.message = data.message;
      }
      if (data.image) {
        msgPayload.image = data.image;
      }
      if (data.files && Array.isArray(data.files)) {
        msgPayload.files = data.files;
      }

      // Store message in sender's history
      if (!messagesHistory[from]) {
        messagesHistory[from] = [];
      }
      messagesHistory[from].push(msgPayload);

      // Store message in recipient's history
      if (!messagesHistory[data.to]) {
        messagesHistory[data.to] = [];
      }
      messagesHistory[data.to].push(msgPayload);

      saveMessagesHistory();

      // Send message to recipient if connected, else store for later
      const toSocketId = sockets[data.to];
      if (toSocketId) {
        io.to(toSocketId).emit('receiveMessage', msgPayload);
      } else {
        if (!undeliveredMessages[data.to]) {
          undeliveredMessages[data.to] = [];
        }
        undeliveredMessages[data.to].push(msgPayload);
        saveUndeliveredMessages();
      }

      // Send message back to sender with single tick status
      socket.emit('messageSent', { to: data.to, message: data.message, image: data.image, files: data.files, timestamp, messageId, status: 'sent' });

      // Also send message to sender's own socket to display
      socket.emit('receiveMessage', msgPayload);
    } catch (err) {
      console.error('Error in sendMessage handler:', err);
      socket.emit('errorMessage', 'Internal server error during sending message.');
    }
  });

  // Handle message deletion
  socket.on('deleteMessage', ({ messageId, to }) => {
    try {
      const from = users[socket.id];
      if (!from || !to || !messageId) return;

      // Remove from undeliveredMessages if present
      if (undeliveredMessages[to]) {
        undeliveredMessages[to] = undeliveredMessages[to].filter(msg => msg.messageId !== messageId);
        saveUndeliveredMessages();
      }

      // Remove from messagesHistory for both users
      if (messagesHistory[from]) {
        messagesHistory[from] = messagesHistory[from].filter(msg => msg.messageId !== messageId);
      }
      if (messagesHistory[to]) {
        messagesHistory[to] = messagesHistory[to].filter(msg => msg.messageId !== messageId);
      }
      saveMessagesHistory();

      // Notify recipient if connected
      const toSocketId = sockets[to];
      if (toSocketId) {
        io.to(toSocketId).emit('deleteMessage', { messageId });
      }

      // Notify sender that deletion was successful
      socket.emit('deleteMessage', { messageId });
    } catch (err) {
      console.error('Error in deleteMessage handler:', err);
      socket.emit('errorMessage', 'Internal server error during deleting message.');
    }
  });

  // Handle message seen acknowledgment
  socket.on('messageSeen', ({ messageId, to }) => {
    try {
      const toSocketId = sockets[to];
      if (toSocketId) {
        io.to(toSocketId).emit('messageSeen', { messageId });
      }
    } catch (err) {
      console.error('Error in messageSeen handler:', err);
    }
  });

  // Handle typing indicator
  socket.on('typing', ({ to, isTyping }) => {
    try {
      const toSocketId = sockets[to];
      if (toSocketId) {
        io.to(toSocketId).emit('typing', { from: users[socket.id], isTyping });
      }
    } catch (err) {
      console.error('Error in typing handler:', err);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    try {
      const username = users[socket.id];
      console.log('User disconnected:', username);
      if (username) {
        onlineUsers.delete(username);
        delete sockets[username];
        delete users[socket.id];

        // Notify chat partner that this user is offline
        const chatPartner = username === 'user1' ? 'user2' : 'user1';
        const partnerSocketId = sockets[chatPartner];
        if (partnerSocketId) {
          io.to(partnerSocketId).emit('partnerOnlineStatus', { username: username, online: false });
        }
      }
    } catch (err) {
      console.error('Error in disconnect handler:', err);
    }
  });
});


server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
