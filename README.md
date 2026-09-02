# auto-workflow

这是一个用于建设和验证可靠前端 AI 自动化工作流的 Vue 3 实验仓库。

目标不是让 AI 收到任何一句话后立即写代码，而是建立一条可追溯的路径：从原始需求和设计输入开始，经人工批准后，再完成实现、测试、浏览器验收和代码审查。

仓库本身使用 Vue 3 验证流程，但工作流不绑定 Vue、React 或任何组件库。其他项目可以替换安装、检查、测试、构建和设计工具的具体映射，同时保留相同的准入与验证原则。

## 当前业务状态

仓库当前不包含有效业务需求、业务实现或本地 UI 参考原型。新的试用需求应先进入 GitHub Issues；需要 UI 时，以需求中记录的准确 Penpot 文件、页面、对象和批准版本作为设计事实来源。

不要把聊天记录、临时代码原型或未确认的设计探索作为长期唯一事实来源。

## 先读这些文档

- [前端 AI 自动化工作流手册](docs/ai-frontend-workflow.md)：跨业务、跨框架的流程、人与 AI 的边界、工具映射、失败恢复和建设路线
- [Agent 执行规则](AGENTS.md)：agent 在本仓库中的编码和验证约束
- [Definition of Ready](docs/agents/definition-of-ready.md)：任务进入 `ready-for-agent` 前必须满足的条件
- [任务状态标签](docs/agents/triage-labels.md)：`needs-triage`、`needs-info`、`ready-for-agent` 等标签含义
- [Issue Tracker 配置](docs/agents/issue-tracker.md)：GitHub Issues 操作约定
- [领域文档规则](docs/agents/domain.md)：`CONTEXT.md` 和 ADR 的职责与创建时机
- [POC 建设与验证记录](docs/poc-validation.md)：本仓库的工具映射和验证边界

## 已建立的工作流底座

- Vue 3、TypeScript、Vite、Vue Router 和 Pinia
- pnpm 单一包管理器
- ESLint、Prettier、vue-tsc、Vitest 和 Playwright
- 本地快速门禁与完整门禁
- Agent 编码契约、GitHub 标签和 Definition of Ready
- Feature、Bug 和 PR 模板
- GitHub Actions `ci` 与 `e2e` 基础门禁

## 环境要求

- Node.js：以 `package.json#engines` 为准
- pnpm：以 `package.json#packageManager` 固定的版本为准；项目只允许使用 pnpm，不使用 npm 或 Yarn
- Playwright Chromium：首次运行 E2E 前执行 `pnpm exec playwright install chromium`

## 常用命令

```bash
pnpm install
pnpm run dev
pnpm run fix
pnpm run check
pnpm run check:all
```

- `pnpm run check`：类型检查、ESLint、格式检查、单元测试和构建
- `pnpm run check:all`：在 `check` 基础上增加 Playwright E2E

## 新试用需求流程

```text
原始输入
→ AI 澄清高影响问题
→ 读取并确认 Penpot 设计（适用时）
→ 形成规格 Issue
→ 人工规格审批并达到 ready-for-agent
→ 拆分可独立验证的任务（复杂需求）
→ implement + TDD
→ 浏览器验收
→ Draft PR/MR
→ 远程 CI + 独立代码审查
→ 人工审核并手工合并
→ 部署、冒烟、监控和反馈
```

规格 Issue 应记录需求来源、范围、验收标准，以及适用的 Penpot 文件、页面、对象、批准版本或读取时间。`CONTEXT.md` 和 ADR 只在真实领域语言或架构决定形成后创建，不预先建立空文件。
