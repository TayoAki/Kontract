import type { SignalStrength, TradeId, TradeTag, WorkId } from "./types.ts";

// Which trades a permit means work for, and why. A permit is a signal that
// someone is about to spend real money on a property; these rules tag the
// follow-on work other contractors want to hear about first.

export interface Trade {
  id: TradeId;
  label: string;
  /** Plural for messages, e.g. "fence companies". */
  plural: string;
  /** What to search on Google Maps to find these businesses. */
  search: string;
  /** As in "new fence leads". */
  noun: string;
}

export const TRADES: Trade[] = [
  { id: "fence", label: "Fence", plural: "fence companies", search: "fence company", noun: "fence" },
  { id: "landscaping", label: "Landscaping", plural: "landscapers", search: "landscaping company", noun: "landscaping" },
  { id: "pool", label: "Pools", plural: "pool builders", search: "pool builder", noun: "pool" },
  { id: "patio", label: "Patios & concrete", plural: "patio and concrete contractors", search: "patio contractor", noun: "patio and concrete" },
  { id: "gutters", label: "Gutters", plural: "gutter companies", search: "gutter company", noun: "gutter" },
  { id: "blinds", label: "Blinds & shutters", plural: "blinds and shutters companies", search: "blinds and shutters", noun: "blinds and shutters" },
  { id: "roofing", label: "Roofing", plural: "roofers", search: "roofing contractor", noun: "roofing" },
  { id: "solar", label: "Solar", plural: "solar installers", search: "solar installer", noun: "solar" },
  { id: "painting", label: "Painting", plural: "painters", search: "painting contractor", noun: "painting" },
  { id: "cleaning", label: "Construction cleaning", plural: "cleaning companies", search: "post construction cleaning", noun: "cleaning" },
  { id: "junk", label: "Junk removal", plural: "junk removal companies", search: "junk removal", noun: "junk removal" },
  { id: "windows", label: "Windows & doors", plural: "window and door companies", search: "window installation company", noun: "window and door" },
];

export const tradeById = (id: TradeId) => TRADES.find((t) => t.id === id)!;

export interface Work {
  id: WorkId;
  label: string;
  plural: string;
  search: string;
}

/** Every kind of sub: the lead trades, plus trades whose own permits name the contractor (HVAC, electrical, plumbing, general). */
export const WORK: Work[] = [
  ...TRADES.map(({ id, label, plural, search }) => ({ id, label, plural, search })),
  { id: "hvac", label: "HVAC", plural: "HVAC contractors", search: "HVAC contractor" },
  { id: "electrical", label: "Electrical", plural: "electricians", search: "electrical contractor" },
  { id: "plumbing", label: "Plumbing", plural: "plumbers", search: "plumbing contractor" },
  { id: "general", label: "General contractor", plural: "general contractors", search: "general contractor" },
];

export const workById = (id: WorkId) => WORK.find((w) => w.id === id)!;

const STRENGTH_RANK: Record<SignalStrength, number> = { strong: 3, likely: 2, possible: 1 };
export const strengthRank = (s: SignalStrength) => STRENGTH_RANK[s];

interface Rule {
  match: RegExp;
  /** Skip when this matches. */
  unless?: RegExp;
  /** Only residential permits (or unknown). */
  residential?: boolean;
  tags: Tag[];
}

type Tag = [TradeId, string, SignalStrength];

const NOT_A_BUILDING = /\b(sign|banner|billboard|electric(al)?|elevator|fire alarm|sprinkler|fire ?line|plumbing|water heater|sewer|scaffold(ing)?|tent|antenna|cell tower|wireless|storm ?water|right[- ]of[- ]way|curb cut|driveway approach|mechanical|hvac|furnace|boiler|gas (line|piping)|backflow|irrigation meter)\b/;

// "new single family", "new construction", "erect 2 story single family residence"…
const NEW_HOME_PHRASE =
  /\bnew (single[- ]?family|one[- ]family|two[- ]family|[12][- ]family|sfr|sfd|sf|residence|residential (building|dwelling)|dwelling|home|house|duplex|triplex|townhome|townhouse|construction|building)\b|\bbldg-new\b|\b(erect|construct|build)( a)?( new)? (\d+[- ]story |two[- ]story |one[- ]story )?(single[- ]?family|one[- ]family|two[- ]family|[12][- ]family|sfr|sfd|residence|dwelling|duplex|townhouse|house|home)\b|\bground[- ]up\b/;
