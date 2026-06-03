const JSONBIN_BASE = "https://api.jsonbin.io/v3";
const BIN_ID = "6a1d973021f9ee59d2a5a28b";
const API_KEY = "$2a$10$0y9bxoYUBgPfUb7kUXSaq.YEHt140BVrcYTw.O4BJjYIiCNp6sm0S";

if (!BIN_ID || !API_KEY) {
  console.warn(
    "JSONBin 未配置。请在 .env.local 中设置 NEXT_PUBLIC_JSONBIN_BIN_ID 和 NEXT_PUBLIC_JSONBIN_API_KEY"
  );
}

interface JsonBinMeta {
  id: string;
  createdAt: string;
  private: boolean;
}

interface JsonBinResponse<T> {
  record: T;
  metadata: JsonBinMeta;
}

export async function readData<T>(): Promise<T | null> {
  if (!BIN_ID || !API_KEY) return null;
  try {
    const res = await fetch(`${JSONBIN_BASE}/b/${BIN_ID}/latest`, {
      headers: { "X-Master-Key": API_KEY },
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 404) {
        // Bin 不存在，需初始化
        return null;
      }
      return null;
    }
    const data: JsonBinResponse<T> = await res.json();
    return data.record;
  } catch {
    return null;
  }
}

export async function createBin<T>(data: T): Promise<string | null> {
  if (!API_KEY) return null;
  try {
    const res = await fetch(`${JSONBIN_BASE}/b`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": API_KEY,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const result = await res.json();
    return result.metadata?.id || null;
  } catch {
    return null;
  }
}

export async function writeData<T>(data: T, keepalive = false): Promise<boolean> {
  try {
    const res = await fetch(`${JSONBIN_BASE}/b/${BIN_ID}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": API_KEY,
      },
      body: JSON.stringify(data),
      keepalive,
    });
    return res.ok;
  } catch {
    return false;
  }
}
