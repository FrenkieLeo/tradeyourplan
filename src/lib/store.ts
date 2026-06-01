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
  stockHoldings: StockHolding[];
  optionHoldings: OptionHolding[];
  tradeRecords: TradeRecord[];
  cash: CashReserve;

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

  updateStockPrices: (updates: { id: string; nowPrice: number }[]) => void;
  updateOptionPrices: (updates: { id: string; nowPrice: number }[]) => void;

  updateCash: (total: number) => void;

  addTradePlan: (plan: TradePlan) => void;
  updateTradePlan: (id: string, plan: Partial<TradePlan>) => void;
  removeTradePlan: (id: string) => void;

  addJournalEntry: (entry: JournalEntry) => void;

  takeSnapshot: () => void;
  setActiveSnapshot: (index: number | null) => void;

  syncToJsonBin: () => Promise<void>;
}

// ─── 归一化 ─────────────────────────────────────────────────────

function normalizeTradeRecord(r: TradeRecord): TradeRecord {
  const assetType = r.assetType ?? 'STOCK';
  const multiplier = r.multiplier ?? 1;
  let tradeType = r.tradeType;
  if (!tradeType) {
    tradeType = r.number > 0 ? 'BUY' : 'SELL';
  }
  let totalCashImpact = r.totalCashImpact;
  if (totalCashImpact == null) {
    totalCashImpact = -r.number * r.price;
  }
  return { ...r, assetType, multiplier, tradeType, totalCashImpact };
}

// ─── 现金调整（所有记录的 totalCashImpact 累加） ─────────────────

function calcTradeCashAdjustment(records: TradeRecord[]): number {
  return records.reduce((sum, r) => sum + (r.totalCashImpact ?? 0), 0);
}

// ─── 个股持仓重算 ──────────────────────────────────────────────

