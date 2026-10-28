import type { BidFeedInfo, Opportunity } from "./types.ts";

// State and local bids: open solicitations that cities, counties and states
// publish on their open-data portals. Small service contracts (grounds,
// janitorial, repairs) often never reach SAM.gov. Each feed's columns were
// checked by hand; `normalize` turns one row into an Opportunity.

type Row = Record<string, unknown>;

export interface BidSource extends BidFeedInfo {
  domain: string;
  /** SoQL filter for bids that are still open (or coming up), given today's date. */
  where: (today: string) => string;
  order: string;
  normalize: (row: Row) => Opportunity | null;
}

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object" && "url" in (v as Row)) return String((v as Row).url ?? "");
  return String(v)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
};

/** "2026-10-30T22:00:00.000" → ISO in UTC isn't known; keep the local wall time as given. */
const when = (v: unknown): string | null => {
  const t = text(v);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.replace(/\.000$/, "") : null;
};

const kindOf = (category: string): Opportunity["serviceKind"] =>
  /commodit|goods|equipment|supplies|vehicle|buses/i.test(category) ? "product" : /construct/i.test(category) ? "construction" : /service/i.test(category) ? "service" : null;

function base(src: Pick<BidSource, "id" | "portal" | "level">, o: Partial<Opportunity> & Pick<Opportunity, "title" | "solicitationNumber" | "samUrl">): Opportunity {
  return {
    id: `sled:${src.id}:${o.solicitationNumber || o.title.slice(0, 40)}`,
    agency: "",
    office: src.portal,
    postedDate: "",
    responseDeadline: null,
    type: "Solicitation",
    setAside: null,
    setAsideCode: null,
    naicsCode: null,
    pscCode: null,
    placeOfPerformance: {},
    contacts: [],
    attachments: null,
    description: "",
    source: "sled",
    level: src.level,
    portal: src.portal,
    ...o,
  };
}

const S = (s: Omit<BidSource, "datasetUrl" | "lastVerified" | "status">): BidSource => ({
  ...s,
  lastVerified: "2026-10-28",
  status: "collecting",
  datasetUrl: `https://${s.domain}/d/${s.dataset}`,
});

