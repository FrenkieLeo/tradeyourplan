
与 Gemini 对话
# TradeYourPlan — 产品需求文档



## 一、基本信息



- **项目名称**：TradeYourPlan

- **核心功能**：设定美股交易计划并跟踪持仓收益情况



## 二、页面结构



```Plain Text

页面布局：[单页面]

主要区域：

- 持仓总收益情况：展示目前总持仓的收益率变动（每个交易日都更新收盘价），以平滑折线图展现；同时同一水平线展现三个数字（持仓总金额，剩余现金，持仓收益金额）

- 个股持仓收益情况：展示我投资的每个个股的收益率变动（每个交易日都更新收盘价），以平滑折线图展现；

- 交易计划：以表格的形式展现，需要有股票名称，预计交易的价格，盈亏比计算，胜率预估，交易原因

```



## 三、功能清单



### P0（MVP）功能范围



1. **持仓总收益展示**

- 显示方式：在单页面上直接统计总持仓情况然后显示每个交易日的收益率变动，用平滑的折线图展现

- 触发方式：点击图表出现弹窗，里面是两个表格，可以支持录入自己每次交易的股票名称，成交价格和购入/卖出数量，同时另外一个表格显示当前持仓总情况

- 数据要求：[股票名称，股票代码, 购入/卖出股票数量，成本价格]

- 特殊要求：主要是每个股票的最新成本价需要按照以下公式来进行计算：

- **减仓**：`最新成本价 = ((原持仓数量 × 原成本价) - (减仓数量 × 减仓卖出价)) / 剩余持仓数量`

- **加仓**：`最新成本价 = ((原持仓数量 × 原成本价) + (加仓数量 × 加仓价格)) / (原持仓数量 + 加仓数量)`

- 顶部概览数字：持仓总金额、剩余现金、持仓收益金额



2. **个股持仓收益情况**

- 显示方式：按照持股的个数来自动生成对应的个股收益率情况，如果新建仓了一支股票就自动新增一个图表，然后显示每个交易日的收益率变动，用平滑的折线图展现。

- 触发方式：点击图表弹窗可以录入每日的看盘心得，自动生成时间，用时间轴节点连线的方式记录自己的想法。

- 数据要求：根据持仓总收益弹窗记录的交易情况



3. **交易计划**

- 显示方式：以表格的方式呈现，显示自己近期的交易计划，表格的内容需要包括股票名称，预计交易的价格，盈亏比计算，胜率预估，交易原因，可供填写新增，删除的话需要有确认框确认删除。

- 触发方式：直接修改表格内容



4. **历史回溯时间轴滑动条**

- 每次价格更新或交易操作时，生成一份完整的持仓快照（含时间戳）

- 通过时间轴滑动条拖动，页面切换到该时间点的持仓状态



### P1（后续迭代）



5. **个股K线图展示**

- 在个股收益率图表的旁边，新增该个股的K线周线图，上面需要标记买和卖的记录，买用"B"在那个时间点做标记，卖用"S"在那个时间点做标记。

- 数据源：Alpha Vantage



## 四、数据结构



### 个股数据库（用于记录个股的总持仓情况）



```TypeScript

interface StockHolding {

id: string; // 股票代码，如 "NVDA"

name: string; // 股票名称，如 "英伟达"

number: number; // 持股数量

price: number; // 成本价格

cost: number; // 持仓的总成本，cost = number * price

nowPrice: number; // 最近一个交易日的收盘价，由 Alpha Vantage 自动更新

total: number; // total = nowPrice * number

revenue: number; // revenue = total - cost

revenuePercentage: number; // (total - cost) / cost * 100

}

```



### 交易记录（用于记录个股的交易情况，然后更新到个股数据库）



