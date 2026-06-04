# TradeYourPlan

个人持仓收益看板，支持股票/期权交易记录、每日收盘价快照、收益图表可视化。

---

## 项目结构

```
src/
├── app/
│   ├── layout.tsx          # 根布局（zh-CN）
│   ├── page.tsx            # 主页面 SPA，组件编排
│   └── globals.css         # TradingView 深色主题 + Tailwind v4
├── components/
│   ├── PriceUpdater.tsx    # 启动加载器（JSONBin → IndexedDB → Store）
│   ├── TotalPortfolio.tsx  # 顶部仪表盘 + ECharts 总收益折线图
│   ├── StockChart.tsx      # 个股收益率折线图 + 快照对齐
│   ├── OptionChart.tsx     # 期权收益率折线图
│   ├── PriceEditModal.tsx  # 历史收盘价编辑器（唯一数据录入入口）
│   ├── TradeModal.tsx      # 交易录入弹窗（股票/期权双标签）
│   ├── CashModal.tsx       # 现金编辑弹窗
│   ├── OptionEditModal.tsx # 期权持仓内联编辑器
│   ├── JournalTimeline.tsx # 看盘日志时间轴
│   ├── TradePlan.tsx       # 交易计划表格
│   └── TimelineSlider.tsx  # 历史快照回顾滑块
├── lib/
│   ├── store.ts            # Zustand 全局状态（859 行核心）
│   ├── jsonbin.ts          # JSONBin API 客户端
│   ├── db.ts               # IndexedDB 封装
│   └── alphavantage.ts     # 行情 API（已禁用，保留仅读）
└── types/index.ts          # 所有 TypeScript 类型
```

## 数据架构

### 三层存储

```
JSONBin（云端）→ IndexedDB（本地）→ Zustand Store（运行时）
```

- **启动**：`PriceUpdater` 从 JSONBin 读取 → `setItem()` 写入 IndexedDB → `initialize()` 载入 Store
- **操作**：Store action 更新状态 → `setItem()` 写入 IndexedDB → `syncToJsonBin()` 推送到 JSONBin
- **同步**：仅由 `PriceEditModal` 保存后手动触发，无自动 interval / beforeunload 同步

### 派生状态规则

| 字段 | 来源 | 是否持久化 |
|------|------|-----------|
| `tradeRecords` | 用户输入 | ✅ 是 |
| `holdings` | `recalcHoldings(tradeRecords)` | ❌ 运行时重算 |
| `optionHoldings` | `recalcOptionHoldings(tradeRecords)` | ❌ 运行时重算 |
| `cash.total` | `baseCash + calcTradeCashAdjustment(records)` | ❌ 运行时派生 |
| `nowPrice` / `nowPremium` | 启动时从存储恢复 | ✅ 例外 |
| `snapshots` | 快照记录 | ✅ 是 |
| `dailyReturns` | 从 snapshots 计算 | ✅ 是 |

## 关键流程

### 快照创建（`takeSnapshot()`）

```
美东时间 16:00+ 且非周末
  → 用 `toLocaleDateString("en-CA", { timeZone: "America/New_York" })` 生成日期
  → 从 Store 深度拷贝 holdings/optionHoldings/cash
  → 计算 dailyReturn（总收益百分比）
  → 去重：同一日期替换，否则追加
  → 按日期排序 → setItem → markPendingSync
```

### 价格编辑（`PriceEditModal` → `updateHistoricalPrices()`）

```
遍历所有待处理更新 { date, id, value, type }
  → 已有快照：直接修改 nowPrice/nowPremium → recalcSnapshotDerived
  → 新日期：buildSnapshotForDate（从最近快照继承成本）
  → 重算所有受影响日期的 dailyReturns
  → 最新快照被修改时，同步 nowPrice/nowPremium 回当前 holdings
  → setItem(snapshots) + setItem(dailyReturns)
  → syncToJsonBin()
```

### 图表渲染

- **总收益折线图**（TotalPortfolio）：`dailyReturns` 数组 → 累计收益金额 vs 日期
- **个股/期权收益折线图**（StockChart/OptionChart）：遍历 `snapshots` 提取 `revenuePercentage` 序列
- **回顾模式**：`TimelineSlider` 控制 `activeSnapshotIndex`，`null`=实时，数值=历史快照

## 技术栈

| 层      | 选型                          |
| ------- | ----------------------------- |
| 框架    | Next.js 16.2.6                |
| UI      | React 19.2.4 + Tailwind CSS v4|
| 状态    | Zustand 5.0.14                |
| 图表    | ECharts 6.1.0                 |
| 存储    | IndexedDB（本地）+ JSONBin（云端）|
| 部署    | Vercel                        |
| 价格源  | 手工录入（Alpha Vantage 保留未启用）|

## 开发

```bash
npm run dev        # 本地开发
npm run build      # 构建 + TypeScript 检查
npx vercel --prod --yes  # 部署到 Vercel
```

## 时区

所有时间以美东时间（America/New_York）为准。快照日期格式 `YYYY-MM-DD`，交易日期 `YYYYMMDD`。

## UI 规范

- 语言：简体中文
- 主题：TradingView 深色 CSS 变量（`var(--tv-bg)` 等）
- 模态框：在触发组件内直接条件渲染
- 图表：ECharts 单例模式
