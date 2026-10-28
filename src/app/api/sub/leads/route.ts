import { json, withUser } from "@/lib/http";
import { planConfig } from "@/lib/plans";
import { permitMarket } from "@/lib/permit-sources";
import { recentPermits } from "@/lib/permits";
import { filterPermits } from "@/lib/permit-normalize";
import { getAccount, saveAccount } from "@/lib/store";
import { dailyLeads, leadsForTrade, weeklyLeads, weekStart } from "@/lib/sub-leads";
import type { SubLeads } from "@/lib/types";

export const dynamic = "force-dynamic";

/** A subscriber's leads: this week's best 10 on free, every lead on daily. */
export const GET = withUser(async (_req, user) => {
  const account = await getAccount(user.id);
  const now = new Date();
  const base: SubLeads = { plan: account.plan, trade: account.trade ?? null, market: account.market ?? null, weekStart: weekStart(now), leads: [], availableThisWeek: 0 };
  if (!account.trade || !permitMarket(account.market)) return json(base);
  const permits = await recentPermits({ market: account.market }, 7);
  // One lead per address, then this trade (and their ZIPs).
  const grouped = filterPermits(permits, { days: 7, leadsOnly: true }).permits;
  const leads = leadsForTrade(grouped, account.trade, account.zips);
  if (account.plan === "daily") return json({ ...base, leads: dailyLeads(leads, account.trade, now), availableThisWeek: leads.length });
  const { picks, weekly } = weeklyLeads(leads, account.trade, planConfig().freePerWeek, account.weekly, now);
  if (weekly.weekStart !== account.weekly?.weekStart || weekly.ids.join() !== account.weekly?.ids.join()) await saveAccount(user.id, { ...account, weekly });
  return json({ ...base, leads: picks, availableThisWeek: leads.length });
});
