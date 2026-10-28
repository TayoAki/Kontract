"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import type { CompanyProfile } from "@/lib/types";
import { useApp } from "./state";
import { Badge, Button, Card, Input, Label, NumberInput, Section, TextArea } from "./ui";

const FIELDS: { key: keyof CompanyProfile; label: string; hint?: string; placeholder?: string }[] = [
  { key: "companyName", label: "Company name", hint: "A broad name works for any kind of contract", placeholder: "Natalie Services LLC" },
  { key: "uei", label: "UEI", hint: "From your SAM.gov registration", placeholder: "12-character Unique Entity ID" },
  { key: "cage", label: "CAGE code", hint: "Also from SAM.gov", placeholder: "5 characters" },
  { key: "address", label: "Business address" },
  { key: "contactName", label: "Your name" },
  { key: "contactTitle", label: "Title" },
  { key: "email", label: "Email", hint: "Use your business domain if you can" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
];

const INTEGRATIONS = [
  {
    key: "sam" as const,
    name: "SAM.gov opportunities",
    env: "SAM_API_KEY",
    what: "Live contract opportunities and full descriptions.",
    how: "Free. Sign in at sam.gov → Profile → Public API Key. Without a role, keys allow about 10 requests a day; Kontract caches results.",
  },
  {
    key: "claude" as const,
    name: "Claude",
    env: "ANTHROPIC_API_KEY",
    what: "Plain-English breakdowns, scopes of work, outreach scripts and proposals.",
    how: "Create a key at platform.claude.com. Without it, Kontract uses fill-in templates.",
  },
  {
    key: "places" as const,
    name: "Subcontractor search",
    env: "GOOGLE_PLACES_API_KEY or APIFY_API_TOKEN",
    what: "Real local businesses with ratings, phones and websites.",
    how: "Google Places API (New) is fastest. Apify uses the compass/crawler-google-places actor.",
  },
  {
    key: "usaspending" as const,
    name: "USAspending.gov",
    env: "none",
    what: "Past award pricing and companies that already won similar work.",
    how: "Public and free. Always on.",
  },
];

export function SettingsView() {
  const profile = useApp((s) => s.profile);
  const status = useApp((s) => s.status);
  const saveProfile = useApp((s) => s.saveProfile);
  const say = useApp((s) => s.say);
  const deals = useApp((s) => s.deals);
  const [form, setForm] = useState<CompanyProfile | null>(profile);
  const [busy, setBusy] = useState(false);

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

        <Section title="Connections" subtitle="Add keys to .env.local next to package.json, then restart the app.">
          <Card className="divide-y divide-line">
            {INTEGRATIONS.map((i) => {
              const on = i.key === "usaspending" ? true : i.key === "places" ? Boolean(status?.places) : Boolean(status?.[i.key]);
              return (
                <div key={i.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="sm:w-48">
                    <div className="text-[13px] font-semibold text-ink">{i.name}</div>
                    <Badge tone={on ? "good" : "neutral"} className="mt-1">
                      {on ? (i.key === "places" ? `On · ${status?.places}` : i.key === "claude" ? `On · ${status?.model}` : "On") : "Not set"}
                    </Badge>
                  </div>
                  <div className="flex-1 text-xs text-ink-2">
                    <p>{i.what}</p>
                    <p className="mt-1 text-ink-3">{i.how}</p>
                    {i.env !== "none" && <code className="mt-1.5 inline-block rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{i.env}</code>}
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>

        <Section title="Your data" subtitle="Bids, quotes and drafts are saved on the server in .data/kontract.json.">
          <Button
            onClick={() => {
              const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile, deals: Object.values(deals) }, null, 2)], { type: "application/json" });
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
