import { create } from "zustand";
import type {
  StockHolding,
  OptionHolding,
  TradeRecord,
  CashReserve,
  JournalEntry,
  PortfolioSnapshot,
  TradePlan,
  DeletedTradeRef,
} from "@/types";
import { getItem, setItem, markPendingSync, clearAllPendingSyncs } from "./db";
import { writeData, readData } from "./jsonbin";
import { fetchQuote, isFinalizedTradingDate } from "./alphavantage";

// 生成跨设备唯一的交易 uid。
function newUid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// 为缺少 uid 的历史交易补齐稳定 uid（基于内容 + 出现次序，保证各设备迁移结果一致）。
export function normalizeTradeRecords(records: TradeRecord[]): TradeRecord[] {
  const counts = new Map<string, number>();
  return records.map((r) => {
    const updatedAt = r.updatedAt ?? r.tradeTime ?? 0;
    if (r.uid) return { ...r, updatedAt };
    const sig = `${r.id}|${r.assetType ?? "STOCK"}|${r.tradeTime}|${r.number}|${r.price}|${r.cost}`;
    const n = counts.get(sig) ?? 0;
    counts.set(sig, n + 1);
    return { ...r, uid: `mig-${sig}-${n}`, updatedAt };
  });
}

export function mergeTombstones(a: DeletedTradeRef[], b: DeletedTradeRef[]): DeletedTradeRef[] {
  const map = new Map<string, number>();
  for (const t of [...a, ...b]) {
    map.set(t.uid, Math.max(map.get(t.uid) ?? 0, t.deletedAt));
  }
  return [...map.entries()].map(([uid, deletedAt]) => ({ uid, deletedAt }));
}

// 按 uid 合并两侧交易记录：同一 uid 取 updatedAt 较大者；再剔除被墓碑删除的记录
// （仅当墓碑时间不早于记录更新时间，从而支持「删除后重新添加」）。结果按时间排序。
export function mergeTradeRecords(
  a: TradeRecord[],
  b: TradeRecord[],
  tombstones: DeletedTradeRef[]
): TradeRecord[] {
  const map = new Map<string, TradeRecord>();
  for (const r of [...a, ...b]) {
    const ex = map.get(r.uid);
    if (!ex || (r.updatedAt ?? 0) >= (ex.updatedAt ?? 0)) map.set(r.uid, r);
  }
  const tmap = new Map<string, number>();
  for (const t of tombstones) tmap.set(t.uid, Math.max(tmap.get(t.uid) ?? 0, t.deletedAt));
  const out: TradeRecord[] = [];
  for (const r of map.values()) {
    const d = tmap.get(r.uid);
    if (d != null && d >= (r.updatedAt ?? 0)) continue;
    out.push(r);
  }
  out.sort((x, y) => x.tradeTime - y.tradeTime || (x.updatedAt ?? 0) - (y.updatedAt ?? 0));
  return out;
}

// 按日期合并快照，冲突时取 timestamp 较新者，避免过期客户端覆盖更新数据。
export function mergeSnapshots(a: PortfolioSnapshot[], b: PortfolioSnapshot[]): PortfolioSnapshot[] {
  const map = new Map<string, PortfolioSnapshot>();
  for (const s of [...a, ...b]) {
    const ex = map.get(s.date);
    if (!ex || (s.timestamp ?? 0) >= (ex.timestamp ?? 0)) map.set(s.date, s);
  }
  return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
}

// 按 id 合并（计划/日志），冲突时取 updatedAt 较大者（无 updatedAt 时以 b 为准）。
export function mergeById<T extends { id: string; updatedAt?: number }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  for (const x of a) map.set(x.id, x);
  for (const x of b) {
    const ex = map.get(x.id);
    if (!ex || (x.updatedAt ?? 1) >= (ex.updatedAt ?? 0)) map.set(x.id, x);
  }
  return [...map.values()];
}

// 应用墓碑：剔除被删除且删除时间不早于自身更新时间的条目（支持删后重建）。
export function applyTombstones<T>(
  items: T[],
  keyOf: (t: T) => string,
  tsOf: (t: T) => number,
  tombstones: DeletedTradeRef[]
): T[] {
  const tmap = new Map<string, number>();
  for (const t of tombstones) tmap.set(t.uid, Math.max(tmap.get(t.uid) ?? 0, t.deletedAt));
  return items.filter((it) => {
    const d = tmap.get(keyOf(it));
    return !(d != null && d >= tsOf(it));
  });
}

