import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 服务端代理 JSONBin：密钥只存在于服务端，不再下发到浏览器。
// 优先读环境变量（推荐在 Vercel 配置）；未设置时回退到既有值以保证不中断。
// 环境变量名：JSONBIN_BIN_ID、JSONBIN_API_KEY
const JSONBIN_BASE = "https://api.jsonbin.io/v3";
const BIN_ID = process.env.JSONBIN_BIN_ID ?? "6a1d973021f9ee59d2a5a28b";
const API_KEY =
  process.env.JSONBIN_API_KEY ??
  "$2a$10$0y9bxoYUBgPfUb7kUXSaq.YEHt140BVrcYTw.O4BJjYIiCNp6sm0S";

export async function GET() {
  try {
    const res = await fetch(`${JSONBIN_BASE}/b/${BIN_ID}/latest`, {
      headers: { "X-Master-Key": API_KEY },
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
  try {
    const body = await req.text();
    const res = await fetch(`${JSONBIN_BASE}/b/${BIN_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Master-Key": API_KEY },
      body,
    });
    return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const res = await fetch(`${JSONBIN_BASE}/b`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Master-Key": API_KEY },
      body,
    });
    if (!res.ok) return NextResponse.json({ id: null }, { status: 502 });
    const result = await res.json();
    return NextResponse.json({ id: result.metadata?.id ?? null });
  } catch {
    return NextResponse.json({ id: null }, { status: 502 });
  }
}
