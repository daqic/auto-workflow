<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

import { useEthereumTool, useEthereumToolSnapshot } from '@/ethereum/vue-ethereum-tool'

const ethereumTool = useEthereumTool()
const snapshot = useEthereumToolSnapshot(ethereumTool)
const privateKeyInput = ref<HTMLInputElement | null>(null)
const isPrivateKeyVisible = ref(false)

const ACCOUNT_STATUS_LABEL = {
  'balance-error': '余额读取错误',
  connected: '已连接',
  'import-error': '导入错误',
  importing: '导入中',
  'loading-balance': '余额加载中',
  locked: '已锁定',
} as const

const accountStatusLabel = computed(() => ACCOUNT_STATUS_LABEL[snapshot.value.account.status])

function importAccount() {
  const input = privateKeyInput.value

  if (!input) {
    return
  }

  const privateKey = input.value
  input.value = ''
  isPrivateKeyVisible.value = false
  void ethereumTool.account.importPrivateKey(privateKey)
}

function lockAccount() {
  const requiresDiscardConfirmation = snapshot.value.transfer.requiresRecovery

  if (
    requiresDiscardConfirmation &&
    !window.confirm(
      '这笔交易可能已经广播。锁定后，完全相同的已签名交易和恢复材料将丢失，且无法从本 Demo 恢复。仍要锁定吗？',
    )
  ) {
    return false
  }

  const locked = ethereumTool.account.lock({
    discardUnresolvedTransaction: requiresDiscardConfirmation,
  })

  if (locked) {
    isPrivateKeyVisible.value = false
  }

  return locked
}

async function startAccountReplacement() {
  if (!lockAccount()) {
    return
  }

  await nextTick()
  privateKeyInput.value?.focus()
}

async function refreshAccountBalance() {
  await ethereumTool.account.refreshBalance()
}
</script>

<template>
  <section class="account-session" aria-label="账户会话">
    <div v-if="snapshot.account.address" class="account-public-state">
      <div class="account-copy">
        <div class="account-label-row">
          <span id="account-session-label">专用测试账户</span>
          <span
            class="account-status"
            :class="`account-status--${snapshot.account.status}`"
            data-testid="account-status"
            role="status"
            aria-live="polite"
          >
            {{ accountStatusLabel }}
          </span>
        </div>
        <a
          class="account-address"
          data-testid="account-address"
          :href="`https://sepolia.etherscan.io/address/${snapshot.account.address}`"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ snapshot.account.address }}
        </a>
        <span
          class="account-balance"
          :class="{ 'account-balance--error': snapshot.account.status === 'balance-error' }"
          data-testid="eth-balance"
        >
          <template v-if="snapshot.account.status === 'loading-balance'">余额加载中…</template>
          <template v-else-if="snapshot.account.ethBalance !== null">
            {{ snapshot.account.ethBalance }} ETH
          </template>
          <template v-else>余额读取失败</template>
        </span>
        <p
          v-if="snapshot.account.error"
          class="account-error"
          data-testid="account-error"
          role="alert"
        >
          {{ snapshot.account.error.message }}
        </p>
      </div>
      <div class="account-actions">
        <button
          class="button button--secondary button--compact"
          name="refresh-account-balance"
          type="button"
          :disabled="!snapshot.account.canRefreshBalance"
          @click="refreshAccountBalance"
        >
          {{ snapshot.account.status === 'loading-balance' ? '刷新中…' : '刷新余额' }}
        </button>
        <button
          class="button button--secondary button--compact"
          name="replace-account"
          type="button"
          :disabled="!snapshot.account.canLock"
          @click="startAccountReplacement"
        >
          导入新账户
        </button>
        <button
          class="button button--danger button--compact"
          name="lock-account"
          type="button"
          :disabled="!snapshot.account.canLock"
          @click="lockAccount"
        >
          锁定
        </button>
      </div>
    </div>

    <form
      v-else
      class="account-import-form"
      data-testid="account-import-form"
      @submit.prevent="importAccount"
    >
      <div class="account-label-row">
        <label id="account-session-label" for="private-key">专用测试账户</label>
        <span
          class="account-status"
          :class="`account-status--${snapshot.account.status}`"
          data-testid="account-status"
          role="status"
          aria-live="polite"
        >
          {{ accountStatusLabel }}
        </span>
      </div>
      <div class="private-key-row">
        <div class="private-key-field">
          <input
            id="private-key"
            ref="privateKeyInput"
            name="private-key"
            :type="isPrivateKeyVisible ? 'text' : 'password'"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            placeholder="0x + 64 位十六进制字符"
            required
            :disabled="!snapshot.account.canImport"
            :aria-describedby="
              snapshot.account.error ? 'private-key-help account-import-error' : 'private-key-help'
            "
          />
          <button
            class="reveal-button"
            type="button"
            :aria-pressed="isPrivateKeyVisible"
            :aria-label="isPrivateKeyVisible ? '隐藏私钥' : '临时显示私钥'"
            @click="isPrivateKeyVisible = !isPrivateKeyVisible"
          >
            {{ isPrivateKeyVisible ? '隐藏' : '显示' }}
          </button>
        </div>
        <button
          class="button button--primary"
          type="submit"
          :disabled="!snapshot.account.canImport"
        >
          {{ snapshot.account.status === 'importing' ? '导入中…' : '导入账户' }}
        </button>
      </div>
      <p id="private-key-help" class="account-help">
        仅限本 Demo 的 Sepolia 测试私钥；刷新或锁定后不会恢复。
      </p>
      <p
        v-if="snapshot.account.error"
        id="account-import-error"
        class="account-error"
        data-testid="account-error"
        role="alert"
      >
        {{ snapshot.account.error.message }}
      </p>
      <p
        v-else-if="!snapshot.network.canUseChainActions"
        class="account-disabled-reason"
        data-testid="account-disabled-reason"
      >
        {{
          snapshot.network.connectionError?.message ??
          '正在验证 Sepolia RPC，连接完成后可导入账户。'
        }}
      </p>
    </form>
  </section>
