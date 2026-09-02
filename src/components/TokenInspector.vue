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
  <section class="token-card" aria-labelledby="token-inspector-heading">
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
  margin-top: 24px;
  padding: 32px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 20px 50px rgb(15 23 42 / 8%);
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
  letter-spacing: -0.02em;
}

.token-kicker {
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.token-network {
  padding: 7px 11px;
  border-radius: 999px;
  color: #1d4ed8;
  background: #eff6ff;
  font-size: 13px;
  font-weight: 700;
}

.token-description {
  margin: 14px 0 24px;
  color: #64748b;
  line-height: 1.6;
}

.token-form label {
  display: block;
  margin-bottom: 5px;
  color: #1e293b;
  font-size: 14px;
  font-weight: 700;
}

.token-form p {
  margin-bottom: 10px;
  color: #64748b;
  font-size: 13px;
}

.token-field-action {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
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
  border: 1px dashed #cbd5e1;
  color: #64748b;
  background: #f8fafc;
  font-size: 13px;
}

.token-placeholder strong {
  color: #334155;
  font-size: 14px;
}

.token-placeholder--loading {
  border-style: solid;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.token-error {
  padding: 14px 16px;
  border: 1px solid #fecaca;
  color: #b91c1c;
  background: #fef2f2;
  font-size: 14px;
  line-height: 1.5;
}

.token-result {
  overflow: hidden;
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
}

.compatibility-row {
  align-items: center;
  padding: 14px 16px;
  color: #166534;
  font-size: 12px;
}

.compatibility-badge {
  padding: 5px 9px;
  border-radius: 999px;
  color: #047857;
  background: #d1fae5;
  font-size: 12px;
  font-weight: 800;
}

.token-details {
  display: grid;
  grid-template-columns: 1.5fr 1fr 0.7fr;
  margin: 0;
  border-top: 1px solid #bbf7d0;
  background: #ffffff;
}

.token-details div {
  min-width: 0;
  padding: 15px 16px;
  border-right: 1px solid #e2e8f0;
  border-bottom: 1px solid #e2e8f0;
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
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.token-details dd {
  margin: 0;
  overflow: hidden;
  color: #1e293b;
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.token-details a {
  color: #1d4ed8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-decoration: none;
}

.token-address-row,
.token-balance-row {
  grid-column: 1 / -1;
}
</style>
