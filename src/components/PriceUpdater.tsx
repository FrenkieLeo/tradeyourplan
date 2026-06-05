"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { getETDate, isAfterMarketClose } from "@/lib/alphavantage";
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

export default function PriceUpdater() {
  const { initialize, loaded, setRefreshing } = useStore();
  const initialized = useRef(false);

  // 单次初始化流程：加载远程 → 初始化（不再自动拉取 Alpha Vantage，以手动填写为准）
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const loadFromRemote = async () => {
      setRefreshing(true);

      try {
        const remote = await readData<{
          tradeRecords: TradeRecord[];
          tradePlans: TradePlan[];
          journalEntries: JournalEntry[];
          snapshots: PortfolioSnapshot[];
          dailyReturns?: DailyPricePoint[];
          holdings?: StockHolding[];
          optionHoldings?: OptionHolding[];
          baseCash?: number;
        }>();

        console.log("[PriceUpdater] JSONBin remote data:", {
          hasRemote: !!remote,
          tradeRecords: remote?.tradeRecords?.length ?? 0,
          snapshots: remote?.snapshots?.length ?? 0,
          holdings: remote?.holdings?.length ?? 0,
          optionHoldings: remote?.optionHoldings?.length ?? 0,
          baseCash: remote?.baseCash,
        });

        if (remote) {
          // ADR-010：过滤掉「未来日期」以及「当日美东时间尚未收盘」的预生成快照/收益，
          // 只有美东收盘后定型的数据才允许进入本地存储与展示；同时按日期去重。
          const todayET = getETDate();
          const marketClosed = isAfterMarketClose();
          const isFinalized = (date: string) =>
            date < todayET || (date === todayET && marketClosed);

          const cleanSnapshots = remote.snapshots
            ? [
                ...new Map(
                  remote.snapshots
                    .filter((s) => isFinalized(s.date))
                    .map((s) => [s.date, s])
                ).values(),
              ].sort((a, b) => a.date.localeCompare(b.date))
            : undefined;
          const cleanDailyReturns = remote.dailyReturns
            ? remote.dailyReturns.filter((d) => isFinalized(d.date))
            : undefined;

          if (remote.holdings?.length) {
            await setItem("holdings", remote.holdings);
          } else if (cleanSnapshots?.length) {
            const latest = cleanSnapshots[cleanSnapshots.length - 1];
            if (latest.holdings?.length) {
              await setItem("holdings", latest.holdings);
            }
          }
          if (remote.optionHoldings?.length) {
            await setItem("optionHoldings", remote.optionHoldings);
          } else if (cleanSnapshots?.length) {
            const latest = cleanSnapshots[cleanSnapshots.length - 1];
            if (latest.optionHoldings?.length) {
              await setItem("optionHoldings", latest.optionHoldings);
            }
          }
          if (remote.tradeRecords?.length) await setItem("tradeRecords", remote.tradeRecords);
          if (remote.tradePlans?.length) await setItem("tradePlans", remote.tradePlans);
          if (remote.journalEntries?.length) await setItem("journalEntries", remote.journalEntries);
          if (cleanSnapshots !== undefined) await setItem("snapshots", cleanSnapshots);
          if (cleanDailyReturns !== undefined) await setItem("dailyReturns", cleanDailyReturns);
          if (remote.baseCash != null) await setItem("baseCash", remote.baseCash);
        } else {
          const newBinId = await createBin({
            tradeRecords: [],
            tradePlans: [],
            journalEntries: [],
            snapshots: [],
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

      console.log("[PriceUpdater] calling initialize()");
      await initialize();

      setRefreshing(false);
    };

    loadFromRemote();
  }, []);

  return null;
}
