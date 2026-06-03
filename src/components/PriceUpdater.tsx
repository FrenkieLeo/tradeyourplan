"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { fetchQuote, isAfterMarketClose, isWeekend, getETDate } from "@/lib/alphavantage";
import { readData, createBin } from "@/lib/jsonbin";
import { setItem } from "@/lib/db";
import type {
  StockHolding,
  OptionHolding,
  TradeRecord,
  TradePlan,
  JournalEntry,
  PortfolioSnapshot,
  DailyPricePoint,
} from "@/types";

const LAST_UPDATE_KEY = "lastPriceUpdateDate";
const LAST_UPDATE_TS_KEY = "lastPriceUpdateTs";
const UPDATE_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 小时冷却，避免时区导致漏拉
const API_DELAY_MS = 14_000;

async function fetchQuotesWithRateLimit(
  symbols: { id: string }[],
  setStatus: (s: string | null) => void,
  setProgress: (p: number) => void,
  updatePrices: (updates: { id: string; nowPrice: number }[]) => void,
) {
  const updates: { id: string; nowPrice: number }[] = [];

  for (let i = 0; i < symbols.length; i++) {
    const h = symbols[i];
    setStatus(`正在获取价格 (${i + 1}/${symbols.length})...`);
    setProgress(((i + 1) / symbols.length) * 100);

    const quote = await fetchQuote(h.id);
    if (quote && quote.price > 0) {
      updates.push({ id: h.id, nowPrice: quote.price });
    }

    if (i < symbols.length - 1) {
      await new Promise((r) => setTimeout(r, API_DELAY_MS));
    }
  }

  if (updates.length > 0) {
    updatePrices(updates);
    localStorage.setItem(LAST_UPDATE_KEY, getETDate());
    localStorage.setItem(LAST_UPDATE_TS_KEY, String(Date.now()));
    setStatus(`已更新 ${updates.length} 只股票价格`);
  } else {
    setStatus("未能获取到价格数据");
  }
  setProgress(100);
}