```TypeScript

interface TradeRecord {

id: string; // 关联股票代码，如 "NVDA"

name: string; // 股票名称

number: number; // 交易数量（正数为买入，负数为卖出）

price: number; // 成交价格

cost: number; // 本次交易的投入总资金，cost = number * price

tradeTime: number; // 交易的时间（格式 YYYYMMDD，以美东时间为准）

}

```



### 现金储备（用于记录现金的变动情况，交易记录的卖出和买入需关联到该数据库）



```TypeScript

interface CashReserve {

id: "cash";

name: "现金";

total: number; // 以美元计价

}

```



### 看盘日志



```TypeScript

interface JournalEntry {

id: string; // 关联股票代码

name: string; // 股票名称

time: number; // 日志日期，格式 YYYYMMDD

content: string; // 日志内容

}

```



### 历史快照



```TypeScript

interface PortfolioSnapshot {

timestamp: number; // 快照生成时间戳

date: string; // 日期，格式 YYYY-MM-DD

holdings: StockHolding[];

cash: CashReserve;

dailyReturn: number; // 当日收益率

}

```



### 交易计划



```TypeScript

interface TradePlan {

id: string; // 唯一标识

stockName: string; // 股票名称

stockCode: string; // 股票代码

expectedPrice: number; // 预计交易价格

riskRewardRatio: number; // 盈亏比

winRate: number; // 胜率预估（百分比）

reason: string; // 交易原因

createdAt: number; // 创建时间

}

```



## 五、UI要求



- **配色**：模仿 TradingView 深色主题风格

- **响应式**：需要移动端适配（苹果手机网页端访问），Windows 和 macOS PC 端访问



## 六、交互说明



- **操作1**：点击持仓总收益情况图表 → 出现持仓情况表格弹窗 → 显示持股详细情况与交易的增删改查

- **操作2**：点击个股持仓收益图表 → 出现看盘日志弹窗 → 时间轴节点连线展示/录入



## 七、技术方案



### 技术栈



| 层面 | 选择 | 理由 |

|---|---|---|

| 框架 | Next.js (App Router) | Vercel 亲生子，SSR/SSG 支持好 |

| 样式 | Tailwind CSS | 快速实现 TradingView 深色风格，响应式支持好 |

| 图表 | ECharts | 折线图 + K 线图 API 成熟 |

| K 线接口 | Alpha Vantage | 免费层可用，每个交易日收盘后调用一次 |

| 数据存储 | JSONBin + IndexedDB | JSONBin 持久化，IndexedDB 做本地读写缓冲，减少 API 调用 |

| 部署 | Vercel | 与 Next.js 无缝集成 |

| 状态管理 | Zustand | 轻量、TypeScript 友好 |



### 数据流



```

用户操作 → 写入 IndexedDB（即时响应）→ 标记待同步 → 批量同步到 JSONBin

页面加载 → 从 JSONBin 拉取 → 写入 IndexedDB → 渲染

收盘后自动更新 → Alpha Vantage 拉取最新价 → 更新持仓计算 → 生成时间轴快照（JSONBin + IndexedDB）

时间轴滑动 → 读取对应快照 → 页面切换到该时间点的持仓状态

```



### 行情更新策略



- **方式**：用户打开页面时，前端判断是否「新交易日且已收盘（美东时间）」，是则自动调用 Alpha Vantage 拉取最新收盘价，更新持仓数据并保存快照

- **限制**：每个交易日最多调用一次 Alpha Vantage

- **兜底**：页面保留手动刷新按钮



---



## 八、项目结构



