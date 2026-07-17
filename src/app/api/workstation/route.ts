import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const number = (value: unknown) => Number(value ?? 0);

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ configured: false });
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: account } = await supabase.from("ibkr_accounts").select("id,display_name,base_currency").limit(1).maybeSingle();
  if (!account) return NextResponse.json({ configured: true, empty: true });
  const { data: run } = await supabase.from("sync_runs").select("id,completed_at")
    .in("source", ["IBKR", "IBKR_FLEX"]).eq("status", "COMPLETED")
    .order("completed_at", { ascending: false }).limit(1).maybeSingle();

  const [snapshotResult, positionsResult, performanceResult, eventsResult, alertsResult] = await Promise.all([
    run ? supabase.from("account_snapshots").select("*").eq("sync_run_id", run.id).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    run ? supabase.from("position_snapshots").select("*").eq("sync_run_id", run.id).order("market_value", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("performance_points").select("*").eq("account_id", account.id).order("point_date", { ascending: true }).limit(2000),
    supabase.from("intelligence_events").select("*").order("published_at", { ascending: false }).limit(40),
    supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  const snapshot = snapshotResult.data;
  return NextResponse.json({
    configured: true,
    empty: !snapshot,
    account: { name: account.display_name, currency: account.base_currency, lastSyncedAt: run?.completed_at ?? null },
    snapshot: snapshot ? {
      asOf: snapshot.as_of, currency: snapshot.currency,
      netLiquidation: number(snapshot.net_liquidation), availableFunds: number(snapshot.available_funds),
      buyingPower: number(snapshot.buying_power), initialMargin: number(snapshot.initial_margin),
      maintenanceMargin: number(snapshot.maintenance_margin), excessLiquidity: number(snapshot.excess_liquidity),
      grossPositionValue: number(snapshot.gross_position_value),
    } : null,
    positions: (positionsResult.data ?? []).map((item) => ({
      contractId: number(item.contract_id), symbol: item.symbol, description: item.description,
      securityType: item.security_type, currency: item.currency, quantity: number(item.quantity),
      averageCost: number(item.average_cost), marketPrice: number(item.market_price), marketValue: number(item.market_value),
      unrealizedPnl: number(item.unrealized_pnl), dailyPnl: number(item.daily_pnl), bid: item.bid == null ? undefined : number(item.bid),
      ask: item.ask == null ? undefined : number(item.ask), impliedVolatility: item.implied_volatility == null ? undefined : number(item.implied_volatility),
      openInterest: item.open_interest == null ? undefined : number(item.open_interest), marketDataDelayed: item.market_data_delayed,
      marketDataAsOf: item.market_data_as_of,
    })),
    performance: (performanceResult.data ?? []).map((item) => ({
      date: item.point_date, nav: number(item.nav), cash: number(item.cash), marketValue: number(item.market_value),
      netExternalFlow: number(item.net_external_flow), dailyReturn: number(item.daily_return), cumulativeReturn: number(item.cumulative_return),
      realizedPnl: number(item.realized_pnl), unrealizedPnl: number(item.unrealized_pnl),
    })),
    events: (eventsResult.data ?? []).map((item) => ({
      id: item.id, symbol: item.symbol, eventType: item.event_type, severity: item.severity,
      titleOriginal: item.title_original, titleZh: item.title_zh, summaryZh: item.summary_zh, impactZh: item.impact_zh,
      sourceName: item.source_name, sourceUrl: item.source_url, publishedAt: item.published_at, detectedAt: item.detected_at, readAt: item.read_at,
    })),
    alerts: (alertsResult.data ?? []).map((item) => ({
      id: item.id, symbol: item.symbol, severity: item.severity, title: item.title, detail: item.detail,
      createdAt: item.created_at, read: Boolean(item.read_at),
    })),
  });
}
