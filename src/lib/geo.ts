/**
 * Address geocoding + distance for delivery-area checks.
 * Google Geocoding when GOOGLE_MAPS_API_KEY is set (tolerant of spoken addresses), otherwise — or if Google
 * finds nothing — the free US Census Bureau geocoder (no key). US addresses only.
 */

import { googleGeocode } from "./places";

export type LatLng = { lat: number; lng: number };

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

export async function geocodeAddress(address: string, timeoutMs = 6000): Promise<LatLng | null> {
  const g = await googleGeocode(address);
  if (g) return g;
  return censusGeocode(address, timeoutMs);
}

async function censusGeocode(address: string, timeoutMs: number): Promise<LatLng | null> {
  const url = `${CENSUS}?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] } };
    const m = data.result?.addressMatches?.[0]?.coordinates;
    if (!m) return null;
    return { lat: m.y, lng: m.x };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Great-circle distance in miles. */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function extractZip(address: string): string | null {
  const m = /\b(\d{5})(?:-\d{4})?\b/.exec(address);
  return m ? m[1] : null;
}

export function formatRestaurantAddress(a: { addressLine1?: string | null; addressLine2?: string | null; city?: string | null; state?: string | null; zip?: string | null }): string | null {
  const parts = [a.addressLine1, a.addressLine2, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter((p) => p && String(p).trim());
  if (!a.addressLine1 && !a.zip) return null;
  return parts.join(", ");
}
