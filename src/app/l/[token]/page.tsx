import type { Metadata } from "next";
import { LeadPage } from "@/components/LeadView";

export const metadata: Metadata = { title: "A lead for you · Kontract", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <LeadPage token={(await params).token} />;
}
