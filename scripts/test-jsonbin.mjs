import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

function loadEnv() {
  const envRaw = readFileSync(envPath, "utf-8");
  return Object.fromEntries(
    envRaw
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"))
      .map((l) => {
        const idx = l.indexOf("=");
        const val = l.slice(idx + 1).trim();
        return [l.slice(0, idx).trim(), val.replace(/\\\$/g, "$")];
      })
  );
}

function updateEnv(key, value) {
  let envRaw = readFileSync(envPath, "utf-8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(envRaw)) {
    envRaw = envRaw.replace(regex, `${key}=${value}`);
  } else {
    envRaw += `\n${key}=${value}`;
  }
  writeFileSync(envPath, envRaw, "utf-8");
  console.log(`   💾 已更新 .env.local: ${key}=${value}`);
}

async function testConnection() {
  console.log("=== JSONBin 连接测试 ===\n");
  const env = loadEnv();
  let { NEXT_PUBLIC_JSONBIN_BIN_ID: BIN_ID, NEXT_PUBLIC_JSONBIN_API_KEY: API_KEY } = env;

  if (!API_KEY) {
    console.error("❌ .env.local 中缺少 NEXT_PUBLIC_JSONBIN_API_KEY");
    process.exit(1);
  }

  console.log(`API Key: ${API_KEY.slice(0, 10)}...`);

  // Step 1: API Key 认证测试 (读取非存在的 bin 应返回 401/403 而非 404)
  console.log("\n1. 测试 API Key 有效性...");
  try {
    const res = await fetch("https://api.jsonbin.io/v3/b/nonexistent", {
      headers: { "X-Master-Key": API_KEY },
    });
    if (res.status === 401 || res.status === 403) {
      console.log("   ❌ API Key 无效 (被拒绝访问)");
      return;
    }
    console.log("   ✅ API Key 有效");
  } catch (err) {
    console.log(`   ⚠️  网络错误 (可能无互联网): ${err.message}`);
    return;
  }

  // Step 2: 尝试读取已有 Bin
  if (BIN_ID) {
    console.log(`\n2. 尝试读取 Bin (${BIN_ID})...`);
    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
        headers: { "X-Master-Key": API_KEY },
      });

      if (res.ok) {
        const data = await res.json();
        const record = data.record;
        const keys = Object.keys(record);
        console.log(`   ✅ 读取成功!`);
        console.log(`   📦 数据键: ${keys.join(", ")}`);
        for (const k of keys) {
          const val = record[k];
          console.log(
            `      - ${k}: ${Array.isArray(val) ? `数组(${val.length}条)` : typeof val === "object" && val !== null ? "对象" : typeof val}`
          );
        }
        return; // all good
      } else if (res.status === 404) {
        console.log("   ⚠️  Bin 不存在 (404)");
      } else {
        console.log(`   ❌ 读取失败 (${res.status}): ${await res.text()}`);
        return;
      }
    } catch (err) {
      console.log(`   ❌ 网络错误: ${err.message}`);
      return;
    }
  } else {
    console.log("\n2. 未配置 Bin ID，跳过读取");
  }

  // Step 3: 创建新 Bin
  console.log("\n3. 创建新 Bin...");
  try {
    const res = await fetch("https://api.jsonbin.io/v3/b", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": API_KEY,
      },
      body: JSON.stringify({ _created: new Date().toISOString() }),
    });

    if (res.ok) {
      const result = await res.json();
      const newId = result.metadata?.id;
      console.log(`   ✅ 创建成功! 新 Bin ID: ${newId}`);
      updateEnv("NEXT_PUBLIC_JSONBIN_BIN_ID", newId);
      BIN_ID = newId;
    } else {
      console.log(`   ❌ 创建失败 (${res.status}): ${await res.text()}`);
      return;
    }
  } catch (err) {
    console.log(`   ❌ 网络错误: ${err.message}`);
    return;
  }

  // Step 4: 回读验证
  console.log("\n4. 回读验证新 Bin...");
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { "X-Master-Key": API_KEY },
    });
    if (res.ok) {
      const data = await res.json();
      console.log(
        `   ✅ 验证成功! 内容: ${JSON.stringify(data.record)}`
      );
    } else {
      console.log(`   ❌ 回读失败 (${res.status})`);
    }
  } catch (err) {
    console.log(`   ❌ 网络错误: ${err.message}`);
  }

  console.log("\n=== 测试完成 ===");
}

testConnection().catch(console.error);
