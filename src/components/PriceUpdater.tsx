"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { fetchQuote, isAfterMarketClose, isWeekend } from "@/lib/alphavantage";
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

export default function PriceUpdater() {
  const { stockHoldings, updateStockPrices, initialize, loaded, tradeRecords, dailyReturns, takeSnapshot } = useStore();
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const priceFetched = useRef(false);

  const shouldUpdateToday = useCallback(() => {
    const today = new Date().toLocaleDateString("en-CA");
    const lastUpdate = localStorage.getItem(LAST_UPDATE_KEY);
    return lastUpdate !== today;
  }, []);

  const updateAllPrices = useCallback(async () => {
    if (stockHoldings.length === 0 || updating) return;

    setUpdating(true);
    setStatus("正在更新价格...");

    const updates: { id: string; nowPrice: number }[] = [];

    for (const h of stockHoldings) {
      const quote = await fetchQuote(h.id);
      if (quote && quote.price > 0) {
        updates.push({ id: h.id, nowPrice: quote.price });
      }
    }

    if (updates.length > 0) {
      updateStockPrices(updates);
      localStorage.setItem(LAST_UPDATE_KEY, new Date().toLocaleDateString("en-CA"));
      setStatus(`已更新 ${updates.length} 只股票价格`);
    } else {
      setStatus("未能获取到价格数据");
    }

    setUpdating(false);
    setTimeout(() => setStatus(null), 3000);
  }, [stockHoldings, updating, updateStockPrices]);

  // 加载后：补充未初始化的价格 + 确保有当日快照
  useEffect(() => {
    if (!loaded || priceFetched.current) return;
    priceFetched.current = true;

    const initPrices = async () => {
      const uninitialized = stockHoldings.filter((h) => h.nowPrice === h.price);
      if (uninitialized.length > 0) {
        setStatus("正在获取最新价格...");
        const updates: { id: string; nowPrice: number }[] = [];
        for (const h of uninitialized) {
          const quote = await fetchQuote(h.id);
          if (quote && quote.price > 0) {
            updates.push({ id: h.id, nowPrice: quote.price });
          }
        }
        if (updates.length > 0) {
          updateStockPrices(updates);
          setStatus(`已更新 ${updates.length} 只股票价格`);
          setTimeout(() => setStatus(null), 3000);
        } else {
          setStatus(null);
        }
      }

      // 确保图表有数据点
      if (stockHoldings.length > 0 && dailyReturns.length === 0) {
        takeSnapshot();
      }
    };
    initPrices();
  }, [loaded]);

  // 保存最新引用供定时器使用
  const updateRef = useRef(updateAllPrices);
  updateRef.current = updateAllPrices;

  // 页面加载时检查是否需要更新
  useEffect(() => {
    if (!loaded) return;
    if (isWeekend()) return;
    if (shouldUpdateToday() || isAfterMarketClose()) {
      updateAllPrices();
    }
  }, [loaded]);

  // 每 5 分钟轮询：收盘后自动更新
  useEffect(() => {
    if (!loaded) return;
    const interval = setInterval(() => {
      if (isWeekend()) return;
      if (isAfterMarketClose() && shouldUpdateToday()) {
        updateRef.current();
      }
    }, 300_000);
    return () => clearInterval(interval);
  }, [loaded]);

  useEffect(() => {
    const loadFromRemote = async () => {
      try {
        const remote = await readData<{
          tradeRecords: TradeRecord[];
          tradePlans: TradePlan[];
          journalEntries: JournalEntry[];
          snapshots: PortfolioSnapshot[];
          dailyReturns: DailyPricePoint[];
          stockHoldings?: StockHolding[];
          optionHoldings?: OptionHolding[];
          baseCash?: number;
          lastPriceUpdateDate?: string;
        }>();

        if (remote) {
          if (remote.tradeRecords?.length) await setItem("tradeRecords", remote.tradeRecords);
          if (remote.tradePlans?.length) await setItem("tradePlans", remote.tradePlans);
          if (remote.journalEntries?.length) await setItem("journalEntries", remote.journalEntries);
          if (remote.snapshots?.length) await setItem("snapshots", remote.snapshots);
          if (remote.dailyReturns?.length) await setItem("dailyReturns", remote.dailyReturns);
          if (remote.stockHoldings?.length) await setItem("stockHoldings", remote.stockHoldings);
          if (remote.optionHoldings?.length) await setItem("optionHoldings", remote.optionHoldings);
          if (remote.baseCash != null) await setItem("baseCash", remote.baseCash);
          if (remote.lastPriceUpdateDate) localStorage.setItem(LAST_UPDATE_KEY, remote.lastPriceUpdateDate);
        } else {
          const newBinId = await createBin({
            tradeRecords: [],
            tradePlans: [],
            journalEntries: [],
            snapshots: [],
            dailyReturns: [],
            stockHoldings: [],
            optionHoldings: [],
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
