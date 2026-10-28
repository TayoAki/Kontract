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
  attachments: string[];
  descriptionUrl: string | null;
  /** Present on sample data, or once fetched from SAM.gov. */
  description?: string;
  samUrl: string;
  isSample?: boolean;
}

export interface OpportunitySearch {
  q?: string;
  state?: string;
  naics?: string;
  setAside?: string;
  postedWithinDays?: number;
  minDaysToRespond?: number;
  servicesOnly?: boolean;
  biddableOnly?: boolean;
}

export interface OpportunityResults {
  results: Opportunity[];
  total: number;
  source: "sam" | "sample";
  notice?: string;
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
  source: "google" | "apify" | "usaspending" | "manual" | "sample";
  status: SubStatus;
  quote?: number;
  quoteBasis?: string;
  notes?: string;
  vetting: Vetting;
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
  sam: boolean;
  claude: boolean;
  places: "google" | "apify" | null;
  usaspending: true;
  model: string;
}

export type DraftKind = "sow" | "outreach" | "proposal";
