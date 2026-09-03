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
  replaying: '正在重播原交易',
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

  if (snapshot.value.transfer.requiresRecovery) {
    return '原交易哈希'
  }

  return '本地交易哈希'
})
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

  if (snapshot.value.transfer.canStartNew) {
    amountDraft.value = ''
  }
}

async function queryTransferStatus() {
  await ethereumTool.transfer.queryStatus()
}

async function replayTransfer() {
  await ethereumTool.transfer.replay()
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
  <section
    :class="[
      'transfer-card',
      snapshot.transfer.isFormVisible
        ? `transfer-card--${snapshot.transfer.status}`
        : 'transfer-card--unavailable',
      { 'transfer-card--field-error': recipientError || amountError },
    ]"
    aria-labelledby="token-transfer-heading"
  >
    <div class="transfer-heading">
      <div>
        <p class="transfer-kicker">TOKEN TRANSFER</p>
        <h2 id="token-transfer-heading">提交 Token 转账</h2>
      </div>
      <span
        class="transfer-status"
        :class="`transfer-status--${snapshot.transfer.status}`"
        data-testid="transfer-status"
        role="status"
        aria-live="polite"
      >
        {{ transferStatusLabel }}
      </span>
    </div>

    <p class="transfer-description">
      使用当前活动 Token 完成模拟、本地签名、原始交易广播和一次 Sepolia 确认。
    </p>

    <div
      v-if="!snapshot.transfer.isFormVisible"
      class="transfer-placeholder"
      data-testid="transfer-unavailable"
    >
      <strong>转账暂不可用</strong>
      <span>{{ snapshot.transfer.unavailableReason }}</span>
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

      <p
        v-if="snapshot.transfer.requiresRecovery"
        class="transfer-recovery transfer-recovery--required"
        data-testid="transfer-recovery-warning"
        role="status"
      >
        该交易可能已经到达网络。恢复完成前不能编辑或提交新转账；只能查询原交易，或由你明确触发重播完全相同的已签名交易。锁定、刷新或关闭页面会永久丢失当前页面内的恢复材料。
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
          v-if="snapshot.transfer.canStartNew"
          class="button button--secondary"
          name="new-transfer"
          type="button"
          @click="startNewTransfer"
        >
          新建转账
        </button>
        <button
          v-if="snapshot.transfer.isStatusQueryVisible"
          class="button button--secondary"
          name="query-transfer-status"
          type="button"
          :disabled="!snapshot.transfer.canQueryStatus"
          @click="queryTransferStatus"
        >
          {{ snapshot.transfer.status === 'querying' ? '正在查询…' : '查询原交易' }}
        </button>
        <button
          v-if="snapshot.transfer.requiresRecovery"
          class="button button--secondary"
          name="replay-transfer"
          type="button"
          :disabled="!snapshot.transfer.canReplay"
          @click="replayTransfer"
        >
          {{ snapshot.transfer.status === 'replaying' ? '正在重播…' : '重播原交易' }}
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
  min-height: 266px;
  margin-top: 24px;
  padding: 32px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
}

.transfer-card:not(.transfer-card--unavailable) {
  position: relative;
  padding: 31px;
}

.transfer-card--field-error {
  height: 410px;
}

.transfer-card--confirming {
  height: 378px;
}

.transfer-card--broadcast-failed,
.transfer-card--failed {
  height: 490px;
}

.transfer-card--unknown {
  height: 510px;
}

.transfer-card--broadcast-error {
  height: 585px;
}

.transfer-card--success {
  height: 462px;
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
  line-height: 1.4;
}

.transfer-kicker {
  margin-bottom: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
}