const HOME_WORDS = /\b(residence|residential (building|dwelling)|dwelling|house|home|sfr|sfd|single[- ]?family|one[- ]family|two[- ]family|duplex|triplex|townho(me|use))\b/;
const BUILDING_WORDS = /\b(building|bldg|residential|residence|single|family|dwelling|duplex|townhouse|house|home|sfr|sfd|construction|structure)\b/;
const COMMERCIAL_WORDS = /\b(commercial|retail|office|warehouse|restaurant|apartment|multi[- ]?family|mixed[- ]use|hotel|industrial)\b/;

function isNewBuild(type: string, all: string): boolean {
  // "New construction in-ground pool" is a pool, not a house.
  if (/\b(pool|spa)\b/.test(all) && !HOME_WORDS.test(all)) return false;
  if (NEW_HOME_PHRASE.test(all)) return true;
  // Many feeds put the work class in the type: "Building Permit · New", "Bldg-New".
  return /\bnew\b/.test(type) && BUILDING_WORDS.test(all) && !/\b(pool|spa|roof|fence|deck|demo|sign)\b/.test(type);
}

const RULES: Rule[] = [
  {
    match: /\b(swimming pool|in-?ground pool|above-?ground pool|pool and spa|pool\/spa|gunite|hot tub|pool)\b|\bspa\b/,
    unless: /\b(pool table|carpool|pool hall|pool equipment (repair|replacement)|pool heater)\b/,
    tags: [
      ["fence", "Most cities require a safety fence around a new pool.", "strong"],
      ["patio", "A new pool needs a deck or patio around it.", "strong"],
      ["landscaping", "The yard around a new pool gets redone.", "likely"],
    ],
  },
  {
    match: /\b(demolition|demolish|wreck(ing)?|tear ?down|raze)\b/,
    unless: /\binterior (demo|demolition)\b|\bselective demo/,
    tags: [
      ["junk", "Demolition leaves debris to haul away.", "strong"],
      ["landscaping", "A cleared lot needs grading and a new yard.", "possible"],
      ["fence", "Demo sites need temporary fencing, and a new build often follows.", "possible"],
    ],
  },
  {
    match: /\b(re-?roof(ing)?|roof replacement|replace (the )?roof|new roof|roofing|roof)\b/,
    unless: /\broof ?top (unit|hvac|equipment|solar)\b|\brtu\b|\broof drain\b|\broof[- ]?mount(ed)?\b/,
    tags: [
      ["gutters", "A new roof is the moment to replace the gutters.", "strong"],
      ["solar", "Homeowners often add solar right after a new roof.", "possible"],
    ],
  },
  {
    match: /\b(addition|adu|accessory dwelling|in-?law (unit|suite)|garage conversion|second (story|floor))\b/,
    residential: true,
    tags: [
      ["roofing", "An addition's roof has to be tied into the old one.", "likely"],
      ["painting", "Additions need painting inside and out.", "strong"],
      ["blinds", "New rooms need window coverings.", "likely"],
      ["windows", "Additions often come with new windows and doors.", "likely"],
      ["cleaning", "Construction dust means a deep clean at the end.", "likely"],
    ],
  },
  {
    match: /\b(remodel(ing)?|renovat(e|ion)|alteration|kitchen|bathroom|interior (finish|build-?out)|tenant (improvement|finish)|build-?out)\b/,
    unless: /\b(roof|pool)\b/,
    tags: [
      ["painting", "Remodels end with fresh paint.", "likely"],
      ["cleaning", "Remodels and build-outs need a final clean.", "likely"],
    ],
  },
  {
    match: /\b(deck|patio|pergola|porch|gazebo|outdoor kitchen|retaining wall)\b/,
    tags: [
      ["landscaping", "Outdoor living projects come with landscaping.", "possible"],
      ["painting", "New decks and porches need staining or paint.", "likely"],
    ],
  },
  {
    match: /\b(windows?|door replacement|replace (windows|doors)|sliding door|patio door)\b/,
    unless: /\b(drive-?thru|service window|window sign)\b/,
    residential: true,
    tags: [["blinds", "New windows need new blinds or shutters.", "strong"]],
  },
  {
    match: /\b(siding|re-?side|exterior cladding)\b/,
    tags: [
      ["gutters", "Siding jobs often replace the gutters too.", "likely"],
      ["painting", "New siding often comes with exterior paint and trim.", "likely"],
    ],
  },
];

