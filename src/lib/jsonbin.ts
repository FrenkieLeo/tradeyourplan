// 客户端只与同源服务端路由 /api/data 通信，密钥由服务端持有（见 src/app/api/data/route.ts）。

export async function readData<T>(): Promise<T | null> {
  try {
    const res = await fetch("/api/data", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.record ?? null) as T | null;
  } catch {
    return null;
  }
}

export async function createBin<T>(data: T): Promise<string | null> {
  try {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    const result = await res.json();
    return result.id ?? null;
  } catch {
    return null;
  }
}

export async function writeData<T>(data: T, keepalive = false): Promise<boolean> {
  try {
    const res = await fetch("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      keepalive,
    });
    if (!res.ok) return false;
    const result = await res.json().catch(() => ({ ok: res.ok }));
    return result.ok ?? res.ok;
  } catch {
    return false;
  }
}
