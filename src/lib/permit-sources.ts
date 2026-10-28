import type { PermitFeedInfo, PermitMarketInfo } from "./types.ts";

// The source register: every building-permit feed we collect, grouped into the
// city or county (market) it covers. One market can need several feeds (San
// Francisco moved some permit types to a new system; New York publishes
// electrical permits separately). Each entry records what we checked by hand:
// how often it updates, what it leaves out, and when we last verified it.
// Field names were checked against each dataset's live columns. To add a city,
// see "Notes and limits" in README.md.

export interface FieldMap {
  number?: string;
  /** Joined with " · " (duplicates dropped). */
  type: string[];
  /** Put in front of the type, for feeds that only hold one kind of permit. */
  typePrefix?: string;
  /** First non-empty one wins. */
  description: string[];
  /** Joined with spaces; anything after a comma is dropped. */
  address: string[];
  city?: string;
  cityDefault?: string;
  zip?: string;
  /** First positive number wins. */
  value?: string[];
  contractor?: string;
  contractorPhone?: string;
  contractorLicense?: string;
  /** General liability insurance expiration, when the city records it. */
  insuredUntil?: string;
  owner?: string;
  /** A field holding a link to the official record. */
  link?: string;
  /** Text fields that say whether it's residential (e.g. permit class or use). */
  use?: string[];
}

/** A second dataset joined to each permit by permit number (San Francisco lists contractors separately). */
export interface ContactJoin {
  domain: string;
  dataset: string;
  /** Column holding the permit number in the contacts dataset. */
  key: string;
  /** Extra SoQL filter, e.g. role='contractor'. */
  where: string;
  contractor: string;
  license?: string;
}

export interface PermitSource extends PermitFeedInfo {
  domain: string;
  /** Issue-date field. */
  date: string;
  /** "iso" (floating timestamp) or "mdyy" (text like 10/27/26). */
  dateFormat?: "iso" | "mdyy";
  map: FieldMap;
  /** Chicago lists contractors and owners in numbered contact_N_type/name columns. */
  numberedContacts?: number;
  contacts?: ContactJoin;
}

type FeedInput = Omit<PermitSource, "datasetUrl" | "lastVerified" | "status"> & Partial<Pick<PermitSource, "lastVerified" | "status">>;

const VERIFIED = "2026-10-28";
const S = (s: FeedInput): PermitSource => ({
  lastVerified: VERIFIED,
  status: "collecting",
  ...s,
  datasetUrl: `https://${s.domain}/d/${s.dataset}`,
});

