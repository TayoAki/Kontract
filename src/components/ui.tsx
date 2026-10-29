"use client";

import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { hueFor, initials } from "@/lib/format";
import type { Level } from "@/lib/fit-score";

/** Join class names; later Tailwind classes override earlier ones (e.g. h-8 beats h-9). */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(" "));
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  busy,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
        // Touch screens get finger-sized targets; mouse users keep the compact sizes.
        size === "sm" ? "h-7 px-2.5 text-xs pointer-coarse:h-10 pointer-coarse:px-3" : "h-9 px-3.5 text-sm pointer-coarse:h-11",
        variant === "primary" && "bg-accent text-on-accent hover:bg-accent-ink",
        variant === "secondary" && "border border-line-strong bg-panel text-ink hover:bg-panel-2",
        variant === "ghost" && "text-ink-2 hover:bg-panel-2 hover:text-ink",
        variant === "danger" && "border border-line-strong bg-panel text-bad hover:bg-bad-soft",
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-line bg-panel", className)}>{children}</div>;
}

export function Section({
  title,
  subtitle,
  actions,
  step,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  step?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-start gap-2.5">
          {step != null && (
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-ink">
              {step}
            </span>
          )}
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

type Tone = "neutral" | "accent" | "good" | "warn" | "bad";
const TONE: Record<Tone, string> = {
  neutral: "bg-panel-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
};

export function Badge({ tone = "neutral", className, children, title }: { tone?: Tone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap", TONE[tone], className)}
    >
      {children}
    </span>
  );
}

export const levelTone = (l: Level): Tone => (l === "good" ? "good" : l === "ok" ? "warn" : "bad");

export function LevelIcon({ level, className }: { level: Level; className?: string }) {
  const Icon = level === "good" ? CheckCircle2 : level === "ok" ? AlertCircle : XCircle;
  return <Icon aria-hidden className={cx("size-4 shrink-0", level === "good" ? "text-good" : level === "ok" ? "text-warn" : "text-bad", className)} />;
}

export function dueTone(days: number | null): Tone {
  if (days == null) return "neutral";
  if (days < 0) return "neutral";
  if (days < 5) return "bad";
  if (days < 10) return "warn";
  return "good";
}

export function dueText(days: number | null): string {
  if (days == null) return "No deadline";
  if (days < 0) return "Closed";
  if (days === 0) return "Due today";
  return `${days}d left`;
}

export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  const hue = hueFor(name);
  return (
    <span
      aria-hidden
      className={cx("grid shrink-0 place-items-center rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `hsl(${hue} 70% 50% / 0.16)`,
        color: `hsl(${hue} 55% 42%)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

const fieldBase =
  // 16px on touch screens so phones don't zoom in when a field is focused.
  "w-full rounded-lg border border-line-strong bg-panel px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 pointer-coarse:text-base";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldBase, "h-9 pointer-coarse:h-11", className)} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(fieldBase, "h-9 pr-8 pointer-coarse:h-11", className)}>
      {children}
    </select>
  );
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldBase, "py-2 leading-relaxed", className)} />;
}

export function Label({ children, hint, className }: { children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <span className={cx("mb-1 block text-xs font-medium text-ink-2", className)}>
      {children}
      {hint && <span className="ml-1 font-normal text-ink-3">{hint}</span>}
    </span>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 select-none pointer-coarse:min-h-10">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-[18px] w-8 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span className={cx("absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-all", checked ? "left-[16px]" : "left-[2px]")} />
      </button>
      {children}
    </label>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors pointer-coarse:h-10 pointer-coarse:px-3.5",
        active ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong bg-panel text-ink-2 hover:bg-panel-2",
      )}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3.5 py-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={cx("mt-1 text-lg font-semibold tabular-nums", tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink")}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-ink-3">{hint}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      {icon && <div className="text-ink-3">{icon}</div>}
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="max-w-sm text-[13px] text-ink-2">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2 text-[13px] text-bad">
      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Note({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "warn" }) {
  return (
    <div className={cx("rounded-lg px-3 py-2 text-[12.5px]", tone === "warn" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-ink")}>{children}</div>
  );
}

/** Numeric field that keeps a local text value so partial input ("0.", "1,2") types smoothly. */
export function NumberInput({
  value,
  onChange,
  prefix,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: number; onChange: (n: number) => void; prefix?: string }) {
  const [text, setText] = useState(value ? String(value) : "");
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value ? String(value) : "";
  return (
    <div className={cx("relative", className)}>
      {prefix && <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-ink-3">{prefix}</span>}
      <input
        {...props}
        type="text"
        inputMode="decimal"
        value={shown}
        placeholder={props.placeholder ?? "0"}
        onFocus={(e) => {
          setText(value ? String(value) : "");
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, "");
          setText(raw);
          const n = Number.parseFloat(raw);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className={cx(fieldBase, "h-8 text-right tabular-nums pointer-coarse:h-11", prefix ? "pl-6" : "")}
      />
    </div>
  );
}
