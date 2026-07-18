import { describe, expect, it } from "vitest";
import { rebuildAccountHistory } from "./reconstruct";
import type { IbkrTradeEvent } from "@/types/workstation";

const trade = (overrides: Partial<IbkrTradeEvent>): IbkrTradeEvent => ({
  sourceTradeId: "trade-1",
  contractId: 1,
  symbol: "TEST",
  securityType: "STK",
  side: "BUY",
  quantity: 10,
  price: 100,
  commission: 0,
  currency: "USD",
  executedAt: "2026-01-02T15:00:00Z",
  ...overrides,
});

describe("rebuildAccountHistory", () => {
  it("uses moving weighted average cost and realizes proportional PnL", () => {
    const result = rebuildAccountHistory({
      openingCash: 10_000,
      trades: [
        trade({ sourceTradeId: "buy-1", quantity: 10, price: 100 }),
        trade({ sourceTradeId: "buy-2", quantity: 10, price: 120, executedAt: "2026-01-03T15:00:00Z" }),
        trade({ sourceTradeId: "sell-1", side: "SELL", quantity: 5, price: 130, executedAt: "2026-01-04T15:00:00Z" }),
      ],
      cashFlows: [],
      dailyMarks: [
        { date: "2026-01-02", prices: { 1: 100 } },
        { date: "2026-01-03", prices: { 1: 120 } },
        { date: "2026-01-04", prices: { 1: 130 } },
      ],
    });

    expect(result.lots[0]).toMatchObject({ quantity: 15, averageCost: 110, realizedPnl: 100 });
    expect(result.performance.at(-1)).toMatchObject({ nav: 10_400, unrealizedPnl: 300, realizedPnl: 100 });
  });

  it("neutralizes external deposits in the linked TWR curve", () => {
    const result = rebuildAccountHistory({
      openingCash: 1_000,
      trades: [],
      cashFlows: [{
        sourceId: "deposit",
        type: "DEPOSIT",
        amount: 1_000,
        currency: "USD",
        occurredAt: "2026-01-02T12:00:00Z",
        external: true,
      }],
      dailyMarks: [
        { date: "2026-01-01", prices: {} },
        { date: "2026-01-02", prices: {} },
      ],
    });

    expect(result.performance[1].dailyReturn).toBe(0);
    expect(result.performance[1].cumulativeReturn).toBe(0);
  });
});
