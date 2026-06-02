import { create } from "zustand";
import type {
  StockHolding,
  OptionHolding,
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
  optionHoldings: OptionHolding[];
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
  removeTradeRecord: (tradeTime: number, id: string) => void;
  updateTradeRecord: (oldTradeTime: number, oldId: string, record: TradeRecord) => void;

  updatePrices: (updates: { id: string; nowPrice: number }[]) => void;
  updateOptionPremiums: (updates: { id: string; nowPremium: number }[]) => void;
  updateOptionHolding: (id: string, updates: Partial<OptionHolding>) => void;

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
  const stockRecords = records.filter((r) => !r.assetType || r.assetType === "STOCK");
  const stockMap = new Map<
    string,
    { name: string; totalNumber: number; totalCost: number }
  >();

  for (const r of stockRecords) {
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

function recalcOptionHoldings(records: TradeRecord[]): OptionHolding[] {
  const optionRecords = records.filter((r) => r.assetType === "OPTION");
  const optionMap = new Map<string, {
    name: string;
    underlyingSymbol: string;
    type: "CALL" | "PUT";
    strikePrice: number;
    expirationDate: string;
    contracts: number;
    averagePremium: number;
  }>();

  for (const r of optionRecords) {
    if (!optionMap.has(r.id)) {
      optionMap.set(r.id, {
        name: r.name,
        underlyingSymbol: r.underlyingSymbol ?? "",
        type: r.optionType ?? "CALL",
        strikePrice: r.optionStrike ?? 0,
        expirationDate: r.optionExpiration ?? "",
        contracts: 0,
        averagePremium: 0,
      });
    }
    const entry = optionMap.get(r.id)!;

    if (r.number > 0) {
      const newContracts = entry.contracts + r.number;
      entry.averagePremium =
        newContracts > 0
          ? ((entry.averagePremium * entry.contracts) + (r.price * r.number)) / newContracts
          : 0;
      entry.contracts = newContracts;
    } else {
      entry.contracts = Math.max(0, entry.contracts - Math.abs(r.number));
    }
  }

  const holdings: OptionHolding[] = [];
  for (const [id, entry] of optionMap) {
    if (entry.contracts <= 0) continue;
    const totalCost = entry.averagePremium * entry.contracts * 100;
    holdings.push({
      id,
      underlyingSymbol: entry.underlyingSymbol,
      name: entry.name,
      type: entry.type,
      strikePrice: entry.strikePrice,
      expirationDate: entry.expirationDate,
      contracts: entry.contracts,
      averagePremium: entry.averagePremium,
      totalCost,
      nowPremium: entry.averagePremium,
      currentValue: totalCost,
      revenue: 0,
      revenuePercentage: 0,
    });
  }

  return holdings;
}

function calcOptionRevenue(options: OptionHolding[]): OptionHolding[] {
  return options.map((o) => {
    const currentValue = o.nowPremium * o.contracts * 100;
    const revenue = currentValue - o.totalCost;
    const revenuePercentage =
      o.totalCost > 0 ? parseFloat(((revenue / o.totalCost) * 100).toFixed(2)) : 0;
    return { ...o, currentValue, revenue, revenuePercentage };
  });
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
  optionHoldings: [],
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
    const [records, plans, journals, snaps, returns, storedBaseCash, storedHoldings, storedOptionHoldings] = await Promise.all([
      getItem<TradeRecord[]>("tradeRecords"),
      getItem<TradePlan[]>("tradePlans"),
      getItem<JournalEntry[]>("journalEntries"),
      getItem<PortfolioSnapshot[]>("snapshots"),
      getItem<DailyPricePoint[]>("dailyReturns"),
      getItem<number>("baseCash"),
      getItem<StockHolding[]>("holdings"),
      getItem<OptionHolding[]>("optionHoldings"),
    ]);

    console.log("[initialize] raw data from IndexedDB:", {
      records: records?.length ?? 0,
      snaps: snaps?.length ?? 0,
      returns: returns?.length ?? 0,
      storedHoldings: storedHoldings?.length ?? 0,
      storedOptionHoldings: storedOptionHoldings?.length ?? 0,
    });

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
    const journalEntries = (journals ?? []).map((j) => {
      const old = j as JournalEntry & { targetType?: string };
      return { ...old, targetType: old.targetType ?? "STOCK" };
    });
    const rawSnapshots = snaps ?? [];
    const snapshots: PortfolioSnapshot[] = [...new Map(rawSnapshots.map((s) => [s.date, s])).values()].map((s) => ({
      ...s,
      optionHoldings: (s as PortfolioSnapshot & { optionHoldings?: OptionHolding[] }).optionHoldings ?? [],
    }));
    const baseCash = storedBaseCash ?? 10000;

    const rawReturns = returns ?? [];
    const dedupedMap = new Map<string, { date: string; return: number }>();
    for (const d of rawReturns) {
      dedupedMap.set(d.date, d);
    }
    const dailyReturns = [...dedupedMap.values()];

    const holdings = recalcHoldings(tradeRecords);
    const optionHoldings = recalcOptionHoldings(tradeRecords);

    console.log("[initialize] recalc result:", {
      stockHoldings: holdings.length,
      optionHoldings: optionHoldings.length,
      holdingIds: holdings.map((h) => h.id),
      snapshotDates: snapshots.map((s) => s.date),
    });
    const cashAdj = calcTradeCashAdjustment(tradeRecords);
    const cash: CashReserve = { id: "cash", name: "现金", total: baseCash + cashAdj };

    if (storedHoldings && storedHoldings.length > 0) {
      for (const h of holdings) {
        const stored = storedHoldings.find((s) => s.id === h.id);
        if (stored && stored.nowPrice > 0) {
          h.nowPrice = stored.nowPrice;
        }
      }
    }

    if (storedOptionHoldings && storedOptionHoldings.length > 0) {
      for (const o of optionHoldings) {
        const stored = storedOptionHoldings.find((s) => s.id === o.id);
        if (stored && stored.nowPremium > 0) {
          o.nowPremium = stored.nowPremium;
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
      optionHoldings: calcOptionRevenue(optionHoldings),
      cash,
      loaded: true,
    });
  },

  addTradeRecord: (record) => {
    const records = [...get().tradeRecords, record];
    const cashAdj = calcTradeCashAdjustment(records);
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + cashAdj };
    const holdings = calcRevenue(recalcHoldings(records));
    const optionHoldings = calcOptionRevenue(recalcOptionHoldings(records));
    set({ tradeRecords: records, holdings, optionHoldings, cash });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
  },

  removeTradeRecord: (tradeTime, id) => {
    const records = get().tradeRecords.filter(
      (r) => !(r.tradeTime === tradeTime && r.id === id)
    );
    const cashAdj = calcTradeCashAdjustment(records);
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + cashAdj };
    const holdings = calcRevenue(recalcHoldings(records));
    const optionHoldings = calcOptionRevenue(recalcOptionHoldings(records));
    set({
      tradeRecords: records,
      holdings,
      optionHoldings,
      cash,
    });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
  },

  updateTradeRecord: (oldTradeTime, oldId, record) => {
    const records = get().tradeRecords.map((r) =>
      r.tradeTime === oldTradeTime && r.id === oldId ? record : r
    );
    const cashAdj = calcTradeCashAdjustment(records);
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + cashAdj };
    const holdings = calcRevenue(recalcHoldings(records));
    const optionHoldings = calcOptionRevenue(recalcOptionHoldings(records));
    set({ tradeRecords: records, holdings, optionHoldings, cash });
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

  updateOptionPremiums: (updates) => {
    const optionHoldings = get().optionHoldings.map((o) => {
      const update = updates.find((u) => u.id === o.id);
      if (!update) return o;
      return { ...o, nowPremium: update.nowPremium };
    });
    set({ optionHoldings: calcOptionRevenue(optionHoldings) });
    setItem("optionHoldings", optionHoldings);
    markPendingSync("optionHoldings", optionHoldings);
    get().takeSnapshot();
  },

  updateOptionHolding: (id, partial) => {
    const optionHoldings = get().optionHoldings.map((o) => {
      if (o.id !== id) return o;
      const updated = { ...o, ...partial };
      updated.totalCost = updated.averagePremium * updated.contracts * 100;
      updated.currentValue = updated.nowPremium * updated.contracts * 100;
      updated.revenue = updated.currentValue - updated.totalCost;
      updated.revenuePercentage =
        updated.totalCost > 0
          ? parseFloat(((updated.revenue / updated.totalCost) * 100).toFixed(2))
          : 0;
      return updated;
    });
    set({ optionHoldings });
    setItem("optionHoldings", optionHoldings);
    markPendingSync("optionHoldings", optionHoldings);
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
    const { holdings, optionHoldings, cash } = get();
    const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const totalValue = holdings.reduce((s, h) => s + h.total, 0) + optionHoldings.reduce((s, o) => s + o.currentValue, 0);
    const totalCost = holdings.reduce((s, h) => s + h.cost, 0) + optionHoldings.reduce((s, o) => s + o.totalCost, 0);
    const totalRevenue = holdings.reduce((s, h) => s + h.revenue, 0) + optionHoldings.reduce((s, o) => s + o.revenue, 0);
    const totalReturnPct =
      totalCost > 0
        ? parseFloat(((totalRevenue / totalCost) * 100).toFixed(2))
        : 0;

    const snapshot: PortfolioSnapshot = {
      timestamp: Date.now(),
      date,
      holdings: JSON.parse(JSON.stringify(holdings)),
      optionHoldings: JSON.parse(JSON.stringify(optionHoldings)),
      cash: JSON.parse(JSON.stringify(cash)),
      dailyReturn: totalReturnPct,
    };

    const existingIdx = get().snapshots.findIndex((s) => s.date === date);
    const snapshots =
      existingIdx >= 0
        ? get().snapshots.map((s, i) => (i === existingIdx ? snapshot : s))
        : [...get().snapshots, snapshot];
    set({ snapshots });
    setItem("snapshots", snapshots);
    markPendingSync("snapshots", snapshots);

    const dailyReturns = [
      ...get().dailyReturns.filter((d) => d.date !== date),
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
    const { tradeRecords, tradePlans, journalEntries, snapshots, dailyReturns, baseCash, holdings, optionHoldings } =
      get();
    const data = {
      tradeRecords,
      tradePlans,
      journalEntries,
      snapshots,
      dailyReturns,
      baseCash,
      holdings,
      optionHoldings,
    };
    const ok = await writeData(data);
    if (ok) {
      await clearAllPendingSyncs();
    }
    return;
  },
}));
