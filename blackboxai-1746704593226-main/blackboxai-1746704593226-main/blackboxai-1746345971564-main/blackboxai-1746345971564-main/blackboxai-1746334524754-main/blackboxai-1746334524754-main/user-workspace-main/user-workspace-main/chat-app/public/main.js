const loginPage = document.getElementById('loginPage');
const chatPage = document.getElementById('chatPage');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const chatWithTitle = document.getElementById('chatWith');
const logoutBtn = document.getElementById('menuLogoutBtn');
const messagesContainer = document.getElementById('messagesContainer');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');

let username = null;
let chatPartner = null;
let typingTimeout = null;
let isTyping = false;
let selectedMessageId = null;
let partnerOnline = false;
let partnerTyping = false;

let localStream = null;
let remoteStream = null;
let peerConnection = null;
const peerConnectionConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

function updateChatWithTitle() {
  let statusText = '';
  if (partnerTyping) {
    statusText = 'typing...';
  } else if (partnerOnline) {
    statusText = 'online';
  }
  chatWithTitle.innerHTML = `Chat with ${chatPartner} <span class="text-xs text-gray-500 lowercase ml-2">${statusText}</span>`;
  console.log('Updated chatWithTitle:', chatWithTitle.innerHTML);
}

function addMessageBubble(message, sender, status = '') {
  const bubble = document.createElement('div');
  bubble.classList.add('chat-bubble');
  if (sender === username) {
    bubble.classList.add('sent');
  } else {
    bubble.classList.add('received');
  }
  let content = '';

  if (message.files && Array.isArray(message.files)) {
    // Multiple files message
    content = message.files.map(file => {
      if (file.type.startsWith('image/')) {
        return `<img src="${file.data}" alt="Sent image" class="max-w-xs rounded-lg mb-1" />`;
      } else {
        // For other files, show icon and download link
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

  // Add click event to select/deselect message
  bubble.addEventListener('click', () => {
    if (selectedMessageId === bubble.dataset.messageId) {
      bubble.classList.remove('selected');
      selectedMessageId = null;
      deleteButton.style.display = 'none';
    } else {
      // Deselect previous
      const prevSelected = messagesContainer.querySelector('.chat-bubble.selected');
      if (prevSelected) {
        prevSelected.classList.remove('selected');
      }
      bubble.classList.add('selected');
      selectedMessageId = bubble.dataset.messageId;
      // Position delete button near selected message
      const rect = bubble.getBoundingClientRect();
      deleteButton.style.top = `${rect.top + window.scrollY - 40}px`;
      deleteButton.style.left = `${rect.right - 40}px`;
      deleteButton.style.display = 'block';
    }
  });

  messagesContainer.appendChild(bubble);
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

loginPage.classList.remove('hidden');
chatPage.classList.add('hidden');

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const enteredUsername = usernameInput.value.trim();
  const enteredPassword = passwordInput.value;
  if (enteredUsername === 'user1' || enteredUsername === 'user2') {
    username = enteredUsername;
    chatPartner = username === 'user1' ? 'user2' : 'user1';
    updateChatWithTitle();
    socket.emit('login', { username, password: enteredPassword });
  } else {
    alert('Please enter a valid user ID: user1 or user2');
  }
});

const socket = io();

const renderedMessageIds = new Set();

socket.on('loginSuccess', (user) => {
  loginPage.classList.add('hidden');
  chatPage.classList.remove('hidden');
  updateChatWithTitle();
});

socket.on('partnerOnlineStatus', ({ username: partnerUsername, online }) => {
  console.log('Received partnerOnlineStatus:', partnerUsername, online);
  if (partnerUsername === chatPartner) {
    partnerOnline = online;
    if (!online) {
      partnerTyping = false;
    }
    updateChatWithTitle();
  }
});

socket.on('receiveMessage', (data) => {
  if (renderedMessageIds.has(data.messageId)) {
    return;
  }
  renderedMessageIds.add(data.messageId);
  addMessageBubble(data, data.from, 'seen');
  socket.emit('messageSeen', { messageId: data.messageId, to: data.from });
});

socket.on('messageSeen', ({ messageId }) => {
  const bubbles = messagesContainer.querySelectorAll(`[data-message-id="${messageId}"]`);
  bubbles.forEach((bubble) => {
    const statusSpan = bubble.querySelector('.message-status');
    if (statusSpan) {
      statusSpan.innerHTML = '<i class="fas fa-check-double text-blue-500"></i><span class="text-[10px] text-blue-500">seen</span>';
    }
  });
});

socket.on('deleteMessage', ({ messageId }) => {
  const bubble = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
  if (bubble) {
    bubble.remove();
  }
});

socket.on('errorMessage', (msg) => {
  alert(msg);
});
  
// Typing indicator UI moved to chatWithTitle update
function sendTypingStatus(isTyping) {
  if (chatPartner) {
    socket.emit('typing', { to: chatPartner, isTyping });
  }
}

messageInput.addEventListener('input', () => {
  if (!isTyping) {
    isTyping = true;
    sendTypingStatus(true);
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    sendTypingStatus(false);
  }, 1000);
});

socket.on('typing', ({ from, isTyping }) => {
  console.log('Received typing:', from, isTyping);
  if (from === chatPartner) {
    partnerTyping = isTyping;
    updateChatWithTitle();
  }
});

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageText = messageInput.value.trim();
  const files = document.getElementById('imageInput').files;

  if (!messageText && files.length === 0) {
    return;
  }

  if (files.length > 0) {
    try {
      const processedFiles = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          const resizedImageData = await resizeImage(file);
          processedFiles.push({ type: file.type, data: resizedImageData, name: file.name });
        } else {
          // For other files, read as base64 data URL
          const fileData = await readFileAsDataURL(file);
          processedFiles.push({ type: file.type, data: fileData, name: file.name });
        }
      }
      const message = {
        to: chatPartner,
        files: processedFiles,
      };
      socket.emit('sendMessage', message);
      addMessageBubble({ files: processedFiles, timestamp: new Date(), messageId: null }, username, 'sent');
    } catch (error) {
      alert('Failed to process files.');
    }
    messageInput.value = '';
    document.getElementById('imageInput').value = '';
  } else if (messageText) {
    const message = {
      to: chatPartner,
      message: messageText,
    };
    socket.emit('sendMessage', message);
    addMessageBubble({ text: messageText, timestamp: new Date(), messageId: null }, username, 'sent');
    messageInput.value = '';
  }
});

