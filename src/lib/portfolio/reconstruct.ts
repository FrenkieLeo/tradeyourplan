import type {
  DailyMarketMark,
  ExternalCashFlow,
  IbkrTradeEvent,
  PortfolioPerformancePoint,
  RebuiltLot,
} from "@/types/workstation";

interface MutableLot extends RebuiltLot {
  lastPrice: number;
}

export interface RebuildAccountHistoryInput {
  trades: IbkrTradeEvent[];
  cashFlows: ExternalCashFlow[];
  dailyMarks: DailyMarketMark[];
  openingCash?: number;
}

export interface RebuildAccountHistoryResult {
  lots: RebuiltLot[];
  performance: PortfolioPerformancePoint[];
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function applyTrade(lots: Map<number, MutableLot>, trade: IbkrTradeEvent): number {
  const signedQuantity = trade.side === "BUY" ? trade.quantity : -trade.quantity;
  const current = lots.get(trade.contractId) ?? {
    contractId: trade.contractId,
    symbol: trade.symbol,
    quantity: 0,
    averageCost: 0,
    realizedPnl: 0,
    lastPrice: trade.price,
  };
  const beforeQuantity = current.quantity;
  const sameDirection = beforeQuantity === 0 || Math.sign(beforeQuantity) === Math.sign(signedQuantity);

  if (sameDirection) {
    const nextQuantity = beforeQuantity + signedQuantity;
    const capitalizedCommission = trade.commission / Math.max(Math.abs(signedQuantity), 1);
    const effectivePrice = trade.side === "BUY"
      ? trade.price + capitalizedCommission
      : trade.price - capitalizedCommission;
    current.averageCost = nextQuantity === 0
      ? 0
      : ((Math.abs(beforeQuantity) * current.averageCost) + (Math.abs(signedQuantity) * effectivePrice)) /
        Math.abs(nextQuantity);
    current.quantity = nextQuantity;
  } else {
    const closingQuantity = Math.min(Math.abs(beforeQuantity), Math.abs(signedQuantity));
    const direction = beforeQuantity > 0 ? 1 : -1;
    const allocatedCommission = trade.commission * (closingQuantity / Math.abs(signedQuantity));
    current.realizedPnl += direction * (trade.price - current.averageCost) * closingQuantity - allocatedCommission;
    const nextQuantity = beforeQuantity + signedQuantity;

    if (nextQuantity === 0) {
      current.quantity = 0;
      current.averageCost = 0;
    } else if (Math.sign(nextQuantity) === Math.sign(beforeQuantity)) {
      current.quantity = nextQuantity;
    } else {
      const openingQuantity = Math.abs(nextQuantity);
      const remainingCommission = trade.commission - allocatedCommission;
      current.quantity = nextQuantity;
      current.averageCost = trade.price + (nextQuantity > 0 ? 1 : -1) * (remainingCommission / openingQuantity);
    }
  }

  current.lastPrice = trade.price;
  lots.set(trade.contractId, current);
  return trade.side === "BUY"
    ? -(trade.quantity * trade.price + trade.commission)
    : trade.quantity * trade.price - trade.commission;
}

export function rebuildAccountHistory({
  trades,
  cashFlows,
  dailyMarks,
  openingCash = 0,
}: RebuildAccountHistoryInput): RebuildAccountHistoryResult {
  const orderedTrades = [...trades].sort((a, b) => a.executedAt.localeCompare(b.executedAt));
  const orderedFlows = [...cashFlows].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const orderedMarks = [...dailyMarks].sort((a, b) => a.date.localeCompare(b.date));
  const lots = new Map<number, MutableLot>();
  const performance: PortfolioPerformancePoint[] = [];
  let cash = openingCash;
  let tradeIndex = 0;
  let flowIndex = 0;
  let previousNav: number | null = null;
  let cumulativeGrowth = 1;

  for (const mark of orderedMarks) {
    let netExternalFlow = 0;
    while (flowIndex < orderedFlows.length && dateKey(orderedFlows[flowIndex].occurredAt) <= mark.date) {
      const flow = orderedFlows[flowIndex];
      cash += flow.amount;
      if (flow.external) netExternalFlow += flow.amount;
      flowIndex += 1;
    }
    while (tradeIndex < orderedTrades.length && dateKey(orderedTrades[tradeIndex].executedAt) <= mark.date) {
      cash += applyTrade(lots, orderedTrades[tradeIndex]);
      tradeIndex += 1;
    }

    let marketValue = 0;
    let unrealizedPnl = 0;
    let realizedPnl = 0;
    for (const lot of lots.values()) {
      const price = mark.prices[lot.contractId] ?? lot.lastPrice;
      lot.lastPrice = price;
      marketValue += lot.quantity * price;
      unrealizedPnl += lot.quantity >= 0
        ? (price - lot.averageCost) * lot.quantity
        : (lot.averageCost - price) * Math.abs(lot.quantity);
      realizedPnl += lot.realizedPnl;
    }
    const nav = cash + marketValue;
    const dailyReturn = previousNav == null || previousNav === 0
      ? 0
      : (nav - previousNav - netExternalFlow) / previousNav;
    cumulativeGrowth *= 1 + dailyReturn;
    performance.push({
      date: mark.date,
      nav: roundMoney(nav),
      cash: roundMoney(cash),
      marketValue: roundMoney(marketValue),
      netExternalFlow: roundMoney(netExternalFlow),
      dailyReturn,
      cumulativeReturn: cumulativeGrowth - 1,
      realizedPnl: roundMoney(realizedPnl),
      unrealizedPnl: roundMoney(unrealizedPnl),
    });
    previousNav = nav;
  }

  return {
    lots: [...lots.values()].map((lot) => ({
      contractId: lot.contractId,
      symbol: lot.symbol,
      quantity: lot.quantity,
      averageCost: roundMoney(lot.averageCost),
      realizedPnl: roundMoney(lot.realizedPnl),
    })),
    performance,
  };
}
