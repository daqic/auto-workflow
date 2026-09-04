# Ethereum Sepolia 工具 Demo

一个只在开发者本地运行、在固定 Ethereum Sepolia 网络上演示链上读取与浏览器本地签名的工具型应用。它用于受控演示，不是生产钱包。

## Language

**专用测试账户**:
由仅供本 Demo 使用的 Sepolia 测试私钥控制的 Ethereum 账户，不得用于主网或持有真实资产；每个浏览器钱包会话最多只能有一个活动账户。
_Avoid_: 用户钱包、生产钱包

**浏览器钱包会话**:
当前页面持有专用测试账户签名能力的临时会话；锁定、刷新或关闭页面后结束，且不能自动恢复。
_Avoid_: 持久钱包、已保存账户

**目标 Token**:
用户在具体 Token 流程开始前输入合约地址、并经系统兼容性检查后由该流程操作的 Sepolia ERC-20 Token。
_Avoid_: 固定 Token、默认 Token

**兼容 Token**:
地址包含合约 bytecode，且 `decimals()` 能返回 `0–18` 范围内结果的目标 Token；`name()` 和 `symbol()` 可以缺失。导入测试账户后，`balanceOf()` 还必须能返回该账户的可解析余额。通过这些检查只表示满足本 Demo 的使用要求，不证明完整 ERC-20 合规。
_Avoid_: 已验证 ERC-20、标准 Token

**可转账 Token**:
在当前转账参数下，`transfer()` 模拟调用能够解码出 `bool` 且结果为 `true` 的兼容 Token。返回 `false`、无返回值或无法解码的 Token 不属于首版转账范围。
_Avoid_: 非标准 Token、仅余额可读 Token

### Token amounts

**展示金额**:
用户输入和界面展示的人类可读十进制 Token 数量，其小数位不能超过当前目标 Token 的精度。
_Avoid_: 原始金额、raw amount

**最小单位金额**:
根据 Token 精度从展示金额转换得到、传给 ERC-20 合约的整数数量。
_Avoid_: 展示金额

### Transaction status

**已提交**:
RPC 已返回 transaction hash，但尚未证明交易在链上执行成功。
_Avoid_: 已成功、转账成功

**执行成功**:
交易 receipt 的 `status` 为成功，并且在 Sepolia 上至少获得一次确认。
_Avoid_: 已提交、已广播

**执行失败**:
交易已经被链上收录，但 receipt 的 `status` 表明执行失败。
_Avoid_: 提交失败、状态未知

**广播失败**:
RPC 明确拒绝已签名交易，且没有返回已接受的 transaction hash 或 receipt；此时可以开始一笔新转账。
_Avoid_: 执行失败、广播状态不明确

**广播状态不明确**:
RPC 未能明确证明广播成功或明确拒绝；它可能带有本地 transaction hash 和签名原文，只允许查询或重播完全相同的交易，不能开始新转账。
_Avoid_: 广播失败、执行失败、状态未知

**状态未知**:
交易已经提交并具有 transaction hash，但在等待期限内仍无法确认链上结果；它既不表示成功，也不表示失败。
_Avoid_: 执行失败、提交失败
