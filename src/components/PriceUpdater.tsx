"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { fetchQuote, isAfterMarketClose, isWeekend, getETDate } from "@/lib/alphavantage";
import { readData, createBin } from "@/lib/jsonbin";
import { setItem } from "@/lib/db";
import type {
  StockHolding,
  TradeRecord,
  TradePlan,
  JournalEntry,
  PortfolioSnapshot,
  DailyPricePoint,
} from "@/types";

const LAST_UPDATE_KEY = "lastPriceUpdateDate";
const API_DELAY_MS = 14_000;
const isFetching = { current: false };

async function fetchQuotesWithRateLimit(
  symbols: { id: string }[],
  setStatus: (s: string | null) => void,
  updatePrices: (updates: { id: string; nowPrice: number }[]) => void,
) {
  const updates: { id: string; nowPrice: number }[] = [];

  for (let i = 0; i < symbols.length; i++) {
    const h = symbols[i];
    setStatus(`正在获取价格 (${i + 1}/${symbols.length})...`);

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
    setStatus(`已更新 ${updates.length} 只股票价格`);
  } else {
    setStatus("未能获取到价格数据");
  }
  setTimeout(() => setStatus(null), 3000);
}

export default function PriceUpdater() {
  const { holdings, updatePrices, initialize, loaded, tradeRecords, dailyReturns, takeSnapshot } = useStore();
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const priceFetched = useRef(false);

  const shouldUpdateToday = useCallback(() => {
    const today = getETDate();
    const lastUpdate = localStorage.getItem(LAST_UPDATE_KEY);
    return lastUpdate !== today;
  }, []);

  // 加载后：补充未初始化的价格 + 确保有当日快照
  useEffect(() => {
    if (!loaded || priceFetched.current) return;
    priceFetched.current = true;

    const initAndMaybeUpdate = async () => {
      const uninitialized = holdings.filter((h) => h.nowPrice === h.price);

      if (uninitialized.length > 0) {
        isFetching.current = true;
        await fetchQuotesWithRateLimit(uninitialized, setStatus, updatePrices);
        isFetching.current = false;
      }

      // 确保图表有数据点
      if (holdings.length > 0 && dailyReturns.length === 0) {
        takeSnapshot();
      }
    };

    // 只在周一~周五收盘后自动更新
    if (!isWeekend() && (shouldUpdateToday() || isAfterMarketClose())) {
      // initAndMaybeUpdate already handles this
    }

    initAndMaybeUpdate();
  }, [loaded, holdings, updatePrices, dailyReturns, takeSnapshot]);

  // 每 5 分钟轮询：收盘后自动更新
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      if (isFetching.current) return;
      if (isWeekend()) return;
      if (isAfterMarketClose() && shouldUpdateToday()) {
        isFetching.current = true;
        fetchQuotesWithRateLimit(holdings, setStatus, updatePrices)
          .finally(() => { isFetching.current = false; });
      }
    }, 300_000);
    return () => clearInterval(interval);
  }, [loaded, holdings, updatePrices]);

  useEffect(() => {
    const loadFromRemote = async () => {
      try {
        const remote = await readData<{
          tradeRecords: TradeRecord[];
          tradePlans: TradePlan[];
          journalEntries: JournalEntry[];
          snapshots: PortfolioSnapshot[];
          dailyReturns: DailyPricePoint[];
          holdings?: StockHolding[];
          baseCash?: number;
          lastPriceUpdateDate?: string;
        }>();

        if (remote) {
          if (remote.tradeRecords?.length) await setItem("tradeRecords", remote.tradeRecords);
          if (remote.tradePlans?.length) await setItem("tradePlans", remote.tradePlans);
          if (remote.journalEntries?.length) await setItem("journalEntries", remote.journalEntries);
          if (remote.snapshots?.length) await setItem("snapshots", remote.snapshots);
          if (remote.dailyReturns?.length) await setItem("dailyReturns", remote.dailyReturns);
          if (remote.holdings?.length) await setItem("holdings", remote.holdings);
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
          });
          if (newBinId) {
            console.log("JSONBin 已创建，新 Bin ID:", newBinId);
          }
        }
      } catch {
        // silent fail
      }
      await initialize();
    };

    loadFromRemote();
  }, []);

  if (status) {
    return (
      <div className="fixed bottom-4 right-4 z-40 rounded-lg border border-[var(--tv-border)] bg-[var(--tv-bg-secondary)] px-4 py-2 text-sm shadow-lg">
        {status}
      </div>
    );
  }

  return null;
}
