// Shared data shapes used by the API routes and the UI.

export interface Place {
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface Contact {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
}

/** A contract opportunity, normalized from a SAM.gov notice. */
export interface Opportunity {
  id: string;
  title: string;
  solicitationNumber: string;
  agency: string;
  office: string;
  postedDate: string;
  responseDeadline: string | null;
  type: string;
  setAside: string | null;
  setAsideCode: string | null;
  naicsCode: string | null;
  pscCode: string | null;
  placeOfPerformance: Place;
  contacts: Contact[];
  /** Attachment links, or null when unknown (SAM.gov's daily file doesn't list them). */
  attachments: string[] | null;
  /** Loaded on demand for search results; "" means the notice has none. */
  description?: string;
  samUrl: string;
  /** True when SAM.gov gave no place of performance and this is the contracting office's location. */
  placeFromOffice?: boolean;
  /** How many versions (original + amendments) SAM.gov has posted under this solicitation number. */
  versions?: number;
  source?: "bulk" | "sample" | "sled";
  isSample?: boolean;
  /** Federal (SAM.gov) unless a state or local feed. */
  level?: "federal" | "state" | "local";
  /** Where to open the notice, when it isn't SAM.gov. */
  portal?: string;
  /** For notices without a product/service code: what kind of buy it is. */
  serviceKind?: "service" | "product" | "construction" | null;
}

export type OpportunitySort = "fit" | "deadline" | "newest";

export interface OpportunitySearch {
  q?: string;
  state?: string;
  naics?: string;
  setAside?: string;
  /** 0 or missing means any time. */
  postedWithinDays?: number;
  minDaysToRespond?: number;
  servicesOnly?: boolean;
  biddableOnly?: boolean;
  sort?: OpportunitySort;
  /** "" for everything, "federal" for SAM.gov, "sled" for state and local. */
  level?: "" | "federal" | "sled";
}

export interface OpportunityResults {
  results: Opportunity[];
  total: number;
  offset: number;
  source: "bulk" | "sample";
  /** When SAM.gov published the daily file these results come from. */
  dataAsOf?: string;
  notice?: string;
  /** How many of the matches are state and local bids. */
  sledTotal?: number;
}

export interface SamDataStatus {
  /** When SAM.gov published the file in use. */
  asOf: string | null;
  /** When Kontract downloaded it. */
  fetchedAt: string;
  /** Notices kept in the local index (open or recently posted). */
  count: number;
  refreshing: boolean;
  error: string | null;
}

/** A past federal contract award from USAspending.gov. */
export interface PastAward {
  id: string;
  awardId: string;
  recipient: string;
  amount: number;
  annualAmount: number | null;
  agency: string;
  subAgency: string;
  startDate: string | null;
  endDate: string | null;
  years: number | null;
  description: string;
  naics: string | null;
  psc: string | null;
  state: string | null;
  url: string;
  likelyRelated: boolean;
}

export interface PricingStats {
  count: number;
  medianTotal: number | null;
  lowTotal: number | null;
  highTotal: number | null;
  /** Per-year figures come from awards that ran about a year or longer, when there are enough. */
  medianAnnual: number | null;
  lowAnnual: number | null;
  highAnnual: number | null;
  annualCount: number;
}

export interface PricingQuery {
  keywords: string[];
  naics?: string;
  state?: string;
  agency?: string;
  yearsBack?: number;
  servicesOnly?: boolean;
}

export interface PricingResults {
  awards: PastAward[];
  stats: PricingStats;
  query: PricingQuery;
}

export type SubStatus = "new" | "contacted" | "quoted" | "selected" | "declined";

export interface Vetting {
  respondsFast?: boolean;
  goodReviews?: boolean;
  hasWebsite?: boolean;
  proEmail?: boolean;
  okWithNet30?: boolean;
  pastPerformance?: boolean;
}

export interface Subcontractor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  mapsUrl?: string;
  source: "google" | "apify" | "usaspending" | "manual" | "sample" | "permits" | "bench";
  status: SubStatus;
  quote?: number;
  quoteBasis?: string;
  /** Their price per unit for each price line, from an online quote. */
  lineQuotes?: Record<string, number>;
  /** Their total per period (per year, or for the whole job), from an online quote. */
  quoteTotal?: number;
  notes?: string;
  vetting: Vetting;
  /** The bench contact this sub is, when linked. */
  crmId?: string;
  /** The quote link sent to them. */
  quoteToken?: string;
  license?: string;
}

export interface PriceLine {
  id: string;
  description: string;
  unit: string;
  /** Units per period (e.g. pickups per year). */
  quantity: number;
  /** What the subcontractor charges you, per unit. */
  subCost: number;
  /** What you charge the government, per unit. */
  price: number;
}

export interface PricingModel {
  /** Number of periods the contract runs, e.g. 5 for 1 base + 4 option years. */
  periods: number;
  /** "year" for multi-year contracts; "contract" for one-off jobs (periods = 1). */
  periodLabel: "year" | "contract";
  lines: PriceLine[];
  /** Price anchor picked from a past award. */
  anchor?: { annual: number | null; total: number; label: string };
}

