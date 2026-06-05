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
  id: string;
  underlyingSymbol: string;
  name: string;
  type: "CALL" | "PUT";
  strikePrice: number;
  expirationDate: string;
  contracts: number;
  averagePremium: number;
  totalCost: number;
  nowPremium: number;
  currentValue: number;
  revenue: number;
  revenuePercentage: number;
}

export interface TradeRecord {
  // 全局唯一标识（跨设备稳定）。区分同一股票/同一天的多笔交易，并支撑多端合并同步。
  uid: string;
  // 最近一次修改时间（毫秒）。多端合并时按其判定哪条记录更新。
  updatedAt?: number;
  id: string;
  assetType?: "STOCK" | "OPTION";
  name: string;
  number: number;
  price: number;
  cost: number;
  tradeTime: number;
  // Option-specific metadata
  underlyingSymbol?: string;
  optionType?: "CALL" | "PUT";
  optionStrike?: number;
  optionExpiration?: string;
}

// 删除墓碑：记录被删除的交易 uid 及删除时间，用于多端同步时正确传播删除。
export interface DeletedTradeRef {
  uid: string;
  deletedAt: number;
}

export interface CashReserve {
  id: "cash";
  name: "现金";
  total: number;
}

export interface JournalEntry {
  id: string;
  targetType: "STOCK" | "OPTION";
  name: string;
  time: number;
  content: string;
}

export interface PortfolioSnapshot {
  timestamp: number;
  date: string;
  holdings: StockHolding[];
  optionHoldings: OptionHolding[];
  cash: CashReserve;
  dailyReturn: number;
}

export interface DailyPricePoint {
  date: string;
  return: number;
}

export interface TradePlan {
  id: string;
  stockName: string;
  stockCode: string;
  expectedPriceMin: number;
  expectedPriceMax: number;
  riskRewardWin: number;
  riskRewardLose: number;
  winRate: number;
  reason: string;
  createdAt: number;
  updatedAt: number;
  cancelled: boolean;
}


