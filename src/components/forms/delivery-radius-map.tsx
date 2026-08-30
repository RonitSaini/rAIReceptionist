"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Google Maps JavaScript API, loaded on demand from Google's own script (no npm package). Needs the
 * browser key NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY (restrict it to your site's URLs in Google Cloud).
 * Minimal typings for the handful of classes we touch — the app doesn't ship @types/google.maps.
 */
type LatLngLiteral = { lat: number; lng: number };
type GBounds = object;
type GMap = { fitBounds(b: GBounds, padding?: number): void; setCenter(c: LatLngLiteral): void };
type GCircle = { setRadius(m: number): void; getBounds(): GBounds | null; setMap(m: GMap | null): void };
type GMarker = { setMap(m: GMap | null): void };
type MapsLib = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Circle: new (opts: Record<string, unknown>) => GCircle;
};
type MarkerLib = { Marker: new (opts: Record<string, unknown>) => GMarker };
type GoogleNs = { maps: { importLibrary(name: "maps"): Promise<MapsLib>; importLibrary(name: "marker"): Promise<MarkerLib> } };
declare global {
  interface Window {
    google?: GoogleNs;
  }
}

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
const MILE = 1609.344;
let loader: Promise<GoogleNs> | null = null;

function loadMaps(): Promise<GoogleNs> {
  if (window.google?.maps) return Promise.resolve(window.google);
  loader ??= new Promise<GoogleNs>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(BROWSER_KEY)}&v=weekly&loading=async`;
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google) : reject(new Error("Google Maps failed to load")));
    s.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(s);
  });
  return loader;
}

export function deliveryMapAvailable(): boolean {
  return BROWSER_KEY.length > 0;
}

/**
 * The restaurant pinned on a Google map with the delivery radius drawn as a circle. Redraws live as the
 * radius field changes; re-created when the theme flips so the map matches light/dark.
 */
export function DeliveryRadiusMap({ center, radiusMiles, label }: { center: LatLngLiteral; radiusMiles: number; label: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<GCircle | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  // Follow the app theme (.dark on <html>).
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // Build the map (once per theme / center).
  useEffect(() => {
    let cancelled = false;
    let marker: GMarker | null = null;
    (async () => {
      try {
        const g = await loadMaps();
        if (cancelled || !elRef.current) return;
        const [{ Map, Circle }, { Marker }] = await Promise.all([g.maps.importLibrary("maps"), g.maps.importLibrary("marker")]);
        if (cancelled || !elRef.current) return;
        const brand = getComputedStyle(document.documentElement).getPropertyValue("--color-brand-600").trim() || "#0f766e";
        const map = new Map(elRef.current, {
          center,
          zoom: 12,
          colorScheme: dark ? "DARK" : "LIGHT",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "cooperative",
        });
        marker = new Marker({ map, position: center, title: label });
        const circle = new Circle({ map, center, radius: Math.max(radiusMiles, 0.1) * MILE, strokeColor: brand, strokeOpacity: 0.9, strokeWeight: 2, fillColor: brand, fillOpacity: 0.12 });
        const b = circle.getBounds();
        if (b) map.fitBounds(b, 24);
        mapRef.current = map;
        circleRef.current = circle;
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Google Maps failed to load");
      }
    })();
    return () => {
      cancelled = true;
      marker?.setMap(null);
      circleRef.current?.setMap(null);
      circleRef.current = null;
      mapRef.current = null;
    };
    // radiusMiles is applied by the effect below — no rebuild on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, dark, label]);

  // Live radius updates.
  useEffect(() => {
    const circle = circleRef.current;
    const map = mapRef.current;
    if (!circle || !map) return;
    circle.setRadius(Math.max(radiusMiles, 0.1) * MILE);
    const b = circle.getBounds();
    if (b) map.fitBounds(b, 24);
  }, [radiusMiles]);

  if (error) return <p className="text-xs text-red-600">{error}</p>;
  return <div ref={elRef} role="img" aria-label={`Map of the ${radiusMiles}-mile delivery area around ${label}`} className="h-64 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 sm:h-80" />;
}
