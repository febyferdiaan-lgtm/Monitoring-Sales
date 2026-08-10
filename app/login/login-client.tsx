"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../supabase/client";

export default function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setLoading(false);
      setStatus("Email atau password tidak sesuai.");
      return;
    }

    const access = await fetch("/api/me", { cache: "no-store" });
    if (!access.ok) {
      await supabase.auth.signOut();
      setLoading(false);
      setStatus("Akun ini belum terdaftar atau aksesnya sudah dinonaktifkan.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <img src="/mda-logo.png" alt="PT MDA Amanah Sejahtera" />
        <p className="eyebrow">PT MDA AMANAH SEJAHTERA</p>
        <h1>Monitoring Sales</h1>
        <p>Masuk menggunakan email dan password akun yang sudah terdaftar.</p>
        <form onSubmit={submit}>
          <label htmlFor="email">Alamat email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" placeholder="nama@perusahaan.com" />
          <label htmlFor="password">Password</label>
          <div className="login-password-field">
            <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="Masukkan password" />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
              {showPassword ? "Sembunyikan" : "Lihat"}
            </button>
          </div>
          <button type="submit" className="login-submit" disabled={loading}>{loading ? "Memeriksa…" : "Masuk ke Dashboard"}</button>
        </form>
        {status ? <p className="login-status login-error" role="alert">{status}</p> : null}
      </section>
    </main>
  );
}
