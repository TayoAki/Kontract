"use client";

import { BarChart3, ClipboardList, FileSignature, Hammer, Search, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { PERMIT_MARKETS, STATE_NAMES } from "@/lib/permit-sources";
import { TRADES } from "@/lib/permit-trades";
import { setPendingAccount } from "./pending-account";
import { Button, Card, cx, ErrorNote, Input, Label, Select } from "./ui";

const PRIME_POINTS = [
  { icon: Search, title: "Federal, state and local bids", text: "Every open SAM.gov notice plus city and state bids, scored for how winnable each one is." },
  { icon: BarChart3, title: "What it paid last time", text: "Past awards from USAspending so you price to win." },
  { icon: ClipboardList, title: "Subs from permit records", text: "The local businesses pulling permits right now, with licenses and insurance where cities publish them." },
  { icon: Users, title: "Your subcontractor bench", text: "Send quote links, track who quoted and who won. Only you see your data." },
];

const SUB_POINTS = [
  { icon: ClipboardList, title: "10 free leads a week", text: "The best new building permits for your trade in your area, every Monday. Every lead, every morning, on the daily plan." },
  { icon: FileSignature, title: "Jobs to quote", text: "Contractors who win government work send you the scope; you quote online in minutes." },
  { icon: Sparkles, title: "Customers who are buying now", text: "Enter your website and AI finds companies with a reason to hire you this month." },
];

export interface JoinParams {
  ref?: string;
  trade?: string;
  market?: string;
}

const marketsByState = Object.keys(STATE_NAMES)
  .sort((a, b) => STATE_NAMES[a]!.localeCompare(STATE_NAMES[b]!))
  .map((code) => ({ code, name: STATE_NAMES[code]!, markets: PERMIT_MARKETS.filter((m) => m.state === code) }));

export function AuthScreen({ onSignedIn, join }: { onSignedIn: () => void; join?: JoinParams }) {
  const [mode, setMode] = useState<"signin" | "signup">(join ? "signup" : "signin");
  const [role, setRole] = useState<"prime" | "sub">(join ? "sub" : "prime");
  const [trade, setTrade] = useState(TRADES.some((t) => t.id === join?.trade) ? join!.trade! : "");
  const [market, setMarket] = useState(PERMIT_MARKETS.some((m) => m.id === join?.market) ? join!.market! : "");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && role === "sub" && (!trade || !market)) {
      setError("Pick your trade and your area so we can send you leads.");
      return;
    }
    setBusy(true);
    setError(null);
    if (mode === "signup") {
      setPendingAccount(
        role === "sub"
          ? { role, trade, market, company: company.trim() || undefined, website: website.trim() || undefined, invitedBy: join?.ref || undefined }
          : { role },
      );
    }
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ name: name.trim() || email.split("@")[0]!, email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? (mode === "signup" ? "Couldn't create the account." : "Wrong email or password."));
      return;
    }
    onSignedIn();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="grid w-full max-w-4xl gap-8 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div>
          <div className="mb-6 flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-accent text-base font-bold text-on-accent">K</div>
            <span className="text-lg font-semibold text-ink">Kontract</span>
          </div>
          <h1 className="text-2xl leading-tight font-semibold text-balance text-ink sm:text-3xl">
            {mode === "signup" && role === "sub" ? "More jobs for your crew, without paying for leads." : "Find the work, line up the people, close the deal."}
          </h1>
          <ul className="mt-6 space-y-4">
            {(mode === "signup" && role === "sub" ? SUB_POINTS : PRIME_POINTS).map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink">
                  <Icon className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-ink">{title}</div>
                  <div className="text-[13px] text-ink-2">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink">{mode === "signup" ? "Create your account" : "Sign in"}</h2>
          <p className="mt-1 text-[13px] text-ink-2">{mode === "signup" ? (role === "sub" ? "Free: 10 leads a week, no card." : "Free to start. Your bids and subs are private to you.") : "Welcome back."}</p>
          <form className="mt-5 space-y-3" onSubmit={submit}>
            {mode === "signup" && (
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="I am">
                {(
                  [
                    ["prime", "I win jobs and hire subs", Users],
                    ["sub", "I'm a subcontractor", Hammer],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={role === value}
                    onClick={() => setRole(value)}
                    className={cx(
                      "flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left text-[13px] transition-colors",
                      role === value ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong text-ink-2 hover:bg-panel-2",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            )}
            {mode === "signup" && role === "sub" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <Label>Your trade</Label>
                    <Select value={trade} onChange={(e) => setTrade(e.target.value)} required aria-label="Your trade">
                      <option value="">Pick one</option>
                      {TRADES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="block">
                    <Label>Your area</Label>
                    <Select value={market} onChange={(e) => setMarket(e.target.value)} required aria-label="Your area">
                      <option value="">Pick a city</option>
                      {marketsByState.map((st) => (
                        <optgroup key={st.code} label={st.name}>
                          {st.markets.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  </label>
                </div>
                <label className="block">
                  <Label>Business name</Label>
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
                </label>
                <label className="block">
                  <Label hint="Optional, for finding you customers">Website</Label>
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourcompany.com" inputMode="url" />
                </label>
              </>
            )}
            {mode === "signup" && (
              <label className="block">
                <Label>Your name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
            )}
            <label className="block">
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="block">
              <Label hint={mode === "signup" ? "At least 8 characters" : undefined}>Password</Label>
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </label>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" variant="primary" busy={busy} className="w-full">
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-[13px] text-ink-2">
            {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setError(null);
              }}
            >
              {mode === "signup" ? "Sign in" : "Create an account"}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}
