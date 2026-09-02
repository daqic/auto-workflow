<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useEthereumTool, useEthereumToolSnapshot } from '@/ethereum/vue-ethereum-tool'

const ethereumTool = useEthereumTool()
const snapshot = useEthereumToolSnapshot(ethereumTool)
const recipientDraft = ref('')
const amountDraft = ref('')

const TRANSFER_STATUS_LABELS = {
  'broadcast-failed': '广播失败',
  'broadcast-error': '广播状态不明确',
  checking: '检查中',
  confirming: '已提交 · 确认中',
  editing: '等待提交',
  failed: '执行失败',
  querying: '正在查询原交易',
  signing: '本地签名中',
  submitting: '提交中',
  success: '执行成功',
  unknown: '状态未知',
} as const

const transferStatusLabel = computed(() => TRANSFER_STATUS_LABELS[snapshot.value.transfer.status])
const transactionHashLabel = computed(() => {
  if (snapshot.value.transfer.status === 'success') {
    return '已确认交易'
  }

  if (snapshot.value.transfer.status === 'failed') {
    return '已收录交易'
  }

  if (snapshot.value.transfer.status === 'unknown') {
    return '原交易哈希'
  }

  return '本地交易哈希'
})
const isTransferReady = computed(
  () =>
    snapshot.value.account.address !== null &&
    (snapshot.value.token.canTransfer || snapshot.value.transfer.status !== 'editing'),
)
const isTerminalTransfer = computed(() =>
  ['broadcast-failed', 'failed', 'success', 'unknown'].includes(snapshot.value.transfer.status),
)
const recipientError = computed(() =>
  ['invalid-recipient', 'self-recipient', 'zero-recipient'].includes(
    snapshot.value.transfer.error?.kind ?? '',
  )
    ? snapshot.value.transfer.error
    : null,
)
const amountError = computed(() =>
  ['amount-exceeds-balance', 'invalid-amount'].includes(snapshot.value.transfer.error?.kind ?? '')
    ? snapshot.value.transfer.error
    : null,
)
const transferUnavailableReason = computed(() => {
  if (!snapshot.value.network.canUseChainActions) {
    return 'Sepolia 网络当前不可用，请先恢复正确的链连接。'
  }

  if (!snapshot.value.account.address) {
    return '缺少活动的专用测试账户，请先导入账户。'
  }

  if (!snapshot.value.token.address) {
    return '尚未激活目标 Token，请先查询 Token。'
  }

  if (snapshot.value.token.balance === null) {
    return '无法读取当前账户的 Token 余额，请先恢复余额查询。'
  }

  return '当前转账状态不可编辑。'
})

function useMaximumAmount() {
  if (snapshot.value.transfer.canSubmit && snapshot.value.token.balance !== null) {
    amountDraft.value = snapshot.value.token.balance
  }
}

async function submitTransfer() {
  const submitted = await ethereumTool.transfer.submit({
    amount: amountDraft.value,
    recipient: recipientDraft.value,
  })

  if (snapshot.value.transfer.recipient) {
    recipientDraft.value = snapshot.value.transfer.recipient
  }

  if (submitted) {
    amountDraft.value = ''
  }

  if (isTerminalTransfer.value) {
    amountDraft.value = ''
  }
}

async function queryTransferStatus() {
  await ethereumTool.transfer.queryStatus()
}

function startNewTransfer() {
  ethereumTool.transfer.startNew()
}

watch(
  () => snapshot.value.account.address,
  (address) => {
    if (!address) {
      recipientDraft.value = ''
      amountDraft.value = ''
    }
  },
)

watch(
  () => snapshot.value.token.status,
  (status) => {
    if (status === 'inspecting') {
      recipientDraft.value = ''
      amountDraft.value = ''
    }
  },
)
</script>

