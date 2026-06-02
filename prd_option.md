这是一份根据你的最新需求（包含股票与期权双模块）全面升级后的 **TradeYourPlan 产品需求文档（v0.4 完整版）**。

我为你把所有的新增逻辑（资产联动、期权公式、双 Tab 弹窗、数据结构扩展）完美融合进了原有的系统架构中，并保持了 TradingView 深色风格及双层存储（IndexedDB + JSONBin）的严谨设计。你可以直接将以下内容完整复制替换。

---

# TradeYourPlan — 产品需求文档 (v0.4 Full)

## 一、基本信息

* **项目名称**：TradeYourPlan
* **核心功能**：设定美股交易计划，统一跟踪股票与期权持仓收益情况

## 二、页面结构

```Plain Text
页面布局：[单页面]
主要区域：
- 持仓总收益情况：展示目前 [股票 + 期权] 总持仓的收益率变动（每个交易日更新收盘价），以平滑折线图展现；同一水平线展现三个数字（持仓总金额，剩余现金，持仓收益金额）
- 个股持仓收益情况：展示投资的每个个股的收益率变动（每个交易日更新收盘价），以平滑折线图展现
- 期权持仓收益情况：展示投资的每个期权单项的收益率变动（每个交易日更新收盘价），以平滑折线图展现
- 交易计划：以表格的形式展现，包含股票名称，预计交易的价格，盈亏比计算，胜率预估，交易原因

```

---

## 三、功能清单

### P0（MVP）功能范围

#### 1. 持仓总收益展示

* **显示方式**：在单页面顶部统计 [股票 + 期权 + 现金] 的总资产情况，显示每个交易日的总收益率变动，用平滑的折线图展现。
* **资产联动公式**：
* `持仓总金额 = ∑个股当前价值 + ∑期权当前价值`
* `资产总净值 = 持仓总金额 + 剩余现金`
* `持仓收益金额 = 资产总净值 - 初始总投入（或历史累计成本）`


* **触发方式**：点击图表出现弹窗（TradeModal），内含两个标签页（Tab）分别支持录入“股票交易”**与**“期权交易”；同时下方显示当前活跃持仓的总表。
* **顶部概览数字**：持仓总金额、剩余现金、持仓收益金额。

#### 2. 个股持仓收益情况

* **显示方式**：按持股代码自动生成对应的个股收益率图表。新建仓自动新增，清仓后隐藏/归档，用平滑的折线图展现每个交易日的收益率变动。
* **触发方式**：点击个股图表弹出看盘日志弹窗，支持录入每日心得，自动生成时间，以时间轴节点连线的方式记录想法。
* **持仓成本计算公式**：
* **加仓**：`最新成本价 = ((原持仓数量 × 原成本价) + (加仓数量 × 加仓价格)) / (原持仓数量 + 加仓数量)`
* **减仓**：`最新成本价 = ((原持仓数量 × 原成本价) - (减仓数量 × 减仓卖出价)) / 剩余持仓数量`
* **清仓**：数量归零，重置该股票成本记录。



#### 3. 期权持仓收益情况（新增）

* **显示方式**：按未到期的期权唯一代码（OCC标示）自动生成对应的期权收益率图表，用平滑折线图展现。
* **触发方式**：点击期权图表弹出期权日志弹窗（逻辑同个股）。
* **特殊规则与计算公式**（美股期权 1 张 = 100 股，MVP阶段仅支持买入开仓 Long）：
* **买入开仓（加仓）**：`最新单张权利金成本 = ((原张数 × 原单张权利金) + (加仓张数 × 加仓权利金)) / (原张数 + 加仓张数)`
* **卖出平仓（减仓）**：最新单张权利金成本保持不变，仅减少 `contracts（持仓张数）`。
* **期权当前价值**：`currentValue = 当前单张权利金(nowPremium) × 持仓张数 × 100`
* **期权总成本**：`totalCost = 最新单张权利金成本 × 持仓张数 × 100`
* **期权收益金额**：`revenue = currentValue - totalCost`
* **到期归零/手动清仓**：持仓张数归零，该期权移出活跃图表。



#### 4. 交易计划

* **显示方式**：以表格呈现近期交易计划。内容包括：股票名称、预计交易价格、盈亏比计算、胜率预估、交易原因。支持直接修改、填写新增；删除操作需弹窗二次确认。
* **触发方式**：直接修改表格内容。

#### 5. 历史回溯时间轴滑动条

* 每次价格更新或交易操作时，生成一份完整的持仓快照（含时间戳，包含股票和期权）。
* 通过时间轴滑动条拖动，整个页面切换到该历史时间点的持仓与收益状态。

### P1（后续迭代）

#### 6. 个股K线图及期权标记展示

* 在个股/期权收益率图表旁，新增该标的的 K 线周线图（数据源：Alpha Vantage）。
* 标记买卖记录：买入在对应时间点标记 "B"，卖出标记 "S"。