function resizeImage(file, maxDimension = 400, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          const reader2 = new FileReader();
          reader2.onload = () => {
            resolve(reader2.result);
          };
          reader2.onerror = reject;
          reader2.readAsDataURL(blob);
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

logoutBtn.addEventListener('click', () => {
  loginPage.classList.remove('hidden');
  chatPage.classList.add('hidden');
});

// Video/Audio call UI elements
const startCallBtn = document.getElementById('startCallBtn');
const startAudioCallBtn = document.getElementById('startAudioCallBtn');
const endCallBtn = document.getElementById('endCallBtn');
const callContainer = document.getElementById('callContainer');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

function resetCallUI() {
  callContainer.classList.add('hidden');
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
}

async function startCall(isVideo) {
  if (!chatPartner) {
    alert('Please login first.');
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: isVideo,
      audio: true
    });
    localVideo.srcObject = localStream;
    callContainer.classList.remove('hidden');

    peerConnection = new RTCPeerConnection(peerConnectionConfig);

    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
      }
      remoteStream.addTrack(event.track);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', { to: chatPartner, candidate: event.candidate });
      }
    };

    // Create offer and send to partner
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc-offer', { to: chatPartner, offer });

  } catch (error) {
    alert('Error accessing media devices or starting call: ' + error.message);
    resetCallUI();
  }
}

startCallBtn.addEventListener('click', () => {
  if (!username || !chatPartner) {
    alert('Please login first.');
    return;
  }
  // Navigate to call page in the same tab instead of opening new tab
  window.location.href = `call.html?username=${encodeURIComponent(username)}&partner=${encodeURIComponent(chatPartner)}`;
});

startAudioCallBtn.addEventListener('click', () => {
  startCall(false); // audio call
});

endCallBtn.addEventListener('click', () => {
  socket.emit('endCall', { to: chatPartner });
  resetCallUI();
});

// Handle incoming WebRTC signaling messages
socket.on('webrtc-offer', async ({ from, offer }) => {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(peerConnectionConfig);

    peerConnection.ontrack = (event) => {
      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
      }
      remoteStream.addTrack(event.track);
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', { to: from, candidate: event.candidate });
      }
    };
  }

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    localStream = await navigator.mediaDevices.getUserMedia({ video: offer.sdp.includes('m=video'), audio: true });
    localVideo.srcObject = localStream;
    callContainer.classList.remove('hidden');

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc-answer', { to: from, answer });
  } catch (error) {
    alert('Error handling incoming call: ' + error.message);
    resetCallUI();
  }
});

socket.on('webrtc-answer', async ({ from, answer }) => {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (error) {
    alert('Error setting remote description: ' + error.message);
    resetCallUI();
  }
});

socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error('Error adding received ICE candidate', error);
  }
});

socket.on('endCall', ({ from }) => {
  alert(`Call ended by ${from}`);
  resetCallUI();
});
