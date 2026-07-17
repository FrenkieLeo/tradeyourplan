# IBKR 私人投资工作台接入说明

## 数据边界

- IBKR 是账户、持仓、成交、现金、股票与期权行情的唯一事实来源。
- Alpha Vantage 自动拉价已停用；旧接口在没有显式配置时返回 503。
- 历史收益曲线使用 IBKR Flex Query 的完整成交与现金流水重建：移动加权平均成本、TWR 主曲线、美元盈亏辅助展示。
- 公司情报仅接受公司官网、投资者关系、SEC/EDGAR 与基金发行方；不采集 X、YouTube 或第三方转载。
- 官方来源每 12 小时检查一次。财报只提炼中文结构化指标；其他重大事件翻译标题、关键事实与潜在影响。

## 服务端配置

部署环境需要配置以下变量，值只保存在部署平台或密钥管理器中，不写入仓库：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SYNC_OWNER_ID`：Supabase Auth 中唯一账户的用户 ID
- `INGEST_API_SECRET`：同步任务调用写入接口的 Bearer 密钥

在 Supabase 执行 `supabase/migrations/202607170001_ibkr_workstation.sql`。所有个人表都启用了 RLS，浏览器会话只能访问自己的数据；服务角色仅用于受保护的同步入口。

## 同步任务

IBKR 同步器应在受保护的服务器或本机任务中运行，不在浏览器中保存券商会话：

1. 市场时段每 15 分钟读取账户摘要、持仓与所持期权的 bid/ask、隐含波动率、持仓量；收盘后补一次最终快照。
2. 首次运行从 Flex Query 导入账户成立以来的全部成交、入出金、分红、利息、费用和税款，在同步器中调用 `rebuildAccountHistory` 生成每日 TWR 点。
3. 将结果按 `src/lib/ibkr/sync-contract.ts` 的结构 POST 到 `/api/ingest/ibkr`，使用稳定的 `idempotencyKey`，避免重复写入。
4. 同步 IBKR 自选列表；公司与 ETF 映射到官方来源，外汇不进入公司情报队列，期权映射到对应正股。
5. 每 12 小时检查到期官方来源，将已翻译、可追溯的事件 POST 到 `/api/ingest/intelligence`。HIGH/CRITICAL 事件自动生成即时风险提醒，其余进入摘要。

两个写入接口都要求 `Authorization: Bearer <INGEST_API_SECRET>`。只有状态为 `COMPLETED` 的同步批次才应被前台视为完整数据。

## 上线前检查

- 在 Supabase Auth 设置唯一允许登录的邮箱并关闭公开注册。
- 轮换旧版本中曾出现过的 Alpha Vantage 与 JSONBin 密钥；当前代码已经移除硬编码回退值，但 Git 历史不等于密钥保险箱。
- 用一小段 Flex Query 对照 IBKR Activity Statement，核对拆股、转仓、做空翻仓、期权乘数和多币种换算后，再执行全量回溯。
- 同步失败时保留上一批已完成数据，并通过 `sync_runs` 查看错误，不展示半批数据。
