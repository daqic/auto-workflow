<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AccountSessionHeader from '@/components/AccountSessionHeader.vue'
import TokenInspector from '@/components/TokenInspector.vue'
import TokenTransfer from '@/components/TokenTransfer.vue'
import { useEthereumTool, useEthereumToolSnapshot } from '@/ethereum/vue-ethereum-tool'

const ethereumTool = useEthereumTool()
const snapshot = useEthereumToolSnapshot(ethereumTool)
const rpcUrlDraft = ref('')

const NETWORK_STATUS_PRESENTATION = {
  connected: {
    description: 'RPC 已验证为 Ethereum Sepolia，链上操作已启用。',
    label: '已连接',
  },
  connecting: {
    description: '正在验证 RPC 返回的 chain ID。',
    label: '正在连接',
  },
  error: {
    description: '应用仍可使用。请重新连接，或验证一个临时 RPC。',
    label: '连接失败',
  },
  idle: {
    description: '正在验证 RPC 返回的 chain ID。',
    label: '等待连接',
  },
} as const

const networkStatusPresentation = computed(
  () => NETWORK_STATUS_PRESENTATION[snapshot.value.network.status],
)

async function reconnect() {
  await ethereumTool.network.reconnect()
}

async function applyRpcOverride() {
  await ethereumTool.network.applyRpcOverride(rpcUrlDraft.value)
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!snapshot.value.transfer.requiresRecovery) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload)
  void ethereumTool.network.initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnBeforeUnload)
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="header-identity">
        <a class="brand" href="/" aria-label="Ethereum Sepolia 工具 Demo 首页">
          <span class="brand-mark" aria-hidden="true">Ξ</span>
          <span>Sepolia Tool</span>
        </a>
        <span class="local-badge">仅限本地开发</span>
      </div>

      <AccountSessionHeader />
    </header>

    <main class="page-shell">
      <section class="intro" aria-labelledby="page-title">
        <p class="eyebrow">SEPOLIA · NETWORK CONSOLE</p>
        <h1 id="page-title">Ethereum Sepolia 工具 Demo</h1>
        <p class="intro-copy">
          一个在浏览器本地运行的开发者工具。先验证网络连接，再安全地进入后续链上操作。
        </p>
      </section>

      <section class="network-card" aria-labelledby="network-heading">
        <div class="card-heading">
          <div>
            <p class="section-kicker">NETWORK</p>
            <h2 id="network-heading">Sepolia 网络连接</h2>
          </div>
          <span
            class="status-pill"
            :class="`status-pill--${snapshot.network.status}`"
            data-testid="network-status"
            role="status"
            aria-live="polite"
          >
            <span class="status-dot" aria-hidden="true"></span>
            {{ networkStatusPresentation.label }}
          </span>
        </div>

        <p class="status-description">{{ networkStatusPresentation.description }}</p>

        <div v-if="snapshot.network.connectionError" class="error-banner" role="alert">
          <span class="error-icon" aria-hidden="true">!</span>
          <div>
            <strong>Sepolia 连接不可用</strong>
            <p>{{ snapshot.network.connectionError.message }}</p>
          </div>
        </div>

        <dl class="connection-details">
          <div>
            <dt>当前 RPC</dt>
            <dd data-testid="active-rpc-url">{{ snapshot.network.activeRpcUrl }}</dd>
          </div>
          <div>
            <dt>Chain ID</dt>
            <dd>{{ snapshot.network.chainId ?? '等待验证' }}</dd>
          </div>
          <div>
            <dt>链上操作</dt>
            <dd>{{ snapshot.network.canUseChainActions ? '可用' : '已暂停' }}</dd>
          </div>
        </dl>

        <div class="primary-actions">
          <button
            class="button button--secondary"
            name="reconnect"
            type="button"
            :disabled="!snapshot.network.canReconnect"
            @click="reconnect"
          >
            {{ snapshot.network.status === 'connecting' ? '正在连接…' : '重新连接' }}
          </button>
        </div>

        <details class="advanced-settings">
          <summary>
            <span>高级 RPC 设置</span>
            <span class="summary-hint">临时覆盖</span>
          </summary>
          <form class="rpc-form" @submit.prevent="applyRpcOverride">
            <div class="field">
              <label for="rpc-url">临时 RPC 地址</label>
              <p id="rpc-url-help">候选地址验证为 Sepolia 后，才会替换当前 RPC。</p>
              <div class="field-action">
                <input
                  id="rpc-url"
                  v-model="rpcUrlDraft"
                  name="rpc-url"
                  type="url"
                  inputmode="url"
                  autocomplete="off"
                  placeholder="https://..."
                  required
                  :aria-describedby="
                    snapshot.network.rpcOverrideError
                      ? 'rpc-url-help rpc-override-error'
                      : 'rpc-url-help'
                  "
                />
                <button
                  class="button button--primary"
                  type="submit"
                  :disabled="!snapshot.network.canApplyRpcOverride"
                >
                  {{ snapshot.network.isValidatingRpc ? '正在验证…' : '验证并应用' }}
                </button>
              </div>
              <p
                v-if="snapshot.network.rpcOverrideError"
                id="rpc-override-error"
                class="field-error"
                data-testid="rpc-override-error"
                role="alert"
              >
                {{ snapshot.network.rpcOverrideError.message }}
              </p>
            </div>
          </form>
          <p class="session-note">此设置只在当前页面会话中有效，刷新后恢复默认 RPC。</p>
        </details>
      </section>

      <TokenInspector />
      <TokenTransfer />

      <aside class="safety-note" aria-labelledby="safety-heading">
        <span class="safety-mark" aria-hidden="true">i</span>
        <div>
          <h2 id="safety-heading">本地运行边界</h2>
          <p>本 Demo 不会持久化 RPC 设置，也不会自动重试失败请求。</p>
        </div>
      </aside>
    </main>

    <footer>Developer utility · Ethereum Sepolia only</footer>
  </div>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(button),
