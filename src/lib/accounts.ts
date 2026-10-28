import "server-only";
import { findContact, logActivity, newContact } from "./crm";
import { permitMarket } from "./permit-sources";
import { TRADES } from "./permit-trades";
import { getAccount, listContacts, saveAccount, saveContact, userInfo } from "./store";
import type { Account, TradeId } from "./types";

// What a user can change on their own account. Plan and billing fields only
// change through Stripe.

export interface AccountPatch {
  role?: Account["role"];
  company?: string;
  trade?: string;
  market?: string;
  zips?: string[];
  website?: string;
  phone?: string;
  digest?: boolean;
  invitedBy?: string;
}

const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) || undefined : undefined);

export async function updateAccount(userId: string, patch: AccountPatch): Promise<Account> {
  const current = await getAccount(userId);
  const next: Account = { ...current };
  if (patch.role === "prime" || patch.role === "sub") next.role = patch.role;
  if ("company" in patch) next.company = clean(patch.company);
  if ("trade" in patch) next.trade = TRADES.some((t) => t.id === patch.trade) ? (patch.trade as TradeId) : undefined;
  if ("market" in patch) next.market = permitMarket(patch.market) ? patch.market : undefined;
  if ("zips" in patch) next.zips = Array.isArray(patch.zips) ? [...new Set(patch.zips.filter((z) => /^\d{5}$/.test(z)))].slice(0, 25) : undefined;
  if ("website" in patch) next.website = clean(patch.website);
  if ("phone" in patch) next.phone = clean(patch.phone, 40);
  if (typeof patch.digest === "boolean") next.digest = patch.digest;
  // Credit the invite once, and put the new sub on that prime's bench.
  if (patch.invitedBy && !current.invitedBy && patch.invitedBy !== userId && userInfo(patch.invitedBy)) {
    next.invitedBy = patch.invitedBy;
    await addToInviterBench(patch.invitedBy, userId, next);
  }
  return saveAccount(userId, next);
}

async function addToInviterBench(primeId: string, subUserId: string, a: Account): Promise<void> {
  const me = userInfo(subUserId);
  const company = a.company || me?.name || me?.email;
  if (!company) return;
  const market = permitMarket(a.market);
  const existing = findContact(await listContacts(primeId), company);
  const base =
    existing ??
    newContact({
      company,
      trade: a.trade,
      email: me?.email,
      phone: a.phone,
      website: a.website,
      market: a.market,
      city: market?.name.replace(/\s*\(.*\)$/, ""),
      state: market?.state,
      source: "signup",
      stage: "contacted",
    });
  await saveContact(primeId, { ...logActivity(base, "note", "Signed up through your invite: gets free permit leads and your quote requests."), email: base.email ?? me?.email, updatedAt: new Date().toISOString() });
}