---

## 四、数据结构

### 1. 个股数据库（StockHolding）

```TypeScript
interface StockHolding {
  id: string;                // 股票代码，如 "NVDA"
  name: string;              // 股票名称，如 "英伟达"
  number: number;            // 持股数量
  price: number;             // 成本价格
  cost: number;              // 持仓的总成本，cost = number * price
  nowPrice: number;          // 最近一个交易日的收盘价，由 Alpha Vantage 自动更新
  total: number;             // total = nowPrice * number
  revenue: number;           // revenue = total - cost
  revenuePercentage: number; // (total - cost) / cost * 100
}

```

### 2. 期权持仓数据库（OptionHolding）

```TypeScript
interface OptionHolding {
  id: string;                // 期权唯一代码（OCC Format），如 "NVDA260619C00130000"
  underlyingSymbol: string;  // 正股代码，如 "NVDA"
  name: string;              // 简写显示名，如 "NVDA 260619 130C"
  type: 'CALL' | 'PUT';      // 期权类型
  strikePrice: number;       // 行权价
  expirationDate: string;    // 到期日 (YYYY-MM-DD)
  contracts: number;         // 持仓张数
  averagePremium: number;    // 平均买入权利金（单股价格，如 4.50）
  totalCost: number;         // 总投入权利金 = contracts * averagePremium * 100
  nowPremium: number;        // 最近一个交易日的期权收盘价
  currentValue: number;      // 当前价值 = nowPremium * contracts * 100
  revenue: number;           // revenue = currentValue - totalCost
  revenuePercentage: number; // (currentValue - totalCost) / totalCost * 100
}

```

### 3. 交易记录（TradeRecord）

```TypeScript
interface TradeRecord {
  id: string;                // 关联标的代码（股票代码 或 期权唯一代码）
  assetType: 'STOCK' | 'OPTION'; // 资产类型：股票 或 期权
  name: string;              // 股票/期权名称
  number: number;            // 交易数量/张数（正数为买入/开仓，负数为卖出/平仓）
  price: number;             // 成交价格（股票价格 或 期权单张权利金）
  cost: number;              // 本次交易投入资金（Stock: number*price; Option: number*price*100）
  tradeTime: number;         // 交易时间（格式 YYYYMMDD，以美东时间为准）
}

```

### 4. 现金储备（CashReserve）

```TypeScript
interface CashReserve {
  id: "cash";
  name: "现金";
  total: number;             // 以美元计价，随 StockRecord 和 OptionRecord 的买卖自动扣减/增加
}

```

### 5. 看盘日志（JournalEntry）

```TypeScript
interface JournalEntry {
  id: string;                // 关联股票代码 或 期权代码
  targetType: 'STOCK' | 'OPTION';
  name: string;              
  time: number;              // 日志日期，格式 YYYYMMDD
  content: string;           // 日志内容
}

```

### 6. 历史快照（PortfolioSnapshot）

```TypeScript
interface PortfolioSnapshot {
  timestamp: number;          // 快照生成时间戳
  date: string;               // 日期，格式 YYYY-MM-DD
  holdings: StockHolding[];
  optionHoldings: OptionHolding[]; // 包含期权持仓快照
  cash: CashReserve;
  dailyReturn: number;        // 当日总收益率
}

```

### 7. 交易计划（TradePlan）

```TypeScript
interface TradePlan {
  id: string;                
  stockName: string;         
  stockCode: string;         
  expectedPrice: number;     
  riskRewardRatio: number;   
  winRate: number;           // 胜率预估（百分比）
  reason: string;            
  createdAt: number;         
}

```

---

## 五、UI要求

* **配色**：全面模仿 TradingView 深色主题风格（Dark Mode Base: `#131722`, Card Base: `#1c2030`, Text: `#d1d4dc`）。
* **响应式**：完美适配 iOS 手机网页端（移动端优先，列表及图表可横向滑动或折叠），同时兼顾 Windows 和 macOS PC 端。

## 六、交互说明

* **操作1（资产录入）**：点击顶部的持仓总收益图表 → 弹出 `TradeModal` 弹窗 → 包含两个 Tab（股票/期权）→ 输入完交易数据提交 → 自动更新对应的个股/期权持仓、扣减/增加现金、触发数据持久化。
* **操作2（日志记录）**：点击任意个股或期权收益折线图 → 弹出对应的看盘日志弹窗 → 时间轴节点连线展示/录入心得。
* **操作3（现金微调）**：点击顶部概览中的“剩余现金”数字 → 弹出 `CashModal` 窗口 → 允许手动调整基础现金数额。

---

## 七、技术方案

### 技术栈

