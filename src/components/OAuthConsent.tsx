"use client";

import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Card, ErrorNote } from "./ui";

// Where an AI assistant (Claude, for example) asks to use your account through
// Kontract's MCP server. Better Auth sends you here after sign-in with a signed
// query; the auth client attaches it to the consent call.

const CAN = [
  "See your bids, sub bench and company profile",
  "Search notices, permits and past awards for you",
  "Make the changes you ask for: track a bid, shortlist a sub, make a quote link, save a scope or proposal",
];
const CANNOT = ["Send emails or texts to anyone", "See your password"];

/** Where the code goes after Allow, so a lookalike client stands out: the site, or "an app on this computer". */
function returnLabel(uri: string | null | undefined): string | null {
  if (!uri) return null;
  try {
    const u = new URL(uri);
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) ? "an app on this computer" : u.host;
  } catch {
    return null;
  }
}

export function OAuthConsent() {
  const { data: session, isPending } = authClient.useSession();
  const [client, setClient] = useState<{ name: string } | null>(null);
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const clientId = query?.get("client_id") ?? null;
  const returnTo = returnLabel(query?.get("redirect_uri"));

  useEffect(() => {
    if (!session || !clientId) return;
    fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { client_name?: string } | null) => setClient({ name: c?.client_name || "An AI assistant" }))
      .catch(() => setClient({ name: "An AI assistant" }));
  }, [session, clientId]);

  async function answer(accept: boolean) {
    setBusy(accept ? "allow" : "deny");
    setError(null);
    const { data, error: err } = await authClient.$fetch<{ redirect: boolean; url: string }>("/oauth2/consent", { method: "POST", body: { accept } });
    if (data?.url) {
      window.location.href = data.url;
      return;
    }
    setError(err?.message || "That didn't go through. Start the connection again from your assistant.");
    setBusy(null);
  }

  return (
    <div className="flex min-h-dvh items-start justify-center bg-bg px-4 py-10 sm:items-center">
      <Card className="w-full max-w-md p-6 max-sm:p-5">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-md bg-accent text-sm font-bold text-on-accent shadow-xs">K</div>
          <span className="text-sm font-semibold text-ink">Kontract</span>
        </div>
        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Loader2 className="size-4 animate-spin" /> Checking your sign-in…
          </p>
        ) : !session ? (
          <p className="text-sm text-ink-2">
            Your sign-in expired. Start the connection again from your assistant and sign in when asked.
          </p>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-balance text-ink">Allow {client?.name ?? "this assistant"} to use your Kontract account?</h1>
            <p className="mt-1 text-[13px] text-ink-2">
              Signed in as <span className="font-medium text-ink">{session.user.email}</span>
            </p>
            {returnTo && (
              <p className="mt-2 text-[13px] text-ink-2">
                Allowing sends you back to <span className="font-medium break-all text-ink">{returnTo}</span>. Only allow it if that&apos;s the assistant you just connected.
              </p>
            )}

            <h2 className="mt-5 text-[13px] font-medium text-ink">It will be able to</h2>
            <ul className="mt-1.5 space-y-1.5 text-[13px] text-ink-2">
              {CAN.map((c) => (
                <li key={c} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> {c}
                </li>
              ))}
            </ul>
            <h2 className="mt-4 text-[13px] font-medium text-ink">It can't</h2>
            <ul className="mt-1.5 space-y-1.5 text-[13px] text-ink-2">
              {CANNOT.map((c) => (
                <li key={c} className="flex gap-2">
                  <X className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden /> {c}
                </li>
              ))}
            </ul>
            <p className="mt-4 flex gap-2 rounded-md bg-panel-2 px-3 py-2 text-xs text-ink-2">
              <ShieldCheck className="mt-px size-4 shrink-0 text-ink-3" aria-hidden />
              You can disconnect it any time from the assistant&apos;s connector settings.
            </p>

            {error && (
              <div className="mt-4">
                <ErrorNote>{error}</ErrorNote>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => void answer(false)} busy={busy === "deny"} disabled={busy !== null}>
                Deny
              </Button>
              <Button variant="primary" onClick={() => void answer(true)} busy={busy === "allow"} disabled={busy !== null}>
                Allow
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
