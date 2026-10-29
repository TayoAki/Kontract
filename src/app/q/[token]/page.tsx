import type { Metadata } from "next";
import { QuotePage } from "@/components/QuotePage";

export const metadata: Metadata = { title: "Quote request · Kontract", robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ preview?: string }> }) {
  return <QuotePage token={(await params).token} preview={(await searchParams).preview === "1"} />;
}
