import type {
  ExternalCashFlow,
  IbkrAccountSnapshot,
  IbkrPositionSnapshot,
  IbkrTradeEvent,
  PortfolioPerformancePoint,
} from "@/types/workstation";

export interface IbkrInstrumentPayload {
  contractId: number;
  contractIdEx?: string;
  symbol: string;
  description: string;
  securityType: string;
  currency: string;
  exchange?: string;
  underlyingContractId?: number;
}

export interface IbkrWatchlistPayload {
  externalId: string;
  name: string;
  sourceHash: number;
  instruments: Array<{
    contractIdEx: string;
    symbol: string;
    description: string;
    underlyingSymbol?: string;
  }>;
}

export interface IbkrSyncPayload {
  idempotencyKey: string;
  source: "IBKR" | "IBKR_FLEX";
  account: { accountKey: string; displayName?: string; baseCurrency: string };
  instruments: IbkrInstrumentPayload[];
  trades: IbkrTradeEvent[];
  cashFlows: ExternalCashFlow[];
  accountSnapshot: IbkrAccountSnapshot;
  positions: IbkrPositionSnapshot[];
  performance?: PortfolioPerformancePoint[];
  watchlists?: IbkrWatchlistPayload[];
}

export function isIbkrSyncPayload(value: unknown): value is IbkrSyncPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<IbkrSyncPayload>;
  return Boolean(
    payload.idempotencyKey &&
    (payload.source === "IBKR" || payload.source === "IBKR_FLEX") &&
    payload.account?.accountKey &&
    payload.accountSnapshot?.asOf &&
    Array.isArray(payload.instruments) &&
    Array.isArray(payload.trades) &&
    Array.isArray(payload.cashFlows) &&
    Array.isArray(payload.positions)
  );
}
