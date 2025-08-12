// Static balancing authority (BA) centroid coordinates (approximate) for visualization
// Source: public domain ISO footprint approximations; coordinates are rough central points.
export interface BalancingAuthority {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  region?: string;
}

export const BALANCING_AUTHORITIES: BalancingAuthority[] = [
  {
    code: "NYIS",
    name: "New York ISO",
    latitude: 42.9,
    longitude: -75.5,
    region: "Northeast",
  },
  {
    code: "PJM",
    name: "PJM Interconnection",
    latitude: 40.0,
    longitude: -79.5,
    region: "Mid-Atlantic",
  },
  {
    code: "MISO",
    name: "Midcontinent ISO",
    latitude: 43.5,
    longitude: -91.0,
    region: "Midwest",
  },
  {
    code: "CAISO",
    name: "California ISO",
    latitude: 37.2,
    longitude: -120.5,
    region: "West",
  },
  {
    code: "SPP",
    name: "Southwest Power Pool",
    latitude: 37.5,
    longitude: -98.5,
    region: "Central",
  },
  {
    code: "ERCOT",
    name: "ERCOT (Texas)",
    latitude: 31.0,
    longitude: -99.0,
    region: "Texas",
  },
  {
    code: "ISNE",
    name: "ISO New England",
    latitude: 43.7,
    longitude: -71.5,
    region: "Northeast",
  },
  {
    code: "SOCO",
    name: "Southern Company",
    latitude: 33.0,
    longitude: -85.5,
    region: "Southeast",
  },
  {
    code: "TVA",
    name: "Tennessee Valley Authority",
    latitude: 35.8,
    longitude: -86.0,
    region: "Southeast",
  },
  {
    code: "BPAT",
    name: "Bonneville Power",
    latitude: 45.7,
    longitude: -120.5,
    region: "Northwest",
  },
];

export function getBalancingAuthority(
  code: string
): BalancingAuthority | undefined {
  return BALANCING_AUTHORITIES.find(
    (b) => b.code.toUpperCase() === code.toUpperCase()
  );
}
