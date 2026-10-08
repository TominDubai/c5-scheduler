"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
    });
    if (error) { setState("error"); setMsg(error.message); } else { setState("sent"); }
  }
  if (state === "sent") return <p className="msg">Link sent to <b>{email}</b>. Open it on this device to sign in.</p>;
  return (
    <form onSubmit={submit} className="form" style={{ gridTemplateColumns: "1fr" }}>
      <div className="field"><label htmlFor="email">Work email</label><input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@concept5.ae" /></div>
      <div className="actions"><button className="btn" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send sign-in link"}</button>{state === "error" && <span className="msg err">{msg}</span>}</div>
    </form>
  );
}
