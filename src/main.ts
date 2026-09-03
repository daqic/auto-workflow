import { createApp } from 'vue'
import { createPinia } from 'pinia'

import '@/styles/theme.scss'

import App from './App.vue'
import { createEthereumTool } from './ethereum/ethereum-tool'
import { createViemSepoliaRpcAdapter } from './ethereum/viem-sepolia-rpc-adapter'
import { ethereumToolKey } from './ethereum/vue-ethereum-tool'
import router from './router'

const app = createApp(App)
const ethereumTool = createEthereumTool({ rpc: createViemSepoliaRpcAdapter() })

app.use(createPinia())
app.use(router)
app.provide(ethereumToolKey, ethereumTool)

app.mount('#app')
