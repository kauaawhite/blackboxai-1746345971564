const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callStatus = document.getElementById('callStatus');
const endCallBtn = document.getElementById('endCallBtn');

let localStream = null;
let remoteStream = null;
let peerConnection = null;
const peerConnectionConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get('username');
const chatPartner = urlParams.get('partner');

if (!username || !chatPartner) {
  alert('Missing username or chat partner information.');
  window.close();
}

function resetCallUI() {
  callStatus.textContent = 'Call ended';
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
}

async function startCall() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peerConnection = new RTCPeerConnection(peerConnectionConfig);

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteVideo.srcObject = remoteStream;
      }
      remoteStream.addTrack(event.track);
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', { to: chatPartner, candidate: event.candidate });
      }
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('webrtc-offer', { to: chatPartner, offer });

    callStatus.textContent = 'Calling ' + chatPartner + '...';

  } catch (error) {
    alert('Error accessing media devices or starting call: ' + error.message);
    resetCallUI();
  }
}

endCallBtn.addEventListener('click', () => {
  socket.emit('endCall', { to: chatPartner });
  resetCallUI();
  window.close();
});

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
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('webrtc-answer', { to: from, answer });

    callStatus.textContent = 'In call with ' + from;

  } catch (error) {
    alert('Error handling incoming call: ' + error.message);
    resetCallUI();
  }
});

socket.on('webrtc-answer', async ({ from, answer }) => {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    callStatus.textContent = 'In call with ' + from;
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
  window.close();
});

// Start the call automatically when page loads
startCall();