</template>

<style scoped>
.account-session {
  width: min(720px, 100%);
  min-width: 0;
}

.account-import-form,
.account-public-state {
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-recessed);
}

.account-public-state {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
}

.account-copy {
  min-width: 0;
}

.account-label-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 7px;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 800;
}

.account-status {
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--color-pending-text);
  background: var(--color-pending-surface);
  font-size: 11px;
  font-weight: 700;
}

.account-status--connected {
  color: var(--color-success-text);
  background: var(--color-success-surface);
}

.account-status--balance-error,
.account-status--import-error {
  color: var(--color-error-text);
  background: var(--color-error-surface);
}

.account-status--locked {
  color: var(--color-text-secondary);
  background: var(--color-disabled-surface);
}

.private-key-row {
  display: grid;
  grid-template-columns: minmax(300px, 1fr) auto;
  gap: 8px;
}

.private-key-field {
  position: relative;
  min-width: 0;
}

.private-key-field input {
  width: 100%;
  padding-right: 58px;
}

.reveal-button {
  position: absolute;
  top: 1px;
  right: 1px;
  height: 38px;
  padding: 0 11px;
  border: 0;
  border-radius: 0 7px 7px 0;
  color: var(--color-link);
  background: var(--color-recessed);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.account-help,
.account-disabled-reason,
.account-error {
  margin: 7px 0 0;
  font-size: 11px;
  line-height: 1.4;
}

.account-help {
  color: var(--color-text-secondary);
}

.account-disabled-reason {
  color: var(--color-warning-text);
}

.account-error,
.account-balance--error {
  color: var(--color-error-text);
}

.account-address,
.account-balance {
  display: block;
}

.account-address {
  overflow: hidden;
  color: var(--color-link);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-balance {
  margin-top: 5px;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 750;
}

.account-actions {
  display: flex;
  flex: none;
  gap: 7px;
}

.button--compact {
  min-height: 34px;
  padding: 0 11px;
  font-size: 12px;
}

.button--danger {
  border: 1px solid var(--color-danger);
  color: var(--color-text);
  background: var(--color-danger);
}

.button--danger:hover:not(:disabled) {
  border-color: var(--color-danger-hover);
  background: var(--color-danger-hover);
}
</style>
