import { io, Socket } from "socket.io-client";
import EventEmitter from 'eventemitter3';

const ConnectionEvent = {
  CONNECTION_STATE_CHANGED: 'connectionStateChanged'
}

interface ConnectionEventTypes {
  'connection-state-changed': (connectionState: RTCPeerConnectionState) => void
}

const SERVER_URL = "http://192.168.123.111:3000";
export class Connection extends EventEmitter<ConnectionEventTypes> {
  _peerConnection: RTCPeerConnection;
  _sendChannel: RTCDataChannel | null = null;
  _receiveChannel: RTCDataChannel | null = null;
  _socket: Socket;
  _localUser?: string;
  _remoteUser?: string;
  connectionState: RTCPeerConnectionState = 'closed';
  receiveBuffer: ArrayBuffer[] = [];
  constructor() {
    super();
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
      this.initDataChannel();
      const answer = await this._peerConnection.createAnswer();
      await this._peerConnection.setLocalDescription(answer)
      this._socket.emit('answer', answer);
    })
    this._socket.on('answer', (answer) => {
      this._peerConnection.setRemoteDescription(answer);
    })
    this._peerConnection.ondatachannel = event => {
      this._receiveChannel = event.channel;
      this._receiveChannel.onopen = () => console.warn('receiveChannel open');
      this._receiveChannel.onmessage = this.onReceiveData.bind(this);
    }
    this._peerConnection.onconnectionstatechange = (event) => {
      this.connectionState = this._peerConnection.connectionState;
      this.emit('connection-state-changed', this._peerConnection.connectionState);
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

  initDataChannel() {
    if (this._sendChannel) return;
    this._sendChannel = this._peerConnection.createDataChannel('dc');
    this._sendChannel.binaryType = 'arraybuffer';
    this._sendChannel.onopen = () => {
      console.warn('datachannel onpen')
    }
    this._sendChannel.onmessage = evt => {
      console.warn(evt);
    }
  }

  async connect() {
    if (this.connectionState === 'connected') return;
    this.initDataChannel();
    //@ts-ignore
    const offer = await this._peerConnection.createOffer({ offerToReceiveVideo: false, offerToReceiveAudio: false, voiceActivityDetection: true, iceRestart: false });
    await this._peerConnection.setLocalDescription(offer);
    this._socket.emit('offer', offer);
  }

  sendFile(file: File) {
    if (!this._peerConnection || !this._sendChannel || !this._sendChannel.readyState) return;

    const fileReader = new FileReader();
    let offset = 0;
    const chunkSize = 16384;
    fileReader.addEventListener('error', error => console.error('Error reading file:', error));
    fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
    fileReader.addEventListener('load', e => {
      console.log('FileRead.onload ', e);
      if (this._sendChannel && e.target && e.target.result && e.target.result instanceof ArrayBuffer) {
        this._sendChannel.send(e.target.result);
        offset += e.target.result.byteLength;
      }

      if (offset < file.size) {
        readSlice(offset);
      } else {
        this._sendChannel?.send('done')
      }
    });
    const readSlice = (o: any) => {
      console.log('readSlice ', o);
      const slice = file.slice(offset, o + chunkSize);
      fileReader.readAsArrayBuffer(slice);
    };
    readSlice(0);
  }

  onReceiveData(event: any) {
    console.warn('receive message: ' + event.data)
    if (event.data === 'done') {
      const blob = new Blob(this.receiveBuffer);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '测试文件.pdf'
      a.click();
    } else {
      this.receiveBuffer.push(event.data);
    }
  }
}