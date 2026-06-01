import { create } from "zustand";
import type {
  StockHolding,
  TradeRecord,
  CashReserve,
  JournalEntry,
  PortfolioSnapshot,
  TradePlan,
  DailyPricePoint,
} from "@/types";
import { getItem, setItem, markPendingSync, clearAllPendingSyncs } from "./db";
import { writeData } from "./jsonbin";

interface AppState {
  holdings: StockHolding[];
  tradeRecords: TradeRecord[];
  cash: CashReserve;
  baseCash: number;

  tradePlans: TradePlan[];

  journalEntries: JournalEntry[];

  snapshots: PortfolioSnapshot[];
  dailyReturns: DailyPricePoint[];
  activeSnapshotIndex: number | null;

  loaded: boolean;

  initialize: () => Promise<void>;

  addTradeRecord: (record: TradeRecord) => void;
  removeTradeRecord: (tradeTime: number) => void;
  updateTradeRecord: (oldTradeTime: number, record: TradeRecord) => void;

  updatePrices: (updates: { id: string; nowPrice: number }[]) => void;

  updateCash: (total: number) => void;

  addTradePlan: (plan: TradePlan) => void;
  updateTradePlan: (id: string, plan: Partial<TradePlan>) => void;
  removeTradePlan: (id: string) => void;

  addJournalEntry: (entry: JournalEntry) => void;

  takeSnapshot: () => void;
  setActiveSnapshot: (index: number | null) => void;

  syncToJsonBin: () => Promise<void>;
}

function calcTradeCashAdjustment(records: TradeRecord[]): number {
  let adj = 0;
  for (const r of records) {
    if (r.number > 0) {
      adj -= r.cost;
    } else {
      adj += Math.abs(r.cost);
    }
  }
  return adj;
}

function recalcHoldings(
  records: TradeRecord[]
): StockHolding[] {
  const stockMap = new Map<
    string,
    { name: string; totalNumber: number; totalCost: number }
  >();

  for (const r of records) {
    if (!stockMap.has(r.id)) {
      stockMap.set(r.id, {
        name: r.name,
        totalNumber: 0,
        totalCost: 0,
      });
    }
    const entry = stockMap.get(r.id)!;

    if (r.number > 0) {
      const newNumber = entry.totalNumber + r.number;
      entry.totalCost =
        newNumber > 0
          ? (entry.totalCost * entry.totalNumber + r.price * r.number) / newNumber
          : 0;
      entry.totalNumber = newNumber;
    } else {
      const sellNumber = Math.abs(r.number);
      if (entry.totalNumber > 0) {
        const remaining = entry.totalNumber - sellNumber;
        if (remaining > 0) {
          entry.totalCost =
            (entry.totalCost * entry.totalNumber - r.price * sellNumber) / remaining;
        } else {
          entry.totalCost = 0;
        }
        entry.totalNumber = Math.max(0, remaining);
      }
    }
  }

  const holdings: StockHolding[] = [];
  for (const [id, entry] of stockMap) {
    if (entry.totalNumber <= 0) continue;
    holdings.push({
      id,
      name: entry.name,
      number: entry.totalNumber,
      price: entry.totalCost,
      cost: entry.totalCost * entry.totalNumber,
      nowPrice: entry.totalCost,
      total: entry.totalCost * entry.totalNumber,
      revenue: 0,
      revenuePercentage: 0,
    });
  }

  return holdings;
}

function calcRevenue(holdings: StockHolding[]): StockHolding[] {
  return holdings.map((h) => {
    const total = h.nowPrice * h.number;
    const revenue = total - h.cost;
    const revenuePercentage =
      h.cost > 0 ? parseFloat(((revenue / h.cost) * 100).toFixed(2)) : 0;
    return { ...h, total, revenue, revenuePercentage };
  });
}

