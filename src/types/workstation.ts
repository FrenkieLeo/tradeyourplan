export type IbkrSecurityType =
  | "STK"
  | "OPT"
  | "FUT"
  | "FOP"
  | "CASH"
  | "BOND"
  | "FUND"
  | "CRYPTO"
  | "OTHER";

export interface IbkrTradeEvent {
  sourceTradeId: string;
  contractId: number;
  symbol: string;
  description?: string;
  securityType: IbkrSecurityType;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  commission: number;
  currency: string;
  executedAt: string;
}

export interface ExternalCashFlow {
  sourceId: string;
  type: "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" | "INTEREST" | "FEE" | "TAX" | "TRANSFER";
  amount: number;
  currency: string;
  occurredAt: string;
  external: boolean;
}

export interface DailyMarketMark {
  date: string;
  prices: Record<number, number>;
}

export interface RebuiltLot {
  contractId: number;
  symbol: string;
  quantity: number;
  averageCost: number;
  realizedPnl: number;
}

export interface PortfolioPerformancePoint {
  date: string;
  nav: number;
  cash: number;
  marketValue: number;
  netExternalFlow: number;
  dailyReturn: number;
  cumulativeReturn: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface IbkrAccountSnapshot {
  asOf: string;
  currency: string;
  netLiquidation: number;
  availableFunds: number;
  buyingPower: number;
  initialMargin: number;
  maintenanceMargin: number;
  excessLiquidity: number;
  grossPositionValue: number;
}

export interface IbkrPositionSnapshot {
  contractId: number;
  symbol: string;
  description: string;
  securityType: IbkrSecurityType;
  currency: string;
  quantity: number;
  averageCost: number;
  marketPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  dailyPnl: number;
  bid?: number;
  ask?: number;
  impliedVolatility?: number;
  openInterest?: number;
  marketDataDelayed?: boolean;
  marketDataAsOf: string;
}

export type IntelligenceEventType =
  | "EARNINGS"
  | "REGULATORY"
  | "MANAGEMENT"
  | "CYBERSECURITY"
  | "LITIGATION"
  | "M_AND_A"
  | "FINANCING"
  | "GUIDANCE"
  | "PRODUCT_RECALL"
  | "OTHER";

export interface IntelligenceEvent {
  id: string;
  symbol: string;
  eventType: IntelligenceEventType;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  titleOriginal: string;
  titleZh: string;
  summaryZh: string;
  impactZh: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  detectedAt: string;
  readAt?: string;
}

export interface WorkstationAlert {
  id: string;
  symbol?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  detail: string;
  createdAt: string;
  read: boolean;
}