function recalcStockHoldings(records: TradeRecord[]): StockHolding[] {
  const stockRecords = records.filter(
    (r) => r.assetType === 'STOCK' && (r.tradeType === 'BUY' || r.tradeType === 'SELL')
  );

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

function calcRevenue(holdings: StockHolding[]): StockHolding[] {
  return holdings.map((h) => {
    const total = h.nowPrice * h.number;
    const revenue = total - h.cost;
    const revenuePercentage =
      h.cost > 0 ? parseFloat(((revenue / h.cost) * 100).toFixed(2)) : 0;
    return { ...h, total, revenue, revenuePercentage };
  });
}

// ─── 期权持仓重算 ──────────────────────────────────────────────

function recalcOptionHoldings(records: TradeRecord[]): OptionHolding[] {
  // 仅处理期权开/平仓流水，生命周期事件（EXERCISE/ASSIGNED/EXPIRE_ZERO）不视为持仓
  const optionRecords = records.filter(
    (r) => r.assetType === 'OPTION' && (r.tradeType === 'BUY' || r.tradeType === 'SELL')
  );

  // 解析 OSI 代码的辅助函数（格式示例: NVDA260619C00130000）
  function parseOsiId(osId: string, name: string) {
    // 从 OSI 提取 underlyingCode、到期日、C/P、行权价
    // 格式: UNDERLYING + YYMMDD + C/P + STRIKE(8位)
    const upper = osId.toUpperCase();
    const match = upper.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
    if (match) {
      const underlyingCode = match[1];
      const yy = match[2], mm = match[3], dd = match[4];
      const expiryDate = `20${yy}-${mm}-${dd}`;
      const optionType = match[5] as 'CALL' | 'PUT';
      const strikePrice = parseInt(match[6], 10) / 1000;
      return { underlyingCode, expiryDate, optionType, strikePrice };
    }
    // 容错：使用 name 里的标的代码
    return { underlyingCode: name, expiryDate: '0000-00-00', optionType: 'CALL' as 'CALL' | 'PUT', strikePrice: 0 };
  }

  const optionMap = new Map<
    string,
    {
      name: string;
      underlyingCode: string;
      expiryDate: string;
      strikePrice: number;
      optionType: 'CALL' | 'PUT';
      positionType: 'LONG' | 'SHORT';
      totalNumber: number;     // 持仓张数（正数）
      totalCost: number;       // 平均建仓权利金单价
      costBasis: number;       // 总权利金成本 = totalNumber * totalCost * 100
    }
  >();

  for (const r of optionRecords) {
    if (!optionMap.has(r.id)) {
      const parsed = parseOsiId(r.id, r.name);
      optionMap.set(r.id, {
        name: r.name,
        underlyingCode: parsed.underlyingCode,
        expiryDate: parsed.expiryDate,
        strikePrice: parsed.strikePrice,
        optionType: parsed.optionType,
        positionType: 'LONG', // 以下根据首笔交易推导
        totalNumber: 0,
        totalCost: 0,
        costBasis: 0,
      });
    }
    const entry = optionMap.get(r.id)!;

    if (r.tradeType === 'BUY' && r.number > 0) {
      // 开/加仓 LONG
      entry.positionType = 'LONG';
      const newNumber = entry.totalNumber + r.number;
      entry.totalCost =
        newNumber > 0
          ? (entry.totalCost * entry.totalNumber + r.price * r.number) / newNumber
          : 0;
      entry.totalNumber = newNumber;
      entry.costBasis = entry.totalNumber * entry.totalCost * 100;
    } else if (r.tradeType === 'SELL' && r.number < 0) {
      // 开/加仓 SHORT
      entry.positionType = 'SHORT';
      const absNum = Math.abs(r.number);
      const newNumber = entry.totalNumber + absNum;
      entry.totalCost =
        newNumber > 0
          ? (entry.totalCost * entry.totalNumber + r.price * absNum) / newNumber
          : 0;
      entry.totalNumber = newNumber;
      entry.costBasis = entry.totalNumber * entry.totalCost * 100;
    } else if (r.tradeType === 'SELL' && r.number > 0) {
      // 减/平 LONG
      if (entry.totalNumber > 0) {
        const remaining = entry.totalNumber - r.number;
        if (remaining <= 0) {
          entry.totalNumber = 0;
          entry.totalCost = 0;
          entry.costBasis = 0;
        } else {
          entry.totalNumber = remaining;
          entry.costBasis = remaining * entry.totalCost * 100;
        }
      }
    } else if (r.tradeType === 'BUY' && r.number < 0) {
      // 减/平 SHORT
      const absNum = Math.abs(r.number);
      if (entry.totalNumber > 0) {
        const remaining = entry.totalNumber - absNum;
        if (remaining <= 0) {
          entry.totalNumber = 0;
          entry.totalCost = 0;
          entry.costBasis = 0;
        } else {
          entry.totalNumber = remaining;
          entry.costBasis = remaining * entry.totalCost * 100;
        }
      }
    }
  }

  const optionHoldings: OptionHolding[] = [];
  for (const [id, entry] of optionMap) {
    if (entry.totalNumber <= 0) continue;

    const cost = entry.costBasis;
    const nowPrice = entry.totalCost;
    const isLong = entry.positionType === 'LONG';
    const total = nowPrice * entry.totalNumber * 100 * (isLong ? 1 : -1);
    const revenue = isLong ? total - cost : cost - total;
    const revenuePercentage =
      cost > 0 ? parseFloat(((revenue / cost) * 100).toFixed(2)) : 0;

    optionHoldings.push({
      id,
      underlyingCode: entry.underlyingCode,
      name: entry.name,
      expiryDate: entry.expiryDate,
      strikePrice: entry.strikePrice,
      optionType: entry.optionType,
      positionType: entry.positionType,
      number: entry.totalNumber,
      price: entry.totalCost,
      cost,
      nowPrice: entry.totalCost,
      total,
      revenue,
      revenuePercentage,
    });
  }

  return optionHoldings;
}

// ─── 持仓列表合并收益 ──────────────────────────────────────────

function calcOptionRevenue(holdings: OptionHolding[]): OptionHolding[] {
  return holdings.map((h) => {
    const isLong = h.positionType === 'LONG';
    const total = h.nowPrice * h.number * 100 * (isLong ? 1 : -1);
    const revenue = isLong ? total - h.cost : h.cost - total;
    const revenuePercentage =
      h.cost > 0 ? parseFloat(((revenue / h.cost) * 100).toFixed(2)) : 0;
    return { ...h, total, revenue, revenuePercentage };
  });
}

// ─── 创建合成个股流水（期权行权/被指派时使用） ──────────────────

function makeStockRecord(
  code: string,
  name: string,
  shares: number,
  price: number,
  buy: boolean,
  tradeTime: number,
): TradeRecord {
  const number = buy ? shares : -shares;
  return {
    id: code,
    name,
    number,
    price,
    cost: number * price,
    tradeTime,
    assetType: 'STOCK',
    tradeType: buy ? 'BUY' : 'SELL',
    multiplier: 1,
    totalCashImpact: buy ? -(shares * price) : shares * price,
  };
}

// ─── Store ─────────────────────────────────────────────────────

export const useStore = create<AppState>((set, get) => ({
  stockHoldings: [],
  optionHoldings: [],
  tradeRecords: [],
  cash: { id: "cash", total: 10000, initialCapital: 10000 },
  tradePlans: [],
  journalEntries: [],
  snapshots: [],
  dailyReturns: [],
  activeSnapshotIndex: null,
  loaded: false,

  initialize: async () => {
    const [records, plans, journals, snaps, returns, storedBaseCash, storedStockHoldings, storedOptionHoldings] =
      await Promise.all([
        getItem<TradeRecord[]>("tradeRecords"),
        getItem<TradePlan[]>("tradePlans"),
        getItem<JournalEntry[]>("journalEntries"),
        getItem<PortfolioSnapshot[]>("snapshots"),
        getItem<DailyPricePoint[]>("dailyReturns"),
        getItem<number>("baseCash"),
        getItem<StockHolding[]>("stockHoldings"),
        getItem<OptionHolding[]>("optionHoldings"),
      ]);

    // 归一化旧流水
    const tradeRecords = (records ?? []).map(normalizeTradeRecord);

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

    // 重算持仓
    const stockHoldings = recalcStockHoldings(tradeRecords);
    const optionHoldings = recalcOptionHoldings(tradeRecords);

    // 合并预设的最新价（首次手动录入场景）
    if (storedStockHoldings && storedStockHoldings.length > 0) {
      for (const h of stockHoldings) {
        const stored = storedStockHoldings.find((s) => s.id === h.id);
        if (stored && stored.nowPrice > 0) {
          h.nowPrice = stored.nowPrice;
        }
      }
    }
    if (storedOptionHoldings && storedOptionHoldings.length > 0) {
      for (const h of optionHoldings) {
        const stored = storedOptionHoldings.find((s) => s.id === h.id);
        if (stored && stored.nowPrice > 0) {
          h.nowPrice = stored.nowPrice;
        }
      }
    }

    const cashAdj = calcTradeCashAdjustment(tradeRecords);
    const cash: CashReserve = { id: "cash", total: baseCash + cashAdj, initialCapital: baseCash };

    set({
      tradeRecords,
      tradePlans,
      journalEntries,
      snapshots,
      dailyReturns,
      stockHoldings: calcRevenue(stockHoldings),
      optionHoldings: calcOptionRevenue(optionHoldings),
      cash,
      loaded: true,
    });
  },

  // ─── 交易流水管理 ──────────────────────────────────────────

  addTradeRecord: (raw) => {
    const record = normalizeTradeRecord(raw);
    const records = [...get().tradeRecords, record];

    // 生成合成个股流水
    const syntheticRecords: TradeRecord[] = [];
    if (record.tradeType === 'EXERCISE' || record.tradeType === 'ASSIGNED') {
      const option = get().optionHoldings.find((o) => o.id === record.id);
      if (option) {
        const shares = Math.abs(record.number) * 100;
        const strikePrice = option.strikePrice;
        const tradeTime = record.tradeTime;

        if (option.optionType === 'CALL' && option.positionType === 'LONG') {
          // Call 行权 → 按行权价买入股票
          syntheticRecords.push(makeStockRecord(option.underlyingCode, option.name, shares, strikePrice, true, tradeTime));
        } else if (option.optionType === 'CALL' && option.positionType === 'SHORT') {
          // Call 被指派 → 按行权价卖出股票
          syntheticRecords.push(makeStockRecord(option.underlyingCode, option.name, shares, strikePrice, false, tradeTime));
        } else if (option.optionType === 'PUT' && option.positionType === 'LONG') {
          // Put 行权 → 按行权价卖出股票
          syntheticRecords.push(makeStockRecord(option.underlyingCode, option.name, shares, strikePrice, false, tradeTime));
        } else if (option.optionType === 'PUT' && option.positionType === 'SHORT') {
          // Put 被指派 → 按行权价买入股票
          syntheticRecords.push(makeStockRecord(option.underlyingCode, option.name, shares, strikePrice, true, tradeTime));
        }
      }
    }

    const allRecords = [...records, ...syntheticRecords];

    // 重算
    const stockHoldings = recalcStockHoldings(allRecords);
    const optionHoldings = recalcOptionHoldings(allRecords);
    const cashAdj = calcTradeCashAdjustment(allRecords);
    const cash: CashReserve = { ...get().cash, total: get().cash.initialCapital + cashAdj };

    set({
      tradeRecords: allRecords,
      stockHoldings: calcRevenue(stockHoldings),
      optionHoldings: calcOptionRevenue(optionHoldings),
      cash,
    });
    setItem("tradeRecords", allRecords);
    markPendingSync("tradeRecords", allRecords);
    get().takeSnapshot();
  },

  removeTradeRecord: (tradeTime) => {
    const records = get().tradeRecords.filter((r) => r.tradeTime !== tradeTime);
    const stockHoldings = recalcStockHoldings(records);
    const optionHoldings = recalcOptionHoldings(records);
    const cashAdj = calcTradeCashAdjustment(records);
    const cash: CashReserve = { ...get().cash, total: get().cash.initialCapital + cashAdj };

    set({
      tradeRecords: records,
      stockHoldings: calcRevenue(stockHoldings),
      optionHoldings: calcOptionRevenue(optionHoldings),
      cash,
    });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
  },

  updateTradeRecord: (oldTradeTime, newRecord) => {
    const normalized = normalizeTradeRecord(newRecord);
    const records = get().tradeRecords.map((r) =>
      r.tradeTime === oldTradeTime ? normalized : r
    );
    const stockHoldings = recalcStockHoldings(records);
    const optionHoldings = recalcOptionHoldings(records);
    const cashAdj = calcTradeCashAdjustment(records);
    const cash: CashReserve = { ...get().cash, total: get().cash.initialCapital + cashAdj };

    set({
      tradeRecords: records,
      stockHoldings: calcRevenue(stockHoldings),
      optionHoldings: calcOptionRevenue(optionHoldings),
      cash,
    });
    setItem("tradeRecords", records);
    markPendingSync("tradeRecords", records);
    get().takeSnapshot();
  },

  // ─── 价格更新 ─────────────────────────────────────────────

  updateStockPrices: (updates) => {
    const stockHoldings = get().stockHoldings.map((h) => {
      const update = updates.find((u) => u.id === h.id);
      if (!update) return h;
      return { ...h, nowPrice: update.nowPrice };
    });
    set({ stockHoldings: calcRevenue(stockHoldings) });
    setItem("stockHoldings", stockHoldings);
    markPendingSync("stockHoldings", stockHoldings);
    get().takeSnapshot();
  },

  updateOptionPrices: (updates) => {
    const optionHoldings = get().optionHoldings.map((h) => {
      const update = updates.find((u) => u.id === h.id);
      if (!update) return h;
      return { ...h, nowPrice: update.nowPrice };
    });
    set({ optionHoldings: calcOptionRevenue(optionHoldings) });
    setItem("optionHoldings", optionHoldings);
    markPendingSync("optionHoldings", optionHoldings);
    get().takeSnapshot();
  },

  // ─── 现金 ─────────────────────────────────────────────────

  updateCash: (total) => {
    const cashAdj = calcTradeCashAdjustment(get().tradeRecords);
    const baseCash = total - cashAdj;
    const cash: CashReserve = { id: "cash", total, initialCapital: baseCash };
    set({ cash });
    setItem("baseCash", baseCash);
    markPendingSync("baseCash", baseCash);
  },

  // ─── 交易计划 ─────────────────────────────────────────────

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

  // ─── 日志 ─────────────────────────────────────────────────

  addJournalEntry: (entry) => {
    const entries = [...get().journalEntries, entry];
    set({ journalEntries: entries });
    setItem("journalEntries", entries);
    markPendingSync("journalEntries", entries);
  },

  // ─── 快照 ─────────────────────────────────────────────────

  takeSnapshot: () => {
    const { stockHoldings, optionHoldings, cash } = get();
    const now = new Date();
    const date = now.toLocaleDateString("en-CA");

    const stockTotal = stockHoldings.reduce((s, h) => s + h.total, 0);
    const optionTotal = optionHoldings.reduce((s, h) => s + h.total, 0);
    const netLiq = stockTotal + optionTotal + cash.total;
    const totalInvested = cash.initialCapital;
    const totalReturn = netLiq - totalInvested;
    const totalReturnPct =
      totalInvested > 0
        ? parseFloat(((totalReturn / totalInvested) * 100).toFixed(2))
        : 0;

    const snapshot: PortfolioSnapshot = {
      timestamp: Date.now(),
      date,
      stockHoldings: JSON.parse(JSON.stringify(stockHoldings)),
      optionHoldings: JSON.parse(JSON.stringify(optionHoldings)),
      cash: JSON.parse(JSON.stringify(cash)),
      netLiquidationValue: parseFloat(netLiq.toFixed(2)),
      totalReturnPercentage: totalReturnPct,
    };

    const snapshots = [...get().snapshots, snapshot];
    set({ snapshots });
    setItem("snapshots", snapshots);
    markPendingSync("snapshots", snapshots);

    const dailyReturns = [
      ...get().dailyReturns,
      { date, return: parseFloat(totalReturn.toFixed(2)) },
    ];
    set({ dailyReturns });
    setItem("dailyReturns", dailyReturns);
    markPendingSync("dailyReturns", dailyReturns);
  },

  setActiveSnapshot: (index) => {
    set({ activeSnapshotIndex: index });
  },

  // ─── 同步 ─────────────────────────────────────────────────

  syncToJsonBin: async () => {
    const { tradeRecords, tradePlans, journalEntries, snapshots, dailyReturns, cash } = get();
    const data = {
      tradeRecords,
      tradePlans,
      journalEntries,
      snapshots,
      dailyReturns,
      baseCash: cash.initialCapital,
    };
    const ok = await writeData(data);
    if (ok) {
      await clearAllPendingSyncs();
    }
  },
}));
