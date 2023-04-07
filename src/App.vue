<script lang="ts">
import { Connection } from './webrtc'

export default {
  data(): { connection: Connection; connectionState: RTCPeerConnectionState, connectButtonDisable: boolean } {
    return {
      connection: new Connection(),
      connectionState: 'closed',
      connectButtonDisable: false,
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
      }
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
    <div>
      选择文件：
    </div>
    <input type="file" @change="onFileChange" ref="fileInput"/>
    <button :disabled="connectButtonDisable" @click="connect()">connect</button>
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
