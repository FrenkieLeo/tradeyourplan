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
  setActiveSnapshot: (index: number | null) => void;

  setRefreshing: (refreshing: boolean) => void;

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
  isRefreshing: false,

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

    const rawReturns = returns ?? [];
    const dedupedMap = new Map<string, { date: string; return: number }>();
    for (const d of rawReturns) {
      dedupedMap.set(d.date, d);
    }
    const dailyReturns = [...dedupedMap.values()].sort((a, b) => a.date.localeCompare(b.date));

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
      console.log("[initialize] restoring nowPrice from storedHoldings", storedHoldings.map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price, total: h.total })));
      for (const h of holdings) {
        const stored = storedHoldings.find((s) => s.id === h.id);
        if (stored && stored.nowPrice > 0) {
          h.nowPrice = stored.nowPrice;
        }
      }
    } else if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      console.log("[initialize] storedHoldings empty, restoring nowPrice from latest snapshot", { snapshotDate: latest.date, holdings: latest.holdings.map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price })) });
      for (const h of holdings) {
        const snap = latest.holdings.find((s) => s.id === h.id);
        if (snap && snap.nowPrice > 0) {
          h.nowPrice = snap.nowPrice;
        }
      }
    } else {
      console.log("[initialize] no storedHoldings AND no snapshots — nowPrice stays at cost basis");
    }

    if (storedOptionHoldings && storedOptionHoldings.length > 0) {
      console.log("[initialize] restoring nowPremium from storedOptionHoldings", storedOptionHoldings.map((o) => ({ id: o.id, nowPremium: o.nowPremium })));
      for (const o of optionHoldings) {
        const stored = storedOptionHoldings.find((s) => s.id === o.id);
        if (stored && stored.nowPremium > 0) {
          o.nowPremium = stored.nowPremium;
        }
      }
    } else if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1];
      console.log("[initialize] storedOptionHoldings empty, restoring nowPremium from latest snapshot", { snapshotDate: latest.date, options: latest.optionHoldings.map((o) => ({ id: o.id, nowPremium: o.nowPremium })) });
      for (const o of optionHoldings) {
        const snap = latest.optionHoldings.find((s) => s.id === o.id);
        if (snap && snap.nowPremium > 0) {
          o.nowPremium = snap.nowPremium;
        }
      }
    } else {
      console.log("[initialize] no storedOptionHoldings AND no snapshots — nowPremium stays at cost");
    }

    console.log("[initialize] final holdings before set:", holdings.map((h) => ({ id: h.id, name: h.name, number: h.number, price: h.price, nowPrice: h.nowPrice, cost: h.cost, total: h.price * h.number, totalWithNowPrice: h.nowPrice * h.number, revenue: (h.nowPrice * h.number) - h.cost })));
    console.log("[initialize] final optionHoldings before set:", optionHoldings.map((o) => ({ id: o.id, nowPremium: o.nowPremium, totalCost: o.totalCost, currentValue: o.nowPremium * o.contracts * 100, revenue: (o.nowPremium * o.contracts * 100) - o.totalCost })));

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

    // 如果是全新的日期且市场未收盘，跳过快照创建（防止未开市时提前生成当日快照）
    const existingIdx = get().snapshots.findIndex((s) => s.date === date);
    if (existingIdx < 0) {
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
    }

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

    const dailyReturns = [
      ...get().dailyReturns.filter((d) => d.date !== date),
      { date, return: totalRevenue },
    ].sort((a, b) => a.date.localeCompare(b.date));
    set({ dailyReturns });
    setItem("dailyReturns", dailyReturns);
    markPendingSync("dailyReturns", dailyReturns);
  },

  setActiveSnapshot: (index) => {
    set({ activeSnapshotIndex: index });
  },

  setRefreshing: (refreshing) => {
    set({ isRefreshing: refreshing });
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
