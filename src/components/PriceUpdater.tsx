"use client";

import { useEffect, useRef } from "react";
import {
  useStore,
  normalizeTradeRecords,
  mergeTradeRecords,
  mergeTombstones,
  mergeSnapshots,
  mergeById,
  mergeJournalEntries,
  applyTombstones,
  mergeUidList,
} from "@/lib/store";
import { getETDate, isAfterMarketClose, lastCompletedTradingDayET } from "@/lib/alphavantage";
import { readData, createBin } from "@/lib/jsonbin";
import { getItem, setItem, hasPendingSyncs } from "@/lib/db";
import type {
  StockHolding,
  OptionHolding,
  TradeRecord,
  TradePlan,
  MegaCapResearch,
  FundamentalEntry,
  JournalEntry,
  PortfolioSnapshot,
  DailyPricePoint,
  DeletedTradeRef,
  CashTransaction,
} from "@/types";

export default function PriceUpdater() {
  const { initialize, loaded, setRefreshing, fetchLatestQuotes, syncToJsonBin } = useStore();
  const initialized = useRef(false);

  // 单次初始化流程：远程与本地按 uid/日期合并（保留未同步的本地改动）→ 初始化 → 回推 → 自动拉价
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const loadFromRemote = async () => {
      setRefreshing(true);

      try {
        const remote = await readData<{
          tradeRecords?: TradeRecord[];
          tradePlans?: TradePlan[];
          megaCapResearches?: MegaCapResearch[];
          fundamentalEntries?: FundamentalEntry[];
          journalEntries?: JournalEntry[];
          snapshots?: PortfolioSnapshot[];
          dailyReturns?: DailyPricePoint[];
          cashTransactions?: CashTransaction[];
          deletedTradeUids?: DeletedTradeRef[];
          deletedSnapshotDates?: DeletedTradeRef[];
          deletedPlanIds?: DeletedTradeRef[];
          deletedMegaCapResearchIds?: DeletedTradeRef[];
          deletedFundamentalEntryIds?: DeletedTradeRef[];
          deletedCashTxUids?: DeletedTradeRef[];
          holdings?: StockHolding[];
          optionHoldings?: OptionHolding[];
          baseCash?: number;
          baseCashUpdatedAt?: number;
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
          // ADR-010：过滤掉「未来日期」以及「当日美东时间尚未收盘」的预生成快照/收益。
          const todayET = getETDate();
          const marketClosed = isAfterMarketClose();
          const isFinalized = (date: string) =>
            date < todayET || (date === todayET && marketClosed);

          // 读取本地（可能含未同步成功的改动），与远程按 uid / 日期 / 墓碑合并，避免丢失本地改动。
          const [localRecords, localTombs, localSnaps, localDr, localSnapTombs, localPlanTombs, localPlans, localResearchTombs, localResearches, localFundamentalTombs, localFundamentals, localJournals, localCashTxs, localCashTxTombs] = await Promise.all([
            getItem<TradeRecord[]>("tradeRecords"),
            getItem<DeletedTradeRef[]>("deletedTradeUids"),
            getItem<PortfolioSnapshot[]>("snapshots"),
            getItem<DailyPricePoint[]>("dailyReturns"),
            getItem<DeletedTradeRef[]>("deletedSnapshotDates"),
            getItem<DeletedTradeRef[]>("deletedPlanIds"),
            getItem<TradePlan[]>("tradePlans"),
            getItem<DeletedTradeRef[]>("deletedMegaCapResearchIds"),
            getItem<MegaCapResearch[]>("megaCapResearches"),
            getItem<DeletedTradeRef[]>("deletedFundamentalEntryIds"),
            getItem<FundamentalEntry[]>("fundamentalEntries"),
            getItem<JournalEntry[]>("journalEntries"),
            getItem<CashTransaction[]>("cashTransactions"),
            getItem<DeletedTradeRef[]>("deletedCashTxUids"),
          ]);

          const tombstones = mergeTombstones(remote.deletedTradeUids ?? [], localTombs ?? []);
          const snapTombs = mergeTombstones(remote.deletedSnapshotDates ?? [], localSnapTombs ?? []);
          const planTombs = mergeTombstones(remote.deletedPlanIds ?? [], localPlanTombs ?? []);
          const researchTombs = mergeTombstones(remote.deletedMegaCapResearchIds ?? [], localResearchTombs ?? []);
          const fundamentalTombs = mergeTombstones(remote.deletedFundamentalEntryIds ?? [], localFundamentalTombs ?? []);
          const cashTxTombs = mergeTombstones(remote.deletedCashTxUids ?? [], localCashTxTombs ?? []);
          const mergedCashTxs = mergeUidList(remote.cashTransactions ?? [], localCashTxs ?? [], cashTxTombs);
          const mergedRecords = mergeTradeRecords(
            normalizeTradeRecords(remote.tradeRecords ?? []),
            normalizeTradeRecords(localRecords ?? []),
            tombstones
          );
          const mergedSnapshots = applyTombstones(
            mergeSnapshots(
              (remote.snapshots ?? []).filter((s) => isFinalized(s.date)),
              (localSnaps ?? []).filter((s) => isFinalized(s.date))
            ),
            (x) => x.date,
            (x) => x.timestamp ?? 0,
            snapTombs
          );
          const mergedPlans = applyTombstones(
            mergeById(remote.tradePlans ?? [], localPlans ?? []),
            (x) => x.id,
            (x) => x.updatedAt ?? 0,
            planTombs
          );
          const mergedResearches = applyTombstones(
            mergeById(remote.megaCapResearches ?? [], localResearches ?? []),
            (x) => x.id,
            (x) => x.updatedAt ?? 0,
            researchTombs
          );
          const mergedFundamentals = applyTombstones(
            mergeById(remote.fundamentalEntries ?? [], localFundamentals ?? []),
            (x) => x.id,
            (x) => x.updatedAt ?? 0,
            fundamentalTombs
          );
          const mergedJournals = mergeJournalEntries(remote.journalEntries ?? [], localJournals ?? []);
          const drMap = new Map<string, DailyPricePoint>();
          for (const d of (remote.dailyReturns ?? []).filter((d) => isFinalized(d.date))) drMap.set(d.date, d);
          for (const d of (localDr ?? []).filter((d) => isFinalized(d.date))) drMap.set(d.date, d);
          const mergedDr = [...drMap.values()].sort((a, b) => a.date.localeCompare(b.date));

          await setItem("tradeRecords", mergedRecords);
          await setItem("deletedTradeUids", tombstones);
          await setItem("deletedSnapshotDates", snapTombs);
          await setItem("deletedPlanIds", planTombs);
          await setItem("deletedMegaCapResearchIds", researchTombs);
          await setItem("deletedFundamentalEntryIds", fundamentalTombs);
          await setItem("deletedCashTxUids", cashTxTombs);
          await setItem("snapshots", mergedSnapshots);
          await setItem("dailyReturns", mergedDr);
          await setItem("tradePlans", mergedPlans);
          await setItem("megaCapResearches", mergedResearches);
          await setItem("fundamentalEntries", mergedFundamentals);
          await setItem("journalEntries", mergedJournals);
          await setItem("cashTransactions", mergedCashTxs);
          if (remote.baseCash != null) await setItem("baseCash", remote.baseCash);
          if (remote.baseCashUpdatedAt != null) await setItem("baseCashUpdatedAt", remote.baseCashUpdatedAt);

          const latest = mergedSnapshots[mergedSnapshots.length - 1];
          if (remote.holdings?.length) {
            await setItem("holdings", remote.holdings);
          } else if (latest?.holdings?.length) {
            await setItem("holdings", latest.holdings);
          }
          if (remote.optionHoldings?.length) {
            await setItem("optionHoldings", remote.optionHoldings);
          } else if (latest?.optionHoldings?.length) {
            await setItem("optionHoldings", latest.optionHoldings);
          }
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

      // 若本地存在未成功上传的改动（之前写入失败），加载后立即回推，保证多端可见。
      try {
        if (await hasPendingSyncs()) {
          console.log("[PriceUpdater] flushing pending local changes to JSONBin");
          await syncToJsonBin();
        }
      } catch (e) {
        console.error("[PriceUpdater] pending flush failed:", e);
      }

      // 自动从 Alpha Vantage 拉取最新收盘价（已验证数据源准确）。
      // 节流：每个「已收盘交易日」最多尝试一次，避免触碰免费档每日额度。
      // 额外校验：若 lastQuoteSync 已标记但最新快照仍落后（旧版 bug 残留），强制重试。
      try {
        const expected = lastCompletedTradingDayET();
        const lastSync = await getItem<string>("lastQuoteSync");
        const latestSnapDate = useStore.getState().snapshots.at(-1)?.date;
        const snapshotBehind = latestSnapDate != null && latestSnapDate < expected;
        if (lastSync == null || lastSync < expected || snapshotBehind) {
          console.log("[PriceUpdater] fetching latest quotes from Alpha Vantage", { expected, lastSync, latestSnapDate });
          const ok = await fetchLatestQuotes();
          const newLatest = useStore.getState().snapshots.at(-1)?.date;
          if (ok && newLatest != null && newLatest >= expected) {
            await setItem("lastQuoteSync", expected);
            console.log("[PriceUpdater] quotes synced", { expected, newLatest });
          } else {
            console.warn("[PriceUpdater] fetchLatestQuotes incomplete, will retry next load", {
              expected,
              newLatest,
              ok,
            });
          }
        } else {
          console.log("[PriceUpdater] quotes already up to date, skip fetch", { expected, lastSync });
        }
      } catch (e) {
        console.error("[PriceUpdater] auto quote fetch failed:", e);
      }

      setRefreshing(false);
    };

    loadFromRemote();
  }, []);

  return null;
}
