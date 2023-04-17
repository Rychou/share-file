<script lang="ts">
import { Connection, FileReceiver } from './webrtc'

export default {
  data(): { connection: Connection; connectionState: RTCPeerConnectionState, connectButtonDisable: boolean, fileReceiverList: FileReceiver[], maxSize: number, sendBitrate: number, receiveBitrate: number } {
    return {
      connection: new Connection(),
      connectionState: 'closed',
      connectButtonDisable: false,
      fileReceiverList: [],
      maxSize: 0,
      sendBitrate: 0,
      receiveBitrate: 0
    }
  },

  // `mounted` 是生命周期钩子，之后我们会讲到
  mounted() {
    //@ts-ignore
    window.connection = this.connection
    this.connection.on('connection-state-changed', state => {
      this.connectionState = state;
      if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
        this.connectButtonDisable = true;
        this.maxSize = this.connection.maxSize;
      }
    })
    this.connection.on('receive-file-started', fileReceiver => {
      this.fileReceiverList.push(fileReceiver);
    })
    this.connection.on('receive-file-ing', fileReceiver => {
      this.fileReceiverList = this.fileReceiverList.map(item => item.id === fileReceiver.id ? fileReceiver : item)
    })
    this.connection.on('receive-file-done', fileReceiver => {
      this.fileReceiverList = this.fileReceiverList.map(item => item.id === fileReceiver.id ? fileReceiver : item)
    })
    this.connection.on('stats', ({ sendBitrate, receiveBitrate }) => {
      this.sendBitrate = sendBitrate;
      this.receiveBitrate = receiveBitrate;
    })
    const search = new URLSearchParams(location.search)
    this.connection.join(search.get('roomId') || '123')
  },

  methods: {
    connect() {
      this.connection?.connect()
    },
    onFileChange() {
      const fileInput = this.$refs.fileInput as HTMLInputElement
      if (fileInput.files && fileInput.files[0]) {
        this.connection.sendFile(fileInput.files[0])
      }
    }
  }
}
</script>

<template>
  <div>
    <div>my userId: {{ connection?._localUser }}</div>
    <div>remote userId: {{ connection?._remoteUser }}</div>
    <div>connection state: {{ connectionState }}</div>
    <div>maxSize: {{ maxSize }}</div>
    <div>sendBitrate: {{ (sendBitrate / 1000 / 1000).toFixed(2) }} Mbps {{ (sendBitrate / 1000 / 1000 / 8).toFixed(2) }} MBps</div>
    <div>receiveBitrate: {{ (receiveBitrate / 1000 / 1000).toFixed(2) }} Mbps {{ (receiveBitrate / 1000 / 1000 / 8).toFixed(2) }} MBps</div>
    <button :disabled="connectButtonDisable" @click="connect()">connect</button>

    <div>
      <div>选择文件：<input type="file" @change="onFileChange" ref="fileInput"/></div>
      <div>收到文件：
        <div v-for="fileReceiver in fileReceiverList" :key="fileReceiver.id">
          <span>{{ fileReceiver.name }}</span>  <span>{{ (fileReceiver.size / 1000 / 1000).toFixed(2) }} MB</span> <span>{{ (fileReceiver.receivedSize / 1000 / 1000).toFixed(2) }} MB</span>
          <button v-if="fileReceiver.isDone" @click="fileReceiver.download()">Donwload</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
header {
  line-height: 1.5;
  max-height: 100vh;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

nav {
  width: 100%;
  font-size: 12px;
  text-align: center;
  margin-top: 2rem;
}

nav a.router-link-exact-active {
  color: var(--color-text);
}

nav a.router-link-exact-active:hover {
  background-color: transparent;
}

nav a {
  display: inline-block;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
}

nav a:first-of-type {
  border: 0;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }

  nav {
    text-align: left;
    margin-left: -1rem;
    font-size: 1rem;

    padding: 1rem 0;
    margin-top: 1rem;
  }
}
</style>
