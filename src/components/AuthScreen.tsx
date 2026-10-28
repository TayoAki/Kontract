"use client";

import { BarChart3, ClipboardList, Search, Users } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button, Card, ErrorNote, Input, Label } from "./ui";

const POINTS = [
  { icon: Search, title: "Every open federal contract", text: "Search all of SAM.gov, scored for how winnable each one is." },
  { icon: BarChart3, title: "What it paid last time", text: "Past awards from USAspending so you price to win." },
  { icon: ClipboardList, title: "Fresh building permits", text: "New permits from city feeds, tagged by the trades that want them." },
  { icon: Users, title: "Your own CRM", text: "Track subcontractors, contractors and clients. Only you see your data." },
];

export function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
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
          <h1 className="text-2xl leading-tight font-semibold text-balance text-ink sm:text-3xl">Find the work, line up the people, close the deal.</h1>
          <ul className="mt-6 space-y-4">
            {POINTS.map(({ icon: Icon, title, text }) => (
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
          <p className="mt-1 text-[13px] text-ink-2">{mode === "signup" ? "Free to start. Your bids and contacts are private to you." : "Welcome back."}</p>
          <form className="mt-5 space-y-3" onSubmit={submit}>
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
