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

/**
 * Google's "dynamic library import" bootstrap, typed: defines google.maps.importLibrary up front, appends
 * the API script once (with the callback the API expects) and resolves when it is ready.
 */
function loadMaps(): Promise<GoogleNs> {
  loader ??= new Promise<GoogleNs>((resolve, reject) => {
    const w = window as unknown as { google?: { maps?: Record<string, unknown> } };
    const g = (w.google ??= {}) as { maps?: Record<string, unknown> };
    const maps = (g.maps ??= {}) as Record<string, unknown> & { importLibrary?: (name: string) => Promise<unknown> };
    if (typeof maps.importLibrary === "function" && maps.__fdReady) {
      resolve(w.google as unknown as GoogleNs);
      return;
    }
    const requested = new Set<string>();
    let script: Promise<void> | null = null;
    const load = () =>
      (script ??= new Promise<void>((ok, fail) => {
        const s = document.createElement("script");
        const q = new URLSearchParams({ key: BROWSER_KEY, v: "weekly", libraries: [...requested].join(","), callback: "google.maps.__ib__" });
        s.src = `https://maps.googleapis.com/maps/api/js?${q}`;
        s.async = true;
        maps.__ib__ = () => {
          maps.__fdReady = true;
          ok();
        };
        s.onerror = () => fail(new Error("The Google Maps JavaScript API could not load."));
        document.head.appendChild(s);
      }));
    // Until the API arrives, importLibrary queues the request; the API replaces it with the real one on load.
    maps.importLibrary = (name: string, ...rest: unknown[]) => {
      requested.add(name);
      return load().then(() => (maps.importLibrary as (n: string, ...r: unknown[]) => Promise<unknown>)(name, ...rest));
    };
    load().then(() => resolve(w.google as unknown as GoogleNs), reject);
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
export function DeliveryRadiusMap({ center, radiusMiles, radiusLabel, label }: { center: LatLngLiteral; radiusMiles: number; radiusLabel?: string; label: string }) {
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
        const brand = getComputedStyle(document.documentElement).getPropertyValue("--color-brand-600").trim() || "#05668d";
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
  return <div ref={elRef} role="img" aria-label={`Map of the ${radiusLabel ?? `${radiusMiles}-mile`} delivery area around ${label}`} className="h-64 w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 sm:h-80" />;
}
