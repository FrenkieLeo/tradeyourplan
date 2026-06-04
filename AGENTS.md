<meta timestamp="2026-06-04" />
<meta version="v1.0.0" />

# Agent 执行入口

**本文件是 AI Agent 的唯一执行约束。**

> Agent 每次会话开始时必须加载本文件及所有 @import 文件并严格遵守所有规则。

---

## §1 核心原则

1. **不确定就停** — 🔴 [STOP] 并询问
2. **人类门控** — 阶段推进需 🟢 [GO]
3. **只做被要求的事** — 不添加需求外功能，不顺手优化
4. **简单优先** — 代码量超预估 3 倍必须重写
5. **数据一致性优先** — JSONBin、IndexedDB、Store 三层数据必须一致，任何操作后检查三者的同步状态

冲突时按编号裁决，1 最优先。

---

## §2 红线

### 绝对禁止（无例外）

| ID  | 行为                       | 触发后动作                                                   |
| --- | -------------------------- | ------------------------------------------------------------ |
| F1  | 跳过工作流阶段             | 🔴 [STOP]，说明原因                                          |
| F2  | 修改 CLAUDE.md / AGENTS.md | 🔴 [STOP]，话术：「F2 约束：我不能修改此文件，请直接编辑。」 |
| F4  | 删除用户数据               | 🔴 [STOP]，列将删除内容，等授权                              |
| F6  | 隐瞒错误或失败             | 必须如实报告                                                 |
| F8  | 读写 .env / 密钥           | 🔴 [STOP]，列变量名，等授权                                  |
| F9  | 自行发出 🟢 [GO]           | 🔴 [STOP]，等待人类发出                                      |
| F10 | 修改 alphavantage.ts 结构  | 🔴 [STOP]，该文件保留供将来启用，只读不删                     |

### 流程性禁止

| ID  | 行为               | 触发后动作       |
| --- | ------------------ | ---------------- |
| F5  | 未跑检查就宣布完成 | 回退补跑全部检查 |
| F11 | 引入未使用的依赖   | 🔴 [STOP]，移除   |

---

## §3 工作流

**默认**：PLAN（分析 + 方案合并输出）→ 🟢 [GO] → EXECUTE → VERIFY

→ PLAN 与 EXECUTE 各自单独等 🟢 [GO]，F3/F4/F8 授权必须在 PLAN 阶段取得

---

### PLAN 📐

输出以下内容，然后 🟡 [WAIT]：

```
假设：
- xxx ✓
- xxx [? 待确认]

影响文件：
- src/components/xxx.tsx（主要改动）
- src/lib/xxx.ts（类型/逻辑）

风险（数据一致性）：
- JSONBin/IndexedDB/Store 三者是否同步
- 是否有快照被覆盖风险

方案：
1. [文件] [改动内容]
2. [文件] [改动内容]

F3/F4/F8：无 / [列出需授权项]
```

---

### EXECUTE ⚡

**禁止**：偏离 PLAN 的改动

#### 编码规则（强制）

| 规则 | 说明                                   | 违反处理           |
| ---- | -------------------------------------- | ------------------ |
| C1   | 代码量超 PLAN 预估 3 倍 → 重写         | 暂停，提出简化方案 |
| C2   | 只做被要求的事                         | 移除需求外功能     |
| C3   | 单次使用不抽象                         | 删除过度封装       |
| C4   | 不处理不可能异常                       | 移除防御性代码     |
| C5   | 只改直接相关的行                       | 回滚顺手优化       |
| C6   | 匹配既有风格                           | 重写不一致代码     |
| C7   | 死代码只提不删（除非你的改动导致孤儿） | 恢复误删代码       |
| C8   | 所有 store action 必须同步 setItem    | 补上 IndexedDB 持久化 |
| C9   | 所有数据修改的 store action 必须确保 JSONBin 同步    | deleteSnapshot 只写 IndexedDB 不调 syncToJsonBin |

- 触发 C1 → 🔴 [STOP]，提出简化方案
- PLAN 无法执行 → 🔴 [STOP]，回退 PLAN

完成后 🟡 [WAIT]

---

### VERIFY 🔍

**禁止**：修改代码（发现问题 → 报告 → 回 EXECUTE）

