import { Building, Property } from "@/types/energy";

// Convert a Building (from API) into a Property used by the map.
export function convertBuildingToProperty(building: Building): Property {
  const address = building.address;
  const addressString =
    [address?.street, address?.city, address?.state, address?.country]
      .filter(Boolean)
      .join(", ") || "Unknown Address";

  const floorCount = building.floors?.length || 0;
  const roomCount =
    building.floors?.reduce(
      (sum, floor) => sum + (floor.spaces?.length || 0),
      0
    ) || 0;

  const basePower = Math.max(100, roomCount * 25 + floorCount * 50);
  const efficiency = Math.max(
    60,
    Math.min(95, 85 + (floorCount > 5 ? 5 : 0) - (roomCount > 50 ? 10 : 0))
  );

  return {
    id: building.id,
    name:
      building.name ||
      building.description ||
      `Building ${building.id.substring(0, 8)}`,
    address: addressString,
    type: building.exactType || "Building",
    energyRating:
      efficiency > 90
        ? "A+"
        : efficiency > 80
        ? "A"
        : efficiency > 70
        ? "B+"
        : "B",
    coordinates: {
      lat: building.geolocation?.latitude || 40.7128,
      lng: building.geolocation?.longitude || -74.006,
    },
    energyMetrics: {
      consumption: Math.floor(basePower * (1 + Math.random() * 0.3)),
      cost: Math.floor(basePower * 4 * (1 + Math.random() * 0.2)),
      efficiency: Math.floor(efficiency),
      lastUpdated: building.dateUpdated || new Date().toISOString(),
    },
    buildingInfo: {
      floors: floorCount,
      rooms: roomCount,
      area: Math.floor(
        (roomCount * 200 + floorCount * 1000) * (1 + Math.random() * 0.4)
      ),
      yearBuilt: 2015 + Math.floor(Math.random() * 8),
    },
  };
}

export function getRatingColor(
  rating: string
): "success" | "warning" | "error" | "default" {
  switch (rating) {
    case "A+":
    case "A":
      return "success";
    case "B+":
    case "B":
      return "warning";
    case "C+":
    case "C":
      return "error";
    default:
      return "default";
  }
}