export const PERMIT_SOURCES: PermitSource[] = [
  S({
    id: "chicago-il", market: "chicago-il", name: "Chicago building permits", state: "IL", kind: "city", domain: "data.cityofchicago.org", dataset: "ydr8-5enu", date: "issue_date",
    cadence: "daily", gaps: ["No ZIP codes (the city publishes coordinates instead)", "Voided and revoked permits are removed, so old records can disappear"],
    map: { number: "permit_", type: ["permit_type", "work_type"], description: ["work_description"], address: ["street_number", "street_direction", "street_name"], cityDefault: "Chicago", value: ["reported_cost"], use: ["work_description"] },
    numberedContacts: 6,
  }),
  S({
    id: "austin-tx", market: "austin-tx", name: "Austin issued construction permits", state: "TX", kind: "city", domain: "datahub.austintexas.gov", dataset: "3syk-w9eu", date: "issue_date",
    cadence: "daily", gaps: ["Job value on only about 1 in 10 permits", "The portal is sometimes slow; a failed pull is retried once"],
    map: { number: "permit_number", type: ["permit_type_desc", "work_class"], description: ["description"], address: ["original_address1"], city: "original_city", zip: "original_zip", value: ["total_job_valuation", "building_valuation"], contractor: "contractor_company_name", contractorPhone: "contractor_phone", link: "link", use: ["permit_class_mapped", "permit_class"] },
  }),
  S({
    id: "dallas-tx", market: "dallas-tx", name: "Dallas building permits", state: "TX", kind: "city", domain: "www.dallasopendata.com", dataset: "e7gq-4sah", date: "issued_date", dateFormat: "mdyy",
    cadence: "daily", gaps: ["Recent permits have no contractor names or job values", "Dates are text (mm/dd/yy), so the query lists each day"],
    map: { number: "permit_number", type: ["permit_type"], description: ["work_description"], address: ["street_address"], cityDefault: "Dallas", zip: "zip_code", value: ["value"], contractor: "contractor", use: ["permit_type", "land_use"] },
  }),
  S({
    id: "collin-county-tx", market: "collin-county-tx", name: "Collin County permits (Plano, Frisco, McKinney…)", state: "TX", kind: "county", domain: "data.texas.gov", dataset: "82ee-gbj5", date: "permitissueddate",
    cadence: "weekly", gaps: ["Posts in batches, so the last few days are often empty; use 14–30 days", "Queries can take 30 seconds"],
    map: { number: "permitnum", type: ["permittypedescr", "permitsubtypedescr"], description: ["permitcomments", "permittypedescr"], address: ["situsbldgnum", "situsstreetprefix", "situsstreetname", "situsstreetsuffix"], city: "situscity", zip: "situszip", value: ["permitvalue"], contractor: "permitbuildername", owner: "propownername", use: ["proprescom"] },
  }),
  S({
    id: "college-station-tx", market: "college-station-tx", name: "College Station permits", state: "TX", kind: "city", domain: "data.cstx.gov", dataset: "hrbn-znt6", date: "issued_date",
    cadence: "weekly", gaps: ["Posts about once a week", "No contractor names"],
    map: { number: "permit_number", type: ["permit_type", "permit_subtype"], description: ["permit_description", "permit_subtype"], address: ["address_1"], city: "city", zip: "zip", value: ["valuation"] },
  }),
  S({
    id: "seattle-wa", market: "seattle-wa", name: "Seattle building permits", state: "WA", kind: "city", domain: "cos-data.seattle.gov", dataset: "76t5-zqzr", date: "issueddate",
    cadence: "daily", gaps: ["Contractor named on few permits", "Descriptions can change during review and may be cut off"],
    map: { number: "permitnum", type: ["permittypedesc", "permitclass"], description: ["description"], address: ["originaladdress1"], city: "originalcity", zip: "originalzip", value: ["estprojectcost"], contractor: "contractorcompanyname", link: "link", use: ["permitclassmapped", "permitclass"] },
  }),
  S({
    id: "everett-wa", market: "everett-wa", name: "Everett permits", state: "WA", kind: "city", domain: "data.everettwa.gov", dataset: "3w3u-656c", date: "issueddate",
    cadence: "daily", gaps: [],
    map: { number: "permitno", type: ["permittype", "permitsubtype"], description: ["permitdesc"], address: ["siteaddress"], cityDefault: "Everett", value: ["jobvalue"], contractor: "contractorname", owner: "ownername", use: ["permittype"] },
  }),
  S({
    id: "los-angeles-ca", market: "los-angeles-ca", name: "Los Angeles building permits", state: "CA", kind: "city", domain: "data.lacity.org", dataset: "pi9x-tg5x", date: "issue_date",
    cadence: "daily", gaps: ["No contractor names in any LA permit feed", "Mechanical, HVAC and plumbing permits are in a separate dataset (not collected)"],
    map: { number: "permit_nbr", type: ["permit_type", "permit_sub_type"], description: ["work_desc"], address: ["primary_address"], cityDefault: "Los Angeles", zip: "zip_code", value: ["valuation"], use: ["permit_sub_type", "use_desc"] },
  }),
  S({
    id: "san-francisco-ca", market: "san-francisco-ca", name: "San Francisco building permits (legacy system)", state: "CA", kind: "city", domain: "data.sf.gov", dataset: "i98e-djp9", date: "issued_date",
    cadence: "daily", gaps: ["Reroofing, electrical, plumbing and some remodels moved to PermitSF (collected separately)", "Contractors come from the separate contacts dataset, joined by permit number"],
    map: { number: "permit_number", type: ["permit_type_definition"], description: ["description"], address: ["street_number", "street_name", "street_suffix"], cityDefault: "San Francisco", zip: "zipcode", value: ["revised_cost", "estimated_cost"], use: ["proposed_use", "existing_use"] },
    contacts: { domain: "data.sf.gov", dataset: "3pee-9qhc", key: "permit_number", where: "role='contractor'", contractor: "firm_name", license: "license1" },
  }),
  S({
    id: "san-francisco-permitsf", market: "san-francisco-ca", name: "San Francisco PermitSF (new system)", state: "CA", kind: "city", domain: "data.sf.gov", dataset: "tyz3-vt28", date: "permit_issued_date",
    cadence: "several-daily", gaps: ["Started in 2026, so there's little history", "No contractor names yet"],
    map: { number: "recordno", type: ["application_type", "recordtype"], description: ["description"], address: ["streetno", "streetname"], cityDefault: "San Francisco", zip: "postalcode", value: ["valuation"], link: "url", use: ["recordtype", "description"] },
  }),
  S({
    id: "marin-county-ca", market: "marin-county-ca", name: "Marin County permits", state: "CA", kind: "county", domain: "data.marincounty.gov", dataset: "mkbn-caye", date: "issued_date",
    cadence: "daily", gaps: ["Unincorporated county only, not the cities inside it"],
    map: { number: "permit_number", type: ["type_permit", "permit_work_class"], description: ["description"], address: ["address"], city: "city_town", zip: "zipcode", value: ["construction_value"], contractor: "contractor", use: ["type_permit"] },
  }),
  S({
    id: "new-york-ny", market: "new-york-ny", name: "New York City DOB NOW: Build approved permits", state: "NY", kind: "city", domain: "data.cityofnewyork.us", dataset: "rbx6-tga4", date: "issued_date",
    cadence: "daily", gaps: ["Excludes electrical, elevator and limited alteration work (electrical is collected separately)"],
    map: { number: "work_permit", type: ["work_type"], description: ["job_description"], address: ["house_no", "street_name"], city: "borough", zip: "zip_code", value: ["estimated_job_costs"], contractor: "applicant_business_name", owner: "owner_business_name" },
  }),
  S({
    id: "new-york-electrical", market: "new-york-ny", name: "New York City DOB NOW: Electrical permits", state: "NY", kind: "city", domain: "data.cityofnewyork.us", dataset: "dm9a-ab7w", date: "permit_issued_date",
    cadence: "daily", gaps: ["Electrical work only: names licensed electricians and their insurance, not a lead for other trades"],
    map: { number: "job_filing_number", typePrefix: "Electrical permit", type: ["filing_type"], description: ["job_description"], address: ["house_number", "street_name"], city: "borough", zip: "zip_code", contractor: "firm_name", contractorLicense: "license_number", insuredUntil: "general_liability_expiration", owner: "business_name", use: ["building_use_type"] },
  }),
  S({
    id: "cincinnati-oh", market: "cincinnati-oh", name: "Cincinnati permits", state: "OH", kind: "city", domain: "data.cincinnati-oh.gov", dataset: "uhjb-xac9", date: "issueddate",
    cadence: "daily", gaps: [],
    map: { number: "permitnum", type: ["permittypemapped", "workclassmapped"], description: ["description"], address: ["originaladdress1"], city: "originalcity", zip: "originalzip", value: ["estprojectcostdec"], contractor: "companyname", link: "link", use: ["permitclass", "proposeduse"] },
  }),
  S({
    id: "new-orleans-la", market: "new-orleans-la", name: "New Orleans permits", state: "LA", kind: "city", domain: "data.nola.gov", dataset: "rcm3-fn58", date: "issuedate",
    cadence: "daily", gaps: [],
    map: { number: "numstring", type: ["type"], description: ["description"], address: ["address"], cityDefault: "New Orleans", value: ["constrval"], contractor: "contractors", owner: "owner", use: ["landuse"] },
  }),
  S({
    id: "baton-rouge-la", market: "baton-rouge-la", name: "Baton Rouge permits", state: "LA", kind: "city", domain: "data.brla.gov", dataset: "7fq7-8j7r", date: "issueddate",
    cadence: "daily", gaps: [],
    map: { number: "permitnumber", type: ["permittype", "designation"], description: ["projectdescription"], address: ["streetaddress"], city: "city1", zip: "zip", value: ["projectvalue"], contractor: "contractorname", owner: "ownername", use: ["permittype", "designation"] },
  }),
  S({
    id: "norfolk-va", market: "norfolk-va", name: "Norfolk permits", state: "VA", kind: "city", domain: "data.norfolk.gov", dataset: "fahm-yuh4", date: "issue_date",
    cadence: "daily", gaps: ["No ZIP codes", "No contractor names"],
    map: { number: "permit_number", type: ["type", "work_type", "use_type"], description: ["structure", "use_type"], address: ["address"], cityDefault: "Norfolk", value: ["project_cost"], use: ["use_class", "use_type"] },
  }),
  S({
    id: "mesa-az", market: "mesa-az", name: "Mesa permits", state: "AZ", kind: "city", domain: "citydata.mesaaz.gov", dataset: "dzpk-hxfb", date: "issued_date",
    cadence: "daily", gaps: ["No ZIP codes"],
    map: { number: "permit_number", type: ["record_type", "type_of_work"], description: ["description_of_work"], address: ["property_address"], cityDefault: "Mesa", value: ["total_valuation", "job_value"], contractor: "contractor_name", contractorPhone: "contractor_phone", use: ["record_type", "type_of_work"] },
  }),
  S({
    id: "montgomery-county-md", market: "montgomery-county-md", name: "Montgomery County residential permits", state: "MD", kind: "county", domain: "data.montgomerycountymd.gov", dataset: "m88u-pqki", date: "issueddate",
    cadence: "daily", gaps: ["Residential permits only", "No contractor names"],
    map: { number: "permitno", type: ["usecode", "worktype"], description: ["description"], address: ["stno", "predir", "stname", "suffix"], city: "city", zip: "zip", value: ["declaredvaluation"], use: ["applicationtype"] },
  }),
  S({
    id: "cambridge-ma", market: "cambridge-ma", name: "Cambridge new construction permits", state: "MA", kind: "city", domain: "data.cambridgema.gov", dataset: "9qm7-wbdc", date: "issue_date",
    cadence: "weekly", gaps: ["New construction only", "Only a handful of permits a month"],
    map: { number: "id", type: ["proposed_building_use"], description: ["description_of_work"], address: ["full_address"], cityDefault: "Cambridge", value: ["total_cost_of_construction"], contractor: "licensed_name", use: ["proposed_building_use"] },
  }),
  S({
    id: "orlando-fl", market: "orlando-fl", name: "Orlando permits", state: "FL", kind: "city", domain: "data.cityoforlando.net", dataset: "ryhf-m453", date: "issue_permit_date",
    cadence: "daily", gaps: ["No ZIP codes in addresses"],
    map: { number: "permit_number", type: ["application_type", "worktype"], description: ["project_name", "plan_review_type"], address: ["permit_address"], cityDefault: "Orlando", value: ["estimated_cost"], contractor: "contractor_name", contractorPhone: "contractor_phone_number", owner: "property_owner_name", use: ["worktype", "plan_review_type"] },
  }),
];

