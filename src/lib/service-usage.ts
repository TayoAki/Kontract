import "server-only";
import { getDb } from "./db";

// Engine API usage by workspace: written once per call by withService, read
// by GET /api/v1/usage.

export function recordServiceCall(row: { workspaceId: string; endpoint: string; costMicro: number; status: number }): void {
  try {
    getDb()
      .prepare("INSERT INTO service_call (workspace_id, endpoint, cost_micro, status, at) VALUES (?, ?, ?, ?, ?)")
      .run(row.workspaceId, row.endpoint, Math.max(0, Math.round(row.costMicro)), row.status, new Date().toISOString());
  } catch (err) {
    console.error("couldn't record an engine API call", err);
  }
}

export interface Usage {
  workspace: string;
  month: string;
  calls: number;
  costMicro: number;
  byEndpoint: Record<string, { calls: number; costMicro: number }>;
}

/** Calls and spend for one workspace in one calendar month (UTC), `month` as YYYY-MM. */
export function usageFor(workspace: string, month: string): Usage {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const to = new Date(Date.UTC(y, m, 1)).toISOString();
  const rows = getDb()
    .prepare("SELECT endpoint, COUNT(*) AS calls, SUM(cost_micro) AS cost FROM service_call WHERE workspace_id = ? AND at >= ? AND at < ? GROUP BY endpoint ORDER BY endpoint")
    .all(workspace, from, to) as { endpoint: string; calls: number; cost: number | null }[];
  const byEndpoint = Object.fromEntries(rows.map((r) => [r.endpoint, { calls: r.calls, costMicro: r.cost ?? 0 }]));
  return { workspace, month, calls: rows.reduce((n, r) => n + r.calls, 0), costMicro: rows.reduce((n, r) => n + (r.cost ?? 0), 0), byEndpoint };
}
