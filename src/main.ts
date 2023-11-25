import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

import './assets/main.css'
import { Notify, Button, Toast, Step, Steps, Progress,Icon,NoticeBar } from 'vant'
import 'vant/lib/index.css';

const app = createApp(App)

app.use(router)
app.use(Notify)
app.use(Button)
app.use(Toast)
app.use(Step)
app.use(Steps)
app.use(Progress)
app.use(Icon)
app.use(NoticeBar)

app.mount('#app')