```

planyourtrade/

├── src/

│ ├── app/

│ │ ├── page.tsx # 主页面

│ │ ├── layout.tsx

│ │ └── globals.css

│ ├── components/

│ │ ├── TotalPortfolio.tsx # 持仓总收益

│ │ ├── StockChart.tsx # 个股收益图表

│ │ ├── TradePlan.tsx # 交易计划表格

│ │ ├── TradeModal.tsx # 交易记录弹窗

│ │ ├── JournalTimeline.tsx # 看盘日志时间轴

│ │ ├── PriceUpdater.tsx # 收盘价更新组件

│ │ └── TimelineSlider.tsx # 历史回溯滑动条

│ ├── lib/

│ │ ├── jsonbin.ts # JSONBin API 封装

│ │ ├── db.ts # IndexedDB 封装

│ │ ├── alphavantage.ts # Alpha Vantage API 封装

│ │ └── store.ts # Zustand 全局状态

│ └── types/

│ └── index.ts # TypeScript 类型定义

├── public/

├── next.config.ts

├── tailwind.config.ts

├── tsconfig.json

└── package.json

```



---



## 九、架构决策记录 (ADR)



### ADR-001：选择 Next.js + Tailwind + ECharts



- **日期**：2026-06-01

- **上下文**：需要部署在 Vercel 上的单页应用，需要图表展示

- **决策**：Next.js App Router 做框架，Tailwind CSS 做样式，ECharts 做图表

- **理由**：与 Vercel 生态无缝集成；Tailwind 方便做暗色主题和响应式；ECharts 同时支持折线图和 K 线图

- **放弃方案**：Create React App（生态老旧）、TradingView Lightweight Charts（K 线需额外处理）



### ADR-002：Alpha Vantage 作为行情数据源



- **日期**：2026-06-01

- **上下文**：需要免费的个股 K 线数据和最新收盘价

- **决策**：使用 Alpha Vantage，每个交易日收盘后（美东时间）调用一次

- **理由**：免费层可用，数据覆盖美股全市场

- **限制**：免费 Key 每分钟 5 次、每天 500 次调用上限

- **约束措施**：前端检测交易日和收盘时间后才触发调用，避免浪费配额



### ADR-003：JSONBin + IndexedDB 双层存储



- **日期**：2026-06-01

- **上下文**：需要免费持久化存储 + 多设备同步

- **决策**：JSONBin 做远程持久化，IndexedDB 做本地读写缓冲

- **理由**：JSONBin 免费版读写次数有限，IndexedDB 做缓冲层可大幅减少 API 调用

- **工作流**：用户操作先写入 IndexedDB（即时），再批量同步到 JSONBin



### ADR-004：功能分阶段交付（MVP 先行）



- **日期**：2026-06-01

- **上下文**：首次合作，需要快速验证核心价值

- **决策**：P0 做持仓总收益、个股收益、交易计划、历史回溯；P1 再做 K 线图

- **理由**：降低初始复杂度，快速交付可用版本



### ADR-005：加仓/减仓双成本公式



- **日期**：2026-06-01

- **上下文**：PRD 只定义了减仓公式，未定义加仓场景

- **决策**：

- **减仓**：`新成本价 = ((原持仓数量 × 原成本价) - (减仓数量 × 减仓卖出价)) / 剩余持仓数量`

- **加仓**：`新成本价 = ((原持仓数量 × 原成本价) + (加仓数量 × 加仓价格)) / (原持仓数量 + 加仓数量)`

- **清仓后重新建仓**：重置为新交易



### ADR-006：历史回溯采用时间轴滑动条



- **日期**：2026-06-01

- **上下文**：需要查看历史持仓状态

- **决策**：每次价格更新或交易操作时生成完整快照，通过时间轴滑动条切换展示

- **理由**：比日期下拉选择器更直观，适合快速浏览不同时间点



### ADR-007：看盘日志采用时间轴节点连线



- **日期**：2026-06-01

- **上下文**：需要记录和查看每日看盘心得

- **决策**：按时间顺序以节点连线方式展示，每个节点为一个日志条目

- **触发方式**：点击个股图表弹窗显示



### ADR-008：新增交易时立即拉取最新收盘价



- **日期**：2026-06-01

- **上下文**：PRD 原定每个交易日收盘后统一更新价格，但新增交易时持仓的 nowPrice 默认等于成本价，导致收益显示为 0

