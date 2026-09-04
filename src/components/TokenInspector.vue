<script setup lang="ts">
import { ref } from 'vue'

import { useEthereumTool, useEthereumToolSnapshot } from '@/ethereum/vue-ethereum-tool'

const ethereumTool = useEthereumTool()
const snapshot = useEthereumToolSnapshot(ethereumTool)
const tokenAddressDraft = ref('')

async function inspectToken() {
  await ethereumTool.token.inspect(tokenAddressDraft.value)
}
</script>

<template>
  <section
    :class="['token-card', `token-card--${snapshot.token.status}`]"
    aria-labelledby="token-inspector-heading"
  >
    <div class="token-heading">
      <div>
        <p class="token-kicker">TOKEN INSPECTOR</p>
        <h2 id="token-inspector-heading">查询目标 Token</h2>
      </div>
      <span class="token-network">Sepolia</span>
    </div>

    <p class="token-description">
      输入一个合约地址并主动查询。检查结果只保存在当前页面，不代表完整 ERC-20 合规。
    </p>

    <form class="token-form" data-testid="token-inspector-form" @submit.prevent="inspectToken">
      <label for="token-address-input">Token contract address</label>
      <p id="token-address-help">输入过程不会发起链请求；点击查询后才检查合约。</p>
      <div class="token-field-action">
        <input
          id="token-address-input"
          v-model="tokenAddressDraft"
          name="token-address"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="0x..."
          required
          :disabled="!snapshot.token.canInspect"
          :aria-invalid="snapshot.token.error ? 'true' : undefined"
          :aria-describedby="
            snapshot.token.error ? 'token-address-help token-error' : 'token-address-help'
          "
        />
        <button class="button button--primary" type="submit" :disabled="!snapshot.token.canInspect">
          {{ snapshot.token.status === 'inspecting' ? '查询中…' : '查询 Token' }}
        </button>
      </div>
    </form>

    <div
      v-if="snapshot.token.status === 'idle'"
      class="token-placeholder"
      data-testid="token-empty-state"
    >
      <strong>尚未查询 Token</strong>
      <span>查询后将在这里显示兼容性与公开元数据。</span>
    </div>

    <div
      v-else-if="snapshot.token.status === 'inspecting'"
      class="token-placeholder token-placeholder--loading"
      role="status"
      aria-live="polite"
    >
      <strong>正在执行兼容性检查</strong>
      <span>正在读取合约字节码、decimals 和可选元数据。</span>
    </div>

    <p
      v-else-if="snapshot.token.error"
      id="token-error"
      class="token-error"
      data-testid="token-error"
      role="alert"
    >
      {{ snapshot.token.error.message }}
    </p>

    <div v-else-if="snapshot.token.address" class="token-result">
      <div class="compatibility-row">
        <span class="compatibility-badge" data-testid="token-compatibility"> 兼容性检查通过 </span>
        <span>符合本 Demo 的目标 Token 读取规则</span>
      </div>

      <dl class="token-details">
        <div>
          <dt>名称</dt>
          <dd data-testid="token-name">{{ snapshot.token.name }}</dd>
        </div>
        <div>
          <dt>Symbol</dt>
          <dd data-testid="token-symbol">{{ snapshot.token.symbol }}</dd>
        </div>
        <div>
          <dt>Decimals</dt>
          <dd data-testid="token-decimals">{{ snapshot.token.decimals }}</dd>
        </div>
        <div class="token-address-row">
          <dt>Checksum 地址</dt>
          <dd>
            <a
              data-testid="token-address"
              :href="`https://sepolia.etherscan.io/token/${snapshot.token.address}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ snapshot.token.address }}
            </a>
          </dd>
        </div>
        <div class="token-balance-row">
          <dt>当前账户余额</dt>
          <dd data-testid="token-balance">
            <template v-if="snapshot.token.balance !== null">
              {{ snapshot.token.balance }} {{ snapshot.token.symbol }}
            </template>
            <template v-else>尚未导入账户，余额尚不可用</template>
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.token-card {
  height: 380px;
  margin-top: 24px;
  padding: 32px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
}

.token-card--error {
  height: 360px;
}

.token-card--compatible {
  height: 562px;
}

.token-heading,
.compatibility-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.token-heading h2,
.token-heading p,
.token-description,
.token-form p {
  margin-top: 0;
}

.token-heading h2 {
  margin-bottom: 0;
  font-size: 22px;
  line-height: 1.4;
}

.token-kicker {
  margin-bottom: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.token-network {
  padding: 7px 11px;
  border-radius: 999px;
  color: var(--color-pending-text);
  background: var(--color-pending-surface);
  font-size: 13px;
  font-weight: 700;
}

.token-description {
  margin: 14px 0 25px;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.token-form label {
  display: block;
  margin-bottom: 5px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
}

.token-form p {
  margin-bottom: 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.token-field-action {
  display: grid;
  grid-template-columns: 697px 107px;
  gap: 10px;
}

.token-field-action .button {
  padding-right: 8px;
  padding-left: 8px;
  white-space: nowrap;
}

.token-field-action input:disabled {
  color: var(--color-text-secondary);
}

.token-placeholder,
.token-error,
.token-result {
  margin-top: 24px;
  border-radius: 12px;
}

.token-placeholder {
  display: grid;
  gap: 5px;
  padding: 20px;
  border: 1px dashed var(--color-border-strong);
  color: var(--color-text-secondary);
  background: var(--color-recessed);
  font-size: 13px;
  min-height: 86px;
}

.token-placeholder strong {
  color: var(--color-text);
  font-size: 14px;
}

.token-placeholder--loading {
  border-style: solid;
  border-color: var(--color-pending-text);
  background: var(--color-pending-surface);
}

.token-error {
  padding: 14px 16px;
  border: 1px solid var(--color-error-text);
  color: var(--color-error-text);
  background: var(--color-error-surface);
  font-size: 14px;
  line-height: 1.5;
}

.token-result {
  height: 268px;
  overflow: hidden;
  border: 1px solid var(--color-success-text);
  background: var(--color-success-surface);
}

.compatibility-row {
  height: 52px;
  gap: 16px;
  align-items: center;
  justify-content: flex-start;
  padding: 14px 16px;
  color: var(--color-success-text);
  font-size: 12px;
}

.compatibility-badge {
  display: grid;
  flex: none;
  width: 116px;
  height: 24px;
  padding: 0 9px;
  place-items: center;
  border-radius: 999px;
  color: var(--color-success-text);
  background: var(--color-success-surface);
  font-size: 12px;
  font-weight: 700;
}

.token-details {
  display: grid;
  grid-template-columns: 382px 254px 178px;
  grid-auto-rows: 72px;
  width: 814px;
  height: 216px;
  margin: -1px 0 0 -1px;
  background: var(--color-surface);
}

.token-details div {
  min-width: 0;
  height: 72px;
  padding: 15px 16px;
  border-right: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.token-details div:nth-child(-n + 3) {
  border-top: 1px solid var(--color-border);
}

.token-details div:nth-child(3),
.token-details div:last-child {
  border-right: 0;
}

.token-details div:last-child {
  border-bottom: 0;
}

.token-details dt {
  margin-bottom: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.token-details dd {
  margin: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token-details a {
  color: var(--color-link);
  text-decoration: none;
}

.token-address-row,
.token-balance-row {
  grid-column: 1 / -1;
}
</style>
