/**
 * Full main.js code for chat app with login functionality
 * Includes:
 * - DOMContentLoaded wrapper to ensure DOM is ready
 * - Socket.io client connection and event handling
 * - Login form submission with preventDefault to avoid page reload
 * - UI updates on login success and error
 * - Message bubble rendering and delete functionality
 * - Typing indicator and online status updates
 */



document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const loginForm = document.getElementById('loginForm');
  const usernameInput = document.getElementById('usernameInput');
  const loginError = document.getElementById('loginError');
  const loginPage = document.getElementById('loginPage');
  const chatPage = document.getElementById('chatPage');
  const chatWithTitle = document.getElementById('chatWith');
  const logoutBtn = document.getElementById('menuLogoutBtn');
  const messagesContainer = document.getElementById('messagesContainer');
  const messageForm = document.getElementById('messageForm');
  const messageInput = document.getElementById('messageInput');

  // State variables
  let username = null;
  let chatPartner = null;
  let typingTimeout = null;
  let isTyping = false;
  let selectedMessageId = null;
  let partnerOnline = false;
  let partnerTyping = false;

  // Socket.io client
  const socket = io();

  // Login form submission
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const usernameValue = usernameInput.value.trim();
    const passwordValue = document.getElementById('passwordInput').value.trim();
    if (usernameValue && passwordValue) {
      socket.emit('login', { username: usernameValue, password: passwordValue });
    } else {
      loginError.textContent = 'Please enter both username and password.';
      loginError.classList.remove('hidden');
    }
  });

  // Update chat header with partner status
  function updateChatWithTitle() {
    let statusText = '';
    if (partnerTyping) {
      statusText = 'typing...';
    } else if (partnerOnline) {
      statusText = 'online';
    }
    chatWithTitle.innerHTML = `Chat with ${chatPartner} <span class="text-xs text-gray-500 lowercase ml-2">${statusText}</span>`;
  }

  // Add message bubble to chat
  function addMessageBubble(message, sender, status = '') {
    const container = document.createElement('div');
    container.classList.add('flex', 'mb-2');
    if (sender === username) {
      container.classList.add('justify-end');
    } else {
      container.classList.add('justify-start');
    }

    const bubble = document.createElement('div');
    bubble.classList.add('chat-bubble');
    if (sender === username) {
      bubble.classList.add('sent');
    } else {
      bubble.classList.add('received');
    }
    let content = '';

    if (message.files && Array.isArray(message.files)) {
      content = message.files.map(file => {
        if (file.type.startsWith('image/')) {
          return `<img src="${file.data}" alt="Sent image" class="max-w-xs rounded-lg mb-1" />`;
        } else {
          const fileName = file.name || 'file';
          return `<a href="${file.data}" download="${fileName}" class="block text-blue-600 underline mb-1" target="_blank" rel="noopener noreferrer"><i class="fas fa-file"></i> ${fileName}</a>`;
        }
      }).join('');
    } else if (message.image) {
      content = `<img src="${message.image}" alt="Sent image" class="max-w-xs rounded-lg" />`;
    } else if (message.message || message.text) {
      content = `<p>${message.message || message.text}</p>`;
    }

    bubble.innerHTML = `
      ${content}
      <span class="text-xs text-gray-500 flex items-center space-x-1">
        <span>${new Date(message.timestamp).toLocaleTimeString()}</span>
        ${sender === username ? `<span class="message-status">${status === 'seen' ? '<i class="fas fa-check-double text-blue-500"></i>' : '<i class="fas fa-check"></i>'}</span>` : ''}
      </span>
    `;
    bubble.dataset.messageId = message.messageId || '';

    bubble.addEventListener('click', () => {
      if (selectedMessageId === bubble.dataset.messageId) {
        bubble.classList.remove('selected');
        selectedMessageId = null;
        deleteButton.style.display = 'none';
      } else {
        const prevSelected = messagesContainer.querySelector('.chat-bubble.selected');
        if (prevSelected) {
          prevSelected.classList.remove('selected');
        }
        bubble.classList.add('selected');
        selectedMessageId = bubble.dataset.messageId;
        const rect = bubble.getBoundingClientRect();
        deleteButton.style.top = `${rect.top + window.scrollY - 40}px`;
        deleteButton.style.left = `${rect.right - 40}px`;
        deleteButton.style.display = 'block';
      }
    });

    container.appendChild(bubble);
    messagesContainer.appendChild(container);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Create delete button
  const deleteButton = document.createElement('button');
  deleteButton.textContent = 'Delete';
  deleteButton.style.position = 'absolute';
  deleteButton.style.display = 'none';
  deleteButton.style.backgroundColor = '#ef4444'; // red-500
  deleteButton.style.color = 'white';
  deleteButton.style.border = 'none';
  deleteButton.style.padding = '0.25rem 0.5rem';
  deleteButton.style.borderRadius = '0.375rem';
  deleteButton.style.cursor = 'pointer';
  deleteButton.style.zIndex = '1000';
  document.body.appendChild(deleteButton);

  deleteButton.addEventListener('click', () => {
    if (selectedMessageId) {
      socket.emit('deleteMessage', { messageId: selectedMessageId, to: chatPartner });
      // Remove message locally
      const bubble = messagesContainer.querySelector(`[data-message-id="${selectedMessageId}"]`);
      if (bubble) {
        bubble.remove();
      }
      selectedMessageId = null;
      deleteButton.style.display = 'none';
    }
  });





  // Socket event listeners
  socket.on('loginSuccess', (receivedUsername) => {
    username = receivedUsername;
    chatPartner = username === 'user1' ? 'user2' : 'user1';
    updateChatWithTitle();
    loginPage.style.display = 'none';
    chatPage.style.display = 'flex';
  });

  socket.on('errorMessage', (message) => {
    loginError.textContent = message;
    loginError.classList.remove('hidden');
  });

  // Send message function
  window.sendMessage = function() {
    const message = messageInput.value.trim();
    if (message) {
      socket.emit('sendMessage', { to: chatPartner, message });
      // Add message bubble locally for sender
      addMessageBubble({ from: username, message, timestamp: new Date(), messageId: 'local' }, username);
      messageInput.value = '';
    }
  };

  // Handle enter key in message input
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendMessage();
    }
  });

  // Prevent form submission
  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
  });

  // Handle received messages
  socket.on('receiveMessage', (msg) => {
    addMessageBubble(msg, msg.from);
  });

  // Handle message sent confirmation
  socket.on('messageSent', (data) => {
    // Message already added locally, but can update status if needed
  });

  // Handle message seen
  socket.on('messageSeen', ({ messageId }) => {
    // Update message status to seen
  });

  // Handle message deletion
  socket.on('deleteMessage', ({ messageId }) => {
    const bubble = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
    if (bubble) {
      bubble.remove();
    }
  });

  // Handle typing indicator
  socket.on('typing', ({ from, isTyping }) => {
    partnerTyping = isTyping;
    updateChatWithTitle();
  });

  // Handle partner online status
  socket.on('partnerOnlineStatus', ({ username: partnerUsername, online }) => {
    if (partnerUsername === chatPartner) {
      partnerOnline = online;
      updateChatWithTitle();
    }
  });

  // Typing indicator
  messageInput.addEventListener('input', () => {
    if (!isTyping) {
      socket.emit('typing', { to: chatPartner, isTyping: true });
      isTyping = true;
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('typing', { to: chatPartner, isTyping: false });
      isTyping = false;
    }, 1000);
  });

  // Logout
  logoutBtn.addEventListener('click', () => {
    socket.disconnect();
    location.reload();
  });
});