- **决策**：在 TradeModal 提交交易记录后，立即调用 Alpha Vantage GLOBAL_QUOTE 接口拉取该股票最新收盘价，并更新对应持仓的 nowPrice

- **理由**：用户添加交易后立即看到真实收益，提升体验

- **注意**：GLOBAL_QUOTE 返回的价格在交易时段内为实时价，非交易时段为最近收盘价



### ADR-009：现金储备可点击修改



- **日期**：2026-06-01

- **上下文**：用户需要手动调整现金储备金额

- **决策**：持仓总收益概览中的"剩余现金"数字改为可点击，弹出 CashModal 输入新金额

- **实现**：store 新增 updateCash 方法，同步更新 IndexedDB 并标记待同步到 JSONBin



---



## 十、修改历史



| 日期 | 版本 | 修改内容 |

|---|---|---|

| 2026-06-01 | v0.1 | 初始 PRD 框架 |

| 2026-06-01 | v0.2 | 头脑风暴后完整回填：技术方案选型、数据流设计、ADR 记录、MVP 范围界定、加仓公式补充、历史回溯方案、看盘日志方案 |

| 2026-06-01 | v0.3 | 新增交易后立即拉取 Alpha Vantage 前一日收盘价；现金储备可点击修改弹窗 |





---



## 十一、已知问题 / 坑点



### 已识别



1. **Alpha Vantage 免费层限制**

- 每分钟 5 次 API 调用，每天 500 次

- 应对：仅收盘后调用一次，前端做调用频率保护



2. **JSONBin 免费版额度**

- 当前免费版有每月读写次数限制

- 应对：引入 IndexedDB 本地缓冲层，减少远程读写



3. **美东时间判断**

- 需在前端判断当前是否为美东时间交易时段/已收盘

- 注意夏令时/冬令时切换



4. **移动端适配**

- 多个图表 + 表格在移动端布局需要合理折叠

- 建议移动端优先展示概览数字，图表改为可滑动



### 待发现

> 随开发进展持续补充





根据以上的需求文档，如果我想在此基础上新增期权操作记录，然后将收益情况完善到总的收益图表中，应该怎么重新设计这个文档，新增哪些内容，我该怎么跟agent沟通

这是一份非常扎实、结构清晰且考虑到了工程落地（如引入 IndexedDB 做缓冲、处理 Alpha Vantage 额度限制）的 MVP PRD。

在美股交易中，期权（Options）的引入会直接打破原有的“股票专用”数据结构。因为期权有到期日、行权价、方向（Call/Put）、买卖类型（Long/Short），并且其价格变动、希腊字母风险以及最终的行权/到期归零逻辑，都与股票有着本质的区别。

为了帮你在原文档基础上完美融合期权功能，并能顺畅地与 AI Agent 沟通，我将从“PRD 升级设计”和“Agent 沟通策略”两个维度为你拆解。

第一部分：PRD 应如何重新设计与新增内容
你需要对原 PRD 的功能清单（功能一）、数据结构（第四节）和架构决策（第九节）进行重构。

1. 数据结构升级（核心变化）
原有的 StockHolding 和 TradeRecord 无法承载期权。我们需要将其抽象为更通用的资产持仓与流水记录，或者单独开辟期权数据库。

新增：期权持仓数据库 (OptionHolding)
期权不仅有长仓（Long），还有短仓（Short，即 Sell Put/Covered Call），因此持仓数量和收益计算要支持正负号。