const NEW_HOME_TAGS: Tag[] = [
  ["landscaping", "New homes need a finished yard; builders usually stop at sod.", "likely"],
  ["fence", "Most new homes get a fence soon after move-in.", "likely"],
  ["gutters", "New construction needs gutters before the first big rain.", "likely"],
  ["blinds", "Nobody moves into a new house with bare windows.", "strong"],
  ["pool", "A new home on a good lot is a pool conversation waiting to happen.", "possible"],
  ["patio", "New yards get patios, walkways and driveways.", "likely"],
  ["cleaning", "Builders hire a final post-construction clean before closing.", "strong"],
];

const NEW_COMMERCIAL_TAGS: Tag[] = [
  ["cleaning", "New buildings need a post-construction clean before opening.", "strong"],
  ["landscaping", "Commercial sites need landscaping before the certificate of occupancy.", "likely"],
  ["blinds", "New offices and units need window coverings.", "likely"],
];

// Permits that are themselves this kind of work. The businesses pulling them
// are working the market right now: likely subs, and likely buyers of leads.
const TRADE_WORK: Partial<Record<WorkId, RegExp>> = {
  fence: /\bfenc(e|es|ing)\b/,
  landscaping: /\b(landscap\w*|retaining wall|hardscape|irrigation)\b/,
  pool: /\b(swimming pool|in-?ground pool|pool and spa|pool\/spa|gunite|pool|spa)\b/,
  patio: /\b(patio|flatwork|concrete slab|driveway|pergola|deck)\b/,
  gutters: /\bgutters?\b/,
  blinds: /\b(blinds|shutters|awnings?)\b/,
  roofing: /\b(re-?roof(ing)?|roof replacement|roofing)\b/,
  solar: /\b(solar|photovoltaic|pv)\b/,
  painting: /\bpaint(ing)?\b/,
  junk: /\b(demolition|demolish|wreck(ing)?)\b/,
  windows: /\b(windows?|replacement doors?)\b/,
  hvac: /\b(hvac|mechanical|furnace|boiler|air condition\w*|heat pump|a\/c|ac unit|duct ?work|chiller|rtu|mini[- ]split)\b/,
  electrical: /\b(electric(al)?|wiring|rewire|service upgrade|panel (upgrade|change)|lighting|generator|ev charger)\b/,
  plumbing: /\b(plumbing|water heater|sewer|backflow|repipe|gas (line|piping)|fixtures?)\b/,
  general: /\b(remodel\w*|renovat\w*|alteration|addition|tenant improvement|build-?out|new (construction|building|single[- ]family|residence|home))\b/,
};

/** Trades whose own permit types (electrical, plumbing, mechanical) name the contractor doing the work. */
const PERMIT_TRADES = new Set<WorkId>(["hvac", "electrical", "plumbing", "solar"]);

/**
 * Electrical, plumbing, sign… permits, even when they're for a new pool or a
 * remodel: the building permit for the same job is the lead. Judged on the
 * permit's own type (before " · ", which is usually the work class).
 */
function isTradeOnly(type: string): boolean {
  const kind = norm(type.split("·")[0] ?? "");
  return NOT_A_BUILDING.test(kind) && !/\b(building|bldg|pool|roof|demoli|addition|adu|deck)\b/.test(kind);
}

/** Whether a permit is itself work in this trade (a pool permit for a pool builder). */
export function isTradeWork(work: WorkId, type: string, description: string): boolean {
  const all = norm(`${type} ${description}`);
  if (PERMIT_TRADES.has(work)) {
    // An electrical permit is an electrician's job whatever it's for.
    if (work !== "solar" && isTradeOnly(type)) return TRADE_WORK[work]!.test(norm(type.split("·")[0] ?? ""));
    return TRADE_WORK[work]?.test(all) ?? false;
  }
  // The electrician wiring a new pool isn't a pool builder.
  if (isTradeOnly(type)) return false;
  // Whoever pulls a new-home permit is a home builder, even if the house comes with a pool.
  if (work === "general") return isNewBuild(norm(type), all) || TRADE_WORK.general!.test(all);
  if (isNewBuild(norm(type), all)) return false;
  return TRADE_WORK[work]?.test(all) ?? false;
}