<template>
  <section class="transfer-card" aria-labelledby="token-transfer-heading">
    <div class="transfer-heading">
      <div>
        <p class="transfer-kicker">TOKEN TRANSFER</p>
        <h2 id="token-transfer-heading">提交 Token 转账</h2>
      </div>
      <span class="transfer-status" data-testid="transfer-status" role="status" aria-live="polite">
        {{ transferStatusLabel }}
      </span>
    </div>

    <p class="transfer-description">
      使用当前活动 Token 完成模拟、本地签名、原始交易广播和一次 Sepolia 确认。
    </p>

    <div v-if="!isTransferReady" class="transfer-placeholder" data-testid="transfer-unavailable">
      <strong>转账暂不可用</strong>
      <span>{{ transferUnavailableReason }}</span>
    </div>

    <form
      v-else
      class="transfer-form"
      data-testid="token-transfer-form"
      @submit.prevent="submitTransfer"
    >
      <div class="transfer-field">
        <label for="transfer-recipient">收款地址</label>
        <p id="transfer-recipient-help">有效地址会在签名前规范化为 checksum。</p>
        <input
          id="transfer-recipient"
          v-model="recipientDraft"
          name="transfer-recipient"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="0x..."
          required
          :disabled="!snapshot.transfer.canSubmit"
          :aria-describedby="
            recipientError
              ? 'transfer-recipient-help transfer-recipient-error'
              : 'transfer-recipient-help'
          "
          :aria-invalid="recipientError ? 'true' : undefined"
        />
        <p
          v-if="recipientError"
          id="transfer-recipient-error"
          class="field-error"
          data-testid="transfer-recipient-error"
          role="alert"
        >
          {{ recipientError.message }}
        </p>
      </div>

      <div class="transfer-field">
        <label for="transfer-amount">展示金额</label>
        <p id="transfer-amount-help">
          当前可读余额：{{ snapshot.token.balance }} {{ snapshot.token.symbol }}
        </p>
        <div class="amount-row">
          <input
            id="transfer-amount"
            v-model="amountDraft"
            name="transfer-amount"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.0"
            required
            :disabled="!snapshot.transfer.canSubmit"
            :aria-describedby="
              amountError ? 'transfer-amount-help transfer-amount-error' : 'transfer-amount-help'
            "
            :aria-invalid="amountError ? 'true' : undefined"
          />
          <button
            class="button button--secondary"
            name="transfer-max"
            type="button"
            :disabled="!snapshot.transfer.canSubmit"
            @click="useMaximumAmount"
          >
            Max
          </button>
        </div>
        <p
          v-if="amountError"
          id="transfer-amount-error"
          class="field-error"
          data-testid="transfer-amount-error"
          role="alert"
        >
          {{ amountError.message }}
        </p>
      </div>

      <p
        v-if="snapshot.transfer.error && !recipientError && !amountError"
        class="transfer-error"
        data-testid="transfer-error"
        role="alert"
      >
        {{ snapshot.transfer.error.message }}
      </p>

      <p v-if="snapshot.transfer.error?.kind === 'insufficient-eth'" class="transfer-recovery">
        下一步：前往
        <a
          href="https://ethereum.org/developers/docs/networks/"
          target="_blank"
          rel="noopener noreferrer"
        >
          ethereum.org Sepolia faucet 目录
        </a>
        获取测试 ETH；应用不会直接调用 faucet。
      </p>

      <div v-if="snapshot.transfer.hash" class="transfer-result">
        <span>{{ transactionHashLabel }}</span>
        <a
          data-testid="transaction-hash"
          :href="`https://sepolia.etherscan.io/tx/${snapshot.transfer.hash}`"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ snapshot.transfer.hash }}
        </a>
      </div>

      <div class="transfer-actions">
        <button
          v-if="isTerminalTransfer"
          class="button button--secondary"
          name="new-transfer"
          type="button"
          @click="startNewTransfer"
        >
          新建转账
        </button>
        <button
          v-if="snapshot.transfer.canQueryStatus || snapshot.transfer.status === 'querying'"
          class="button button--secondary"
          name="query-transfer-status"
          type="button"
          :disabled="!snapshot.transfer.canQueryStatus"
          @click="queryTransferStatus"
        >
          {{ snapshot.transfer.status === 'querying' ? '正在查询…' : '查询原交易' }}
        </button>
        <button
          class="button button--primary"
          name="submit-transfer"
          type="submit"
          :disabled="!snapshot.transfer.canSubmit"
        >
          {{ snapshot.transfer.status === 'editing' ? '检查并提交' : transferStatusLabel }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.transfer-card {
  margin-top: 24px;
  padding: 32px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 20px 50px rgb(15 23 42 / 8%);
}

.transfer-heading,
.transfer-actions,
.amount-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.transfer-heading {
  justify-content: space-between;
}

.transfer-heading h2,
.transfer-heading p,
.transfer-description,
.transfer-field p {
  margin-top: 0;
}

.transfer-heading h2 {
  margin-bottom: 0;
  font-size: 22px;
  letter-spacing: -0.02em;
}

.transfer-kicker {
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.transfer-status {
  padding: 7px 11px;
  border-radius: 999px;
  color: #1d4ed8;
  background: #eff6ff;
  font-size: 13px;
  font-weight: 700;
}

.transfer-description {
  margin: 14px 0 24px;
  color: #64748b;
  line-height: 1.6;
}

.transfer-placeholder {
  display: grid;
  gap: 5px;
  padding: 20px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  color: #64748b;
  background: #f8fafc;
  font-size: 13px;
}

.transfer-placeholder strong {
  color: #334155;
  font-size: 14px;
}

.transfer-form {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
  gap: 20px;
}

.transfer-field label {
  display: block;
  margin-bottom: 5px;
  color: #1e293b;
  font-size: 14px;
  font-weight: 700;
}

.transfer-field p {
  margin-bottom: 10px;
  color: #64748b;
  font-size: 13px;
}

.transfer-field input {
  width: 100%;
}

.amount-row input {
  flex: 1;
}

.transfer-error,
.transfer-recovery,
.transfer-result,
.transfer-actions {
  grid-column: 1 / -1;
}

.field-error {
  margin-top: 8px;
  color: #b91c1c !important;
}

.transfer-recovery {
  margin: 0;
  padding: 14px 16px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  color: #1e3a8a;
  background: #eff6ff;
  font-size: 14px;
}

.transfer-recovery a {
  color: #1d4ed8;
  font-weight: 700;
}

.transfer-error {
  margin: 0;
  padding: 14px 16px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  color: #b91c1c;
  background: #fef2f2;
  font-size: 14px;
}

.transfer-result {
  display: grid;
  gap: 6px;
  padding: 16px;
  overflow: hidden;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  color: #166534;
  background: #f0fdf4;
  font-size: 12px;
  font-weight: 700;
}

.transfer-result a {
  overflow: hidden;
  color: #1d4ed8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-actions {
  justify-content: flex-end;
}
</style>
