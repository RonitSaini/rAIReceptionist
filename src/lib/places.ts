/**
 * Google Maps Platform, server side: Places API (New) for address suggestions and the Geocoding API for
 * turning a spoken/typed address into coordinates. Plain fetch, no SDK. Needs GOOGLE_MAPS_API_KEY with
 * "Places API (New)" and "Geocoding API" enabled; every function degrades to null/[] when it is absent.
 */
import type { LatLng } from "./geo";

const key = () => process.env.GOOGLE_MAPS_API_KEY ?? "";

export type AddressSuggestion = { placeId: string; main: string; secondary: string; text: string };

export type StructuredAddress = {
  placeId: string;
  formatted: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
};

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** US address suggestions as the owner types. `sessionToken` groups keystrokes + the final details call for billing. */
export async function autocompleteAddresses(input: string, sessionToken?: string): Promise<AddressSuggestion[]> {
  if (!key() || input.trim().length < 3) return [];
  const data = await withTimeout(async (signal) => {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key() },
      body: JSON.stringify({ input: input.trim(), sessionToken, includedRegionCodes: ["us"], languageCode: "en-US" }),
    });
    if (!res.ok) return null;
    return (await res.json()) as {
      suggestions?: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[];
    };
  }, 5000);
  return (data?.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .map((p) => ({ placeId: p.placeId, main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "", text: p.text?.text ?? "" }))
    .slice(0, 6);
}

type Component = { longText?: string; shortText?: string; types?: string[] };

/** Resolve a suggestion to street / city / state / ZIP + coordinates. */
export async function placeAddress(placeId: string, sessionToken?: string): Promise<StructuredAddress | null> {
  if (!key() || !placeId) return null;
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const data = await withTimeout(async (signal) => {
    const res = await fetch(url, { signal, headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location" } });
    if (!res.ok) return null;
    return (await res.json()) as { id: string; formattedAddress?: string; addressComponents?: Component[]; location?: { latitude: number; longitude: number } };
  }, 5000);
  if (!data?.location) return null;
  const comp = (type: string, short = false) => {
    const c = data.addressComponents?.find((x) => x.types?.includes(type));
    return (short ? c?.shortText : c?.longText) ?? "";
  };
  const streetNumber = comp("street_number");
  const route = comp("route");
  return {
    placeId: data.id,
    formatted: data.formattedAddress ?? "",
    addressLine1: [streetNumber, route].filter(Boolean).join(" "),
    addressLine2: comp("subpremise") ? `Suite ${comp("subpremise")}` : "",
    city: comp("locality") || comp("sublocality_level_1") || comp("postal_town") || comp("administrative_area_level_3"),
    state: comp("administrative_area_level_1", true),
    zip: comp("postal_code"),
    lat: data.location.latitude,
    lng: data.location.longitude,
  };
}

/** Geocode a free-text US address (what a caller says on the phone). Null when Google can't pin it to a street/area. */
export async function googleGeocode(address: string): Promise<LatLng | null> {
  if (!key() || !address.trim()) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address.trim());
  url.searchParams.set("components", "country:US");
  url.searchParams.set("key", key());
  const data = await withTimeout(async (signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as { status: string; results?: { geometry?: { location?: { lat: number; lng: number } }; types?: string[] }[] };
  }, 6000);
  const first = data?.status === "OK" ? data.results?.[0] : null;
  const loc = first?.geometry?.location;
  if (!loc) return null;
  // A match that only resolved to a state or country is useless for a delivery radius.
  const tooCoarse = (first?.types ?? []).every((t) => t === "country" || t === "administrative_area_level_1" || t === "political");
  return tooCoarse ? null : { lat: loc.lat, lng: loc.lng };
}