/** A plain-English read of a solicitation. */
export interface Breakdown {
  plainEnglish: string;
  workType: "service" | "product" | "mixed";
  whoDoesTheWork: string;
  subcontractorSearchTerms: string[];
  pricingStructure: string;
  suggestedLines: { description: string; unit: string; quantityPerPeriod: number }[];
  contractLength: string;
  periods: number | null;
  keyRequirements: string[];
  questionsForSubs: string[];
  redFlags: string[];
  difficulty: "easy" | "moderate" | "hard";
  source: "claude" | "rules";
}

export type Stage = "found" | "sourcing" | "quoted" | "submitted" | "won" | "lost";

export interface Deal {
  id: string;
  opportunity: Opportunity;
  stage: Stage;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  notes: string;
  breakdown?: Breakdown;
  sow?: string;
  proposal?: string;
  subs: Subcontractor[];
  pricing: PricingModel;
}

export interface CompanyProfile {
  companyName: string;
  uei: string;
  cage: string;
  address: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  website: string;
  capabilities: string;
  defaultMarkupPct: number;
}

export interface IntegrationStatus {
  /** SAM_API_KEY is set (used to list attachments). */
  sam: boolean;
  samData: SamDataStatus | null;
  claude: boolean;
  places: "google" | "apify" | null;
  usaspending: true;
  model: string;
  subPlans: { freePerWeek: number; dailyPrice: number; payments: boolean; email: boolean };
  /** Open state and local bids we're collecting, and from how many feeds. */
  sled?: { count: number; feeds: number; error: string | null };
}

export type DraftKind = "sow" | "outreach" | "proposal";

/** Where a subcontractor is on your bench. */
export type CrmStage = "found" | "contacted" | "quoted" | "active" | "not-a-fit";

export interface CrmActivity {
  id: string;
  at: string;
  kind: "call" | "email" | "text" | "meeting" | "note";
  text: string;
}

/** A subcontractor on your bench: found from permits or maps, added by hand, or signed up themselves. */
export interface CrmContact {
  id: string;
  company: string;
  contactName?: string;
  /** A WorkId when known (fence, hvac…), otherwise free text. */
  trade?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  /** Permit market they were found in, e.g. "austin-tx". */
  market?: string;
  license?: string;
  /** YYYY-MM-DD their liability insurance runs to, when known. */
  insuredUntil?: string;
  source: "permits" | "places" | "manual" | "signup";
  stage: CrmStage;
  /** YYYY-MM-DD */
  nextFollowUp?: string;
  notes?: string;
  activities: CrmActivity[];
  createdAt: string;
  updatedAt: string;
}

// ---- Building permits ----

export type TradeId =
  | "fence"
  | "landscaping"
  | "pool"
  | "patio"
  | "gutters"
  | "blinds"
  | "roofing"
  | "solar"
  | "painting"
  | "cleaning"
  | "junk"
  | "windows";

/** Kinds of work a subcontractor does: the lead trades plus ones permits name directly. */
export type WorkId = TradeId | "hvac" | "electrical" | "plumbing" | "general";

/** How sure the tag is: a new pool legally needs a fence (strong); a new home might get a pool (possible). */
export type SignalStrength = "strong" | "likely" | "possible";

export interface TradeTag {
  trade: TradeId;
  /** Why this permit means work for that trade. */
  reason: string;
  strength: SignalStrength;
}

export interface RelatedPermit {
  id: string;
  number: string;
  type: string;
  issuedDate: string;
  url: string;
}

export interface Permit {
  id: string;
  sourceId: string;
  /** The city or county, e.g. "san-francisco-ca" (may span several feeds). */
  market: string;
  number: string;
  /** YYYY-MM-DD */
  issuedDate: string;
  type: string;
  description: string;
  /** Street address only. */
  address: string;
  city: string;
  state: string;
  zip?: string;
  value?: number;
  contractor?: string;
  contractorPhone?: string;
  contractorLicense?: string;
  /** YYYY-MM-DD the contractor's liability insurance runs to, when the city records it. */
  insuredUntil?: string;
  owner?: string;
  residential: boolean | null;
  /** Official record when the city links one, otherwise the dataset. */
  url: string;
  trades: TradeTag[];
  /** Other permits at the same address in this window (counted as one lead). */
  related?: RelatedPermit[];
}

export type FeedCadence = "several-daily" | "daily" | "weekly";
export type FeedStatus = "discovered" | "inspected" | "sampled" | "collecting" | "validated";

/** One dataset in the source register. */
export interface PermitFeedInfo {
  id: string;
  market: string;
  name: string;
  state: string;
  kind: "city" | "county";
  dataset: string;
  datasetUrl: string;
  /** How often the publisher adds permits. */
  cadence: FeedCadence;
  /** What it leaves out, in plain words. */
  gaps: string[];
  /** YYYY-MM-DD we last checked its columns and freshness by hand. */
  lastVerified: string;
  status: FeedStatus;
}

