import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 服务端代理 Alpha Vantage：密钥只存在于服务端，不下发到浏览器。
// 环境变量名：ALPHAVANTAGE_API_KEY
const BASE_URL = "https://www.alphavantage.co/query";
const API_KEY = process.env.ALPHAVANTAGE_API_KEY ?? "RJFNH4AQQR0KXNKT";

const ALLOWED_FN = new Set(["GLOBAL_QUOTE", "TIME_SERIES_WEEKLY", "TIME_SERIES_DAILY"]);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const fn = searchParams.get("fn") ?? "GLOBAL_QUOTE";
  if (!symbol) return NextResponse.json({ error: "missing symbol" }, { status: 400 });
  if (!ALLOWED_FN.has(fn)) return NextResponse.json({ error: "invalid fn" }, { status: 400 });
  try {
    const res = await fetch(
      `${BASE_URL}?function=${encodeURIComponent(fn)}&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`,
      { cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