export const BID_SOURCES: BidSource[] = [
  S({
    id: "la-ramp", name: "Los Angeles RAMP open bids", portal: "RAMP LA", state: "CA", level: "local", domain: "data.lacity.org", dataset: "hf3r-utnq", cadence: "daily",
    gaps: ["City of Los Angeles and some LA County agencies only", "No descriptions or set-asides in the feed; open the RAMP page for documents"],
    where: (today) => `closedate >= '${today}T00:00:00'`,
    order: "closedate",
    normalize(r) {
      const title = text(r.title);
      if (!title) return null;
      const category = text(r.category);
      return base(this, {
        title,
        solicitationNumber: text(r.rampid),
        agency: text(r.department) || "City of Los Angeles",
        postedDate: when(r.bidpost) ?? "",
        responseDeadline: when(r.closedate),
        type: `Solicitation · ${text(r.type) || "Bid"}`,
        placeOfPerformance: { city: "Los Angeles", state: "CA" },
        description: [category && `Category: ${category}`, text(r.stagename) === "Amended" && "This solicitation has been amended."].filter(Boolean).join("\n"),
        serviceKind: kindOf(category),
        samUrl: text(r.url) || "https://www.rampla.org",
      });
    },
  }),
  S({
    id: "nyc-city-record", name: "NYC City Record procurement notices", portal: "NYC City Record", state: "NY", level: "local", domain: "data.cityofnewyork.us", dataset: "dg92-zbpx", cadence: "daily",
    gaps: ["Solicitations only (awards and hearings are filtered out)", "Some notices are bid extensions of earlier ones"],
    where: (today) => `section_name='Procurement' AND type_of_notice_description='Solicitation' AND due_date >= '${today}T00:00:00'`,
    order: "due_date",
    normalize(r) {
      const title = text(r.short_title);
      if (!title) return null;
      const category = text(r.category_description);
      const desc = [text(r.additional_description_1), text(r.additional_description_2), text(r.additional_description_3)].filter(Boolean).join("\n\n");
      return base(this, {
        title: title.replace(/^\d{5}[A-Z]\d{4}-/, ""),
        solicitationNumber: text(r.pin) || text(r.request_id),
        agency: text(r.agency_name) || "City of New York",
        postedDate: when(r.start_date) ?? "",
        responseDeadline: when(r.due_date),
        type: `Solicitation · ${text(r.selection_method_description) || "Bid"}`,
        placeOfPerformance: { city: "New York", state: "NY" },
        contacts: text(r.contact_name) ? [{ name: text(r.contact_name), phone: text(r.contact_phone) || undefined, email: text(r.email) || undefined }] : [],
        description: [category && `Category: ${category}`, text(r.address_to_request) && `Get the documents: ${text(r.address_to_request)}`, desc].filter(Boolean).join("\n\n"),
        serviceKind: kindOf(category),
        samUrl: text(r.document_links) || `https://a856-cityrecord.nyc.gov/RequestDetail/${text(r.request_id)}`,
      });
    },
  }),
  S({
    id: "delaware-open-bids", name: "Delaware state open bids", portal: "Delaware MyMarketplace", state: "DE", level: "state", domain: "data.delaware.gov", dataset: "2hnj-zwix", cadence: "daily",
    gaps: ["Title and deadline only; open the bid page for the scope"],
    where: (today) => `deadlinedate >= '${today}T00:00:00'`,
    order: "deadlinedate",
    normalize(r) {
      const title = text(r.contracttitle);
      if (!title) return null;
      const unspsc = text(r.unspsc);
      return base(this, {
        title,
        solicitationNumber: text(r.contractnumber),
        agency: `State of Delaware (${text(r.agencycode) || "agency"})`,
        postedDate: when(r.opendate) ?? "",
        responseDeadline: when(r.deadlinedate),
        placeOfPerformance: { state: "DE" },
        description: unspsc ? `UNSPSC: ${unspsc}` : "",
        // UNSPSC segments 70–95 are services.
        serviceKind: /^(7\d|8\d|9[0-5])/.test(unspsc) ? "service" : unspsc ? "product" : null,
        samUrl: text(r.bidurl) || "https://mmp.delaware.gov/Bids",
      });
    },
  }),
  S({
    id: "montgomery-md-solicitations", name: "Montgomery County (MD) solicitations", portal: "Montgomery County Procurement", state: "MD", level: "local", domain: "data.montgomerycountymd.gov", dataset: "eeq6-nnwe", cadence: "daily",
    gaps: ["No documents in the feed; ask the department contact or check the county portal"],
    where: (today) => `closingdate >= '${today}T00:00:00'`,
    order: "closingdate",
    normalize(r) {
      const title = text(r.description);
      if (!title) return null;
      const reserved = text(r.lsbrpindicator) === "Y";
      return base(this, {
        title,
        solicitationNumber: text(r.number),
        agency: text(r.department) || "Montgomery County, MD",
        postedDate: when(r.issuancedate) ?? "",
        responseDeadline: when(r.closingdate),
        type: `Solicitation · ${text(r.type) || "Bid"}`,
        setAside: reserved ? "Local Small Business Reserve Program" : null,
        setAsideCode: reserved ? "LSBRP" : null,
        placeOfPerformance: { city: "Montgomery County", state: "MD" },
        contacts: text(r.deptcontact) ? [{ name: text(r.deptcontact), title: text(r.department) || undefined }] : [],
        description: text(r.construction) === "Y" ? "Construction solicitation." : "",
        serviceKind: text(r.construction) === "Y" ? "construction" : null,
        samUrl: text(r.bidtab) || "https://www.montgomerycountymd.gov/PRO/",
      });
    },
  }),
  S({
    id: "illinois-cdb-future", name: "Illinois Capital Development Board upcoming bids", portal: "Illinois CDB", state: "IL", level: "state", domain: "illinois-edp.data.socrata.com", dataset: "6rb8-ntpm", cadence: "weekly",
    gaps: ["Upcoming projects, not yet open: the date is when bidding is expected to start", "Construction only"],
    where: (today) => `estimated_bid_date >= '${today}T00:00:00'`,
    order: "estimated_bid_date",
    normalize(r) {
      const title = text(r.description);
      if (!title) return null;
      const bidDate = when(r.estimated_bid_date);
      const location = text(r.location_name);
      const county = location.match(/-\s*([A-Za-z .]+?) County\b/)?.[1];
      return base(this, {
        title,
        solicitationNumber: text(r.project_number),
        agency: "Illinois Capital Development Board",
        postedDate: "",
        responseDeadline: null,
        type: "Presolicitation",
        placeOfPerformance: { city: county ? `${county} County` : undefined, state: "IL" },
        contacts: text(r.project_manager) ? [{ name: text(r.project_manager), title: "Project manager" }] : [],
        description: [
          bidDate && `Bidding expected to open around ${bidDate.slice(0, 10)}.`,
          location && `Location: ${location}`,
          text(r.approximate_cost) && `Approximate cost: ${text(r.approximate_cost)}`,
          text(r.architect_engineer) && `Architect/engineer: ${text(r.architect_engineer)}`,
        ]
          .filter(Boolean)
          .join("\n"),
        serviceKind: "construction",
        samUrl: "https://cdb.illinois.gov/business/bidding-opportunities.html",
      });
    },
  }),
];
