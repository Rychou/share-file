<script lang="ts">
import { Connection, FileReceiver } from './webrtc'
import { showNotify, showLoadingToast, type ToastWrapperInstance, showSuccessToast } from 'vant'
// @ts-ignore
import QRCode from 'qrcode'

export default {
  data(): {
    connection: Connection
    connectionState: RTCPeerConnectionState
    connectButtonDisable: boolean
    fileReceiverList: FileReceiver[]
    maxSize: number
    sendBitrate: number
    receiveBitrate: number
    roomId: string
    qrcode: string
    stepIndex: number
  } {
    return {
      connection: new Connection(),
      connectionState: 'closed',
      connectButtonDisable: false,
      fileReceiverList: [],
      maxSize: 0,
      sendBitrate: 0,
      receiveBitrate: 0,
      roomId: String(Math.floor(Math.random() * 100000)),
      qrcode: '',
      stepIndex: 0
    }
  },

  computed: {
    url() {
      return `${location.href}?roomId=${this.roomId}&autoConnect=1`
    }
  },

  // `mounted` 是生命周期钩子，之后我们会讲到
  mounted() {
    //@ts-ignore
    window.connection = this.connection
    let toast: ToastWrapperInstance | null = null
    this.connection.on('connection-state-changed', (state) => {
      this.connectionState = state
      if (state === 'connecting') {
        toast = showLoadingToast({ duration: 0, message: '正在连接' })
      } else if (state === 'connected') {
        toast?.close()
        toast = showSuccessToast('连接成功')
        if (this.stepIndex === 1) {
          this.stepIndex = 2
        }
      } else if (state === 'failed') {
        toast?.close()
        toast = showSuccessToast('连接失败，请检查网络或者更换网络重试')
      }
      if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
        this.connectButtonDisable = true
        this.maxSize = this.connection.maxSize
      }
    })
    this.connection.on('user-join', () => {
      if (this.stepIndex === 0) {
        this.stepIndex = 1
      }
    })
    this.connection.on('receive-file-started', (fileReceiver) => {
      this.fileReceiverList.push(fileReceiver)
    })
    this.connection.on('receive-file-ing', (fileReceiver) => {
      this.fileReceiverList = this.fileReceiverList.map((item) =>
        item.id === fileReceiver.id ? fileReceiver : item
      )
    })
    this.connection.on('receive-file-done', (fileReceiver) => {
      this.fileReceiverList = this.fileReceiverList.map((item) =>
        item.id === fileReceiver.id ? fileReceiver : item
      )
    })
    this.connection.on('stats', ({ sendBitrate, receiveBitrate }) => {
      this.sendBitrate = sendBitrate
      this.receiveBitrate = receiveBitrate
    })
    const search = new URLSearchParams(location.search)
    const urlRoomId = search.get('roomId')
    if (urlRoomId) {
      this.roomId = urlRoomId
    }
    QRCode.toDataURL(this.url).then((res) => {
      this.qrcode = res
    })
    this.connection.join(this.roomId)
  },

  methods: {
    connect() {
      this.connection?.connect()
    },
    chooseFile() {
      const fileInput = document.createElement('input')
      fileInput.type = 'file'
      fileInput.onchange = () => {
        if (fileInput.files && fileInput.files[0]) {
          this.connection.sendFile(fileInput.files[0])
        }
      }
      fileInput.click()
    },
    share() {
      navigator.clipboard.writeText(this.url).then(() => {
        showNotify({ type: 'success', message: '已将页面链接复制到剪切板' })
      })
    }
  }
}
</script>

<template>
  <div class="wrapper">
    <van-notice-bar color="#1989fa" background="#ecf9ff" left-icon="info-o" wrapable :scrollable="false">
      {{ (() => {
        if (stepIndex === 0) {
          return '在两台设备的浏览器中打开相同地址，可扫码二维码或者复制链接。'
        } else if (stepIndex === 1) {
          return '该步骤需要设备网络能正常访问互联网'
        } else {
          return '该步骤是 P2P 传输，若是通过手机热点连接，可以关闭移动数据，避免消耗流量。'
        }
      })() }}
    </van-notice-bar>
    <van-steps :active="stepIndex">
      <van-step>双方进入同一个链接</van-step>
      <van-step>建立 P2P 连接</van-step>
      <van-step>P2P 传输数据</van-step>
    </van-steps>

    <div class="main-wrapper">
      <div v-if="!connection?._remoteUser" class="share">
        <div>
          <img v-if="qrcode" :src="qrcode" />
        </div>
        <div class="share-link">
          <van-button @click="share()">复制链接</van-button>
        </div>
      </div>
      <!-- <button :disabled="connectButtonDisable" @click="connect()">connect</button> -->
      <div
        v-if="connection?._remoteUser && connectionState !== 'connected'"
        class="connect-wrapper"
      >
        <div></div>
        <van-button @click="connect()">连接</van-button>
      </div>

      <div v-if="connectionState === 'connected'" class="transfer-wrapper">
        <!-- <div>maxSize: {{ maxSize }}</div> -->
        <div>上行速率: {{ (sendBitrate / 1000 / 1000 / 8).toFixed(2) }} MB/s</div>
        <div>下行速率: {{ (receiveBitrate / 1000 / 1000 / 8).toFixed(2) }} MB/s</div>

        <div>
          <van-button
            type="primary"
            icon="plus"
            @click="chooseFile"
            style="margin: 0 auto; display: block"
          >
          </van-button>
          <div v-if="fileReceiverList.length">
            <div v-for="fileReceiver in fileReceiverList" :key="fileReceiver.id">
              <div style="display: flex; align-items: baseline">
                <span>{{ fileReceiver.name }}</span>
                <span style="margin: 0 6px"
                  >{{ (fileReceiver.size / 1000 / 1000).toFixed(2) }} MB</span
                >
                <van-icon
                  style="cursor: pointer"
                  name="down"
                  size="24"
                  v-if="fileReceiver.isDone"
                  @click="fileReceiver.download()"
                />
              </div>
              <van-progress
                style="margin: 6px 0"
                :percentage="Math.floor((fileReceiver.receivedSize / fileReceiver.size) * 100)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrapper {
  width: 80vw;
}
/* div {
  width: 100%;
} */
.main-wrapper,
.transfer-wrapper,
.share-link {
  display: flex;
  justify-content: center;
  align-items: center;
}
.transfer-wrapper {
  flex-direction: column;
}
</style>
