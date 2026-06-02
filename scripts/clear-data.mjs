import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

const envRaw = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      const val = l.slice(idx + 1).trim();
      return [l.slice(0, idx).trim(), val.replace(/\\\$/g, "$")];
    })
);

const BIN_ID = env["NEXT_PUBLIC_JSONBIN_BIN_ID"];
const API_KEY = env["NEXT_PUBLIC_JSONBIN_API_KEY"];

const emptyData = {
  tradeRecords: [],
  tradePlans: [],
  journalEntries: [],
  snapshots: [],
  dailyReturns: [],
  baseCash: 10000,
};

async function clear() {
  if (!BIN_ID || !API_KEY) {
    console.error("❌ 缺少 JSONBin 配置");
    process.exit(1);
  }

  console.log("=== 清空 JSONBin 数据 ===\n");

  const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": API_KEY,
    },
    body: JSON.stringify(emptyData),
  });

  if (res.ok) {
    console.log("✅ JSONBin 已清空");
  } else {
    console.log(`❌ 写入失败 (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
}

clear().catch(console.error);
