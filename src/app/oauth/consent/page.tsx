import type { Metadata } from "next";
import { OAuthConsent } from "@/components/OAuthConsent";

export const metadata: Metadata = { title: "Connect an assistant · Kontract", robots: { index: false, follow: false } };

export default function Page() {
  return <OAuthConsent />;
}