// 看盘日志的 id 是「股票代码」而非唯一键，不能按 id 去重（会把同一股票的多条日志合并成一条）。
// 这里按「股票代码 + 时间 + 内容」联合去重，保留所有不同的日志。
export function mergeJournalEntries(a: JournalEntry[], b: JournalEntry[]): JournalEntry[] {
  const map = new Map<string, JournalEntry>();
  for (const e of [...a, ...b]) map.set(`${e.id}|${e.time}|${e.content}`, e);
  return [...map.values()].sort((x, y) => x.time - y.time);
}

type DailyReturn = { date: string; return: number };
function mergeDailyReturns(a: DailyReturn[], b: DailyReturn[]): DailyReturn[] {
  const map = new Map<string, DailyReturn>();
  for (const d of a) map.set(d.date, d);
  for (const d of b) map.set(d.date, d); // 本地优先
  return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
}

interface SyncDoc {
  tradeRecords: TradeRecord[];
  tradePlans: TradePlan[];
  journalEntries: JournalEntry[];
  snapshots: PortfolioSnapshot[];
  dailyReturns: DailyReturn[];
  deletedTradeUids: DeletedTradeRef[];
  deletedSnapshotDates: DeletedTradeRef[];
  deletedPlanIds: DeletedTradeRef[];
  baseCash: number;
  baseCashUpdatedAt: number;
  holdings: StockHolding[];
  optionHoldings: OptionHolding[];
  updatedAt?: number;
}

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
  deletedTradeUids: DeletedTradeRef[];
  deletedSnapshotDates: DeletedTradeRef[];
  deletedPlanIds: DeletedTradeRef[];
  baseCashUpdatedAt: number;
  activeSnapshotIndex: number | null;

  loaded: boolean;
  isRefreshing: boolean;

  initialize: () => Promise<void>;

  addTradeRecord: (record: TradeRecord) => void;
  removeTradeRecord: (uid: string) => void;
  updateTradeRecord: (uid: string, record: TradeRecord) => void;

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