按顺序执行并报告结果：

1. `npm run build`（编译 + TypeScript 检查）

| 失败类型             | 动作                       |
| -------------------- | -------------------------- |
| 类型错误 / Lint 错误 | 可尝试自动修复，最多 2 次  |
| 构建失败             | 🔴 [STOP]，回 EXECUTE 修复 |
| 连续 2 次修复失败    | 🔴 [STOP]，输出完整错误    |

全部通过 → 🟡 [WAIT]，等最终确认

---

## §4 信号

| 信号      | 发出方     | 含义             | Agent 发出后行为           |
| --------- | ---------- | ---------------- | -------------------------- |
| 🔴 [STOP] | Agent/人类 | 阻塞/违规/停止   | 中断一切，输出原因，等指令 |
| 🟡 [WAIT] | Agent      | 阶段完成，等确认 | 停止操作，不执行命令       |
| 🟢 [GO]   | 仅人类     | 允许进入下一阶段 | 开始执行                   |

---

## §5 补充规则

### 数据架构约束

1. **三层存储架构**：JSONBin（云端）→ IndexedDB（本地）→ Zustand Store（运行时）
   - 启动时：JSONBin → `setItem()` → IndexedDB → `initialize()` → Store
   - 操作时：Store → `setItem()` → IndexedDB → `syncToJsonBin()` → JSONBin
2. **不自动同步**：`page.tsx` 已移除 auto-sync interval 和 beforeunload，同步仅由 PriceEditModal 保存后手动触发
3. **派生状态永不持久化**：`holdings` / `optionHoldings` / `cash` 从 `tradeRecords` 通过 `recalcHoldings()` / `recalcOptionHoldings()` / `calcTradeCashAdjustment()` 重新计算；`nowPrice` / `nowPremium` 例外——它们在启动时从存储恢复

### 时区规则

- 所有时间以美东时间（America/New_York）为准
- `takeSnapshot()` 在美东 16:00+ 且非周末才允许创建快照
- 日期格式：快照 `YYYY-MM-DD`，交易 `YYYYMMDD`

### UI 规则

- 语言：简体中文
- 主题：TradingView 深色 CSS 变量（`var(--tv-bg)` 等）
- 模态框：在触发组件内直接条件渲染
- 图表：ECharts 单例模式

---

## 项目上下文

### 技术栈

| 层      | 选型                             |
| ------- | -------------------------------- |
| 框架    | Next.js 16.2.6                   |
| UI      | React 19.2.4 + Tailwind CSS v4   |
| 状态    | Zustand 5.0.14                   |
| 图表    | ECharts 6.1.0                    |
| 存储    | IndexedDB（本地）+ JSONBin（云端）|
| 部署    | Vercel                           |
| 价格源  | 手工录入（Alpha Vantage 保留未启用）|

### 常用命令

```bash
npm run dev        # 本地开发
npm run build      # 构建 + TypeScript 检查
npx vercel --prod --yes  # 部署到 Vercel
```

### 关键文件路径

| 文件 | 用途 |
|------|------|
| `src/lib/store.ts` | Zustand 全局状态（859 行） |
| `src/lib/jsonbin.ts` | JSONBin API（读写云端数据） |
| `src/lib/db.ts` | IndexedDB 封装（持久化 + pendingSync） |
| `src/lib/alphavantage.ts` | 行情 API（已禁用，保留为仅读） |
| `src/app/page.tsx` | 主页面，组件编排 |
| `src/components/PriceUpdater.tsx` | 启动加载器：JSONBin → IndexedDB → Store |
| `src/components/PriceEditModal.tsx` | 历史收盘价编辑器（唯一入口，保存后 syncToJsonBin） |
| `src/components/TotalPortfolio.tsx` | 仪表盘 + 折线图 |
| `src/types/index.ts` | 所有 TypeScript 类型定义 |

### JSONBin

- Bin ID: `6a1d973021f9ee59d2a5a28b`
- API Key 硬编码在 `src/lib/jsonbin.ts:3`
- 端点：`GET /v3/b/{id}/latest` | `PUT /v3/b/{id}`
- 回复格式：`{ record: T, metadata: {...} }`
