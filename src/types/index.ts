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

export interface TradeRecord {
  id: string;
  name: string;
  number: number;
  price: number;
  cost: number;
  tradeTime: number;
}

export interface CashReserve {
  id: "cash";
  name: "现金";
  total: number;
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
  holdings: StockHolding[];
  cash: CashReserve;
  dailyReturn: number;
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


