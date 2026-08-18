// Vercel uses the existing Supabase dataset. The embedded Cloudflare seed is
// intentionally empty on this deployment branch to keep the source upload lean.
/* eslint-disable @typescript-eslint/no-explicit-any */
type SeedRow = Record<string, any>;

export const excelSeed = {
  importVersion: "supabase-managed",
  sourceFile: "Monitoring Sales.xlsx",
  importedAt: "2026-08-18",
  rawRecords: [] as SeedRow[],
  sales: [] as SeedRow[],
  spareParts: [] as SeedRow[],
};
