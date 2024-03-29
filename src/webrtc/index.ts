import { io, Socket } from "socket.io-client";
import EventEmitter from 'eventemitter3';
import { reactive } from "vue";
import { showToast } from "vant";

const ConnectionEvent = {
  CONNECTION_STATE_CHANGED: 'connectionStateChanged'
}

interface ConnectionEventTypes {
  'user-join': () => void;
  'connection-state-changed': (connectionState: RTCPeerConnectionState) => void;
  'receive-file-started': (fileReceiver: FileReceiver) => void;
  'receive-file-ing': (fileReceiver: FileReceiver) => void;
  'receive-file-done': (fileReceiver: FileReceiver) => void;
  'stats': (stats: { sendBitrate: number; receiveBitrate: number }) => void;
}

interface FileItem {
  type: 'meta' | 'done';
}
interface FileItemMeta extends FileItem {
  name: string;
  size: number;
}

let fileReceiverSeq = 0
export class FileReceiver extends EventEmitter {
  id = ++fileReceiverSeq;
  seq = 0;
  receiveBuffer: ArrayBuffer[] = [];
  name: string;
  size: number;
  isDone = false;
  dataURL = ''
  receivedSize = 0;

  constructor(fileItemMeta: FileItemMeta) {
    super();
    this.name = fileItemMeta.name;
    this.size = fileItemMeta.size;
  }

  getDataURL() {
    if (this.dataURL.length > 0) return this.dataURL
    if (this.isDone) {
      const blob = new Blob(this.receiveBuffer);
      this.dataURL = URL.createObjectURL(blob);
    }
    return this.dataURL;
  }

  addData(data: ArrayBuffer) {
    const uin8Array = new Uint8Array(data);
    const seq = new DataView(data).getUint16(0, false);
    console.warn(seq, this.seq);
    if (seq - this.seq !== 1) {
      console.error(seq, this.seq)
    }
    this.seq = seq;
    const fileData = uin8Array.slice(2).buffer;
    this.receiveBuffer.push(fileData);
    this.receivedSize += fileData.byteLength;
  }

  download() {
    if (!this.isDone) {
      console.error('file receiver is not done yet!');
      return;
    }
    const a = document.createElement('a');
    a.href = this.getDataURL();
    a.download = this.name;
    a.click();
  }
}

const IS_LOCAL = location.hostname.includes('localhost') || location.hostname.includes('127.0.0.1') || location.hostname.includes('192.168')
// const SERVER_URL = "http://localhost:3000";
// const SERVER_URL = "http://43.163.217.75:3000";
// const SERVER_URL = "http://192.168.123.111:3000";
const SERVER_URL = `http://${location.hostname}:3000`;
export class Connection extends EventEmitter<ConnectionEventTypes> {
  _peerConnection: RTCPeerConnection;
  _sendChannel: RTCDataChannel | null = null;
  _receiveChannel: RTCDataChannel | null = null;
  _socket: Socket;
  _localUser?: string;
  _remoteUser?: string;
  connectionState: RTCPeerConnectionState = 'closed';

  bytesSent = 0;
  bytesReceived = 0;

  fileReceiverMap: Map<number, FileReceiver> = new Map();
  receivingFileId: number = -1;

  maxSize = 0;