| 层面 | 选择 | 理由 |
| --- | --- | --- |
| 框架 | Next.js (App Router) | Vercel 原生集成，SSR/SSG 支持，便于多端访问 |
| 样式 | Tailwind CSS | 快速构建 TradingView 风格暗黑 UI，响应式工具类健全 |
| 图表 | ECharts | 完美支持多条平滑折线图联动，后续扩展 K 线图（P1）API 成熟 |
| 数据接口 | Alpha Vantage | 免费层获取股票收盘价。对于期权价格若免费层受限，前端在价格更新时**提供用户手动辅助更新输入框**作为兜底。 |
| 数据存储 | JSONBin + IndexedDB | 本地读写由 IndexedDB 即时缓冲（无网络延迟），异步批量同步至 JSONBin 云端实现多端同步。 |
| 状态管理 | Zustand | 轻量级、无样板代码、TypeScript 友好，易于管理复杂的复合资产状态。 |

### 行情更新策略

* **判定机制**：用户打开页面时，前端根据美东时间判断是否“进入新交易日且已收盘”。满足条件则触发 Alpha Vantage 更新股票收盘价；期权收盘价若接口未返回，则弹窗提示用户进行手动“今日权价核对”。
* **即时行情（ADR-008）**：在交易弹窗中新增交易记录成功后，立即调用外部接口拉取该标的最新的 `nowPrice` / `nowPremium`，避免新资产首日收益显示为 0。

---

## 八、项目结构

```
planyourtrade/
├── src/
│   ├── app/
│   │   ├── page.tsx            # 单页面主入口（包含持仓总览、股票图表区、期权图表区、交易计划）
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── TotalPortfolio.tsx   # 持仓总收益（资产看板 + 联动总折线图）
│   │   ├── StockChart.tsx       # 个股收益率图表组件
│   │   ├── OptionChart.tsx      # 期权收益率图表组件【新增】
│   │   ├── TradePlan.tsx        # 交易计划表格组件
│   │   ├── TradeModal.tsx       # 交易记录录入弹窗（含 股票/期权 双Tab）
│   │   ├── CashModal.tsx        # 现金手动微调弹窗
│   │   ├── JournalTimeline.tsx  # 看盘日志时间轴组件
│   │   ├── PriceUpdater.tsx     # 收盘价/期权权利金更新调度器
│   │   └── TimelineSlider.tsx   # 历史回溯滑动条组件
│   ├── lib/
│   │   ├── jsonbin.ts           # JSONBin API 交互封装
│   │   ├── db.ts                # IndexedDB 本地数据库初始化及读写
│   │   ├── alphavantage.ts      # Alpha Vantage 行情接口封装
│   │   └── store.ts             # Zustand 全局状态管理（包含资产、计划、日志的核心 Reducer）
│   └── types/
│       └── index.ts             # 统一 TypeScript 接口定义

```

---

## 九、架构决策记录 (ADR)

*（ADR-001 至 ADR-009 保持不变，新增以下期权相关决策）*

### ADR-010：期权模块作为独立持仓池与股票并行处理

* **日期**：2026-06-02
* **上下文**：引入期权资产，期权拥有特殊的乘数（1张=100股）和到期属性，直接混入股票结构会导致类型混乱和公式逻辑污染。
* **决策**：在 Zustand 和数据库层设计独立的 `optionHoldings` 数组，在计算总资产时由 `TotalPortfolio` 组件在前端进行统一加总。
* **理由**：保证了代码的解耦性。如果未来需要去掉期权或增加其他衍生品，不会破坏核心的个股计算逻辑。

### ADR-011：MVP 阶段期权行情采取“接口拉取 + 手动输入”双调度

* **日期**：2026-06-02
* **上下文**：Alpha Vantage 免费层对期权链和历史期权价格的 API 限制较为严格。
* **决策**：前端更新收盘快照时，若接口未成功返回 `nowPremium`（今日权利金），页面允许用户弹窗手动录入未到期期权的当前价格进行快照补全。
* **理由**：绕过免费 API 的限制，确保系统在任何情况下都能生成准确的资产快照。

---

## 十、修改历史

| 日期 | 版本 | 修改内容 |
| --- | --- | --- |
| 2026-06-01 | v0.1 | 初始 PRD 框架 |
| 2026-06-01 | v0.2 | 回填技术方案选型、数据流、ADR、加减仓公式 |
| 2026-06-01 | v0.3 | 引入新交易即时拉取行情机制（ADR-008）及现金微调功能（ADR-009） |
| 2026-06-02 | v0.4 | **全面引入期权（Option）收益跟踪模块**。扩展了页面结构、功能清单 P0 范围、更新了包含 `OptionHolding` 和 `assetType` 的核心数据结构，定义了期权成本乘数公式。 |

---

## 十一、已知问题 / 坑点

1. **期权符号唯一性 (OCC Format)**：录入期权代码时应建议使用标准格式（如 `NVDA260619C00130000`），以便于系统识别到期日和行权价。
2. **期权到期归零处理**：前端需要有定时器或在打开页面时检测当前日期是否大于 `expirationDate`。若已到期且张数不为 0，需自动将其转为清仓状态并结算（Long期权价值归零）。

