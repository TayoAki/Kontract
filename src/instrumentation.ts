// Runs once when the server starts: begin loading SAM.gov's daily file so the
// first search doesn't have to wait for the download, and start the
// background jobs (permit feed sync and health checks, state and local bids,
// subscriber lead digests).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSamDataSync } = await import("./lib/sam-bulk");
    startSamDataSync();
    const { ensureAuthReady } = await import("./lib/auth");
    await ensureAuthReady();
    const { startPermitSync } = await import("./lib/permits");
    startPermitSync();
    const { startSledSync } = await import("./lib/sled");
    startSledSync();
    const { startDigestJob } = await import("./lib/digests");
    startDigestJob();
  }
}
