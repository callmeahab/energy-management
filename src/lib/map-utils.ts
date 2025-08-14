import { Property } from "@/types/energy";

// Simple in-memory cache for generated property marker icons
const propertyIconCache: Record<string, string> = {};

export function generatePropertyIcon(p: Property, selected: boolean): string {
  const rating = p.energyRating || "";
  const iconVersion = "v2"; // bump to invalidate older cached icons
  const key = `${p.id}-${rating}-${selected ? "sel" : "n"}-${iconVersion}`;
  const cached = propertyIconCache[key];
  if (cached) return cached;

  const high = ["#2e7d32", "#43a047", "#66bb6a", "#81c784"]; // greens
  const mid = ["#ff9800", "#fb8c00", "#f57c00", "#ef6c00"]; // oranges
  const low = ["#e53935", "#ef5350", "#f06292", "#ba68c8"]; // reds/magenta
  const palette = /^(A\+?|A)$/i.test(rating)
    ? high
    : /^(B\+?|B)$/i.test(rating)
    ? mid
    : low;

  const size = 64;
  const outerR = 30;
  const innerR = 18;
  const gapWidth = 6;
  const coreR = innerR - gapWidth;
  const center = 32;

  function ringQuarter(a1: number, a2: number): string {
    const x1o = center + outerR * Math.cos(a1);
    const y1o = center + outerR * Math.sin(a1);
    const x2o = center + outerR * Math.cos(a2);
    const y2o = center + outerR * Math.sin(a2);
    const x1i = center + innerR * Math.cos(a2);
    const y1i = center + innerR * Math.sin(a2);
    const x2i = center + innerR * Math.cos(a1);
    const y2i = center + innerR * Math.sin(a1);
    return `M ${x1o} ${y1o} A ${outerR} ${outerR} 0 0 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${innerR} ${innerR} 0 0 0 ${x2i} ${y2i} Z`;
  }

  const quarters = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI];
  const paths = quarters.slice(0, 4).map((a, i) => {
    const d = ringQuarter(a, quarters[i + 1]);
    return `<path d="${d}" fill="${palette[i % palette.length]}" />`;
  });

  const eff = Math.min(100, Math.max(0, p.energyMetrics.efficiency || 0));
  const r = Math.round(255 * (1 - eff / 100));
  const g = Math.round(180 + 75 * (eff / 100));
  const b = Math.round(120 * (eff / 100));
  const coreColor = `rgb(${r},${g},${b})`;

  const selectionGlow = selected
    ? `<circle cx="${center}" cy="${center}" r="${
        outerR + 3
      }" fill="white" fill-opacity="0.95" />`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${selectionGlow}
      <circle cx="${center}" cy="${center}" r="${
    outerR + 1
  }" fill="#ffffff" fill-opacity="0.9" />
      ${paths.join("")}
      <circle cx="${center}" cy="${center}" r="${
    innerR - 0.5
  }" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="1" />
      <circle cx="${center}" cy="${center}" r="${coreR}" fill="${coreColor}" stroke="white" stroke-width="2" />
    </svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString(
    "base64"
  )}`;
  propertyIconCache[key] = dataUrl;
  return dataUrl;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function computePropertyBounds(properties: Property[]): Bounds | null {
  if (!properties.length) return null;
  const lats = properties.map((p) => p.coordinates.lat);
  const lngs = properties.map((p) => p.coordinates.lng);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

export function heuristicZoom(bounds: Bounds): {
  latitude: number;
  longitude: number;
  zoom: number;
} {
  const { minLat, maxLat, minLng, maxLng } = bounds;
  if (minLat === maxLat && minLng === maxLng) {
    return { latitude: minLat, longitude: minLng, zoom: 14 };
  }
  const latSpan = Math.max(0.0001, maxLat - minLat);
  const lngSpan = Math.max(0.0001, maxLng - minLng);
  const zoomLat = Math.log2(360 / latSpan) - 1;
  const zoomLng = Math.log2(360 / lngSpan) - 1;
  const targetZoom = Math.min(20, Math.max(3, Math.min(zoomLat, zoomLng)));
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    zoom: targetZoom,
  };
}
