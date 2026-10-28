import type { View } from "./state";

// The weekly rhythm: Monday find, Tuesday write scopes, Wednesday call subs,
// Thursday gather quotes, Friday look again.

export interface DayPlan {
  day: string;
  task: string;
  detail: string;
  action: { label: string; view: View };
}

export const WEEK: DayPlan[] = [
  { day: "Monday", task: "Find opportunities", detail: "Spend two hours finding as many service contracts as you can understand.", action: { label: "Search", view: "search" } },
  { day: "Tuesday", task: "Write scopes of work", detail: "Turn each bid you like into a scope you can send to subcontractors.", action: { label: "Open my bids", view: "bids" } },
  { day: "Wednesday", task: "Call subcontractors", detail: "Call and email local companies. Look for fast, hungry responders.", action: { label: "Open my bids", view: "bids" } },
  { day: "Thursday", task: "Gather quotes and submit", detail: "Collect quotes, put your price on top, and send the proposal.", action: { label: "Open my bids", view: "bids" } },
  { day: "Friday", task: "Look again", detail: "New notices post every day. Fill next week's pipeline.", action: { label: "Search", view: "search" } },
];

export function todaysFocus(now: Date = new Date()): DayPlan {
  const dow = now.getDay(); // 0 Sun … 6 Sat
  if (dow >= 1 && dow <= 5) return WEEK[dow - 1]!;
  return { day: dow === 0 ? "Sunday" : "Saturday", task: "Catch up", detail: "Follow up on quotes and read next week's notices.", action: { label: "Open my bids", view: "bids" } };
}