.transfer-status {
  display: grid;
  width: 104px;
  height: 28px;
  padding: 7px 11px;
  place-items: center;
  border-radius: 999px;
  color: var(--color-pending-text);
  background: var(--color-pending-surface);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.transfer-card:not(.transfer-card--unavailable) .transfer-status {
  transform: translateY(-1px);
}

.transfer-status--broadcast-error {
  width: 140px;
}

.transfer-status--success {
  color: var(--color-success-text);
  background: var(--color-success-surface);
}

.transfer-status--broadcast-error,
.transfer-status--unknown {
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
}

.transfer-status--broadcast-failed,
.transfer-status--failed {
  color: var(--color-error-text);
  background: var(--color-error-surface);
}

.transfer-description {
  margin: 14px 0 18px;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.transfer-card:not(.transfer-card--unavailable) .transfer-description {
  margin-bottom: 16px;
}

.transfer-placeholder {
  display: grid;
  gap: 5px;
  padding: 20px;
  min-height: 78px;
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  color: var(--color-text-secondary);
  background: var(--color-recessed);
  font-size: 13px;
}

.transfer-placeholder strong {
  color: var(--color-text);
  font-size: 14px;
}

.transfer-form {
  display: grid;
  grid-template-columns: 470px 284px;
  gap: 30px;
}

.transfer-field label {
  display: block;
  margin-bottom: 5px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
}

.transfer-field p {
  margin-bottom: 5px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.4;
}

.transfer-field input {
  width: 100%;
}

.amount-row input {
  width: 220px;
}

.amount-row {
  gap: 10px;
}

.amount-row .button {
  width: 54px;
  padding-right: 8px;
  padding-left: 8px;
}

.transfer-field input:disabled {
  color: var(--color-text-secondary);
  background: var(--color-disabled-surface);
}

.transfer-field {
  position: relative;
}

.transfer-error,
.transfer-recovery,
.transfer-result,
.transfer-actions {
  grid-column: 1 / -1;
}

.transfer-field .field-error {
  position: absolute;
  top: 96px;
  left: 0;
  width: 100%;
  height: 19px;
  margin: 0;
  color: var(--color-error-text);
  line-height: 19px;
}

.transfer-recovery {
  margin: 0;
  padding: 14px 16px;
  border: 1px solid var(--color-warning-text);
  border-radius: 10px;
  color: var(--color-warning-text);
  background: var(--color-warning-surface);
  font-size: 14px;
}

.transfer-recovery--required {
  height: 92px;
  font-size: 13px;
  line-height: 1.45;
}

.transfer-recovery a {
  color: var(--color-link);
  font-weight: 700;
}

.transfer-error {
  margin: 0;
  padding: 14px 16px;
  border: 1px solid var(--color-error-text);
  border-radius: 10px;
  color: var(--color-error-text);
  background: var(--color-error-surface);
  font-size: 14px;
}

.transfer-result {
  display: grid;
  gap: 5px;
  height: 66px;
  padding: 13px 15px;
  overflow: hidden;
  border: 1px solid var(--color-success-text);
  border-radius: 12px;
  color: var(--color-success-text);
  background: var(--color-success-surface);
  font-size: 12px;
  font-weight: 700;
}

.transfer-result a {
  overflow: hidden;
  color: var(--color-link);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transfer-actions {
  justify-content: flex-end;
  gap: 16px;
}

.transfer-card--field-error .transfer-actions,
.transfer-card--confirming .transfer-actions,
.transfer-card--broadcast-failed .transfer-actions,
.transfer-card--failed .transfer-actions,
.transfer-card--unknown .transfer-actions,
.transfer-card--broadcast-error .transfer-actions,
.transfer-card--success .transfer-actions {
  position: absolute;
  right: 63px;
  left: 31px;
}

.transfer-card--broadcast-failed .transfer-error,
.transfer-card--failed .transfer-error,
.transfer-card--unknown .transfer-error,
.transfer-card--broadcast-error .transfer-error,
.transfer-card--unknown .transfer-result,
.transfer-card--failed .transfer-result,
.transfer-card--confirming .transfer-result,
.transfer-card--broadcast-error .transfer-recovery--required,
.transfer-card--broadcast-error .transfer-result,
.transfer-card--success .transfer-result {
  position: absolute;
  right: 31px;
  left: 31px;
}

.transfer-card--broadcast-failed .transfer-error,
.transfer-card--failed .transfer-error,
.transfer-card--unknown .transfer-error,
.transfer-card--broadcast-error .transfer-error {
  top: 245px;
  height: 72px;
  line-height: 1.5;
}

.transfer-card--unknown .transfer-result,
.transfer-card--failed .transfer-result {
  top: 333px;
}

.transfer-card--confirming .transfer-result {
  top: 245px;
  height: 50px;
  padding-top: 6px;
  padding-bottom: 6px;
}

.transfer-card--broadcast-error .transfer-recovery--required {
  top: 333px;
}

.transfer-card--broadcast-error .transfer-result {
  top: 441px;
}

.transfer-card--success .transfer-result {
  top: 245px;
}

.transfer-card--field-error .transfer-actions {
  top: 343px;
}

.transfer-card--confirming .transfer-actions {
  top: 305px;
}

.transfer-card--broadcast-failed .transfer-actions,
.transfer-card--failed .transfer-actions,
.transfer-card--unknown .transfer-actions {
  top: 415px;
}

.transfer-card--broadcast-error .transfer-actions {
  top: 523px;
}

.transfer-card--success .transfer-actions {
  top: 327px;
}

.transfer-actions .button[name='new-transfer'] {
  width: 112px;
}

.transfer-actions .button[name='query-transfer-status'],
.transfer-actions .button[name='replay-transfer'] {
  width: 132px;
}

.transfer-card--field-error .button[name='submit-transfer'] {
  width: 142px;
}

.transfer-card--confirming .button[name='submit-transfer'] {
  width: 172px;
}

.transfer-card--broadcast-failed .button[name='submit-transfer'],
.transfer-card--failed .button[name='submit-transfer'],
.transfer-card--success .button[name='submit-transfer'] {
  width: 170px;
}

.transfer-card--unknown .button[name='submit-transfer'] {
  width: 154px;
}

.transfer-card--broadcast-error .button[name='submit-transfer'] {
  width: 130px;
}

.transfer-card:not(.transfer-card--editing) .button[name='submit-transfer'] {
  padding-right: 8px;
  padding-left: 8px;
  white-space: nowrap;
}
</style>
