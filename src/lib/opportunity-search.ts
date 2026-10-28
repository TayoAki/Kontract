import { fitScore, isBiddable, isServiceCode } from "./fit-score.ts";
import type { Opportunity, OpportunitySearch } from "./types.ts";

// Search over notices held locally (the SAM.gov daily file, or samples).

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SearchPage {
  results: Opportunity[];
  total: number;
  offset: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words of 2+ characters; every one must appear somewhere in the notice. */
function queryMatchers(q: string | undefined): RegExp[] {
  return (q ?? "")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .map((w) => new RegExp(escape(w), "i"));
}

export function searchOpportunities(
  list: Opportunity[],
  s: OpportunitySearch,
  opts: { now?: Date; limit?: number; offset?: number; descriptionOf?: (o: Opportunity) => string | undefined } = {},
): SearchPage {
  const now = opts.now ?? new Date();
  const t = now.getTime();
  const words = queryMatchers(s.q);
  const minDeadline = s.minDaysToRespond ? t + s.minDaysToRespond * DAY_MS : null;
  const postedAfter = s.postedWithinDays ? t - s.postedWithinDays * DAY_MS : null;
  const describe = opts.descriptionOf ?? ((o: Opportunity) => o.description);

  const matches = list.filter((o) => {
    const deadline = o.responseDeadline ? Date.parse(o.responseDeadline) : null;
    if (deadline != null && deadline < t) return false; // closed
    if (s.biddableOnly && !isBiddable(o.type)) return false;
    if (s.servicesOnly && isServiceCode(o.pscCode) === false) return false;
    if (minDeadline != null && (deadline == null || deadline < minDeadline)) return false;
    if (postedAfter != null && Date.parse(o.postedDate) < postedAfter) return false;
    if (s.state && o.placeOfPerformance.state !== s.state) return false;
    if (s.naics && !o.naicsCode?.startsWith(s.naics)) return false;
    if (s.setAside && o.setAsideCode !== s.setAside) return false;
    if (words.length) {
      const head = `${o.title} ${o.agency} ${o.office} ${o.solicitationNumber} ${o.naicsCode ?? ""} ${o.pscCode ?? ""} ${o.placeOfPerformance.city ?? ""}`;
      for (const re of words) if (!re.test(head) && !re.test(describe(o) ?? "")) return false;
    }
    return true;
  });

  const byDeadline = (a: Opportunity, b: Opportunity) => (a.responseDeadline ?? "9").localeCompare(b.responseDeadline ?? "9");
  const byNewest = (a: Opportunity, b: Opportunity) => b.postedDate.localeCompare(a.postedDate);
  if (s.sort === "deadline") matches.sort(byDeadline);
  else if (s.sort === "newest") matches.sort(byNewest);
  else {
    const score = new Map(matches.map((o) => [o.id, fitScore(o, now).score]));
    matches.sort((a, b) => score.get(b.id)! - score.get(a.id)! || byNewest(a, b));
  }

  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.max(1, opts.limit ?? 100);
  return { results: matches.slice(offset, offset + limit), total: matches.length, offset };
}