export default function PriceUpdater() {
  const { holdings, updatePrices, initialize, loaded, takeSnapshot, setRefreshing } = useStore();
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const initialized = useRef(false);

  const shouldUpdateToday = useCallback(() => {
    const today = getETDate();
    const lastUpdate = localStorage.getItem(LAST_UPDATE_KEY);
    // ① ET 日期不同 → 需要更新
    if (lastUpdate !== today) return true;
    // ② ET 日期相同，但上次拉取超过 2 小时（解决中国时区 ET 日期不变但价格已变的问题）
    const lastTs = localStorage.getItem(LAST_UPDATE_TS_KEY);
    if (!lastTs) return true;
    return Date.now() - Number(lastTs) > UPDATE_COOLDOWN_MS;
  }, []);

  // 单次初始化流程：加载远程 → 初始化 → 获取价格 → 快照
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const loadFromRemote = async () => {
      setRefreshing(true);
      setProgress(0);
      setStatus("正在加载远程数据...");

      try {
        const remote = await readData<{
          tradeRecords: TradeRecord[];
          tradePlans: TradePlan[];
          journalEntries: JournalEntry[];
          snapshots: PortfolioSnapshot[];
          dailyReturns: DailyPricePoint[];
          holdings?: StockHolding[];
          optionHoldings?: OptionHolding[];
          baseCash?: number;
          lastPriceUpdateDate?: string;
        }>();

        console.log("[PriceUpdater] JSONBin remote data:", {
          hasRemote: !!remote,
          tradeRecords: remote?.tradeRecords?.length ?? 0,
          snapshots: remote?.snapshots?.length ?? 0,
          dailyReturns: remote?.dailyReturns?.length ?? 0,
          holdings: remote?.holdings?.length ?? 0,
          holdingsSample: remote?.holdings?.slice(0, 2).map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price })),
          optionHoldings: remote?.optionHoldings?.length ?? 0,
          baseCash: remote?.baseCash,
          lastPriceUpdateDate: remote?.lastPriceUpdateDate,
        });

        if (remote) {
          // 过滤未来数据仅用于本地展示，但不写回 JSONBin（防止因时区/时钟偏差误删）
          // JSONBin 只由 syncToJsonBin（用户操作/定时同步）写入
          const today = getETDate();
          // 用 1 天缓冲避免时区边缘情况误删数据
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const maxAllowed = tomorrow.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
          const cleanedSnapshots = (remote.snapshots ?? []).filter((s) => s.date <= maxAllowed);
          const cleanedReturns = (remote.dailyReturns ?? []).filter((d) => d.date <= maxAllowed);
          if (cleanedSnapshots.length !== (remote.snapshots?.length ?? 0)) {
            const removed = (remote.snapshots ?? []).filter((s) => s.date > maxAllowed).map((s) => s.date);
            console.warn("[PriceUpdater] filtering far-future snapshots in-app only (not removing from JSONBin):", removed);
          }
          remote.snapshots = cleanedSnapshots;
          remote.dailyReturns = cleanedReturns;

          if (remote.holdings?.length) {
            console.log("[PriceUpdater] writing remote.holdings to IndexedDB:", remote.holdings.map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price })));
            await setItem("holdings", remote.holdings);
          } else if (remote.snapshots?.length) {
            const sorted = [...remote.snapshots].sort((a, b) => a.date.localeCompare(b.date));
            const latest = sorted[sorted.length - 1];
            if (latest.holdings?.length) {
              console.log("[PriceUpdater] deriving holdings from latest snapshot:", { date: latest.date, holdings: latest.holdings.map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price })) });
              await setItem("holdings", latest.holdings);
            }
          }
          if (remote.optionHoldings?.length) {
            await setItem("optionHoldings", remote.optionHoldings);
          } else if (remote.snapshots?.length) {
            const sorted = [...remote.snapshots].sort((a, b) => a.date.localeCompare(b.date));
            const latest = sorted[sorted.length - 1];
            if (latest.optionHoldings?.length) {
              console.log("[PriceUpdater] deriving optionHoldings from latest snapshot");
              await setItem("optionHoldings", latest.optionHoldings);
            }
          }
          if (remote.tradeRecords?.length) await setItem("tradeRecords", remote.tradeRecords);
          if (remote.tradePlans?.length) await setItem("tradePlans", remote.tradePlans);
          if (remote.journalEntries?.length) await setItem("journalEntries", remote.journalEntries);
          if (remote.snapshots?.length) await setItem("snapshots", remote.snapshots);
          if (remote.dailyReturns?.length) await setItem("dailyReturns", remote.dailyReturns);
          if (remote.baseCash != null) await setItem("baseCash", remote.baseCash);
          if (remote.lastPriceUpdateDate) localStorage.setItem(LAST_UPDATE_KEY, remote.lastPriceUpdateDate);
        } else {
          const newBinId = await createBin({
            tradeRecords: [],
            tradePlans: [],
            journalEntries: [],
            snapshots: [],
            dailyReturns: [],
            holdings: [],
            optionHoldings: [],
          });
          if (newBinId) {
            console.log("JSONBin 已创建，新 Bin ID:", newBinId);
          }
        }
      } catch (e) {
        console.error("[PriceUpdater] JSONBin readData error:", e);
      }

      setProgress(30);

      console.log("[PriceUpdater] calling initialize()");
      await initialize();

      const state = useStore.getState();
      console.log("[PriceUpdater] after initialize, holdings:", state.holdings.map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price, cost: h.cost, revenue: h.revenue })));
      console.log("[PriceUpdater] after initialize, dailyReturns:", state.dailyReturns.map((d) => d));
      console.log("[PriceUpdater] after initialize, snapshots:", state.snapshots.map((s) => ({ date: s.date, dailyReturn: s.dailyReturn, holdings: s.holdings.map((h) => ({ id: h.id, nowPrice: h.nowPrice })) })));

      const uninitialized = state.holdings.filter((h) => h.nowPrice === h.price);
      // 只在美股收盘后才拉取新一天的价格（防止未开市时提前拉取）
      const staleLastUpdate = !isWeekend() && isAfterMarketClose() && shouldUpdateToday();
      console.log("[PriceUpdater] uninitialized count:", uninitialized.length, "staleLastUpdate:", staleLastUpdate, "details:", uninitialized.map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price })));

      const needFetch = uninitialized.length > 0 || (staleLastUpdate && state.holdings.length > 0);
      if (needFetch) {
        const toFetch = uninitialized.length > 0 ? uninitialized : state.holdings;
        setStatus(`正在获取 ${toFetch.length} 只股票价格...`);
        await fetchQuotesWithRateLimit(toFetch, setStatus, setProgress, updatePrices);
        const afterState = useStore.getState();
        console.log("[PriceUpdater] after price fetch, holdings:", afterState.holdings.map((h) => ({ id: h.id, nowPrice: h.nowPrice, price: h.price, revenue: h.revenue })));
      }

      const today = getETDate();
      const currentState = useStore.getState();
      const exists = currentState.snapshots.some((s) => s.date === today);
      console.log("[PriceUpdater] snapshot check:", { today, exists, holdingsCount: currentState.holdings.length, optionHoldingsCount: currentState.optionHoldings.length });
      // 只在美股收盘后自动创建当日快照（防止未开市时提前生成）
      if (!exists && isAfterMarketClose() && (currentState.holdings.length > 0 || currentState.optionHoldings.length > 0)) {
        console.log(`[PriceUpdater] creating today's snapshot (${today})`);
        takeSnapshot();
        const snapState = useStore.getState();
        console.log("[PriceUpdater] after snapshot, snapshots:", snapState.snapshots.map((s) => ({ date: s.date, dailyReturn: s.dailyReturn })));
        console.log("[PriceUpdater] after snapshot, dailyReturns:", snapState.dailyReturns);
      }

      setProgress(100);
      setStatus("数据已就绪");
      setTimeout(() => setStatus(null), 2000);
    };

    loadFromRemote().finally(() => {
      setRefreshing(false);
    });
  }, []);

  // 每 5 分钟轮询：收盘后自动更新
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(async () => {
      if (isWeekend()) return;
      if (isAfterMarketClose() && shouldUpdateToday()) {
        setRefreshing(true);
        setProgress(0);
        try {
          const state = useStore.getState();
          await fetchQuotesWithRateLimit(state.holdings, setStatus, setProgress, updatePrices);
        } finally {
          setRefreshing(false);
        }
      }
    }, 300_000);
    return () => clearInterval(interval);
  }, [loaded, updatePrices, setRefreshing]);

  if (status) {
    return (
      <div className="fixed bottom-4 right-4 z-40 min-w-[200px] rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-4 py-3 shadow-lg">
        <div className="mb-2 text-sm text-[var(--tv-text)]">{status}</div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--tv-border)]">
          <div
            className="h-full rounded-full bg-[#2962ff] transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return null;
}
