export type AppRole = "ADMIN" | "EDITOR" | "VIEWER";

export type AppIdentity = {
  email: string;
  name: string;
  role: AppRole;
};

const ownerEmail = "febyferdiaan@gmail.com";

async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

export async function ensureAppUsers() {
  const db = await getD1();
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'VIEWER',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS app_users_role_idx ON app_users(role)").run();
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO app_users (email, name, role, is_active, created_at, updated_at)
     VALUES (?, ?, 'ADMIN', 1, ?, ?)
     ON CONFLICT(email) DO UPDATE SET role='ADMIN', is_active=1, updated_at=excluded.updated_at`,
  ).bind(ownerEmail, "Feby Ferdian", now, now).run();
}

function decodeName(headers: Headers) {
  const encoded = headers.get("oai-authenticated-user-full-name");
  if (!encoded || headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return "";
  }
}

export async function getAppIdentity(request: Request): Promise<AppIdentity | null> {
  const email = (
    request.headers.get("oai-authenticated-user-email")
    || (process.env.NODE_ENV === "development" ? ownerEmail : "")
  ).trim().toLowerCase();
  if (!email) return null;
  await ensureAppUsers();
  const db = await getD1();
  const stored = await db.prepare(
    "SELECT email, name, role FROM app_users WHERE email = ? AND is_active = 1",
  ).bind(email).first<{ email: string; name: string; role: AppRole }>();
  return {
    email,
    name: stored?.name || decodeName(request.headers) || email,
    role: stored?.role === "ADMIN" || stored?.role === "EDITOR" ? stored.role : "VIEWER",
  };
}

export async function requireRole(request: Request, allowed: AppRole[]) {
  const identity = await getAppIdentity(request);
  if (!identity) return { identity: null, error: "Silakan login untuk melanjutkan.", status: 401 };
  if (!allowed.includes(identity.role)) return { identity, error: "Anda tidak memiliki izin untuk tindakan ini.", status: 403 };
  return { identity, error: null, status: 200 };
}
