import "server-only";
import { digestEmail } from "./digest-email";
import { emailConfigured, sendEmail } from "./email";
import { filterPermits } from "./permit-normalize";
import { permitMarket } from "./permit-sources";
import { tradeById } from "./permit-trades";
import { recentPermits } from "./permits";
import { planConfig } from "./plans";
import { listAccounts, saveAccount, userInfo } from "./store";
import { dailyLeads, digestDue, leadsForTrade, newSince, weeklyLeads } from "./sub-leads";

// Every 30 minutes: email subscribers whose digest is due. Daily plans get the
// morning's new leads; free plans get their week's 10 on Monday morning.
// DIGEST_HOUR_UTC (default 12, about 7am Central) sets the send time.

const g = globalThis as unknown as { __kontractDigests?: ReturnType<typeof setInterval>; __kontractDigestRun?: Promise<void> | null };

export async function runDigests(now = new Date()): Promise<{ sent: number; skipped: number; failed: number }> {
  const set = Number.parseInt(process.env.DIGEST_HOUR_UTC ?? "", 10);
  const hour = set >= 0 && set <= 23 ? set : 12;
  const appUrl = process.env.BETTER_AUTH_URL || "";
  const plans = planConfig();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const { userId, account } of listAccounts()) {
    if (account.role !== "sub" || !account.digest || !account.trade || !permitMarket(account.market)) continue;
    const kind = digestDue(account, now, Number.isFinite(hour) ? hour : 12);
    if (!kind) continue;
    const user = userInfo(userId);
    if (!user?.email) continue;
    try {
      const grouped = filterPermits(await recentPermits({ market: account.market }, 7), { days: 7, leadsOnly: true }).permits;
      const all = leadsForTrade(grouped, account.trade, account.zips);
      const picked = kind === "daily" ? newSince(dailyLeads(all, account.trade, now), account.lastDigestAt, now) : weeklyLeads(all, account.trade, plans.freePerWeek, account.weekly, now).picks;
      if (picked.length > 0) {
        const market = permitMarket(account.market)!;
        await sendEmail({
          to: user.email,
          ...digestEmail({ kind, trade: account.trade, tradeLabel: tradeById(account.trade).label, marketName: market.name.replace(/\s*\(.*\)$/, ""), leads: picked, appUrl, freePerWeek: plans.freePerWeek, dailyPrice: plans.dailyPrice, availableThisWeek: all.length }),
        });
        sent += 1;
      } else skipped += 1;
      await saveAccount(userId, { ...account, lastDigestAt: now.toISOString() });
    } catch (err) {
      failed += 1;
      console.error(`digest for ${userId} failed`, err);
    }
  }
  return { sent, skipped, failed };
}

export function startDigestJob(): void {
  if (g.__kontractDigests || !emailConfigured()) return;
  const run = () => {
    g.__kontractDigestRun ??= runDigests()
      .then((r) => {
        if (r.sent || r.failed) console.log("lead digests:", r);
      })
      .catch((err) => console.error("digest job failed", err))
      .finally(() => {
        g.__kontractDigestRun = null;
      });
  };
  g.__kontractDigests = setInterval(run, 30 * 60 * 1000);
  g.__kontractDigests.unref?.();
  setTimeout(run, 2 * 60 * 1000).unref?.();
}