代码段
interface OptionHolding {
  id: string;               // 唯一标识，如 "NVDA_260619_C_130"
  underlyingCode: string;   // 标的股票代码，如 "NVDA"
  ticker: string;           // 期权标准代码
  expiryDate: string;       // 到期日 (YYYY-MM-DD)
  strikePrice: number;      // 行权价
  optionType: 'CALL' | 'PUT';
  positionType: 'LONG' | 'SHORT'; // 買方或賣方
  number: number;           // 持仓张数（1张通常=100股合约）
  price: number;            // 平均建仓权利金（单股价格，如 5.5）
  cost: number;             // 总权利金成本 = number * price * 100 * (SHORT为负，LONG为正)
  nowPrice: number;         // 最新权利金价格
  total: number;            // 当前价值 = nowPrice * number * 100
  revenue: number;          // 账面收益 = LONG: total - cost | SHORT: cost - total
  revenuePercentage: number;
}
新增/修改：交易记录 (TradeRecord)
需要支持期权的特殊变动，如行权（Exercise）、被指派（Assigned）或到期归零（Expired）。

代码段
interface TradeRecord {
  id: string;               // 关联资产代码（股票或期权ID）
  assetType: 'STOCK' | 'OPTION'; // 资产类型
  number: number;           // 交易数量
  price: number;            // 成交价格（股票价或期权权利金）
  tradeType: 'BUY' | 'SELL' | 'EXERCISE' | 'ASSIGNED' | 'EXPIRE_ZERO'; // 增加期权生命周期状态
  cost: number;             // 本次资金变动 = number * price * (assetType === 'OPTION' ? 100 : 1)
  tradeTime: number;
}
2. 功能清单升级（P0/P1 范围调整）
持仓总收益展示（P0 增强）：

计算公式重构：持仓总金额 = ∑个股当前价值+∑期权当前价值。

注意点：Sell Put 或 Covered Call（Short Option）在开仓时会变成现金（现金流入），但持仓市值是负数。总收益图表必须把“股票市值 + 期权市值 + 现金”加总，才能平滑反映总资产的真实净值（Net Liquidation Value）。

行情更新策略（技术调整）：

坑点：Alpha Vantage 的免费 API 不支持美股期权实时/历史权利金报价。

解决方案（ADR 修正）：

方案 A：期权暂不支持自动更新，每天收盘后提示用户“手动录入期权今日收盘权利金”。

方案 B：切换/并行引入支持期权的免费数据源（如 Yahoo Finance API 的衍生爬虫或 OpenWeb 接口）。

方案 C (MVP 推荐)：期权持仓在未平仓前，允许用户手动更新或在交易结算时才计入总收益。

3. 新增架构决策记录 (ADR)
ADR-010：期权复杂策略（如 PMCC、Covered Call）的展现形式
决策：在个股收益率图表下方，若该个股有关联期权，将期权持仓与个股并列展示（例如在 NVDA 股票下方，缩进显示其 PMCC 对应的 LEAPS Call 组合），方便计算组合盈亏比。

第二部分：如何高效地与 Agent 沟通？
由于你已经有一份结构极其严密的 PRD，与 Agent 沟通时切忌直接丢一句话“帮我加上期权功能”，这样它会胡乱修改，破坏你原本优雅的架构。

你可以采取“分步引导 + 架构审查”的沟通模式：

🧱 步骤一：发送背景与明确意图
先将你现有的完整 PRD 发给 Agent，并附上以下指令：

Prompt 模版：
“我发给你的是我目前运作良好的美股交易计划与跟踪工具 TradeYourPlan 的 PRD（当前版本 v0.3）。目前系统基于 Next.js + IndexedDB + Alpha Vantage 运行。

现在我需要在此基础上进行功能升级：全面支持期权（Options）操作记录（包括买入Call/Put、卖出Sell Put/Covered Call，以及期权到期/行权的处理），并将其无缝融合到‘持仓总收益’的折线图和全局数字中。

请先阅读我当前的 PRD，理解我的数据结构和存储设计。收到请回复‘已理解现有架构’，接下来我会交给你具体的修改任务。”

🛠️ 步骤二：让 Agent 产出修改提案（不要直接写代码）
当 Agent 回复理解后，让它针对 PRD 给出具体的修改点：

Prompt 模版：
“很好。现在请针对期权功能，帮我重构和补充这份 PRD。请输出以下具体内容：

