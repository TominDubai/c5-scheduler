"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: "email" });
    if (error) { setBusy(false); setMsg(error.message.includes("expired") || error.message.includes("invalid") ? "That code didn’t work. Check it or request a new one." : error.message); return; }
    // session cookie is set; the server checks the team list
    const res = await fetch("/auth/check", { method: "POST" });
    const { ok } = await res.json();
    if (!ok) { await supabase.auth.signOut(); setBusy(false); setMsg("That email isn’t on the Concept 5 team list. Ask Tom or Aftab to add you."); setStep("email"); return; }
    router.replace("/board"); router.refresh();
  }

  if (step === "code") return (
    <form onSubmit={verify} className="form" style={{ gridTemplateColumns: "1fr" }}>
      <p style={{ margin: 0 }}>We’ve emailed a 6-digit code to <b>{email}</b>. It’s valid for an hour.</p>
      <div className="field"><label htmlFor="code">Code</label>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ fontSize: 22, letterSpacing: ".3em", fontFamily: "var(--mono)" }} /></div>
      <div className="actions">
        <button className="btn" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
        <button type="button" className="btn ghost" onClick={() => { setStep("email"); setCode(""); setMsg(""); }}>Use a different email</button>
        {msg && <span className="msg err">{msg}</span>}
      </div>
    </form>
  );
  return (
    <form onSubmit={sendCode} className="form" style={{ gridTemplateColumns: "1fr" }}>
      <div className="field"><label htmlFor="email">Work email</label><input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@concept-5.com" /></div>
      <div className="actions"><button className="btn" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>{msg && <span className="msg err">{msg}</span>}</div>
    </form>
  );
}
