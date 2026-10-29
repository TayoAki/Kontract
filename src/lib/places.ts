import "server-only";
import { sampleSubcontractors } from "./sample-data";
import { cached } from "./store";
import type { Subcontractor } from "./types";

// Find local businesses that can do the work. Google Places (New) Text Search
// is fastest; Apify's compass/crawler-google-places actor (used by the
// Agentic Workflows gmaps pipeline) is the alternative.

export type FoundSub = Omit<Subcontractor, "id" | "status" | "vetting">;

export interface SubSearchResult {
  results: FoundSub[];
  source: "google" | "apify" | "sample";
  notice?: string;
}

const TTL = 24 * 60 * 60 * 1000;

export function placesProvider(): "google" | "apify" | null {
  if (process.env.GOOGLE_PLACES_API_KEY) return "google";
  if (process.env.APIFY_API_TOKEN) return "apify";
  return null;
}

export class PlacesError extends Error {}

async function googlePlaces(text: string): Promise<FoundSub[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.rating",
        "places.userRatingCount",
        "places.googleMapsUri",
        "places.primaryTypeDisplayName",
        "places.businessStatus",
      ].join(","),
    },
    body: JSON.stringify({ textQuery: text, pageSize: 20 }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new PlacesError(`Google Places error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as {
    places?: {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      rating?: number;
      userRatingCount?: number;
      googleMapsUri?: string;
      primaryTypeDisplayName?: { text?: string };
      businessStatus?: string;
    }[];
  };
  return (body.places ?? [])
    .filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY")
    .map((p) => ({
      name: p.displayName?.text ?? "Unnamed business",
      address: p.formattedAddress,
      phone: p.nationalPhoneNumber,
      website: p.websiteUri,
      rating: p.rating,
      reviewCount: p.userRatingCount,
      mapsUrl: p.googleMapsUri,
      category: p.primaryTypeDisplayName?.text,
      source: "google" as const,
    }));
}

async function apifyPlaces(text: string): Promise<FoundSub[]> {
  const url = new URL("https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items");
  url.searchParams.set("timeout", "150");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.APIFY_API_TOKEN}` },
    body: JSON.stringify({
      searchStringsArray: [text],
      maxCrawledPlacesPerSearch: 15,
      language: "en",
      deeperCityScrape: false,
      skipClosedPlaces: true,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(170_000),
  });
  if (!res.ok) throw new PlacesError(`Apify error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const items = (await res.json()) as {
    title?: string;
    address?: string;
    phone?: string;
    website?: string;
    totalScore?: number;
    reviewsCount?: number;
    url?: string;
    categoryName?: string;
    permanentlyClosed?: boolean;
  }[];
  return items
    .filter((i) => !i.permanentlyClosed)
    .map((i) => ({
      name: i.title ?? "Unnamed business",
      address: i.address,
      phone: i.phone,
      website: i.website,
      rating: i.totalScore,
      reviewCount: i.reviewsCount,
      mapsUrl: i.url,
      category: i.categoryName,
      source: "apify" as const,
    }));
}

export async function findSubcontractors(query: string, location: string): Promise<SubSearchResult> {
  const q = query.trim();
  const loc = location.trim();
  if (!q) throw new PlacesError("Enter what kind of company you're looking for.");
  const text = loc ? `${q} near ${loc}` : q;
  const provider = placesProvider();
  if (!provider) {
    return {
      results: sampleSubcontractors(q, loc),
      source: "sample",
      notice: "Sample listings: business search is off on this site.",
    };
  }
  const results = await cached(`places:${provider}:${text.toLowerCase()}`, TTL, () =>
    provider === "google" ? googlePlaces(text) : apifyPlaces(text),
  );
  return { results, source: provider };
}