export const useStore = create<AppState>((set, get) => ({
  holdings: [],
  tradeRecords: [],
  cash: { id: "cash", name: "现金", total: 10000 },
  baseCash: 10000,
  tradePlans: [],
  journalEntries: [],
  snapshots: [],
  dailyReturns: [],
  activeSnapshotIndex: null,
  loaded: false,

  initialize: async () => {
    const [records, plans, journals, snaps, returns, storedBaseCash, storedHoldings] = await Promise.all([
      getItem<TradeRecord[]>("tradeRecords"),
      getItem<TradePlan[]>("tradePlans"),
      getItem<JournalEntry[]>("journalEntries"),
      getItem<PortfolioSnapshot[]>("snapshots"),
      getItem<DailyPricePoint[]>("dailyReturns"),
      getItem<number>("baseCash"),
      getItem<StockHolding[]>("holdings"),
    ]);

    const tradeRecords = records ?? [];
    const tradePlans = (plans ?? []).map((p) => {
      const old = p as TradePlan & { riskRewardRatio?: number };
      return {
        ...old,
        updatedAt: old.updatedAt ?? old.createdAt,
        cancelled: old.cancelled ?? false,
        riskRewardWin: old.riskRewardWin ?? old.riskRewardRatio ?? 0,
        riskRewardLose: old.riskRewardLose ?? 1,
      };
    });
    const journalEntries = journals ?? [];
    const snapshots = snaps ?? [];
    const baseCash = storedBaseCash ?? 10000;

    const rawReturns = returns ?? [];
    const dedupedMap = new Map<string, { date: string; return: number }>();
    for (const d of rawReturns) {
      dedupedMap.set(d.date, d);
    }
    const dailyReturns = [...dedupedMap.values()];

    const holdings = recalcHoldings(tradeRecords);
    const cashAdj = calcTradeCashAdjustment(tradeRecords);
    const cash: CashReserve = { id: "cash", name: "现金", total: baseCash + cashAdj };

    // 若存储中有 pre-set nowPrice，合并到初始持仓（适用于首次手动录入）
    if (storedHoldings && storedHoldings.length > 0) {
      for (const h of holdings) {
        const stored = storedHoldings.find((s) => s.id === h.id);
        if (stored && stored.nowPrice > 0) {
          h.nowPrice = stored.nowPrice;
        }
      }
    }

    set({
      tradeRecords,
      tradePlans,
      journalEntries,
      snapshots,
      dailyReturns,
      baseCash,
      holdings: calcRevenue(holdings),
      cash,
      loaded: true,
    });
  },

  addTradeRecord: (record) => {
    const records = [...get().tradeRecords, record];
    const holdings = recalcHoldings(records);
    const cashAdj = calcTradeCashAdjustment(records);
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + cashAdj };
    set({
      tradeRecords: records,
      holdings: calcRevenue(holdings),
      cash,
    });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
  },

  removeTradeRecord: (tradeTime) => {
    const records = get().tradeRecords.filter(
      (r) => r.tradeTime !== tradeTime
    );
    const holdings = recalcHoldings(records);
    const cashAdj = calcTradeCashAdjustment(records);
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + cashAdj };
    set({
      tradeRecords: records,
      holdings: calcRevenue(holdings),
      cash,
    });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
  },

  updateTradeRecord: (oldTradeTime, record) => {
    const records = get().tradeRecords.map((r) =>
      r.tradeTime === oldTradeTime ? record : r
    );
    const holdings = recalcHoldings(records);
    const cashAdj = calcTradeCashAdjustment(records);
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + cashAdj };
    set({
      tradeRecords: records,
      holdings: calcRevenue(holdings),
      cash,
    });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
  },

  updatePrices: (updates) => {
    const holdings = get().holdings.map((h) => {
      const update = updates.find((u) => u.id === h.id);
      if (!update) return h;
      return { ...h, nowPrice: update.nowPrice };
    });
    set({ holdings: calcRevenue(holdings) });
    setItem("holdings", holdings);
    markPendingSync("holdings", holdings);
    get().takeSnapshot();
  },

  updateCash: (total) => {
    const cashAdj = calcTradeCashAdjustment(get().tradeRecords);
    const baseCash = total - cashAdj;
    const cash: CashReserve = { id: "cash", name: "现金", total };
    set({ baseCash, cash });
    setItem("baseCash", baseCash);
    markPendingSync("baseCash", baseCash);
  },

  addTradePlan: (plan) => {
    const plans = [...get().tradePlans, { ...plan, updatedAt: Date.now() }];
    set({ tradePlans: plans });
    setItem("tradePlans", plans);
    markPendingSync("tradePlans", plans);
  },

  updateTradePlan: (id, plan) => {
    const plans = get().tradePlans.map((p) =>
      p.id === id ? { ...p, ...plan, updatedAt: Date.now() } : p
    );
    set({ tradePlans: plans });
    setItem("tradePlans", plans);
    markPendingSync("tradePlans", plans);
  },

  removeTradePlan: (id) => {
    const plans = get().tradePlans.filter((p) => p.id !== id);
    set({ tradePlans: plans });
    setItem("tradePlans", plans);
    markPendingSync("tradePlans", plans);
  },

  addJournalEntry: (entry) => {
    const entries = [...get().journalEntries, entry];
    set({ journalEntries: entries });
    setItem("journalEntries", entries);
    markPendingSync("journalEntries", entries);
  },

  takeSnapshot: () => {
    const { holdings, cash } = get();
    const now = new Date();
    const date = now.toLocaleDateString("en-CA");
    const totalValue = holdings.reduce((s, h) => s + h.total, 0) + cash.total;
    const totalCost = holdings.reduce((s, h) => s + h.cost, 0);
    const totalRevenue = holdings.reduce((s, h) => s + h.revenue, 0);
    const totalReturnPct =
      totalCost > 0
        ? parseFloat(((totalRevenue / totalCost) * 100).toFixed(2))
        : 0;

    const snapshot: PortfolioSnapshot = {
      timestamp: Date.now(),
      date,
      holdings: JSON.parse(JSON.stringify(holdings)),
      cash: JSON.parse(JSON.stringify(cash)),
      dailyReturn: totalReturnPct,
    };

    const snapshots = [...get().snapshots, snapshot];
    set({ snapshots });
    setItem("snapshots", snapshots);
    markPendingSync("snapshots", snapshots);

    const dailyReturns = [
      ...get().dailyReturns,
      { date, return: totalRevenue },
    ];
    set({ dailyReturns });
    setItem("dailyReturns", dailyReturns);
    markPendingSync("dailyReturns", dailyReturns);
  },

  setActiveSnapshot: (index) => {
    set({ activeSnapshotIndex: index });
  },

  syncToJsonBin: async () => {
    const { tradeRecords, tradePlans, journalEntries, snapshots, dailyReturns, baseCash } =
      get();
    const data = {
      tradeRecords,
      tradePlans,
      journalEntries,
      snapshots,
      dailyReturns,
      baseCash,
    };
    const ok = await writeData(data);
    if (ok) {
      await clearAllPendingSyncs();
    }
    return;
  },
}));
