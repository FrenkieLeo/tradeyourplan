export interface StockHolding {
  id: string;
  name: string;
  number: number;
  price: number;
  cost: number;
  nowPrice: number;
  total: number;
  revenue: number;
  revenuePercentage: number;
}

export interface OptionHolding {
  id: string;                 // OSI 标准代码 "NVDA260619C00130000"
  underlyingCode: string;     // 标的股票代码 "NVDA"
  name: string;               // 可读名称
  expiryDate: string;         // 到期日 YYYY-MM-DD
  strikePrice: number;
  optionType: 'CALL' | 'PUT';
  positionType: 'LONG' | 'SHORT';
  number: number;             // 持仓张数
  price: number;              // 平均建仓权利金单价
  cost: number;               // 总权利金成本 = number * price * 100（LONG 为正，SHORT 为负）
  nowPrice: number;           // 当前最新权利金（手动更新）
  total: number;              // 当前期权市值 = nowPrice * number * 100（LONG 为正，SHORT 为负）
  revenue: number;            // 账面盈亏：LONG = total - cost; SHORT = cost - total
  revenuePercentage: number;
}

export interface TradeRecord {
  id: string;
  name: string;
  number: number;
  price: number;
  cost: number;
  tradeTime: number;
  // 期权扩展字段（旧数据归一化时缺省填充）
  assetType?: 'STOCK' | 'OPTION';
  tradeType?: 'BUY' | 'SELL' | 'EXERCISE' | 'ASSIGNED' | 'EXPIRE_ZERO';
  multiplier?: number;
  totalCashImpact?: number;
}

export interface CashReserve {
  id: "cash";
  total: number;
  initialCapital: number;
}

export interface JournalEntry {
  id: string;
  name: string;
  time: number;
  content: string;
}

export interface PortfolioSnapshot {
  timestamp: number;
  date: string;
  stockHoldings: StockHolding[];
  optionHoldings: OptionHolding[];
  cash: CashReserve;
  netLiquidationValue: number;
  totalReturnPercentage: number;
}

export interface TradePlan {
  id: string;
  stockName: string;
  stockCode: string;
  expectedPrice: number;
  riskRewardWin: number;
  riskRewardLose: number;
  winRate: number;
  reason: string;
  createdAt: number;
  updatedAt: number;
  cancelled: boolean;
}

export interface DailyPricePoint {
  date: string;
  return: number;
}
