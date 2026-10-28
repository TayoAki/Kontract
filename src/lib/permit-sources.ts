import type { PermitSourceInfo } from "./types.ts";

// Building-permit feeds published by cities and counties on Socrata open-data
// portals (free, no key, updated daily). Field names were checked against each
// dataset's live columns; README.md ("Notes and limits") explains adding a city.

export interface FieldMap {
  number?: string;
  /** Joined with " · " (duplicates dropped). */
  type: string[];
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
  owner?: string;
  /** A field holding a link to the official record. */
  link?: string;
  /** Text fields that say whether it's residential (e.g. permit class or use). */
  use?: string[];
}

export interface PermitSource extends PermitSourceInfo {
  domain: string;
  dataset: string;
  /** Issue-date field. */
  date: string;
  /** "iso" (floating timestamp) or "mdyy" (text like 10/27/26). */
  dateFormat?: "iso" | "mdyy";
  map: FieldMap;
  /** Chicago lists contractors and owners in numbered contact_N_type/name columns. */
  numberedContacts?: number;
}

const S = (s: Omit<PermitSource, "datasetUrl">): PermitSource => ({ ...s, datasetUrl: `https://${s.domain}/d/${s.dataset}` });

export const PERMIT_SOURCES: PermitSource[] = [
  S({
    id: "chicago-il", name: "Chicago", state: "IL", kind: "city", domain: "data.cityofchicago.org", dataset: "ydr8-5enu", date: "issue_date",
    map: { number: "permit_", type: ["permit_type", "work_type"], description: ["work_description"], address: ["street_number", "street_direction", "street_name"], cityDefault: "Chicago", value: ["reported_cost"], use: ["work_description"] },
    numberedContacts: 6,
  }),
  S({
    id: "austin-tx", name: "Austin", state: "TX", kind: "city", domain: "datahub.austintexas.gov", dataset: "3syk-w9eu", date: "issue_date",
    map: { number: "permit_number", type: ["permit_type_desc", "work_class"], description: ["description"], address: ["original_address1"], city: "original_city", zip: "original_zip", value: ["total_job_valuation", "building_valuation"], contractor: "contractor_company_name", contractorPhone: "contractor_phone", link: "link", use: ["permit_class_mapped", "permit_class"] },
  }),
  S({
    id: "dallas-tx", name: "Dallas", state: "TX", kind: "city", domain: "www.dallasopendata.com", dataset: "e7gq-4sah", date: "issued_date", dateFormat: "mdyy",
    map: { number: "permit_number", type: ["permit_type"], description: ["work_description"], address: ["street_address"], cityDefault: "Dallas", zip: "zip_code", value: ["value"], contractor: "contractor", use: ["permit_type", "land_use"] },
  }),
  S({
    id: "collin-county-tx", name: "Collin County (Plano, Frisco, McKinney…)", state: "TX", kind: "county", domain: "data.texas.gov", dataset: "82ee-gbj5", date: "permitissueddate",
    map: { number: "permitnum", type: ["permittypedescr", "permitsubtypedescr"], description: ["permitcomments", "permittypedescr"], address: ["situsbldgnum", "situsstreetprefix", "situsstreetname", "situsstreetsuffix"], city: "situscity", zip: "situszip", value: ["permitvalue"], contractor: "permitbuildername", owner: "propownername", use: ["proprescom"] },
  }),
  S({
    id: "college-station-tx", name: "College Station", state: "TX", kind: "city", domain: "data.cstx.gov", dataset: "hrbn-znt6", date: "issued_date",
    map: { number: "permit_number", type: ["permit_type", "permit_subtype"], description: ["permit_description", "permit_subtype"], address: ["address_1"], city: "city", zip: "zip", value: ["valuation"] },
  }),
  S({
    id: "seattle-wa", name: "Seattle", state: "WA", kind: "city", domain: "cos-data.seattle.gov", dataset: "76t5-zqzr", date: "issueddate",
    map: { number: "permitnum", type: ["permittypedesc", "permitclass"], description: ["description"], address: ["originaladdress1"], city: "originalcity", zip: "originalzip", value: ["estprojectcost"], contractor: "contractorcompanyname", link: "link", use: ["permitclassmapped", "permitclass"] },
  }),
  S({
    id: "everett-wa", name: "Everett", state: "WA", kind: "city", domain: "data.everettwa.gov", dataset: "3w3u-656c", date: "issueddate",
    map: { number: "permitno", type: ["permittype", "permitsubtype"], description: ["permitdesc"], address: ["siteaddress"], cityDefault: "Everett", value: ["jobvalue"], contractor: "contractorname", owner: "ownername", use: ["permittype"] },
  }),
  S({
    id: "los-angeles-ca", name: "Los Angeles", state: "CA", kind: "city", domain: "data.lacity.org", dataset: "pi9x-tg5x", date: "issue_date",
    map: { number: "permit_nbr", type: ["permit_type", "permit_sub_type"], description: ["work_desc"], address: ["primary_address"], cityDefault: "Los Angeles", zip: "zip_code", value: ["valuation"], use: ["permit_sub_type", "use_desc"] },
  }),
  S({
    id: "san-francisco-ca", name: "San Francisco", state: "CA", kind: "city", domain: "data.sfgov.org", dataset: "i98e-djp9", date: "issued_date",
    map: { number: "permit_number", type: ["permit_type_definition"], description: ["description"], address: ["street_number", "street_name", "street_suffix"], cityDefault: "San Francisco", zip: "zipcode", value: ["revised_cost", "estimated_cost"], use: ["proposed_use", "existing_use"] },
  }),
  S({
    id: "marin-county-ca", name: "Marin County", state: "CA", kind: "county", domain: "data.marincounty.gov", dataset: "mkbn-caye", date: "issued_date",
    map: { number: "permit_number", type: ["type_permit", "permit_work_class"], description: ["description"], address: ["address"], city: "city_town", zip: "zipcode", value: ["construction_value"], contractor: "contractor", use: ["type_permit"] },
  }),
  S({
    id: "new-york-ny", name: "New York City", state: "NY", kind: "city", domain: "data.cityofnewyork.us", dataset: "rbx6-tga4", date: "issued_date",
    map: { number: "work_permit", type: ["work_type"], description: ["job_description"], address: ["house_no", "street_name"], city: "borough", zip: "zip_code", value: ["estimated_job_costs"], contractor: "applicant_business_name", owner: "owner_business_name" },
  }),
  S({
    id: "cincinnati-oh", name: "Cincinnati", state: "OH", kind: "city", domain: "data.cincinnati-oh.gov", dataset: "uhjb-xac9", date: "issueddate",
    map: { number: "permitnum", type: ["permittypemapped", "workclassmapped"], description: ["description"], address: ["originaladdress1"], city: "originalcity", zip: "originalzip", value: ["estprojectcostdec"], contractor: "companyname", link: "link", use: ["permitclass", "proposeduse"] },
  }),
  S({
    id: "new-orleans-la", name: "New Orleans", state: "LA", kind: "city", domain: "data.nola.gov", dataset: "rcm3-fn58", date: "issuedate",
    map: { number: "numstring", type: ["type"], description: ["description"], address: ["address"], cityDefault: "New Orleans", value: ["constrval"], contractor: "contractors", owner: "owner", use: ["landuse"] },
  }),
  S({
    id: "baton-rouge-la", name: "Baton Rouge", state: "LA", kind: "city", domain: "data.brla.gov", dataset: "7fq7-8j7r", date: "issueddate",
    map: { number: "permitnumber", type: ["permittype", "designation"], description: ["projectdescription"], address: ["streetaddress"], city: "city1", zip: "zip", value: ["projectvalue"], contractor: "contractorname", owner: "ownername", use: ["permittype", "designation"] },
  }),
  S({
    id: "norfolk-va", name: "Norfolk", state: "VA", kind: "city", domain: "data.norfolk.gov", dataset: "fahm-yuh4", date: "issue_date",
    map: { number: "permit_number", type: ["type", "work_type", "use_type"], description: ["structure", "use_type"], address: ["address"], cityDefault: "Norfolk", value: ["project_cost"], use: ["use_class", "use_type"] },
  }),
  S({
    id: "mesa-az", name: "Mesa", state: "AZ", kind: "city", domain: "citydata.mesaaz.gov", dataset: "dzpk-hxfb", date: "issued_date",
    map: { number: "permit_number", type: ["record_type", "type_of_work"], description: ["description_of_work"], address: ["property_address"], cityDefault: "Mesa", value: ["total_valuation", "job_value"], contractor: "contractor_name", contractorPhone: "contractor_phone", use: ["record_type", "type_of_work"] },
  }),
  S({
    id: "montgomery-county-md", name: "Montgomery County (residential)", state: "MD", kind: "county", domain: "data.montgomerycountymd.gov", dataset: "m88u-pqki", date: "issueddate",
    map: { number: "permitno", type: ["usecode", "worktype"], description: ["description"], address: ["stno", "predir", "stname", "suffix"], city: "city", zip: "zip", value: ["declaredvaluation"], use: ["applicationtype"] },
  }),
  S({
    id: "cambridge-ma", name: "Cambridge (new construction)", state: "MA", kind: "city", domain: "data.cambridgema.gov", dataset: "9qm7-wbdc", date: "issue_date",
    map: { number: "id", type: ["proposed_building_use"], description: ["description_of_work"], address: ["full_address"], cityDefault: "Cambridge", value: ["total_cost_of_construction"], contractor: "licensed_name", use: ["proposed_building_use"] },
  }),
  S({
    id: "orlando-fl", name: "Orlando", state: "FL", kind: "city", domain: "data.cityoforlando.net", dataset: "ryhf-m453", date: "issue_permit_date",
    map: { number: "permit_number", type: ["application_type", "worktype"], description: ["project_name", "plan_review_type"], address: ["permit_address"], cityDefault: "Orlando", value: ["estimated_cost"], contractor: "contractor_name", contractorPhone: "contractor_phone_number", owner: "property_owner_name", use: ["worktype", "plan_review_type"] },
  }),
];

export const STATE_NAMES: Record<string, string> = {
  AZ: "Arizona", CA: "California", FL: "Florida", IL: "Illinois", LA: "Louisiana", MA: "Massachusetts", MD: "Maryland",
  NY: "New York", OH: "Ohio", TX: "Texas", VA: "Virginia", WA: "Washington",
};

export function sourcesForState(state: string | undefined): PermitSource[] {
  return state ? PERMIT_SOURCES.filter((s) => s.state === state) : PERMIT_SOURCES;
}

export function permitSource(id: string): PermitSource | undefined {
  return PERMIT_SOURCES.find((s) => s.id === id);
}

/** Every column a source's mapping reads, for SoQL $select. */
export function selectedFields(s: PermitSource): string[] {
  const m = s.map;
  const fields = new Set<string>([s.date, ...m.type, ...m.description, ...m.address, ...(m.value ?? []), ...(m.use ?? [])]);
  for (const f of [m.number, m.city, m.zip, m.contractor, m.contractorPhone, m.owner, m.link]) if (f) fields.add(f);
  for (let i = 1; i <= (s.numberedContacts ?? 0); i++) {
    fields.add(`contact_${i}_type`);
    fields.add(`contact_${i}_name`);
  }
  return [...fields];
}