const MARKET_NAMES: Record<string, string> = {
  "chicago-il": "Chicago", "austin-tx": "Austin", "dallas-tx": "Dallas", "collin-county-tx": "Collin County (Plano, Frisco, McKinney…)",
  "college-station-tx": "College Station", "seattle-wa": "Seattle", "everett-wa": "Everett", "los-angeles-ca": "Los Angeles",
  "san-francisco-ca": "San Francisco", "marin-county-ca": "Marin County", "new-york-ny": "New York City", "cincinnati-oh": "Cincinnati",
  "new-orleans-la": "New Orleans", "baton-rouge-la": "Baton Rouge", "norfolk-va": "Norfolk", "mesa-az": "Mesa",
  "montgomery-county-md": "Montgomery County (residential)", "cambridge-ma": "Cambridge (new construction)", "orlando-fl": "Orlando",
};

/** Cities and counties, each with the feeds that cover it. */
export const PERMIT_MARKETS: PermitMarketInfo[] = [...new Set(PERMIT_SOURCES.map((s) => s.market))].map((id) => {
  const feeds = PERMIT_SOURCES.filter((s) => s.market === id);
  return { id, name: MARKET_NAMES[id] ?? feeds[0]!.name, state: feeds[0]!.state, kind: feeds[0]!.kind, feeds: feeds.map((f) => f.id) };
});

