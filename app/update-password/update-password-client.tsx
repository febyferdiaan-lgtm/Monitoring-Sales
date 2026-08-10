"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../supabase/client";

export default function UpdatePasswordClient() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    if (password.length < 8) {
      setStatus("Password baru minimal 8 karakter.");
      return;
    }
    if (password !== confirmation) {
      setStatus("Konfirmasi password belum sama.");
      return;
    }
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      setStatus("Password belum dapat diperbarui. Silakan minta tautan pemulihan baru.");
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <img src="/mda-logo.png" alt="PT MDA Amanah Sejahtera" />
        <p className="eyebrow">PT MDA AMANAH SEJAHTERA</p>
        <h1>Buat Password Baru</h1>
        <p>Masukkan password baru untuk akun Monitoring Sales Anda.</p>
        <form onSubmit={submit}>
          <label htmlFor="new-password">Password baru</label>
          <div className="login-password-field">
            <input id="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Minimal 8 karakter" />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
              {showPassword ? "Sembunyikan" : "Lihat"}
            </button>
          </div>
          <label htmlFor="confirm-password">Konfirmasi password baru</label>
          <input id="confirm-password" type={showPassword ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} autoComplete="new-password" placeholder="Ulangi password baru" />
          <p className="password-requirements">Gunakan minimal 8 karakter dan hindari password yang mudah ditebak.</p>
          <button type="submit" className="login-submit" disabled={loading}>{loading ? "Menyimpan…" : "Simpan Password Baru"}</button>
        </form>
        {status ? <p className="login-status login-error" role="alert">{status}</p> : null}
      </section>
    </main>
  );
}
