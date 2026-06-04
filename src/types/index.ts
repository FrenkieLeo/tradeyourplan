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


