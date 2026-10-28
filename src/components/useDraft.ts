"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Deal, DraftKind } from "@/lib/types";

/** Streams a draft from /api/ai/draft (newline-delimited JSON events). */
export function useDraft() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"claude" | "template" | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const stop = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
    setBusy(false);
  }, []);

  /** Resolves with the full text, or null if it failed or was stopped. */
  const run = useCallback(async (kind: DraftKind, deal: Deal, subId?: string): Promise<string | null> => {
    ctrl.current?.abort();
    const controller = new AbortController();
    ctrl.current = controller;
    setText("");
    setError(null);
    setSource(null);
    setBusy(true);
    let full = "";
    let failed = false;
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, deal, subId }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Draft failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!raw) continue;
          const ev = JSON.parse(raw) as { type: string; text?: string; message?: string; source?: "claude" | "template" };
          if (ev.type === "meta") setSource(ev.source ?? null);
          else if (ev.type === "text" && ev.text) {
            full += ev.text;
            setText(full);
          } else if (ev.type === "error") {
            failed = true;
            setError(ev.message ?? "Draft failed");
          }
        }
      }
      return failed && !full ? null : full;
    } catch (err) {
      if (controller.signal.aborted) return null;
      setError((err as Error).message);
      return null;
    } finally {
      if (ctrl.current === controller) {
        ctrl.current = null;
        setBusy(false);
      }
    }
  }, []);

  return { text, busy, error, source, run, stop };
}
