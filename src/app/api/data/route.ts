import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 服务端代理 JSONBin：密钥只存在于服务端，不再下发到浏览器。
// 优先读环境变量（推荐在 Vercel 配置）；未设置时回退到既有值以保证不中断。
// 环境变量名：JSONBIN_BIN_ID、JSONBIN_API_KEY
const JSONBIN_BASE = "https://api.jsonbin.io/v3";
// v2 bin：与旧版客户端隔离。旧缓存页面仍直连旧 bin（6a1d97...），已不再影响这里。
const BIN_ID = process.env.JSONBIN_BIN_ID;
const API_KEY = process.env.JSONBIN_API_KEY;

function hasJsonBinConfig() {
  return Boolean(BIN_ID && API_KEY);
}

function getJsonBinConfig() {
  if (!BIN_ID || !API_KEY) throw new Error("JSONBin configuration is missing");
  return { binId: BIN_ID, apiKey: API_KEY };
}

export async function GET() {
  if (!hasJsonBinConfig()) {
    return NextResponse.json({ record: null, disabled: true }, { status: 503 });
  }
  try {
    const { binId, apiKey } = getJsonBinConfig();
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}/latest`, {
      headers: { "X-Master-Key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ record: null });
    const data = await res.json();
    return NextResponse.json({ record: data.record ?? null });
  } catch {
    return NextResponse.json({ record: null });
  }
}

export async function PUT(req: NextRequest) {
  if (!hasJsonBinConfig()) {
    return NextResponse.json({ ok: false, disabled: true }, { status: 503 });
  }
  try {
    const { binId, apiKey } = getJsonBinConfig();
    const body = await req.text();
    const res = await fetch(`${JSONBIN_BASE}/b/${binId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": apiKey },
      body,
    });
    return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!hasJsonBinConfig()) {
    return NextResponse.json({ id: null, disabled: true }, { status: 503 });
  }
  try {
    const { apiKey } = getJsonBinConfig();
    const body = await req.text();
    const res = await fetch(`${JSONBIN_BASE}/b`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Master-Key": apiKey },
      body,
    });
    if (!res.ok) return NextResponse.json({ id: null }, { status: 502 });
    const result = await res.json();
    return NextResponse.json({ id: result.metadata?.id ?? null });
  } catch {
    return NextResponse.json({ id: null }, { status: 502 });
  }
}