数据结构变更：如何在 types/index.ts 中扩展或新增 OptionHolding 和修改 TradeRecord？请注意期权单价乘数通常为 100，且 Short 操作会带来现金流入但产生负资产。

总收益算法修正：请给出包含期权市值在内的持仓总金额和每日收益率的精确计算公式。

行情源兜底方案：鉴于 Alpha Vantage 免费层没有期权报价，请为我设计一个最轻量、不破坏现有 JSONBin+IndexedDB 架构的期权价格更新机制（可接受手动录入或推荐免费替代源）。

新增 ADR-010：关于期权策略（如 PMCC、Covered Call）与个股持仓联动展示的决策。

请用 Markdown 格式输出需要替换和新增的 PRD 章节。”

🚀 步骤三：审查并合并代码
当 Agent 输出了完美的 PRD 补充方案后，你确认无误，再让它基于新的数据结构去重写状态管理（Zustand Store）和前端组件：

Prompt 模版：
“很好，PRD 升级内容很完善。现在请帮我具体实现代码。请提供更新后的 src/types/index.ts 以及 src/lib/store.ts（Zustand 状态管理），重点实现期权开仓、平仓、加减仓成本计算，以及期权到期归零（Expire to Zero）或行权（Exercise）时，现金（CashReserve）和个股持仓（StockHolding）的联动逻辑。”

💡 给你的额外大招：期权特有的“三大隐形坑点”提醒
在跟 Agent 确认逻辑时，务必盯紧以下三点，这是金融交易系统开发的常见 Bug：

保证金与现金（Margin & Premium）：当你 Sell a Put 时，你会收到一笔权利金（现金增加），但你的券商会冻结一部分购买力（保证金）。在 MVP 阶段，建议只记录实有现金变动（加上收到的权利金），暂不计算复杂的保证金占用，否则系统会过于臃肿。

期权代码规范（OSI Subsymbol）：期权的 ID 不要简单写成 "NVDA"，一定要规范，例如 NVDA260619C00130000（标的+到期日+C/P+行权价），方便未来对接任何标准金融 API。

持仓乘数（The 100 Multiplier）：告诉 Agent，期权的交易数量单位是“张（Contracts）”，计算总价时必须乘以 100。例如：买入 1 张权利金为 $5 的 Call，现金扣除的是 $500，而不是 $5。

你可以直接给我一份期权更新版本的prd文档吗

这是为你重构后的 TradeYourPlan PRD v0.4（期权整合版）。

我保持了你原有的 TradingView 暗色风格、JSONBin + IndexedDB 双层架构以及时间轴回溯的核心亮点，重点对资产架构、计算公式、期权生命周期联动（行权/到期）进行了深度融合，并为你完美解决了免费 API 缺失期权报价的工程痛点。

TradeYourPlan — 产品需求文档 (v0.4 期权整合版)
一、基本信息
项目名称：TradeYourPlan

核心功能：设定美股（股票 & 期权）交易计划，跟踪多资产组合持仓，平滑统计综合收益净值。

二、页面结构
代码段
页面布局：[单页面]
主要区域：
- 组合总资产与收益情况：展示「股票 + 期权 + 现金」综合净资产（Net Liquidation Value）的收益率变动（每个交易日更新），以平滑折线图展现；同一水平线展现三个全局数字（总资产净值、剩余现金、组合总收益金额）。
- 个股与期权持仓看板：按标的个股（Underlying）进行聚合。每一个个股卡片内，包含：
  ├─ 该个股的收益率变动折线图
  ├─ 该个股的股票持仓明细（若有）
  └─ 该个股关联的期权持仓列表（如 Covered Call / Long Call，若有）
- 交易计划：以表格的形式展现（含股票/期权代码、预计方向、预计交易价格、盈亏比、胜率预估、交易原因）。
三、功能清单（MVP 范围升级）
1. 组合总资产与收益展示 (P0 增强)
显示方式：在单页面顶部统计综合资产净值的每日变动，用平滑折线图展现。

