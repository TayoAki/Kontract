// Runs once when the server starts: begin loading SAM.gov's daily file so the
// first search doesn't have to wait for the download.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSamDataSync } = await import("./lib/sam-bulk");
    startSamDataSync();
    const { ensureAuthReady } = await import("./lib/auth");
    await ensureAuthReady();
  }
}