function sortChronologically(records: TradeRecord[]): TradeRecord[] {
  return [...records].sort(
    (a, b) => a.tradeTime - b.tradeTime || (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
  );
}

function recalcHoldings(
  records: TradeRecord[]
): StockHolding[] {
  const stockRecords = sortChronologically(records.filter((r) => !r.assetType || r.assetType === "STOCK"));
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
  const optionRecords = sortChronologically(records.filter((r) => r.assetType === "OPTION"));
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

// 从交易记录派生当前持仓（含成本/数量），并恢复 nowPrice/nowPremium：
// 优先取最新快照的收盘价，其次沿用内存中已有的现价，确保「持仓 ⇄ 交易记录」始终一致。
function deriveHoldings(
  tradeRecords: TradeRecord[],
  snapshots: PortfolioSnapshot[],
  prevHoldings: StockHolding[] = [],
  prevOptionHoldings: OptionHolding[] = []
): { holdings: StockHolding[]; optionHoldings: OptionHolding[] } {
  const rawHoldings = recalcHoldings(tradeRecords);
  const rawOptions = recalcOptionHoldings(tradeRecords);
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];

  for (const h of rawHoldings) {
    const snapH = latest?.holdings.find((s) => s.id === h.id);
    if (snapH && snapH.nowPrice > 0) {
      h.nowPrice = snapH.nowPrice;
    } else {
      const prev = prevHoldings.find((o) => o.id === h.id);
      if (prev && prev.nowPrice > 0) h.nowPrice = prev.nowPrice;
    }
  }
  for (const o of rawOptions) {
    const snapO = latest?.optionHoldings.find((s) => s.id === o.id);
    if (snapO && snapO.nowPremium > 0) {
      o.nowPremium = snapO.nowPremium;
    } else {
      const prev = prevOptionHoldings.find((p) => p.id === o.id);
      if (prev && prev.nowPremium > 0) o.nowPremium = prev.nowPremium;
    }
  }
  return { holdings: calcRevenue(rawHoldings), optionHoldings: calcOptionRevenue(rawOptions) };
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
  deletedTradeUids: [],
  deletedSnapshotDates: [],
  deletedPlanIds: [],
  baseCashUpdatedAt: 0,
  activeSnapshotIndex: null,
  loaded: false,
  isRefreshing: false,

  initialize: async () => {
    const [records, plans, journals, snaps, storedDr, storedBaseCash, storedHoldings, storedOptionHoldings, storedTombstones, storedBaseCashUpdatedAt, storedSnapTombs, storedPlanTombs] = await Promise.all([
      getItem<TradeRecord[]>("tradeRecords"),
      getItem<TradePlan[]>("tradePlans"),
      getItem<JournalEntry[]>("journalEntries"),
      getItem<PortfolioSnapshot[]>("snapshots"),
      getItem<{ date: string; return: number }[]>("dailyReturns"),
      getItem<number>("baseCash"),
      getItem<StockHolding[]>("holdings"),
      getItem<OptionHolding[]>("optionHoldings"),
      getItem<DeletedTradeRef[]>("deletedTradeUids"),
      getItem<number>("baseCashUpdatedAt"),
      getItem<DeletedTradeRef[]>("deletedSnapshotDates"),
      getItem<DeletedTradeRef[]>("deletedPlanIds"),
    ]);

    console.log("[initialize] raw data from IndexedDB:", {
      records: records?.length ?? 0,
      snaps: snaps?.length ?? 0,
      dailyReturns: storedDr?.length ?? 0,
      storedHoldings: storedHoldings?.length ?? 0,
      storedOptionHoldings: storedOptionHoldings?.length ?? 0,
    });

    const deletedTradeUids = storedTombstones ?? [];
    const deletedSnapshotDates = storedSnapTombs ?? [];
    const deletedPlanIds = storedPlanTombs ?? [];
    const tradeRecords = mergeTradeRecords(normalizeTradeRecords(records ?? []), [], deletedTradeUids);
    const tradePlans: TradePlan[] = applyTombstones(
      (plans ?? []).map((p: any) => {
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
      }),
      (p) => p.id,
      (p) => p.updatedAt ?? 0,
      deletedPlanIds
    );
    const journalEntries = (journals ?? []).map((j) => {
      const old = j as JournalEntry & { targetType?: string };
      return { ...old, targetType: old.targetType ?? "STOCK" };
    });
    const rawSnapshots = snaps ?? [];
    const snapshots: PortfolioSnapshot[] = applyTombstones(
      [...new Map(rawSnapshots.map((s) => [s.date, s])).values()]
        .map((s) => ({
          ...s,
          optionHoldings: (s as PortfolioSnapshot & { optionHoldings?: OptionHolding[] }).optionHoldings ?? [],
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      (s) => s.date,
      (s) => s.timestamp ?? 0,
      deletedSnapshotDates
    );
    const baseCash = storedBaseCash ?? 10000;

    const { holdings, optionHoldings } = deriveHoldings(tradeRecords, snapshots);

    console.log("[initialize] recalc result:", {
      stockHoldings: holdings.length,
      optionHoldings: optionHoldings.length,
      holdingIds: holdings.map((h) => h.id),
      snapshotDates: snapshots.map((s) => s.date),
    });
    const cashAdj = calcTradeCashAdjustment(tradeRecords);
    const cash: CashReserve = { id: "cash", name: "现金", total: baseCash + cashAdj };

    set({
      tradeRecords,
      tradePlans,
      journalEntries,
      snapshots,
      dailyReturns: storedDr ?? [],
      deletedTradeUids,
      deletedSnapshotDates,
      deletedPlanIds,
      baseCashUpdatedAt: storedBaseCashUpdatedAt ?? 0,
      baseCash,
      holdings,
      optionHoldings,
      cash,
      loaded: true,
    });
  },

  addTradeRecord: (record) => {
    const rec: TradeRecord = { ...record, uid: record.uid || newUid(), updatedAt: Date.now() };
    const records = [...get().tradeRecords, rec];
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + calcTradeCashAdjustment(records) };
    const { holdings, optionHoldings } = deriveHoldings(records, get().snapshots, get().holdings, get().optionHoldings);

    set({ tradeRecords: records, holdings, optionHoldings, cash });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
    get().syncToJsonBin();
  },

  removeTradeRecord: (uid) => {
    const records = get().tradeRecords.filter((r) => r.uid !== uid);
    const deletedTradeUids = mergeTombstones(get().deletedTradeUids, [{ uid, deletedAt: Date.now() }]);
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + calcTradeCashAdjustment(records) };
    const { holdings, optionHoldings } = deriveHoldings(records, get().snapshots, get().holdings, get().optionHoldings);

    set({ tradeRecords: records, deletedTradeUids, holdings, optionHoldings, cash });
    setItem("tradeRecords", records);
    setItem("deletedTradeUids", deletedTradeUids);
    markPendingSync("tradeRecords", records);
    markPendingSync("deletedTradeUids", deletedTradeUids);
    get().takeSnapshot();
    get().syncToJsonBin();
  },

  updateTradeRecord: (uid, record) => {
    const records = get().tradeRecords.map((r) =>
      r.uid === uid ? { ...record, uid, updatedAt: Date.now() } : r
    );
    const cash = { id: "cash" as const, name: "现金" as const, total: get().baseCash + calcTradeCashAdjustment(records) };
    const { holdings, optionHoldings } = deriveHoldings(records, get().snapshots, get().holdings, get().optionHoldings);

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
    const baseCashUpdatedAt = Date.now();
    const cash: CashReserve = { id: "cash", name: "现金", total };
    set({ baseCash, baseCashUpdatedAt, cash });
    setItem("baseCash", baseCash);
    setItem("baseCashUpdatedAt", baseCashUpdatedAt);
    markPendingSync("baseCash", baseCash);
    get().syncToJsonBin();
  },

  addTradePlan: (plan) => {
    const plans = [...get().tradePlans, { ...plan, updatedAt: Date.now() }];
    set({ tradePlans: plans });
    setItem("tradePlans", plans);
    markPendingSync("tradePlans", plans);
    get().syncToJsonBin();
  },

  updateTradePlan: (id, plan) => {
    const plans = get().tradePlans.map((p) =>
      p.id === id ? { ...p, ...plan, updatedAt: Date.now() } : p
    );
    set({ tradePlans: plans });
    setItem("tradePlans", plans);
    markPendingSync("tradePlans", plans);
    get().syncToJsonBin();
  },

  removeTradePlan: (id) => {
    const plans = get().tradePlans.filter((p) => p.id !== id);
    const deletedPlanIds = mergeTombstones(get().deletedPlanIds, [{ uid: id, deletedAt: Date.now() }]);
    set({ tradePlans: plans, deletedPlanIds });
    setItem("tradePlans", plans);
    setItem("deletedPlanIds", deletedPlanIds);
    markPendingSync("tradePlans", plans);
    markPendingSync("deletedPlanIds", deletedPlanIds);
    get().syncToJsonBin();
  },

  addJournalEntry: (entry) => {
    const entries = [...get().journalEntries, entry];
    set({ journalEntries: entries });
    setItem("journalEntries", entries);
    markPendingSync("journalEntries", entries);
    get().syncToJsonBin();
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
    const deletedSnapshotDates = mergeTombstones(get().deletedSnapshotDates, [{ uid: date, deletedAt: Date.now() }]);
    const activeSnapshotIndex = get().activeSnapshotIndex;
    const newIndex = activeSnapshotIndex !== null && activeSnapshotIndex >= snapshots.length
      ? (snapshots.length > 0 ? snapshots.length - 1 : null)
      : activeSnapshotIndex;
    set({ snapshots, dailyReturns, deletedSnapshotDates, activeSnapshotIndex: newIndex });
    setItem("snapshots", snapshots);
    markPendingSync("snapshots", snapshots);
    setItem("dailyReturns", dailyReturns);
    markPendingSync("dailyReturns", dailyReturns);
    setItem("deletedSnapshotDates", deletedSnapshotDates);
    markPendingSync("deletedSnapshotDates", deletedSnapshotDates);

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
    const s = get();

    // 卸载场景：尽力直接写当前状态，不做读改写/状态回灌。
    if (keepalive) {
      const doc: SyncDoc = {
        tradeRecords: s.tradeRecords,
        tradePlans: s.tradePlans,
        journalEntries: s.journalEntries,
        snapshots: s.snapshots,
        dailyReturns: s.dailyReturns,
        deletedTradeUids: s.deletedTradeUids,
        deletedSnapshotDates: s.deletedSnapshotDates,
        deletedPlanIds: s.deletedPlanIds,
        baseCash: s.baseCash,
        baseCashUpdatedAt: s.baseCashUpdatedAt,
        holdings: s.holdings,
        optionHoldings: s.optionHoldings,
        updatedAt: Date.now(),
      };
      await writeData(doc, true);
      return;
    }

    // 读-改-写：先取远端，按 uid / 日期合并，避免过期端覆盖其它设备的改动。
    let remote: SyncDoc | null = null;
    try {
      remote = await readData<SyncDoc>();
    } catch {
      remote = null;
    }

    const tombstones = remote
      ? mergeTombstones(remote.deletedTradeUids ?? [], s.deletedTradeUids)
      : s.deletedTradeUids;
    const snapTombs = remote
      ? mergeTombstones(remote.deletedSnapshotDates ?? [], s.deletedSnapshotDates)
      : s.deletedSnapshotDates;
    const planTombs = remote
      ? mergeTombstones(remote.deletedPlanIds ?? [], s.deletedPlanIds)
      : s.deletedPlanIds;
    const tradeRecords = remote
      ? mergeTradeRecords(normalizeTradeRecords(remote.tradeRecords ?? []), s.tradeRecords, tombstones)
      : s.tradeRecords;
    const snapshots = remote
      ? applyTombstones(mergeSnapshots(remote.snapshots ?? [], s.snapshots), (x) => x.date, (x) => x.timestamp ?? 0, snapTombs)
      : s.snapshots;
    const tradePlans = remote
      ? applyTombstones(mergeById(remote.tradePlans ?? [], s.tradePlans), (x) => x.id, (x) => x.updatedAt ?? 0, planTombs)
      : s.tradePlans;
    const journalEntries = remote ? mergeJournalEntries(remote.journalEntries ?? [], s.journalEntries) : s.journalEntries;
    const dailyReturns = remote ? mergeDailyReturns(remote.dailyReturns ?? [], s.dailyReturns) : s.dailyReturns;
    const remoteBaseAt = remote?.baseCashUpdatedAt ?? 0;
    const baseCash = remoteBaseAt > s.baseCashUpdatedAt ? (remote!.baseCash ?? s.baseCash) : s.baseCash;
    const baseCashUpdatedAt = Math.max(remoteBaseAt, s.baseCashUpdatedAt);

    const { holdings, optionHoldings } = deriveHoldings(tradeRecords, snapshots, s.holdings, s.optionHoldings);
    const cash: CashReserve = {
      id: "cash",
      name: "现金",
      total: baseCash + calcTradeCashAdjustment(tradeRecords),
    };

    const doc: SyncDoc = {
      tradeRecords,
      tradePlans,
      journalEntries,
      snapshots,
      dailyReturns,
      deletedTradeUids: tombstones,
      deletedSnapshotDates: snapTombs,
      deletedPlanIds: planTombs,
      baseCash,
      baseCashUpdatedAt,
      holdings,
      optionHoldings,
      updatedAt: Date.now(),
    };

    // 带退避重试的写入，避免单次网络抖动导致改动丢失。
    let ok = false;
    for (let i = 0; i < 4; i++) {
      ok = await writeData(doc, false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
    if (ok) await clearAllPendingSyncs();

    // 回灌合并结果，保证本设备与云端一致。
    set({
      tradeRecords,
      tradePlans,
      journalEntries,
      snapshots,
      dailyReturns,
      deletedTradeUids: tombstones,
      deletedSnapshotDates: snapTombs,
      deletedPlanIds: planTombs,
      baseCash,
      baseCashUpdatedAt,
      holdings,
      optionHoldings,
      cash,
    });
    setItem("tradeRecords", tradeRecords);
    setItem("tradePlans", tradePlans);
    setItem("journalEntries", journalEntries);
    setItem("snapshots", snapshots);
    setItem("dailyReturns", dailyReturns);
    setItem("deletedTradeUids", tombstones);
    setItem("deletedSnapshotDates", snapTombs);
    setItem("deletedPlanIds", planTombs);
    setItem("baseCash", baseCash);
    setItem("baseCashUpdatedAt", baseCashUpdatedAt);
  },
}));