全局三大数字定义：

总资产净值 (Net Liq) = ∑个股当前价值+∑期权当前价值+剩余现金

剩余现金：支持正负（支持融资，但 MVP 阶段主要为正）。

组合总收益金额 = 当前总资产净值−历史净转入总本金

触发方式：点击图表出现管理弹窗，包含：交易流水录入、当前股票持仓表、当前期权持仓表。

2. 个股与期权联动看板 (P0 增强)
多资产聚合：不再是纯个股图表。系统以标的代码（如 NVDA）为核心。如果用户既持有 NVDA 股票，又持有 NVDA 的期权（如 Sell Call 赚取权利金），它们将在同一个 NVDA 模块下复合展示，以便用户一眼看清组合策略（如备兑组合 Covered Call）的整体表现。

看盘日志：点击该模块弹窗录入，以时间轴节点形式展现。

3. 期权交易与生命周期管理 (P0 新增)
期权交易录入：支持录入期权代码、买卖方向、张数、权利金单价（自动乘以 100 乘数变动现金）。

生命周期状态变更：由于期权有到期日，交易管理中除了买入/卖出，还必须支持以下核心操作，触发后自动联动现金与股票数据库：

到期归零 (Expire to Zero)：期权价值清零，移除持仓，将已实现盈亏归档。

行权 (Exercise) / 被指派 (Assigned)：期权持仓移除，同时自动在股票持仓中新增/减少对应数量的股票，并扣除/增加相应的行权现金。

4. 历史回溯时间轴滑动条 (P0)
每次价格更新或发生任何资产（股票/期权/现金）变动时，生成包含完整资产状态的快照。通过滑动条可完整回溯历史任意时刻的资产总净值。

四、数据结构 (TypeScript 升级)
1. 个股持仓数据库
代码段
interface StockHolding {
  id: string;                // 股票代码，如 "NVDA"
  name: string;              // 股票名称
  number: number;            // 持股数量
  price: number;             // 成本价格
  cost: number;              // 持仓总成本 = number * price
  nowPrice: number;          // 最近一个交易日收盘价 (Alpha Vantage 自动更新)
  total: number;             // 当前市值 = nowPrice * number
  revenue: number;           // 收益 = total - cost
  revenuePercentage: number; // (total - cost) / cost * 100
}
2. 期权持仓数据库 (新增)
代码段
interface OptionHolding {
  id: string;                 // 期权唯一OSI标准代码，如 "NVDA260619C00130000"
  underlyingCode: string;     // 标的股票代码，如 "NVDA"
  expiryDate: string;         // 到期日，格式 YYYY-MM-DD
  strikePrice: number;        // 行权价
  optionType: 'CALL' | 'PUT';
  positionType: 'LONG' | 'SHORT'; // LONG(买方/权利方), SHORT(卖方/义务方)
  number: number;             // 持仓张数 (1张 = 100股合约)
  price: number;              // 平均建仓权利金单价（如 4.5）
  cost: number;               // 权利金总成本 = number * price * 100 (SHORT为负现金流变正，LONG为正)
  nowPrice: number;           // 当前最新权利金价格（手动更新或三方源）
  total: number;              // 当前期权市值 = nowPrice * number * 100 * (SHORT为负，LONG为正)
  revenue: number;            // 账面盈亏：LONG 为 total - cost；SHORT 为 cost - total (权利金归零获得全额利润)
  revenuePercentage: number;
}
3. 统一资产流水记录 (重构)
代码段
interface TradeRecord {
  id: string;                 // 流水唯一ID
  assetId: string;            // 关联股票代码(NVDA) 或 期权代码(NVDA260619C00130000)
  assetType: 'STOCK' | 'OPTION';
  tradeType: 'BUY' | 'SELL' | 'EXERCISE' | 'ASSIGNED' | 'EXPIRE_ZERO'; 
  number: number;             // 交易数量（股票为股数，期权为张数）
  price: number;              // 成交单价
  multiplier: number;         // 乘数：股票为 1，期权为 100
  totalCashImpact: number;    // 对现金的影响额（买入为负，卖出为正）
  tradeTime: number;          // 时间戳 YYYYMMDD
}
4. 现金储备与历史快照
代码段
interface CashReserve {
  id: "cash";
  total: number;              // 剩余可用美元现金
  initialCapital: number;     // 历史总转入本金（用以准确计算总收益率）
}

