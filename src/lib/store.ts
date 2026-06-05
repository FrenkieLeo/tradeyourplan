import { create } from "zustand";
import type {
  StockHolding,
  OptionHolding,
  TradeRecord,
  CashReserve,
  JournalEntry,
  PortfolioSnapshot,
  TradePlan,
} from "@/types";
import { getItem, setItem, markPendingSync, clearAllPendingSyncs } from "./db";
import { writeData } from "./jsonbin";
import { fetchQuote, isFinalizedTradingDate } from "./alphavantage";

interface AppState {
  holdings: StockHolding[];
  optionHoldings: OptionHolding[];
  tradeRecords: TradeRecord[];
  cash: CashReserve;
  baseCash: number;

  tradePlans: TradePlan[];

  journalEntries: JournalEntry[];

  snapshots: PortfolioSnapshot[];
  dailyReturns: { date: string; return: number }[];
  activeSnapshotIndex: number | null;

  loaded: boolean;
  isRefreshing: boolean;

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
  updateHistoricalPrices: (updates: { date: string; id: string; value: number; type?: "stock" | "option" }[]) => void;
  deleteSnapshot: (date: string) => void;
  setActiveSnapshot: (index: number | null) => void;

  setRefreshing: (refreshing: boolean) => void;

  fetchLatestQuotes: () => Promise<boolean>;

  syncToJsonBin: (keepalive?: boolean) => Promise<void>;
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
      nowPrice: 0,
      total: 0,
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
      nowPremium: 0,
      currentValue: 0,
      revenue: 0,
      revenuePercentage: 0,
    });
  }

  return holdings;
}

function calcOptionRevenue(options: OptionHolding[]): OptionHolding[] {
  return options.map((o) => {
    if (o.nowPremium === 0) {
      return { ...o, currentValue: 0, revenue: 0, revenuePercentage: 0 };
    }
    const currentValue = o.nowPremium * o.contracts * 100;
    const revenue = currentValue - o.totalCost;
    const revenuePercentage =
      o.totalCost > 0 ? parseFloat(((revenue / o.totalCost) * 100).toFixed(2)) : 0;
    return { ...o, currentValue, revenue, revenuePercentage };
  });
}

function calcRevenue(holdings: StockHolding[]): StockHolding[] {
  return holdings.map((h) => {
    if (h.nowPrice === 0) {
      return { ...h, total: 0, revenue: 0, revenuePercentage: 0 };
    }
    const total = h.nowPrice * h.number;
    const revenue = total - h.cost;
    const revenuePercentage =
      h.cost > 0 ? parseFloat(((revenue / h.cost) * 100).toFixed(2)) : 0;
    return { ...h, total, revenue, revenuePercentage };
  });
}

function findSourceStock(
  snapshots: PortfolioSnapshot[],
  currentHoldings: StockHolding[],
  targetDate: string,
  id: string,
): StockHolding | null {
  const fromCurrent = currentHoldings.find((h) => h.id === id);
  if (fromCurrent) return fromCurrent;
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const before = [...sorted].reverse().find((s) => s.date < targetDate && s.holdings.some((h) => h.id === id));
  if (before) return before.holdings.find((h) => h.id === id)!;
  const after = sorted.find((s) => s.date > targetDate && s.holdings.some((h) => h.id === id));
  if (after) return after.holdings.find((h) => h.id === id)!;
  return null;
}

function findSourceOption(
  snapshots: PortfolioSnapshot[],
  currentOptionHoldings: OptionHolding[],
  targetDate: string,
  id: string,
): OptionHolding | null {
  const fromCurrent = currentOptionHoldings.find((o) => o.id === id);
  if (fromCurrent) return fromCurrent;
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const before = [...sorted].reverse().find((s) => s.date < targetDate && s.optionHoldings.some((o) => o.id === id));
  if (before) return before.optionHoldings.find((o) => o.id === id)!;
  const after = sorted.find((s) => s.date > targetDate && s.optionHoldings.some((o) => o.id === id));
  if (after) return after.optionHoldings.find((o) => o.id === id)!;
  return null;
}

