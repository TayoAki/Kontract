"use client";

import type { Editor } from "@tiptap/react";
import { Copy, FileDown, FileText, Loader2, Printer, Send, Sparkles, Square, ThumbsDown, Trophy } from "lucide-react";
import { useCallback, useState } from "react";
import { bidTotals } from "@/lib/bid-math";
import { daysUntil, formatDate, money } from "@/lib/format";
import type { Level } from "@/lib/fit-score";
import { findPlaceholders } from "@/lib/proposal-doc";
import type { Deal } from "@/lib/types";
import { Markdown } from "../Markdown";
import { DocEditor } from "../DocEditor";
import { useApp, type Tab } from "../state";
import { useDraft } from "../useDraft";
import { Badge, Button, Card, Empty, ErrorNote, LevelIcon, Note, Section } from "../ui";
import { copyDoc, downloadWord as wordFile, printHtml, slug } from "../doc-actions";
import { downloadText } from "./SubsTab";

interface Check {
  level: Level;
  label: string;
  detail: string;
  fix?: { label: string; tab?: Tab; settings?: boolean };
}

function useReadiness(deal: Deal): Check[] {
  const profile = useApp((s) => s.profile);
  const t = bidTotals(deal.pricing);
  const days = daysUntil(deal.opportunity.responseDeadline);
  const selected = deal.subs.find((s) => s.status === "selected");
  const quoted = deal.subs.some((s) => s.quote);
  const attachments = deal.opportunity.attachments?.length ?? 0;
  const amendments = (deal.opportunity.versions ?? 1) - 1;
  const blanks = findPlaceholders(deal.proposal ?? "");
  const forms = deal.details?.noticeId === deal.opportunity.id ? deal.details.forms : [];
  const missing = [
    !profile?.companyName && "company name",
    !profile?.uei && "UEI",
    !profile?.cage && "CAGE code",
    !profile?.email && "email",
  ].filter(Boolean) as string[];
  return [
    t.pricePerPeriod > 0 && t.profitPerPeriod > 0
      ? { level: "good", label: "Price is set", detail: `${money(t.priceTotal)} total, ${money(t.profitTotal)} profit` }
      : t.pricePerPeriod > 0
        ? { level: "ok", label: "Price set, but no profit", detail: "Your price doesn't cover the sub's cost plus a margin.", fix: { label: "Fix price", tab: "pricing" } }
        : { level: "bad", label: "No price yet", detail: "Add your sub's quote and put your price on top.", fix: { label: "Build price", tab: "pricing" } },
    selected
      ? { level: "good", label: "Subcontractor selected", detail: selected.name }
      : quoted
        ? { level: "ok", label: "Quote in, nobody selected", detail: "Mark the sub you're going with as Selected.", fix: { label: "Pick one", tab: "subs" } }
        : { level: "bad", label: "No subcontractor lined up", detail: "Never submit without someone who will do the work.", fix: { label: "Find subs", tab: "subs" } },
    missing.length === 0
      ? { level: "good", label: "Company info complete", detail: `UEI ${profile!.uei} · CAGE ${profile!.cage}` }
      : { level: "bad", label: "Company info missing", detail: `Add your ${missing.join(", ")}.`, fix: { label: "Edit profile", settings: true } },
    deal.subs.some((s) => s.vetting.pastPerformance) || profile?.capabilities
      ? { level: "good", label: "Past performance ready", detail: "Use your sub's similar jobs if this is your first contract." }
      : { level: "ok", label: "Past performance", detail: "Ask your sub for 2–3 similar jobs you can list.", fix: { label: "Subs", tab: "subs" } },
    days == null
      ? { level: "ok", label: "Check the deadline", detail: "No response date on the notice." }
      : days < 0
        ? { level: "bad", label: "Deadline passed", detail: formatDate(deal.opportunity.responseDeadline) }
        : { level: days >= 2 ? "good" : "ok", label: `Due ${formatDate(deal.opportunity.responseDeadline)}`, detail: days === 0 ? "Today. Submit early, portals get slow." : `${days} day${days === 1 ? "" : "s"} left. Submit a day early.` },
    ...(amendments > 0
      ? [
          {
            level: "ok" as const,
            label: `Acknowledge ${amendments} amendment${amendments === 1 ? "" : "s"}`,
            detail: "List each amendment number and date in your proposal (or sign the SF-30). Read them: they can change the scope or deadline.",
          },
        ]
      : []),
    ...(deal.proposal
      ? [
          blanks.length
            ? { level: "bad" as const, label: `${blanks.length} blank${blanks.length === 1 ? "" : "s"} left in the proposal`, detail: `${blanks.slice(0, 4).join(", ")}${blanks.length > 4 ? "…" : ""}. They're highlighted below.` }
            : { level: "good" as const, label: "No blanks left", detail: "Every [placeholder] is filled in." },
        ]
      : []),
    {
      level: "ok",
      label: forms.length ? `Fill in ${forms.length} form${forms.length === 1 ? "" : "s"}` : "Follow the instructions",
      detail: forms.length
        ? `${forms.slice(0, 4).join(", ")}${forms.length > 4 ? "…" : ""}. Check the notice for page limits and how to submit.`
        : `Check ${attachments ? `all ${attachments} attachment${attachments === 1 ? "" : "s"}` : "the notice"} for required forms, page limits and how to submit (email or portal).`,
    },
  ];
}