:global(input) {
  font: inherit;
}

:global(button:focus-visible),
:global(input:focus-visible),
:global(summary:focus-visible),
:global(a:focus-visible) {
  outline: 3px solid var(--color-focus-outline);
  outline-offset: 3px;
}

.app-shell {
  min-height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  min-height: 96px;
  padding: 16px 48px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}

.header-identity {
  display: flex;
  flex: none;
  gap: 14px;
  align-items: center;
}

.brand {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  color: var(--color-text);
  font-weight: 700;
  text-decoration: none;
}

.brand-mark {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 9px;
  color: var(--color-text);
  background: var(--color-action);
}

.local-badge {
  padding: 6px 10px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  color: var(--color-pending-text);
  background: var(--color-pending-surface);
  font-size: 12px;
  font-weight: 700;
}

.page-shell {
  width: min(880px, calc(100% - 96px));
  margin: 0 auto;
  padding: 72px 0 48px;
}

.intro {
  max-width: 720px;
  margin-bottom: 32px;
}

.eyebrow,
.section-kicker {
  margin: 0 0 10px;
  color: var(--color-link);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 16px;
  font-size: 40px;
  line-height: 1.15;
  letter-spacing: -0.035em;
}

.intro-copy {
  max-width: 640px;
  margin-bottom: 0;
  color: var(--color-text-secondary);
  font-size: 17px;
  line-height: 1.75;
}

.network-card {
  padding: 32px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
}

.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.card-heading h2 {
  margin-bottom: 0;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.section-kicker {
  margin-bottom: 6px;
  color: var(--color-text-secondary);
}

.status-pill {
  display: inline-flex;
  flex: none;
  gap: 8px;
  align-items: center;
  padding: 7px 11px;
  border-radius: 999px;
  color: var(--color-pending-text);
  background: var(--color-pending-surface);
  font-size: 13px;
  font-weight: 700;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentcolor;
}

.status-pill--connected {
  color: var(--color-success-text);
  background: var(--color-success-surface);
}

.status-pill--error {
  color: var(--color-error-text);
  background: var(--color-error-surface);
}

.status-pill--connecting .status-dot {
  animation: pulse 1.2s ease-in-out infinite;
}

.status-description {
  margin: 14px 0 24px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.error-banner {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  padding: 14px 16px;
  border: 1px solid var(--color-error-text);
  border-radius: 10px;
  color: var(--color-error-text);
  background: var(--color-error-surface);
}

.error-banner p {
  margin: 4px 0 0;
  color: var(--color-error-text);
  font-size: 14px;
  line-height: 1.5;
}

.error-icon,
.safety-mark {
  display: grid;
  flex: none;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 999px;
  color: var(--color-text);
  background: var(--color-danger);
  font-size: 13px;
  font-weight: 800;
}

.connection-details {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 0.7fr 0.7fr;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-recessed);
}

.connection-details div {
  min-width: 0;
  padding: 16px;
}

.connection-details div + div {
  border-left: 1px solid var(--color-border);
}

.connection-details dt {
  margin-bottom: 7px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.connection-details dd {
  margin: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.primary-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

:global(.button) {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background 140ms ease;
}

:global(.button:disabled) {
  border-color: var(--color-disabled-surface);
  color: var(--color-text-secondary);
  background: var(--color-disabled-surface);
  cursor: not-allowed;
}

:global(.button--secondary) {
  border: 1px solid var(--color-border-strong);
  color: var(--color-text);
  background: var(--color-surface);
}

:global(.button--secondary:hover:not(:disabled)) {
  border-color: var(--color-focus);
  background: var(--color-recessed);
}

:global(.button--primary) {
  border: 1px solid var(--color-action);
  color: var(--color-text);
  background: var(--color-action);
}

:global(.button--primary:hover:not(:disabled)) {
  border-color: var(--color-action-hover);
  background: var(--color-action-hover);
}

.advanced-settings {
  margin-top: 24px;
  border-top: 1px solid var(--color-border);
}

.advanced-settings summary {
  display: flex;
  justify-content: space-between;
  padding: 20px 0 0;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}

.advanced-settings summary::-webkit-details-marker {
  display: none;
}

.summary-hint {
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.rpc-form {
  margin-top: 20px;
}

.field label {
  display: block;
  margin-bottom: 5px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
}

.field > p {
  margin-bottom: 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.field-action {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

:global(input) {
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  color: var(--color-text);
  background: var(--color-recessed);
}

:global(input::placeholder) {
  color: var(--color-text-secondary);
}

:global(input:hover) {
  border-color: var(--color-border-strong);
}

:global(input:focus) {
  border-color: var(--color-focus);
}

.field .field-error {
  margin: 8px 0 0;
  color: var(--color-error-text);
  font-size: 13px;
}

.session-note {
  margin: 14px 0 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.safety-note {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-top: 18px;
  padding: 18px 20px;
  border: 1px solid var(--color-pending-text);
  border-radius: 12px;
  color: var(--color-pending-text);
  background: var(--color-pending-surface);
}

.safety-mark {
  background: var(--color-action);
}

.safety-note h2 {
  margin-bottom: 4px;
  font-size: 14px;
}

.safety-note p {
  margin-bottom: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

footer {
  padding: 0 48px 32px;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-align: center;
}

@keyframes pulse {
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-pill--connecting .status-dot {
    animation: none;
  }

  .button {
    transition: none;
  }
}
</style>