/** A state or local bid feed in the source register. */
export interface BidFeedInfo {
  id: string;
  name: string;
  /** Where bidders open the notice, e.g. "RAMP LA". */
  portal: string;
  state: string;
  level: "state" | "local";
  dataset: string;
  datasetUrl: string;
  cadence: FeedCadence;
  gaps: string[];
  lastVerified: string;
  status: FeedStatus;
}

export interface PermitMarketInfo {
  id: string;
  name: string;
  state: string;
  kind: "city" | "county";
  feeds: string[];
}

export type FeedHealthStatus = "ok" | "stale" | "empty" | "failing" | "unknown";

export interface FeedHealth {
  status: FeedHealthStatus;
  detail: string;
  checkedAt?: string;
  /** Newest issue date seen in the last check. */
  latest?: string;
  /** Permits in the last 7 days at the last check. */
  rows?: number;
  ms?: number;
}

export interface PermitQuery {
  state?: string;
  /** One city or county, or every market in the state when empty. */
  market?: string;
  days: number;
  trade?: TradeId;
  minValue?: number;
  residentialOnly?: boolean;
  q?: string;
  zip?: string;
  /** Only permits that mean work for at least one trade. */
  leadsOnly?: boolean;
  /** Only tags at least this sure. */
  minStrength?: SignalStrength;
}

export interface PermitSourceResult {
  id: string;
  name: string;
  market: string;
  count: number;
  error?: string;
}

export interface PermitResults {
  /** One per address: several permits at the same address are one lead. */
  permits: Permit[];
  total: number;
  /** Leads per trade (unique addresses), before the trade filter. */
  byTrade: Partial<Record<TradeId, number>>;
  /** Permit rows issued in the window, before any filter or grouping. */
  scanned: number;
  /** Unique addresses among the filtered permits, before the trade filter. */
  addresses: number;
  sources: PermitSourceResult[];
}

/** A local business that has pulled permits in this market. */
export interface PermitContractor {
  /** Lowercased name with punctuation removed, for matching. */
  key: string;
  name: string;
  phone?: string;
  license?: string;
  insuredUntil?: string;
  permits: number;
  /** Unique addresses they pulled permits for. */
  jobs: number;
  latest: string;
  types: string[];
  market?: string;
}

// ---- Subcontractor accounts ----

export type AccountRole = "prime" | "sub";
export type LeadPlan = "free" | "daily";

/** Per-user settings: whether they hire subs (prime) or are one, and a sub's trade, area and plan. */
export interface Account {
  role: AccountRole;
  company?: string;
  /** The trade they want permit leads for. */
  trade?: TradeId;
  /** Permit market (city or county) for their leads. */
  market?: string;
  /** Only these ZIPs, when set. */
  zips?: string[];
  website?: string;
  phone?: string;
  plan: LeadPlan;
  planSince?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /** Email the leads (weekly on free, every morning on daily). */
  digest: boolean;
  /** The free plan's picks for one week, fixed once chosen. */
  weekly?: { weekStart: string; ids: string[] };
  lastDigestAt?: string;
  /** The prime whose invite they signed up through. */
  invitedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubLeads {
  plan: LeadPlan;
  trade: TradeId | null;
  market: string | null;
  /** Monday of the current week (YYYY-MM-DD). */
  weekStart: string;
  leads: Permit[];
  /** Leads available this week on the daily plan. */
  availableThisWeek: number;
}


// ---- AI customer finder (for subcontractors) ----

export type SignalKind = "funding" | "hiring" | "linkedin" | "x" | "community" | "news";

export interface BusinessProfile {
  summary: string;
  services: string[];
  /** Who buys from them, in their own words. */
  idealCustomers: string[];
  serviceArea: string;
  /** Events that make a company need them now (moved offices, raised money, hiring…). */
  buyingSignals: string[];
}

export interface ProspectPerson {
  name: string;
  title?: string;
  linkedin?: string;
  /** Only when published on a page that was read; never guessed. */
  email?: string;
}

export type ProspectStatus = "new" | "contacted" | "replied" | "won" | "dismissed";

/** A company with a reason to hire this sub right now, and where that reason came from. */
export interface Prospect {
  id: string;
  company: string;
  website?: string;
  kind: SignalKind;
  /** What happened, e.g. "Raised a $12M Series A". */
  signal: string;
  /** The page that says so. */
  signalUrl: string;
  /** YYYY-MM-DD when known. */
  signalDate?: string;
  whyFit: string;
  location?: string;
  funding?: { amount?: string; round?: string; date?: string };
  hiring?: string[];
  people: ProspectPerson[];
  outreach: { subject: string; body: string };
  status: ProspectStatus;
  foundAt: string;
  /** Labeled demo data (no Claude key). */
  sample?: boolean;
}

export interface ProspectRun {
  id: string;
  website: string;
  startedAt: string;
  finishedAt?: string;
  profile?: BusinessProfile;
  found: number;
  searches: number;
  error?: string;
  sample?: boolean;
}
