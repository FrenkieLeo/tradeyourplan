"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setMessage(error ? error.message : "登录链接已发送，请检查邮箱。链接使用后会回到工作台。");
    setBusy(false);
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">T</div>
        <p className="eyebrow">PRIVATE INVESTMENT OS</p>
        <h1>TradeYourPlan</h1>
        <p className="muted">使用你的授权邮箱进入。账户、持仓与交易数据由 IBKR 同步，浏览器不会保存券商凭据。</p>
        <form onSubmit={signIn}>
          <label htmlFor="email">邮箱</label>
          <input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          <button className="primary-button" disabled={busy}>{busy ? "发送中…" : "发送安全登录链接"}</button>
        </form>
        {message && <p className="login-message">{message}</p>}
      </section>
    </main>
  );
}
