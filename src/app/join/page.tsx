import type { Metadata } from "next";
import { App } from "@/components/App";

export const metadata: Metadata = {
  title: "Join free · Kontract",
  description: "Free building-permit leads for your trade every week, plus jobs to quote from local contractors.",
};

/** The invite link subs sign up through: /join?ref=<inviter>&trade=fence&market=austin-tx */
export default async function Join({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <App join={{ ref: one(p.ref), trade: one(p.trade), market: one(p.market) }} />;
}