export function ProposalTab({ deal }: { deal: Deal }) {
  const updateDeal = useApp((s) => s.updateDeal);
  const setTab = useApp((s) => s.setTab);
  const setView = useApp((s) => s.setView);
  const say = useApp((s) => s.say);
  const claude = useApp((s) => Boolean(s.status?.claude));
  const draft = useDraft();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [exporting, setExporting] = useState(false);
  const checks = useReadiness(deal);
  const onReady = useCallback((e: Editor | null) => setEditor(e), []);
  const save = useCallback((md: string) => updateDeal(deal.id, (d) => ({ ...d, proposal: md })), [deal.id, updateDeal]);

  async function downloadWord() {
    if (!editor) return;
    setExporting(true);
    try {
      await wordFile(editor, `proposal-${slug(deal.opportunity.title)}.docx`, deal.opportunity.title);
    } catch (err) {
      say(`Couldn't make the Word file: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  }
  const text = draft.busy ? draft.text : (deal.proposal ?? "");
  const submitted = deal.stage === "submitted" || deal.stage === "won" || deal.stage === "lost";

  async function generate() {
    const out = await draft.run("proposal", deal);
    if (out) updateDeal(deal.id, (d) => ({ ...d, proposal: out }));
  }

  return (
    <div className="space-y-10">
      <Section title="Before you submit" subtitle="A quick check so nothing gets you disqualified.">
        <Card className="divide-y divide-line">
          {checks.map((c) => (
            <div key={c.label} className="flex items-start gap-3 px-3.5 py-2.5">
              <LevelIcon level={c.level} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{c.label}</div>
                <div className="text-xs text-ink-2">{c.detail}</div>
              </div>
              {c.fix && (
                <Button size="sm" variant="ghost" onClick={() => (c.fix!.settings ? setView("settings") : setTab(c.fix!.tab!))}>
                  {c.fix.label}
                </Button>
              )}
            </div>
          ))}
        </Card>
      </Section>

      <Section
        title="Proposal"
        subtitle={claude ? "Claude drafts it from the notice, your price and your company profile. Edit before sending." : "A fill-in-the-blanks draft from your price and profile. Add ANTHROPIC_API_KEY for a tailored one."}
        actions={
          <>
            {draft.busy ? (
              <Button size="sm" onClick={draft.stop}>
                <Square className="size-3.5" /> Stop
              </Button>
            ) : (
              <Button size="sm" variant={deal.proposal ? "secondary" : "primary"} onClick={() => void generate()}>
                <Sparkles className="size-3.5" /> {deal.proposal ? "Rewrite" : claude ? "Draft with Claude" : "Fill in a template"}
              </Button>
            )}
            {deal.proposal && !draft.busy && (
              <>
                <Button size="sm" onClick={() => void downloadWord()} busy={exporting} disabled={!editor}>
                  <FileDown className="size-3.5" /> Word
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!editor}
                  onClick={() => editor && !printHtml(editor.getHTML(), deal.opportunity.title) && say("Allow pop-ups to print or save as PDF.")}
                  aria-label="Print or save as PDF"
                  title="Print or save as PDF"
                >
                  <Printer className="size-3.5" /> PDF
                </Button>
                <Button size="sm" variant="ghost" disabled={!editor} onClick={() => editor && void copyDoc(editor).then((ok) => say(ok ? "Copied with formatting" : "Couldn't copy. Select the text and copy it instead."))} aria-label="Copy proposal" title="Copy (pastes formatted into email or Word)">
                  <Copy className="size-3.5" /> Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => downloadText(`proposal-${slug(deal.opportunity.title)}.md`, deal.proposal!)} aria-label="Download as Markdown" title="Download as Markdown (.md)">
                  <FileText className="size-3.5" /> .md
                </Button>
              </>
            )}
          </>
        }
      >
        {draft.error && <ErrorNote>{draft.error}</ErrorNote>}
        {!text && !draft.busy ? (
          <Empty title="No proposal yet">Set your price and pick a subcontractor first, then draft the proposal here.</Empty>
        ) : !draft.busy ? (
          <DocEditor markdown={deal.proposal ?? ""} onChange={save} onReady={onReady} label="Proposal" />
        ) : (
          <div className="rounded-xl border border-line bg-white px-6 py-6 text-[13.5px] text-neutral-900 shadow-sm sm:px-10 sm:py-8 dark:bg-panel dark:text-ink">
            {draft.busy && !text && (
              <div className="flex items-center gap-2 text-ink-3">
                <Loader2 className="size-4 animate-spin" /> Drafting… this can take a minute.
              </div>
            )}
            <Markdown source={text} />
          </div>
        )}
        {deal.proposal && !draft.busy && <Note>Edit it right here. Read it start to finish and replace every highlighted [placeholder] before you send it. Word downloads a .docx; the printer icon saves a PDF.</Note>}
      </Section>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">
            {submitted ? "Submitted" : "Ready to send?"} {submitted && <Badge tone={deal.stage === "won" ? "good" : deal.stage === "lost" ? "bad" : "accent"}>{deal.stage}</Badge>}
          </div>
          <div className="text-xs text-ink-2">
            {submitted
              ? deal.submittedAt
                ? `Sent ${formatDate(deal.submittedAt)}. Record the result when you hear back.`
                : "Record the result when you hear back."
              : "Submit the way the notice says (usually email to the contracting officer or a portal), then mark it here."}
          </div>
        </div>
        {submitted ? (
          <div className="flex gap-2">
            <Button size="sm" variant={deal.stage === "won" ? "primary" : "secondary"} onClick={() => updateDeal(deal.id, (d) => ({ ...d, stage: "won" }))}>
              <Trophy className="size-3.5" /> Won
            </Button>
            <Button size="sm" variant={deal.stage === "lost" ? "danger" : "secondary"} onClick={() => updateDeal(deal.id, (d) => ({ ...d, stage: "lost" }))}>
              <ThumbsDown className="size-3.5" /> Lost
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={() => updateDeal(deal.id, (d) => ({ ...d, stage: "submitted", submittedAt: new Date().toISOString() }))}>
            <Send className="size-4" /> Mark as submitted
          </Button>
        )}
      </Card>
    </div>
  );
}