function buildSnapshotForDate(
  date: string,
  prices: Map<string, { value: number; type: "stock" | "option" }>,
  existing: PortfolioSnapshot[],
  currentHoldings: StockHolding[],
  currentOptionHoldings: OptionHolding[],
  cash: CashReserve,
): PortfolioSnapshot {
  const sorted = [...existing].sort((a, b) => a.date.localeCompare(b.date));
  const nearestBefore = [...sorted].reverse().find((s) => s.date < date);
  const ref = nearestBefore ?? sorted[sorted.length - 1];

  const holdings: StockHolding[] = [];
  const optionHoldings: OptionHolding[] = [];
  const seenStock = new Set<string>();
  const seenOption = new Set<string>();

  for (const [id, p] of prices) {
    if (p.type === "stock") {
      const src = findSourceStock(existing, currentHoldings, date, id);
      if (src) {
        holdings.push({
          ...src,
          nowPrice: p.value,
          total: p.value * src.number,
          revenue: p.value * src.number - src.cost,
          revenuePercentage: src.cost > 0
            ? parseFloat((((p.value * src.number - src.cost) / src.cost) * 100).toFixed(2))
            : 0,
        });
        seenStock.add(id);
      }
    } else {
      const src = findSourceOption(existing, currentOptionHoldings, date, id);
      if (src) {
        const currentValue = p.value * src.contracts * 100;
        optionHoldings.push({
          ...src,
          nowPremium: p.value,
          currentValue,
          revenue: currentValue - src.totalCost,
          revenuePercentage: src.totalCost > 0
            ? parseFloat((((currentValue - src.totalCost) / src.totalCost) * 100).toFixed(2))
            : 0,
        });
        seenOption.add(id);
      }
    }
  }

  if (ref) {
    for (const h of ref.holdings) {
      if (!seenStock.has(h.id)) holdings.push(h);
    }
    for (const o of ref.optionHoldings) {
      if (!seenOption.has(o.id)) optionHoldings.push(o);
    }
  }

  const totalValue = holdings.reduce((s, h) => s + h.total, 0) + optionHoldings.reduce((s, o) => s + o.currentValue, 0);
  const totalCost = holdings.reduce((s, h) => s + h.cost, 0) + optionHoldings.reduce((s, o) => s + o.totalCost, 0);
  const totalRevenue = holdings.reduce((s, h) => s + h.revenue, 0) + optionHoldings.reduce((s, o) => s + o.revenue, 0);

  return {
    timestamp: Date.now(),
    date,
    holdings,
    optionHoldings,
    cash,
    dailyReturn: totalCost > 0 ? parseFloat(((totalRevenue / totalCost) * 100).toFixed(2)) : 0,
  };
}

function recalcSnapshotDerived(snap: PortfolioSnapshot): PortfolioSnapshot {
  const totalValue = snap.holdings.reduce((s, h) => s + h.total, 0) + snap.optionHoldings.reduce((s, o) => s + o.currentValue, 0);
  const totalCost = snap.holdings.reduce((s, h) => s + h.cost, 0) + snap.optionHoldings.reduce((s, o) => s + o.totalCost, 0);
  const totalRevenue = snap.holdings.reduce((s, h) => s + h.revenue, 0) + snap.optionHoldings.reduce((s, o) => s + o.revenue, 0);
  return {
    ...snap,
    dailyReturn: totalCost > 0 ? parseFloat(((totalRevenue / totalCost) * 100).toFixed(2)) : 0,
    timestamp: Date.now(),
  };
}

function stockWithPrice(h: StockHolding, nowPrice: number): StockHolding {
  const total = nowPrice * h.number;
  const revenue = total - h.cost;
  return {
    ...h,
    nowPrice,
    total,
    revenue,
    revenuePercentage: h.cost > 0 ? parseFloat(((revenue / h.cost) * 100).toFixed(2)) : 0,
  };
}

