"use client";

import { Globe, Loader2, Mail, Phone, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { SiteFacts } from "@/lib/site-facts";
import { api, useApp } from "./state";
import { Badge, Button, ErrorNote } from "./ui";

/**
 * "Read their website": emails, phones, license numbers, services and area
 * from a business's own site (Firecrawl; up to 2 credits, cached a month).
 * `onUse` fills a missing email, phone or license on the card.
 */
export function WebsiteFacts({ website, have, onUse }: { website: string; have: { email?: string; phone?: string; license?: string }; onUse: (patch: { email?: string; phone?: string; license?: string; insured?: boolean }) => void }) {
  const enabled = useApp((s) => Boolean(s.status?.firecrawl));
  const [facts, setFacts] = useState<SiteFacts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!enabled) return null;

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const { facts: f } = await api<{ facts: SiteFacts }>("/api/subs/website", { method: "POST", body: JSON.stringify({ url: website }) });
      setFacts(f);
      const patch: { email?: string; phone?: string; license?: string; insured?: boolean } = {};
      if (!have.email && f.emails[0]) patch.email = f.emails[0];
      if (!have.phone && f.phones[0]) patch.phone = f.phones[0];
      if (!have.license && f.licenses[0]) patch.license = f.licenses[0];
      if (f.insured) patch.insured = true;
      if (Object.keys(patch).length) onUse(patch);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!facts) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => void read()} busy={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />} Read their website
        </Button>
        {!have.email && <span className="text-[11px] text-ink-3">Finds their email, license and services</span>}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    );
  }
  const host = (() => {
    try {
      return new URL(facts.url).hostname.replace(/^www\./, "");
    } catch {
      return facts.url;
    }
  })();
  const nothing = !facts.emails.length && !facts.phones.length && !facts.licenses.length && !facts.services.length;
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-line px-2.5 py-2 text-xs">
      <div className="text-[11px] text-ink-3">
        From {host} · {facts.pages.length} page{facts.pages.length === 1 ? "" : "s"} read
      </div>
      {nothing && <p className="text-ink-2">No email, phone, license or services on their site. Call them.</p>}
      {(facts.emails.length > 0 || facts.phones.length > 0) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-ink-2">
          {facts.emails.map((e) => (
            <a key={e} href={`mailto:${e}`} className="inline-flex items-center gap-1 hover:text-accent">
              <Mail className="size-3" /> {e}
            </a>
          ))}
          {facts.phones.map((p) => (
            <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1 hover:text-accent">
              <Phone className="size-3" /> {p}
            </a>
          ))}
        </div>
      )}
      {(facts.licenses.length > 0 || facts.insured || facts.experience) && (
        <div className="flex flex-wrap gap-1">
          {facts.licenses.map((l) => (
            <Badge key={l}>{l}</Badge>
          ))}
          {facts.insured && (
            <Badge tone="good">
              <ShieldCheck className="mr-0.5 inline size-3" /> Says licensed &amp; insured
            </Badge>
          )}
          {facts.experience && <Badge>{facts.experience}</Badge>}
        </div>
      )}
      {facts.services.length > 0 && <p className="text-ink-2">Services: {facts.services.join(" · ")}</p>}
      {facts.serviceArea && <p className="text-ink-2">Serves: {facts.serviceArea}</p>}
      <p className="text-[11px] text-ink-3">What a site says isn&apos;t proof: check the license with the state and ask for their insurance certificate.</p>
    </div>
  );
}
