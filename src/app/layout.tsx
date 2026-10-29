import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

// Self-hosted at build time; the page loads it from this site.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: "Kontract",
  description: "Find government contracts, price them against past awards, line up subcontractors, and draft proposals.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f7f4",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
