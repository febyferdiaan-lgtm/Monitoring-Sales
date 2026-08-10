export type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<{ meta: { last_row_id?: number }; success?: boolean }>;
};

export type D1DatabaseLike = {
  prepare: (sql: string) => D1StatementLike;
  batch: (statements: D1StatementLike[]) => Promise<unknown>;
};

export async function getD1Database(): Promise<D1DatabaseLike> {
  const runtimeModule = "cloudflare:workers";
  const runtime = await import(runtimeModule) as { env?: { DB?: D1DatabaseLike } };
  if (!runtime.env?.DB) throw new Error("Database binding is unavailable");
  return runtime.env.DB;
}