export const STATE_NAMES: Record<string, string> = {
  AZ: "Arizona", CA: "California", FL: "Florida", IL: "Illinois", LA: "Louisiana", MA: "Massachusetts", MD: "Maryland",
  NY: "New York", OH: "Ohio", TX: "Texas", VA: "Virginia", WA: "Washington",
};

export function permitMarket(id: string | undefined): PermitMarketInfo | undefined {
  return id ? PERMIT_MARKETS.find((m) => m.id === id) : undefined;
}

export function marketsForState(state: string | undefined): PermitMarketInfo[] {
  return state ? PERMIT_MARKETS.filter((m) => m.state === state) : PERMIT_MARKETS;
}

/** Feeds for one market, or for every market in a state. */
export function feedsFor(q: { market?: string; state?: string }): PermitSource[] {
  if (q.market) return PERMIT_SOURCES.filter((s) => s.market === q.market);
  return q.state ? PERMIT_SOURCES.filter((s) => s.state === q.state) : [];
}

export function permitSource(id: string): PermitSource | undefined {
  return PERMIT_SOURCES.find((s) => s.id === id);
}

/** The market whose name matches a city ("Austin" → austin-tx), if we cover it. */
export function marketForCity(city: string | undefined, state: string | undefined): PermitMarketInfo | undefined {
  if (!city || !state) return undefined;
  const c = city.toLowerCase().replace(/[^a-z]/g, "");
  return marketsForState(state).find((m) => m.name.toLowerCase().replace(/[^a-z]/g, "").startsWith(c));
}

/** Every column a feed's mapping reads, for SoQL $select. */
export function selectedFields(s: PermitSource): string[] {
  const m = s.map;
  const fields = new Set<string>([s.date, ...m.type, ...m.description, ...m.address, ...(m.value ?? []), ...(m.use ?? [])]);
  for (const f of [m.number, m.city, m.zip, m.contractor, m.contractorPhone, m.contractorLicense, m.insuredUntil, m.owner, m.link]) if (f) fields.add(f);
  for (let i = 1; i <= (s.numberedContacts ?? 0); i++) {
    fields.add(`contact_${i}_type`);
    fields.add(`contact_${i}_name`);
  }
  return [...fields];
}
