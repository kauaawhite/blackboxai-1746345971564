const peerConnectionConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

let localStream = null;
let remoteStream = null;
let peerConnection = null;

const callContainer = document.getElementById('callContainer');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const endCallBtn = document.getElementById('endCallBtn');

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

async function startAudioCall(socket, chatPartner) {
  if (!chatPartner) {
    alert('Please login first.');
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true
    });
    localVideo.srcObject = null; // Hide local video for audio call
    remoteVideo.srcObject = null;
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
    alert('Error accessing media devices or starting audio call: ' + error.message);
    resetCallUI();
  }
}

endCallBtn.addEventListener('click', () => {
  socket.emit('endCall', { to: chatPartner });
  resetCallUI();
  // Show chat UI and hide call UI
  document.getElementById('chatPage').classList.remove('hidden');
  callContainer.classList.add('hidden');
});

export { startAudioCall, resetCallUI, peerConnection, localStream, remoteStream, peerConnectionConfig };