// NAICS prefixes and title words → the subs a job needs.
const NAICS_WORK: [RegExp, WorkId[]][] = [
  [/^561730/, ["landscaping"]],
  [/^2382(2|20)/, ["hvac", "plumbing"]],
  [/^238210/, ["electrical"]],
  [/^238160/, ["roofing"]],
  [/^238320/, ["painting"]],
  [/^238110/, ["patio"]],
  [/^238150/, ["windows"]],
  [/^238170/, ["gutters", "windows"]],
  [/^23891|^238990/, ["junk", "patio"]],
  [/^2362|^236118|^2361|^238350|^238390/, ["general"]],
  [/^5621/, ["junk"]],
  [/^221114/, ["solar"]],
];
const TITLE_WORK: [RegExp, WorkId][] = [
  [/\b(hvac|heating|air condition\w*|boiler|chiller|cooling tower|mechanical)\b/i, "hvac"],
  [/\b(electric\w*|lighting|generator|wiring)\b/i, "electrical"],
  [/\b(plumbing|backflow|water heater|sewer)\b/i, "plumbing"],
  [/\b(roof\w*)\b/i, "roofing"],
  [/\b(fenc\w*)\b/i, "fence"],
  [/\b(paint\w*)\b/i, "painting"],
  [/\b(landscap\w*|grounds|mowing|lawn|tree (trimming|removal)|irrigation)\b/i, "landscaping"],
  [/\b(paving|concrete|sidewalk|asphalt|parking lot)\b/i, "patio"],
  [/\b(demoli\w*|debris|abatement|junk)\b/i, "junk"],
  // "Window washing" is a cleaning job, not window installers.
  [/\b(windows?|glazing|doors?)\b(?!\s+(?:wash|clean))/i, "windows"],
  [/\b(solar|photovoltaic)\b/i, "solar"],
  [/\b(gutters?)\b/i, "gutters"],
  [/\b(renovat\w*|remodel\w*|construction|repairs?|alteration|build-?out)\b/i, "general"],
];

/** The kinds of subs a job needs, best guess first ([] when permits won't help, e.g. janitorial). */
export function workForJob(job: { naicsCode?: string | null; title?: string; terms?: string[] }): WorkId[] {
  const found: WorkId[] = [];
  const add = (w: WorkId) => !found.includes(w) && found.push(w);
  const text = `${job.title ?? ""} ${(job.terms ?? []).join(" ")}`;
  for (const [re, w] of TITLE_WORK) if (re.test(text)) add(w);
  for (const [re, ws] of NAICS_WORK) if (job.naicsCode && re.test(job.naicsCode)) ws.forEach(add);
  return found;
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/[·|]/g, " ").replace(/\s+/g, " ")} `;

/** Tag the follow-on work a permit means for other trades. */
export function tagTrades(type: string, description: string, residential: boolean | null): TradeTag[] {
  const t = norm(type);
  const all = norm(`${type} ${description}`);
  const tags = new Map<TradeId, { reason: string; strength: SignalStrength }>();
  const add = (list: Tag[]) =>
    list.forEach(([trade, reason, strength]) => {
      const had = tags.get(trade);
      if (!had || STRENGTH_RANK[strength] > STRENGTH_RANK[had.strength]) tags.set(trade, { reason, strength });
    });

  // Trade-only permits (electrical, plumbing, signs…) aren't a signal unless they say otherwise.
  if (isTradeOnly(type)) return [];

  if (isNewBuild(t, all)) {
    const commercial = residential === false || (COMMERCIAL_WORDS.test(all) && residential !== true);
    add(commercial ? NEW_COMMERCIAL_TAGS : NEW_HOME_TAGS);
  }
  for (const rule of RULES) {
    if (rule.residential && residential === false) continue;
    if (!rule.match.test(all) || rule.unless?.test(all)) continue;
    add(rule.tags);
  }
  return [...tags].map(([trade, t]) => ({ trade, ...t }));
}

const RESIDENTIAL = /\b(residential|single[- ]family|one[- ]family|two[- ]family|1 or 2 family|1-2 family|dwelling|duplex|triplex|townhouse|townhome|sfr|sfd|adu|r-3|r-5|res\b|house|home)\b/i;
const COMMERCIAL = /\b(commercial|retail|office|industrial|warehouse|restaurant|hotel|business|mercantile|assembly|institutional|com\b)\b/i;

/** Whether a permit is residential, from its class/use text; null if it doesn't say. */
export function isResidential(text: string): boolean | null {
  if (!text.trim()) return null;
  const r = RESIDENTIAL.test(text);
  const c = COMMERCIAL.test(text);
  if (r && !c) return true;
  if (c && !r) return false;
  if (/^\s*r\s*$/i.test(text)) return true;
  if (/^\s*c\s*$/i.test(text)) return false;
  return r ? true : null;
}