function optionWithPremium(o: OptionHolding, nowPremium: number): OptionHolding {
  const currentValue = nowPremium * o.contracts * 100;
  const revenue = currentValue - o.totalCost;
  return {
    ...o,
    nowPremium,
    currentValue,
    revenue,
    revenuePercentage: o.totalCost > 0 ? parseFloat(((revenue / o.totalCost) * 100).toFixed(2)) : 0,
  };
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
  isRefreshing: false,

  initialize: async () => {
    const [records, plans, journals, snaps, storedDr, storedBaseCash, storedHoldings, storedOptionHoldings] = await Promise.all([
      getItem<TradeRecord[]>("tradeRecords"),
      getItem<TradePlan[]>("tradePlans"),
      getItem<JournalEntry[]>("journalEntries"),
      getItem<PortfolioSnapshot[]>("snapshots"),
      getItem<{ date: string; return: number }[]>("dailyReturns"),
      getItem<number>("baseCash"),
      getItem<StockHolding[]>("holdings"),
      getItem<OptionHolding[]>("optionHoldings"),
    ]);

    console.log("[initialize] raw data from IndexedDB:", {
      records: records?.length ?? 0,
      snaps: snaps?.length ?? 0,
      dailyReturns: storedDr?.length ?? 0,
      storedHoldings: storedHoldings?.length ?? 0,
      storedOptionHoldings: storedOptionHoldings?.length ?? 0,
    });

    const tradeRecords = records ?? [];
    const tradePlans: TradePlan[] = (plans ?? []).map((p: any) => {
      const plan = { ...p };
      plan.updatedAt = plan.updatedAt ?? plan.createdAt;
      plan.cancelled = plan.cancelled ?? false;
      plan.riskRewardWin = plan.riskRewardWin ?? plan.riskRewardRatio ?? 0;
      plan.riskRewardLose = plan.riskRewardLose ?? 1;
      // 迁移旧版 expectedPrice → 价格区间
      if (plan.expectedPriceMin == null || plan.expectedPriceMax == null) {
        plan.expectedPriceMin = plan.expectedPrice ?? 0;
        plan.expectedPriceMax = plan.expectedPrice ?? 0;
      }
      delete plan.expectedPrice;
      return plan;
    });
    const journalEntries = (journals ?? []).map((j) => {
      const old = j as JournalEntry & { targetType?: string };
      return { ...old, targetType: old.targetType ?? "STOCK" };
    });
    const rawSnapshots = snaps ?? [];
    const snapshots: PortfolioSnapshot[] = [...new Map(rawSnapshots.map((s) => [s.date, s])).values()]
      .map((s) => ({
        ...s,
        optionHoldings: (s as PortfolioSnapshot & { optionHoldings?: OptionHolding[] }).optionHoldings ?? [],
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const baseCash = storedBaseCash ?? 10000;

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

    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      console.log("[initialize] restoring nowPrice from latest snapshot", { snapshotDate: latest.date, holdings: latest.holdings.map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price })) });
      for (const h of holdings) {
        const snap = latest.holdings.find((s) => s.id === h.id);
        if (snap && snap.nowPrice > 0) {
          h.nowPrice = snap.nowPrice;
        }
      }
      console.log("[initialize] restoring nowPremium from latest snapshot", { snapshotDate: latest.date, options: latest.optionHoldings.map((o) => ({ id: o.id, nowPremium: o.nowPremium })) });
      for (const o of optionHoldings) {
        const snap = latest.optionHoldings.find((s) => s.id === o.id);
        if (snap && snap.nowPremium > 0) {
          o.nowPremium = snap.nowPremium;
        }
      }
    } else {
      console.log("[initialize] no snapshots — nowPrice/nowPremium stays at 0 (no data)");
    }

    console.log("[initialize] final holdings before set:", holdings.map((h) => ({ id: h.id, name: h.name, number: h.number, price: h.price, nowPrice: h.nowPrice, cost: h.cost, total: h.price * h.number, totalWithNowPrice: h.nowPrice * h.number, revenue: (h.nowPrice * h.number) - h.cost })));
    console.log("[initialize] final optionHoldings before set:", optionHoldings.map((o) => ({ id: o.id, nowPremium: o.nowPremium, totalCost: o.totalCost, currentValue: o.nowPremium * o.contracts * 100, revenue: (o.nowPremium * o.contracts * 100) - o.totalCost })));

    set({
      tradeRecords,
      tradePlans,
      journalEntries,
      snapshots,
      dailyReturns: storedDr ?? [],
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

    const oldHoldings = get().holdings;
    const rawHoldings = recalcHoldings(records);
    const restored = rawHoldings.map((h) => {
      const old = oldHoldings.find((o) => o.id === h.id);
      return old && old.nowPrice > 0 ? { ...h, nowPrice: old.nowPrice } : h;
    });
    const holdings = calcRevenue(restored);
    console.log("[addTradeRecord] nowPrice restored:", rawHoldings.map((h) => ({ id: h.id, price: h.price, nowPrice: (oldHoldings.find((o) => o.id === h.id)?.nowPrice ?? h.price) })));

    const oldOptionHoldings = get().optionHoldings;
    const rawOptions = recalcOptionHoldings(records);
    const restoredOptions = rawOptions.map((o) => {
      const old = oldOptionHoldings.find((p) => p.id === o.id);
      return old && old.nowPremium > 0 ? { ...o, nowPremium: old.nowPremium } : o;
    });
    const optionHoldings = calcOptionRevenue(restoredOptions);

    set({ tradeRecords: records, holdings, optionHoldings, cash });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
    get().syncToJsonBin();
  },

  removeTradeRecord: (tradeTime, id) => {
    const records = get().tradeRecords.filter(
      (r) => !(r.tradeTime === tradeTime && r.id === id)
    );
    const cashAdj = calcTradeCashAdjustment(records);
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + cashAdj };

    const oldHoldings = get().holdings;
    const rawHoldings = recalcHoldings(records);
    const restored = rawHoldings.map((h) => {
      const old = oldHoldings.find((o) => o.id === h.id);
      return old && old.nowPrice > 0 ? { ...h, nowPrice: old.nowPrice } : h;
    });
    const holdings = calcRevenue(restored);

    const oldOptionHoldings = get().optionHoldings;
    const rawOptions = recalcOptionHoldings(records);
    const restoredOptions = rawOptions.map((o) => {
      const old = oldOptionHoldings.find((p) => p.id === o.id);
      return old && old.nowPremium > 0 ? { ...o, nowPremium: old.nowPremium } : o;
    });
    const optionHoldings = calcOptionRevenue(restoredOptions);

    set({
      tradeRecords: records,
      holdings,
      optionHoldings,
      cash,
    });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
    get().syncToJsonBin();
  },

  updateTradeRecord: (oldTradeTime, oldId, record) => {
    const records = get().tradeRecords.map((r) =>
      r.tradeTime === oldTradeTime && r.id === oldId ? record : r
    );
    const cashAdj = calcTradeCashAdjustment(records);
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + cashAdj };

    const oldHoldings = get().holdings;
    const rawHoldings = recalcHoldings(records);
    const restored = rawHoldings.map((h) => {
      const old = oldHoldings.find((o) => o.id === h.id);
      return old && old.nowPrice > 0 ? { ...h, nowPrice: old.nowPrice } : h;
    });
    const holdings = calcRevenue(restored);

    const oldOptionHoldings = get().optionHoldings;
    const rawOptions = recalcOptionHoldings(records);
    const restoredOptions = rawOptions.map((o) => {
      const old = oldOptionHoldings.find((p) => p.id === o.id);
      return old && old.nowPremium > 0 ? { ...o, nowPremium: old.nowPremium } : o;
    });
    const optionHoldings = calcOptionRevenue(restoredOptions);

    set({ tradeRecords: records, holdings, optionHoldings, cash });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
    get().syncToJsonBin();
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

    const { snapshots } = get();
    if (snapshots.length > 0) {
      const idx = snapshots.length - 1;
      const latest = { ...snapshots[idx] };
      let changed = false;
      for (const u of updates) {
        const hIdx = latest.holdings.findIndex((h) => h.id === u.id);
        if (hIdx >= 0) {
          latest.holdings = [...latest.holdings];
          latest.holdings[hIdx] = stockWithPrice(latest.holdings[hIdx], u.nowPrice);
          changed = true;
        }
      }
      if (changed) {
        const updated = recalcSnapshotDerived(latest);
        const newSnapshots = [...snapshots];
        newSnapshots[idx] = updated;
        set({ snapshots: newSnapshots });
        setItem("snapshots", newSnapshots);
        markPendingSync("snapshots", newSnapshots);
      }
    }
    get().syncToJsonBin();
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

    const { snapshots } = get();
    if (snapshots.length > 0) {
      const idx = snapshots.length - 1;
      const latest = { ...snapshots[idx] };
      let changed = false;
      for (const u of updates) {
        const oIdx = latest.optionHoldings.findIndex((o) => o.id === u.id);
        if (oIdx >= 0) {
          latest.optionHoldings = [...latest.optionHoldings];
          latest.optionHoldings[oIdx] = optionWithPremium(latest.optionHoldings[oIdx], u.nowPremium);
          changed = true;
        }
      }
      if (changed) {
        const updated = recalcSnapshotDerived(latest);
        const newSnapshots = [...snapshots];
        newSnapshots[idx] = updated;
        set({ snapshots: newSnapshots });
        setItem("snapshots", newSnapshots);
        markPendingSync("snapshots", newSnapshots);
      }
    }
    get().syncToJsonBin();
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
  },

  updateCash: (total) => {
    const cashAdj = calcTradeCashAdjustment(get().tradeRecords);
    const baseCash = total - cashAdj;
    const cash: CashReserve = { id: "cash", name: "现金", total };
    set({ baseCash, cash });
    setItem("baseCash", baseCash);
    markPendingSync("baseCash", baseCash);
    get().syncToJsonBin();
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

    // 市场未收盘时跳过，无论当日快照是否存在都禁止提前生成/覆盖
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const day = et.getDay();
    const isWeekend = day === 0 || day === 6;
    const totalMinutes = et.getHours() * 60 + et.getMinutes();
    const afterClose = !isWeekend && totalMinutes >= 16 * 60;
    if (!afterClose) {
      console.log("[takeSnapshot] skipping - market not closed yet for", date);
      return;
    }

    const existingIdx = get().snapshots.findIndex((s) => s.date === date);

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

    const isNew = existingIdx < 0;
    const snapshots = (
      existingIdx >= 0
        ? get().snapshots.map((s, i) => (i === existingIdx ? snapshot : s))
        : [...get().snapshots, snapshot]
    ).sort((a, b) => a.date.localeCompare(b.date));
    set({ snapshots, activeSnapshotIndex: isNew ? null : get().activeSnapshotIndex });
    setItem("snapshots", snapshots);
    markPendingSync("snapshots", snapshots);
  },

  updateHistoricalPrices: (updates) => {
    const { snapshots: currentSnapshots, holdings: currentHoldings, optionHoldings: currentOptionHoldings, cash } = get();
    const snapshots = [...currentSnapshots];
    const newDatePrices = new Map<string, Map<string, { value: number; type: "stock" | "option" }>>();
    const affectedDates = new Set<string>();

    for (const u of updates) {
      affectedDates.add(u.date);
      const snapIdx = snapshots.findIndex((s) => s.date === u.date);

      if (snapIdx < 0) {
        let byDate = newDatePrices.get(u.date);
        if (!byDate) { byDate = new Map(); newDatePrices.set(u.date, byDate); }
        const isStock = u.type ? u.type === "stock"
          : currentHoldings.some((h) => h.id === u.id) || currentSnapshots.some((s) => s.holdings.some((h) => h.id === u.id));
        byDate.set(u.id, { value: u.value, type: isStock ? "stock" : "option" });
        continue;
      }

      const snap = snapshots[snapIdx];
      const hIdx = snap.holdings.findIndex((h) => h.id === u.id);
      if (hIdx >= 0) {
        const holdings = [...snap.holdings];
        holdings[hIdx] = stockWithPrice(holdings[hIdx], u.value);
        snapshots[snapIdx] = recalcSnapshotDerived({ ...snap, holdings });
        continue;
      }

      const oIdx = snap.optionHoldings.findIndex((o) => o.id === u.id);
      if (oIdx >= 0) {
        const optionHoldings = [...snap.optionHoldings];
        optionHoldings[oIdx] = optionWithPremium(optionHoldings[oIdx], u.value);
        snapshots[snapIdx] = recalcSnapshotDerived({ ...snap, optionHoldings });
        continue;
      }

      const srcStock = findSourceStock(currentSnapshots, currentHoldings, u.date, u.id);
      if (srcStock) {
        snapshots[snapIdx] = recalcSnapshotDerived({
          ...snap,
          holdings: [...snap.holdings, stockWithPrice(srcStock, u.value)],
        });
        continue;
      }

      const srcOption = findSourceOption(currentSnapshots, currentOptionHoldings, u.date, u.id);
      if (srcOption) {
        snapshots[snapIdx] = recalcSnapshotDerived({
          ...snap,
          optionHoldings: [...snap.optionHoldings, optionWithPremium(srcOption, u.value)],
        });
      }
    }

    for (const [date, prices] of newDatePrices) {
      snapshots.push(buildSnapshotForDate(date, prices, snapshots, currentHoldings, currentOptionHoldings, cash));
    }
    snapshots.sort((a, b) => a.date.localeCompare(b.date));

    set({ snapshots });
    setItem("snapshots", snapshots);
    markPendingSync("snapshots", snapshots);

    // 重算受影响的 dailyReturns
    const drs = [...get().dailyReturns];
    for (const date of affectedDates) {
      const snap = snapshots.find((s) => s.date === date);
      if (!snap) continue;
      const stockTotal = snap.holdings.reduce((s, h) => s + h.total, 0);
      const optionTotal = snap.optionHoldings.reduce((s, o) => s + o.currentValue, 0);
      const portfolioTotal = Math.round((stockTotal + optionTotal + (snap.cash?.total ?? 0)) * 100) / 100;
      const cumulativeReturn = Math.round((portfolioTotal - get().baseCash) * 100) / 100;
      const idx = drs.findIndex((d) => d.date === date);
      if (idx >= 0) {
        drs[idx] = { date, return: cumulativeReturn };
      } else {
        drs.push({ date, return: cumulativeReturn });
      }
    }
    drs.sort((a, b) => a.date.localeCompare(b.date));
    set({ dailyReturns: drs });
    setItem("dailyReturns", drs);
    markPendingSync("dailyReturns", drs);

    // 仅当最新快照被本次修改影响时，同步收盘价到当前持仓显示（不覆盖 number/cost）
    const sortedSnapshots = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sortedSnapshots[sortedSnapshots.length - 1];
    if (latest && affectedDates.has(latest.date)) {
      const currentHoldings = get().holdings.map((h) => {
        const snapH = latest.holdings.find((sh) => sh.id === h.id);
        return snapH ? { ...h, nowPrice: snapH.nowPrice, total: snapH.total, revenue: snapH.revenue, revenuePercentage: snapH.revenuePercentage } : h;
      });
      const currentOptionHoldings = get().optionHoldings.map((o) => {
        const snapO = latest.optionHoldings.find((so) => so.id === o.id);
        return snapO ? { ...o, nowPremium: snapO.nowPremium, currentValue: snapO.currentValue, revenue: snapO.revenue, revenuePercentage: snapO.revenuePercentage } : o;
      });
      set({ holdings: currentHoldings, optionHoldings: currentOptionHoldings });
      setItem("holdings", currentHoldings);
      markPendingSync("holdings", currentHoldings);
      setItem("optionHoldings", currentOptionHoldings);
      markPendingSync("optionHoldings", currentOptionHoldings);
    }
  },

  deleteSnapshot: (date) => {
    const { snapshots: oldSnapshots, dailyReturns: oldDailyReturns, holdings: oldHoldings, optionHoldings: oldOptionHoldings } = get();
    const snapshots = oldSnapshots.filter((s) => s.date !== date);
    const dailyReturns = oldDailyReturns.filter((d) => d.date !== date);
    const activeSnapshotIndex = get().activeSnapshotIndex;
    const newIndex = activeSnapshotIndex !== null && activeSnapshotIndex >= snapshots.length
      ? (snapshots.length > 0 ? snapshots.length - 1 : null)
      : activeSnapshotIndex;
    set({ snapshots, dailyReturns, activeSnapshotIndex: newIndex });
    setItem("snapshots", snapshots);
    markPendingSync("snapshots", snapshots);
    setItem("dailyReturns", dailyReturns);
    markPendingSync("dailyReturns", dailyReturns);

    const wasLatest = oldSnapshots.length > 0 && oldSnapshots[oldSnapshots.length - 1].date === date;
    if (wasLatest && snapshots.length > 0) {
      const newLatest = snapshots[snapshots.length - 1];
      const holdings = oldHoldings.map((h) => {
        const snapH = newLatest.holdings.find((sh) => sh.id === h.id);
        return snapH ? { ...h, nowPrice: snapH.nowPrice, total: snapH.total, revenue: snapH.revenue, revenuePercentage: snapH.revenuePercentage } : h;
      });
      const optionHoldings = oldOptionHoldings.map((o) => {
        const snapO = newLatest.optionHoldings.find((so) => so.id === o.id);
        return snapO ? { ...o, nowPremium: snapO.nowPremium, currentValue: snapO.currentValue, revenue: snapO.revenue, revenuePercentage: snapO.revenuePercentage } : o;
      });
      set({ holdings, optionHoldings });
      setItem("holdings", holdings);
      markPendingSync("holdings", holdings);
      setItem("optionHoldings", optionHoldings);
      markPendingSync("optionHoldings", optionHoldings);
    } else if (snapshots.length === 0) {
      const h0 = calcRevenue(oldHoldings.map((h) => ({ ...h, nowPrice: 0 })));
      const o0 = calcOptionRevenue(oldOptionHoldings.map((o) => ({ ...o, nowPremium: 0 })));
      set({ holdings: h0, optionHoldings: o0 });
      setItem("holdings", h0);
      markPendingSync("holdings", h0);
      setItem("optionHoldings", o0);
      markPendingSync("optionHoldings", o0);
    }

    get().syncToJsonBin();
  },

  setActiveSnapshot: (index) => {
    set({ activeSnapshotIndex: index });
  },

  setRefreshing: (refreshing) => {
    set({ isRefreshing: refreshing });
  },

  // 从 Alpha Vantage 拉取各股票最新收盘价，按接口返回的「latest trading day」标注日期，
  // 仅采纳已定型（收盘后/历史）的报价，避免把盘中实时价写入快照。
  // 返回是否实际写入了更新，便于调用方决定是否记录节流标记。
  fetchLatestQuotes: async () => {
    const stocks = get().holdings;
    if (stocks.length === 0) return false;

    const updates: { date: string; id: string; value: number; type: "stock" }[] = [];
    for (const h of stocks) {
      const quote = await fetchQuote(h.id);
      if (
        quote &&
        quote.price > 0 &&
        quote.latestTradingDay &&
        isFinalizedTradingDate(quote.latestTradingDay)
      ) {
        updates.push({ date: quote.latestTradingDay, id: h.id, value: quote.price, type: "stock" });
      }
      // 尊重免费档突发限制（约 1 次/秒）
      await new Promise((r) => setTimeout(r, 1200));
    }

    if (updates.length === 0) return false;
    get().updateHistoricalPrices(updates);
    await get().syncToJsonBin();
    return true;
  },

  syncToJsonBin: async (keepalive = false) => {
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
    const ok = await writeData(data, keepalive);
    if (ok && !keepalive) {
      await clearAllPendingSyncs();
    }
    return;
  },
}));
