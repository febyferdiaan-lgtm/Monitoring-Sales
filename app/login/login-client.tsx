"use client";

import { FormEvent, useState } from "react";
import { createSupabaseBrowserClient } from "../supabase/client";

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    setStatus(error ? error.message : "Tautan login sudah dikirim. Silakan periksa email Anda.");
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <img src="/mda-logo.png" alt="PT MDA Amanah Sejahtera" />
        <p className="eyebrow">PT MDA AMANAH SEJAHTERA</p>
        <h1>Monitoring Sales</h1>
        <p>Masuk menggunakan email yang sudah terdaftar pada akses pengguna.</p>
        <form onSubmit={submit}>
          <label htmlFor="email">Alamat email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          <button type="submit" disabled={loading}>{loading ? "Mengirim…" : "Kirim tautan login"}</button>
        </form>
        {status ? <p className="login-status" role="status">{status}</p> : null}
      </section>
    </main>
  );
}
