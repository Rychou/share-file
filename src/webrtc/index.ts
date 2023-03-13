import { io, Socket } from "socket.io-client";
const SERVER_URL = "http://43.163.217.75:3000";
export class Connection {
   _peerConnection: RTCPeerConnection;
   _dataChannel: RTCDataChannel;
   _socket: Socket;
   _localUser?: string;
   _remoteUser?: string;
  constructor() {
    this._socket = io(SERVER_URL);
    this._peerConnection = new RTCPeerConnection({
      iceServers: [{
        urls: ['stun:43.163.217.75:3478'],
        username: 'admin',
        credential: '123456'
      }]
    });
    this._socket.on('connect', () => this._localUser = this._socket.id);
    this._socket.on('candidate', (candidate) => {
      console.warn('on remote candidate ', candidate);
      this._peerConnection.addIceCandidate(candidate);
    })
    this._socket.on('user-join', userId => {
      this._remoteUser = userId;
      console.warn('remote user join: ', userId);
    })
    this._socket.on('offer', async (offer) => {
      await this._peerConnection.setRemoteDescription(offer);
      const answer = await this._peerConnection.createAnswer();
      await this._peerConnection.setLocalDescription(answer)
      this._socket.emit('answer', answer);
    })
    this._socket.on('answer', (answer) => {
      this._peerConnection.setRemoteDescription(answer);
    })
    this._peerConnection.onconnectionstatechange = (event) => {
      console.warn('connection state changed: ', this._peerConnection.connectionState);
    }
    this._peerConnection.oniceconnectionstatechange = (event) => {
      console.warn('iceConnectionState state changed: ', this._peerConnection.iceConnectionState);
    }
    this._peerConnection.onicecandidateerror = console.error

    this._peerConnection.onicecandidate = event => {
      console.warn('on local candidate ', event.candidate);
      if (event.candidate) {
        this._socket.emit('candidate', event.candidate);
      }
    }
  }

  join(roomId: string) {
    this._socket.emit('join', roomId);
  }

  async connect() {
    this._dataChannel = this._peerConnection.createDataChannel('dc');
    this._dataChannel.binaryType = 'arraybuffer';
    //@ts-ignore
    const offer = await this._peerConnection.createOffer({offerToReceiveVideo: false, offerToReceiveAudio: false, voiceActivityDetection: true, iceRestart: false});
    await this._peerConnection.setLocalDescription(offer);
    this._socket.emit('offer', offer);
  }
}