import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { shouldCreateImmediateAlert } from "@/lib/intelligence/policy";
import { authorizeIngestRequest, getSyncOwnerId } from "@/lib/server/ingest-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { IntelligenceEventType } from "@/types/workstation";

export const dynamic = "force-dynamic";

type IncomingEvent = {
  symbol: string;
  eventType: IntelligenceEventType;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  titleOriginal: string;
  titleZh: string;
  summaryZh: string;
  impactZh: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  raw?: Record<string, unknown>;
};

function isEvent(value: unknown): value is IncomingEvent {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return ["symbol", "eventType", "severity", "titleOriginal", "titleZh", "summaryZh", "impactZh", "sourceName", "sourceUrl", "publishedAt"]
    .every((key) => typeof item[key] === "string" && item[key] !== "");
}

export async function POST(request: NextRequest) {
  if (!authorizeIngestRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const payload = body as { idempotencyKey?: unknown; events?: unknown };
  if (typeof payload.idempotencyKey !== "string" || !Array.isArray(payload.events) || !payload.events.every(isEvent)) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const ownerId = getSyncOwnerId();
  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase.from("sync_runs").select("id,status")
    .eq("owner_id", ownerId).eq("source", "COMPANY_INTELLIGENCE")
    .eq("idempotency_key", payload.idempotencyKey).maybeSingle();
  if (existing?.status === "COMPLETED") {
    return NextResponse.json({ ok: true, duplicate: true, syncRunId: existing.id });
  }
  const { data: run, error: runError } = await supabase.from("sync_runs").upsert({
    owner_id: ownerId,
    source: "COMPANY_INTELLIGENCE",
    idempotency_key: payload.idempotencyKey,
    status: "RUNNING",
    started_at: new Date().toISOString(),
    completed_at: null,
    error_message: null,
  }, { onConflict: "owner_id,source,idempotency_key" }).select("id").single();
  if (runError || !run) return NextResponse.json({ error: runError?.message ?? "sync run failed" }, { status: 502 });

  try {
    let inserted = 0;
    for (const event of payload.events) {
      const fingerprint = createHash("sha256")
        .update(`${event.symbol}|${event.sourceUrl}|${event.publishedAt}|${event.titleOriginal}`)
        .digest("hex");
      const { data: saved, error } = await supabase.from("intelligence_events").upsert({
        owner_id: ownerId,
        sync_run_id: run.id,
        fingerprint,
        symbol: event.symbol.toUpperCase(),
        event_type: event.eventType,
        severity: event.severity,
        title_original: event.titleOriginal,
        title_zh: event.titleZh,
        summary_zh: event.summaryZh,
        impact_zh: event.impactZh,
        source_name: event.sourceName,
        source_url: event.sourceUrl,
        published_at: event.publishedAt,
        raw: event.raw ?? {},
      }, { onConflict: "owner_id,fingerprint", ignoreDuplicates: true }).select("id").maybeSingle();
      if (error) throw error;
      if (!saved) continue;
      inserted += 1;
      if (shouldCreateImmediateAlert(event.severity)) {
        const { error: alertError } = await supabase.from("alerts").insert({
          owner_id: ownerId,
          symbol: event.symbol.toUpperCase(),
          severity: event.severity,
          title: event.titleZh,
          detail: event.impactZh,
          source_event_id: saved.id,
        });
        if (alertError) throw alertError;
      }
    }
    await supabase.from("sync_runs").update({ status: "COMPLETED", completed_at: new Date().toISOString(), item_count: inserted }).eq("id", run.id);
    return NextResponse.json({ ok: true, duplicate: false, syncRunId: run.id, inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ingest failed";
    await supabase.from("sync_runs").update({ status: "FAILED", completed_at: new Date().toISOString(), error_message: message }).eq("id", run.id);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