interface PortfolioSnapshot {
  timestamp: number;
  date: string;
  stockHoldings: StockHolding[];
  optionHoldings: OptionHolding[];
  cash: CashReserve;
  netLiquidationValue: number; // 综合总资产净值
  totalReturnPercentage: number;
}
五、UI 与交互要求
聚合卡片设计：

主界面以“标的”为外壳。例如 NVDA 卡片：顶部是 NVDA 个股折线图，左下方显示股票持仓（如：100股，成本 $120），右下方并行显示期权持仓（如：Sell Call $130, 1张）。

期权特殊视觉：

Short（卖出开仓）的期权在持仓市值（Total）中显示为红色/负数或带有 [Short] 标签，明确告知用户这是潜在负债，但在到期归零或价格下跌时产生正向收益。

六、技术方案与行情兜底策略
1. 核心计算公式更新
期权建仓/加仓成本：

最新成本价= 
原张数+加仓张数
(原张数×原成本价)+(加仓张s×加仓价格)
​
 
综合总资产净值 (Net Liq) 每日更新公式：

Net Liq=∑(Stock Number×Stock Close Price)+∑(Option Contracts×Option Premium×100×Direction Factor)+Cash
(注：Direction Factor 中 LONG 为 1，SHORT 为 -1)

2. ADR-011：期权行情更新兜底方案 (重点)
上下文：Alpha Vantage 免费 API 无法提供美股期权行情，且市场缺乏完全稳定的免费期权 API。

决策：

建仓时：nowPrice 默认等于交易成交的权利金价格 price。

日常更新（兜底方案）：在总资产收益区的顶部以及个股卡片内，保留一个 "手动同步今日期权收盘价" 的轻量输入框。用户可在收盘后，一键为当前的几只期权输入当前权利金，系统将立即重新计算并生成今日快照。

结算时自动平仓：若期权发生平仓（SELL/BUY TO CLOSE）或到期（EXPIRE），系统直接根据最终结算价扣减现金，不依赖持续行情流。

七、架构决策记录 (ADR 扩充)
ADR-012：期权生命周期与账户联动处理
上下文：期权在行权（Exercise）或被指派（Assigned）时会发生资产性质的跃迁。

决策：当用户在交易历史中为某期权选择“行权/被指派”时，系统将自动执行以下联合原子操作：

将该期权的 OptionHolding 数量清零（移除持仓）。

根据期权类型，自动修改 StockHolding：

Call 被指派 (Short Call)：自动减少 100 股股票持仓，同时增加 行权价 * 100 的现金。

Put 被指派 (Short Put)：自动增加 100 股股票持仓（成本价为行权价），同时扣除 行权价 * 100 的现金。

生成对应流水，确保总资产时间轴快照连贯。

八、已知问题 / 坑点提示
期权 Short 仓位的特殊性：卖出期权（Short）在开仓时现金增加，但持仓价值（Market Value）为负。在前端计算总资产时，必须严格遵循 现金 + 股票市值 + 期权市值（负数） 的逻辑，否则总资产会在开仓当天暴增，产生逻辑错误。

美东时间到期检查：由于期权在周五收盘后（美东时间 16:00）到期，系统应在周六打开时提示用户对已到期的期权进行“声明处理”（选择到期归零或被行权）。