  sendChannelAvailablePromise: Promise<void> | null = null;
  sendArrayBuffer: ArrayBuffer[] = [];
  sendDataURL = '';
  get isSendChannelAvailable() {
    if (!this._sendChannel) return false;
    return this._sendChannel.bufferedAmount <= this._sendChannel.bufferedAmountLowThreshold;
  }
  constructor() {
    super();
    this._socket = io(SERVER_URL);
    this._peerConnection = new RTCPeerConnection({
      iceServers: [{
        urls: [`stun:${location.hostname}:3478`],
        username: 'admin',
        credential: '123456'
      }]
    });
    this._socket.on('connect', () => {
      this._localUser = this._socket.id
      console.warn('local userId', this._localUser)
    });
    this._socket.on('candidate', (candidate) => {
      console.warn('on remote candidate ', candidate);
      this._peerConnection.addIceCandidate(candidate);
    })
    this._socket.on('user-join', userId => {
      this._remoteUser = userId;
      console.warn('remote user join: ', userId);
      showToast({ type: 'text', message: `user-join ${userId}`})
      this.emit('user-join')
    })
    this._socket.on('user-leave', userId => {
      showToast({ type: 'text', message: `user-leave ${userId}`})
      this._remoteUser = undefined;
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
    this._socket.on('error', message => {
      showToast(message);
    })
    this._peerConnection.ondatachannel = event => {
      this._receiveChannel = event.channel;
      this._receiveChannel.onopen = () => console.warn('receiveChannel open');
      this._receiveChannel.onmessage = this.onReceiveData.bind(this);
    }
    this._peerConnection.onconnectionstatechange = (event) => {
      this.connectionState = this._peerConnection.connectionState;
      if (this.connectionState === 'connected') {
        setInterval(async () => {
          const stats = await this._peerConnection.getStats();
          const prevBytesSent = this.bytesSent;
          const prevBytesReceived = this.bytesReceived;
          stats.forEach(item => {
            if (item.type === 'data-channel') {
              if (item.bytesSent > 0) {
                this.bytesSent = item.bytesSent;
              }
              if (item.bytesReceived) {
                this.bytesReceived = item.bytesReceived;
              }
            }
          });
          const sendBitrate = (this.bytesSent - prevBytesSent) * 8;
          const receiveBitrate = (this.bytesReceived - prevBytesReceived) * 8;
          this.emit('stats', { sendBitrate, receiveBitrate });
        }, 1000)
        const match = this._peerConnection.remoteDescription!.sdp.match(/a=max-message-size:\s*(\d+)/);
        if (match && match[1]) {
          this.maxSize = Number(match[1]);
          if (this._sendChannel) {
            this._sendChannel.bufferedAmountLowThreshold = this.maxSize * 16;
          }
        }
      }
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
    this._sendChannel.bufferedAmountLowThreshold = 65535
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

  // TODO: 发送多文件
  sendFiles(files: File[]) {

  }

  waitSendChannelAbleToSend() {
    if (this.sendChannelAvailablePromise) {
      return this.sendChannelAvailablePromise;
    }

    if (!this.isSendChannelAvailable) {
      this.sendChannelAvailablePromise = new Promise((resovle) => {
        this._sendChannel!.onbufferedamountlow = () => {
          this.sendChannelAvailablePromise = null;
          this._sendChannel!.onbufferedamountlow = null;
          resovle();
        };
      })
      return this.sendChannelAvailablePromise;
    }
    return Promise.resolve();
  }

  // FIXME: Android 和 iOS 互传，速度比较慢 1M/s
  async send(data: ArrayBuffer | string) {
    if (!this._sendChannel) return;
    // console.warn(this._sendChannel.bufferedAmount, this._sendChannel.bufferedAmountLowThreshold)
    if (this.isSendChannelAvailable) {
      try {
        // @ts-ignore
        if (data instanceof ArrayBuffer && this.sendArrayBuffer.length > 0) {
          console.warn(new DataView(data).getUint16(0))
          this._sendChannel.send(this.sendArrayBuffer.shift()!);
        } else {
          this._sendChannel.send(data as string)
        }
      } catch (error) {
        // debugger;
      }
    } else {
      await this.waitSendChannelAbleToSend();
      this.send(data);
    }
  }

  sendFile(file: File) {
    if (!this._peerConnection || !this._sendChannel || !this._sendChannel.readyState) return;

    const fileReader = reactive(new FileReader());
    let offset = 0;
    let index = 0;
    const chunkSize = 256 * 1024;
    const metaInfo: FileItemMeta = {
      type: 'meta',
      name: file.name,
      size: file.size
    }
    this.send(JSON.stringify(metaInfo))
    fileReader.addEventListener('error', error => console.error('Error reading file:', error));
    fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
    fileReader.addEventListener('load', e => {
      if (this._sendChannel && e.target && e.target.result && e.target.result instanceof ArrayBuffer) {
        index++;
        const data = new Uint8Array(2 + e.target.result.byteLength);
        new DataView(data.buffer).setUint16(0, index)
        data.set(new Uint8Array(e.target.result), 2);
        this.sendArrayBuffer.push(data.buffer);
        this.send(data.buffer);
        offset += e.target.result.byteLength;
      }

      if (offset < file.size) {
        readSlice(offset);
      } else {
        const doneInfo: FileItem = { type: 'done' }
        this.send(JSON.stringify(doneInfo))
      }
    });
    const readSlice = (o: any) => {
      // console.log('readSlice ', o);
      const slice = file.slice(offset, o + chunkSize - 2);
      fileReader.readAsArrayBuffer(slice);
    };
    readSlice(0);
  }

  onReceiveData(event: any) {
    // console.warn('receive message: ' + event.data)
    if (typeof event.data === 'string') {
      const fileItem: FileItem | FileItemMeta = JSON.parse(event.data);
      if (fileItem.type === 'meta') {
        const fileReceiver = new FileReceiver(fileItem as FileItemMeta);
        this.receivingFileId = fileReceiver.id;
        this.fileReceiverMap.set(fileReceiver.id, fileReceiver);
        this.emit('receive-file-started', fileReceiver)
      } else if (fileItem.type === 'done') {
        const fileReceiver = this.fileReceiverMap.get(this.receivingFileId);
        if (fileReceiver) {
          this.receivingFileId = -1;
          fileReceiver.isDone = true;
          this.emit('receive-file-done', fileReceiver)
        }
      }
    } else if (event.data instanceof ArrayBuffer) {
      const fileReceiver = this.fileReceiverMap.get(this.receivingFileId);
      if (fileReceiver) {
        fileReceiver.addData(event.data);
        this.emit('receive-file-ing', fileReceiver)
      }
    }
  }
}