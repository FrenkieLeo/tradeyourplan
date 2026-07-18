import { NextRequest, NextResponse } from "next/server";
import { isIbkrSyncPayload } from "@/lib/ibkr/sync-contract";
import { authorizeIngestRequest, getSyncOwnerId } from "@/lib/server/ingest-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!authorizeIngestRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload: unknown = await request.json().catch(() => null);
  if (!isIbkrSyncPayload(payload)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const ownerId = getSyncOwnerId();
  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase.from("sync_runs").select("id,status")
    .eq("owner_id", ownerId).eq("source", payload.source)
    .eq("idempotency_key", payload.idempotencyKey).maybeSingle();
  if (existing?.status === "COMPLETED") {
    return NextResponse.json({ ok: true, duplicate: true, syncRunId: existing.id });
  }

  const { data: syncRun, error: syncRunError } = await supabase.from("sync_runs").upsert({
    owner_id: ownerId,
    source: payload.source,
    idempotency_key: payload.idempotencyKey,
    status: "RUNNING",
    started_at: new Date().toISOString(),
    completed_at: null,
    error_message: null,
  }, { onConflict: "owner_id,source,idempotency_key" }).select("id").single();
  if (syncRunError || !syncRun) {
    return NextResponse.json({ error: syncRunError?.message ?? "sync run failed" }, { status: 502 });
  }

  try {
    const { data: account, error: accountError } = await supabase.from("ibkr_accounts").upsert({
      owner_id: ownerId,
      account_key: payload.account.accountKey,
      base_currency: payload.account.baseCurrency,
      display_name: payload.account.displayName ?? "IBKR",
      updated_at: new Date().toISOString(),
    }, { onConflict: "owner_id,account_key" }).select("id").single();
    if (accountError || !account) throw accountError ?? new Error("Account upsert failed");

    const accountId = account.id as string;
    const runId = syncRun.id as string;
    const operations: Array<PromiseLike<{ error: { message: string } | null }>> = [];
    if (payload.instruments.length) {
      operations.push(supabase.from("instruments").upsert(payload.instruments.map((item) => ({
        owner_id: ownerId,
        contract_id: item.contractId,
        contract_id_ex: item.contractIdEx ?? null,
        symbol: item.symbol,
        description: item.description,
        security_type: item.securityType,
        currency: item.currency,
        exchange: item.exchange ?? null,
        underlying_contract_id: item.underlyingContractId ?? null,
        updated_at: new Date().toISOString(),
      })), { onConflict: "owner_id,contract_id" }));
    }
    if (payload.trades.length) {
      operations.push(supabase.from("ibkr_trades").upsert(payload.trades.map((trade) => ({
        owner_id: ownerId,
        account_id: accountId,
        sync_run_id: runId,
        source_trade_id: trade.sourceTradeId,
        contract_id: trade.contractId,
        symbol: trade.symbol,
        security_type: trade.securityType,
        side: trade.side,
        quantity: trade.quantity,
        price: trade.price,
        commission: trade.commission,
        currency: trade.currency,
        executed_at: trade.executedAt,
        raw: trade,
      })), { onConflict: "owner_id,source_trade_id" }));
    }
    if (payload.cashFlows.length) {
      operations.push(supabase.from("cash_flows").upsert(payload.cashFlows.map((flow) => ({
        owner_id: ownerId,
        account_id: accountId,
        sync_run_id: runId,
        source_id: flow.sourceId,
        flow_type: flow.type,
        amount: flow.amount,
        currency: flow.currency,
        is_external: flow.external,
        occurred_at: flow.occurredAt,
        raw: flow,
      })), { onConflict: "owner_id,source_id" }));
    }
    operations.push(supabase.from("account_snapshots").upsert({
      owner_id: ownerId,
      account_id: accountId,
      sync_run_id: runId,
      as_of: payload.accountSnapshot.asOf,
      currency: payload.accountSnapshot.currency,
      net_liquidation: payload.accountSnapshot.netLiquidation,
      available_funds: payload.accountSnapshot.availableFunds,
      buying_power: payload.accountSnapshot.buyingPower,
      initial_margin: payload.accountSnapshot.initialMargin,
      maintenance_margin: payload.accountSnapshot.maintenanceMargin,
      excess_liquidity: payload.accountSnapshot.excessLiquidity,
      gross_position_value: payload.accountSnapshot.grossPositionValue,
    }, { onConflict: "owner_id,account_id,as_of" }));
    if (payload.positions.length) {
      operations.push(supabase.from("position_snapshots").upsert(payload.positions.map((position) => ({
        owner_id: ownerId,
        account_id: accountId,
        sync_run_id: runId,
        contract_id: position.contractId,
        symbol: position.symbol,
        description: position.description,
        security_type: position.securityType,
        currency: position.currency,
        quantity: position.quantity,
        average_cost: position.averageCost,
        market_price: position.marketPrice,
        market_value: position.marketValue,
        unrealized_pnl: position.unrealizedPnl,
        daily_pnl: position.dailyPnl,
        bid: position.bid ?? null,
        ask: position.ask ?? null,
        implied_volatility: position.impliedVolatility ?? null,
        open_interest: position.openInterest ?? null,
        market_data_delayed: position.marketDataDelayed ?? false,
        market_data_as_of: position.marketDataAsOf,
      })), { onConflict: "owner_id,account_id,contract_id,market_data_as_of" }));
    }
    if (payload.performance?.length) {
      operations.push(supabase.from("performance_points").upsert(payload.performance.map((point) => ({
        owner_id: ownerId,
        account_id: accountId,
        point_date: point.date,
        nav: point.nav,
        cash: point.cash,
        market_value: point.marketValue,
        net_external_flow: point.netExternalFlow,
        daily_return: point.dailyReturn,
        cumulative_return: point.cumulativeReturn,
        realized_pnl: point.realizedPnl,
        unrealized_pnl: point.unrealizedPnl,
      })), { onConflict: "owner_id,account_id,point_date" }));
    }
    const results = await Promise.all(operations);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw new Error(failed.error.message);

    for (const watchlist of payload.watchlists ?? []) {
      const { data: savedWatchlist, error: watchlistError } = await supabase.from("watchlists").upsert({
        owner_id: ownerId,
        external_id: watchlist.externalId,
        name: watchlist.name,
        source_hash: watchlist.sourceHash,
        synced_at: new Date().toISOString(),
      }, { onConflict: "owner_id,external_id" }).select("id").single();
      if (watchlistError || !savedWatchlist) throw watchlistError ?? new Error("Watchlist upsert failed");
      if (watchlist.instruments.length) {
        const { error } = await supabase.from("watchlist_members").upsert(watchlist.instruments.map((item) => ({
          owner_id: ownerId,
          watchlist_id: savedWatchlist.id,
          sync_run_id: runId,
          contract_id_ex: item.contractIdEx,
          symbol: item.symbol,
          description: item.description,
          underlying_symbol: item.underlyingSymbol ?? null,
        })), { onConflict: "watchlist_id,contract_id_ex" });
        if (error) throw error;
      }
    }

    const itemCount = payload.trades.length + payload.positions.length + payload.cashFlows.length +
      (payload.performance?.length ?? 0) + (payload.watchlists?.length ?? 0);
    await supabase.from("sync_runs").update({
      status: "COMPLETED", completed_at: new Date().toISOString(), item_count: itemCount,
    }).eq("id", runId);
    return NextResponse.json({ ok: true, duplicate: false, syncRunId: runId, itemCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ingest failed";
    await supabase.from("sync_runs").update({
      status: "FAILED", completed_at: new Date().toISOString(), error_message: message,
    }).eq("id", syncRun.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
