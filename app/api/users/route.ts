import { NextRequest, NextResponse } from "next/server";
import { ensureAppUsers, requireRole, type AppRole } from "../../authz";

const roles: AppRole[] = ["ADMIN", "EDITOR", "VIEWER"];

async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

export async function GET(request: NextRequest) {
  const access = await requireRole(request, ["ADMIN"]);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  await ensureAppUsers();
  const result = await (await getD1()).prepare(
    "SELECT id, email, name, role, is_active, created_at, updated_at FROM app_users ORDER BY role, name, email",
  ).all();
  return NextResponse.json({ data: result.results });
}

export async function POST(request: NextRequest) {
  const access = await requireRole(request, ["ADMIN"]);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json() as { email?: string; name?: string; role?: AppRole };
  const email = String(body.email || "").trim().toLowerCase();
  const role = roles.includes(body.role as AppRole) ? body.role as AppRole : "VIEWER";
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Email tidak valid." }, { status: 400 });
  const now = new Date().toISOString();
  await (await getD1()).prepare(
    `INSERT INTO app_users (email, name, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name=excluded.name, role=excluded.role, is_active=1, updated_at=excluded.updated_at`,
  ).bind(email, String(body.name || "").trim(), role, now, now).run();
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const access = await requireRole(request, ["ADMIN"]);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json() as { id?: number; role?: AppRole; is_active?: boolean };
  const role = roles.includes(body.role as AppRole) ? body.role as AppRole : "VIEWER";
  if (!body.id) return NextResponse.json({ error: "ID pengguna wajib diisi." }, { status: 400 });
  await (await getD1()).prepare(
    "UPDATE app_users SET role=?, is_active=?, updated_at=? WHERE id=?",
  ).bind(role, body.is_active === false ? 0 : 1, new Date().toISOString(), Number(body.id)).run();
  return NextResponse.json({ ok: true });
}

