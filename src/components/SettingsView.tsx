"use client";

import { Download, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import type { CompanyProfile } from "@/lib/types";
import { authClient } from "@/lib/auth-client";
import { flushSaves, useApp } from "./state";
import { Avatar, Badge, Button, Card, Input, Label, NumberInput, Section, TextArea } from "./ui";

const FIELDS: { key: keyof CompanyProfile; label: string; hint?: string; placeholder?: string }[] = [
  { key: "companyName", label: "Company name", hint: "A broad name works for any kind of contract", placeholder: "Your company LLC" },
  { key: "uei", label: "UEI", hint: "From your SAM.gov registration", placeholder: "12-character Unique Entity ID" },
  { key: "cage", label: "CAGE code", hint: "Also from SAM.gov", placeholder: "5 characters" },
  { key: "address", label: "Business address" },
  { key: "contactName", label: "Your name" },
  { key: "contactTitle", label: "Title" },
  { key: "email", label: "Email", hint: "Use your business domain if you can" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
];

// What each connection does for the user, what happens without it, and (for
// whoever runs the site) how to turn it on.
const INTEGRATIONS = [
  {
    key: "sam" as const,
    name: "Federal opportunities",
    what: "Every open notice from SAM.gov's free daily file, checked hourly. Attachments are read straight from SAM.gov.",
    off: "",
    setup: "Nothing to set up. SAM_API_KEY is only a fallback for attachment links (about 10 requests a day without a role).",
  },
  {
    key: "claude" as const,
    name: "AI reading and drafts",
    what: "Plain-English breakdowns, item-by-item scope from bid documents, outreach scripts and proposals.",
    off: "Off: drafts are fill-in templates and bids get a rules-based read.",
    setup: "Set ANTHROPIC_API_KEY (from platform.claude.com) and restart.",
  },
  {
    key: "places" as const,
    name: "Local subcontractor search",
    what: "Real local businesses with ratings, phones and websites.",
    off: "Off: searches show sample businesses.",
    setup: "Set GOOGLE_PLACES_API_KEY (Places API New) or APIFY_API_TOKEN and restart.",
  },
  {
    key: "firecrawl" as const,
    name: "Website reader",
    what: "Reads a sub's website for licenses, phones and emails, and state or local bid pages for their documents.",
    off: "Off: open sub websites and state or local bid pages yourself.",
    setup: "Set FIRECRAWL_API_KEY and restart. Each page read costs one credit.",
  },
  {
    key: "usaspending" as const,
    name: "Past award pricing",
    what: "What the government paid before and who won similar work, from USAspending.gov.",
    off: "",
    setup: "Public and free. Always on.",
  },
];

export function SettingsView() {
  const profile = useApp((s) => s.profile);
  const status = useApp((s) => s.status);
  const saveProfile = useApp((s) => s.saveProfile);
  const say = useApp((s) => s.say);
  const deals = useApp((s) => s.deals);
  const contacts = useApp((s) => s.contacts);
  const [form, setForm] = useState<CompanyProfile | null>(profile);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const user = useApp((s) => s.user);
  const [checking, setChecking] = useState(false);
  const refreshStatus = useApp((s) => s.refreshStatus);

  async function checkSam() {
    setChecking(true);
    try {
      const res = await fetch("/api/opportunities/refresh", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshStatus();
      say("SAM.gov data is up to date");
    } catch (err) {
      say(`Couldn't check SAM.gov: ${(err as Error).message}`);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (profile && !form) setForm(profile);
  }, [profile, form]);

  if (!form) return <div className="p-6 text-sm text-ink-2">Loading…</div>;
  const set = (patch: Partial<CompanyProfile>) => setForm({ ...form, ...patch });

  return (
    <div className="scroll-thin min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-6 sm:px-6">
        <header>
          <h1 className="text-2xl font-semibold text-ink">Settings</h1>
          <p className="mt-1 text-[13px] text-ink-2">Your company details fill in every proposal and scope of work.</p>
        </header>

        <Section title="Account">
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <Avatar name={user?.name || user?.email || "You"} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{user?.name}</div>
              <div className="truncate text-[13px] text-ink-2">{user?.email}</div>
            </div>
            <Button
              busy={signingOut}
              onClick={async () => {
                setSigningOut(true);
                await flushSaves();
                await authClient.signOut();
                window.location.reload();
              }}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </Card>
          <p className="text-xs text-ink-3">Your bids, company profile and CRM are private to this account.</p>
        </Section>

        <Section title="Company profile">
          <Card className="p-4">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await saveProfile(form);
                } catch (err) {
                  say(`Couldn't save: ${(err as Error).message}`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {FIELDS.map((f) => (
                <label key={f.key} className={f.key === "address" || f.key === "companyName" ? "sm:col-span-2" : undefined}>
                  <Label hint={f.hint}>{f.label}</Label>
                  <Input value={String(form[f.key] ?? "")} placeholder={f.placeholder} onChange={(e) => set({ [f.key]: e.target.value })} />
                </label>
              ))}
              <label className="sm:col-span-2">
                <Label hint="A few sentences on what you do. Used in proposals.">Capabilities</Label>
                <TextArea rows={3} value={form.capabilities} onChange={(e) => set({ capabilities: e.target.value })} placeholder="We manage facility services for government customers through vetted local partners…" />
              </label>
              <label>
                <Label hint="Starting point for your price">Default markup %</Label>
                <NumberInput value={form.defaultMarkupPct} onChange={(n) => set({ defaultMarkupPct: n })} className="w-28" />
              </label>
              <div className="flex items-end justify-end sm:col-span-1">
                <Button type="submit" variant="primary" busy={busy}>
                  Save profile
                </Button>
              </div>
            </form>
          </Card>
        </Section>

        <Section title="What's connected" subtitle="What Kontract can do on this site. Whoever runs the site turns these on.">
          <Card className="divide-y divide-line">
            {INTEGRATIONS.map((i) => {
              const sam = status?.samData;
              const on = i.key === "usaspending" ? true : i.key === "places" ? Boolean(status?.places) : i.key === "sam" ? Boolean(sam?.count) : Boolean(status?.[i.key]);
              return (
                <div key={i.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex items-center gap-2 sm:w-48 sm:flex-col sm:items-start sm:gap-1">
                    <div className="text-[13px] font-semibold text-ink">{i.name}</div>
                    <Badge tone={on ? "good" : "neutral"}>
                      {i.key === "sam" ? (sam?.count ? `On · ${sam.count.toLocaleString()} notices` : sam?.refreshing ? "Downloading…" : "Not loaded") : on ? "On" : "Off"}
                    </Badge>
                  </div>
                  <div className="flex-1 text-xs text-ink-2">
                    <p>{i.what}</p>
                    {!on && i.off && <p className="mt-1 text-ink-3">{i.off}</p>}
                    {i.key === "sam" && (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className="text-ink-3">
                          {sam?.asOf
                            ? `File published ${formatDate(sam.asOf, { hour: "numeric", minute: "2-digit" })}`
                            : sam?.refreshing
                              ? "Downloading today's file…"
                              : "No file downloaded yet"}
                          {sam?.error && <span className="text-bad"> · Last check failed: {sam.error}</span>}
                        </span>
                        <Button size="sm" busy={checking} onClick={() => void checkSam()}>
                          Check for a new file
                        </Button>
                      </div>
                    )}
                    <details className="mt-1.5 text-ink-3">
                      <summary className="w-max cursor-pointer rounded hover:text-ink-2 pointer-coarse:py-2">Site setup</summary>
                      <p className="mt-1">
                        {i.setup}
                        {i.key === "claude" && status?.model && on && <> Using {status.model}.</>}
                      </p>
                    </details>
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>

        <Section title="Your data" subtitle="Bids, quotes, drafts and CRM contacts are saved on the server, under your account.">
          <Button
            onClick={() => {
              const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile, deals: Object.values(deals), contacts: Object.values(contacts) }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `kontract-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download className="size-4" /> Download a backup
          </Button>
        </Section>
      </div>
    </div>
  );
}
