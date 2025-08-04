import { gql } from '@apollo/client';

// Based on the actual Mapped.com GraphQL schema
export const GET_SITES = gql`
  query GetSites($filter: SiteFilter) {
    sites(filter: $filter) {
      id
      name
      description
      address {
        street
        city
        state
        country
        postalCode
      }
      geolocation {
        latitude
        longitude
      }
      dateCreated
      dateUpdated
      buildings {
        id
        name
        description
        address {
          street
          city
          state
          country
          postalCode
        }
        floors {
          id
          name
          description
        }
      }
    }
  }
`;

export const GET_BUILDINGS = gql`
  query GetBuildings($filter: BuildingFilter) {
    buildings(filter: $filter) {
      id
      name
      description
      address {
        street
        city
        state
        country
        postalCode
      }
      geolocation {
        latitude
        longitude
      }
      dateCreated
      dateUpdated
      floors {
        id
        name
        description
        spaces {
          id
          name
          description
        }
      }
    }
  }
`;

export const GET_FLOORS = gql`
  query GetFloors($filter: FloorFilter) {
    floors(filter: $filter) {
      id
      name
      description
      dateCreated
      dateUpdated
      spaces {
        id
        name
        description
        exactType
      }
    }
  }
`;

export const GET_SPACES = gql`
  query GetSpaces($filter: SpaceFilter) {
    spaces(filter: $filter) {
      id
      name
      description
      exactType
      dateCreated
      dateUpdated
    }
  }
`;

// Keep the old queries for fallback/mock data
export const GET_ENERGY_CONSUMPTION = gql`
  query GetEnergyConsumption($timeRange: String!, $spaceId: String) {
    energyConsumption(timeRange: $timeRange, spaceId: $spaceId) {
      id
      timestamp
      energyCost
      renewableEnergyCost
      totalConsumption
      savings
      period
    }
  }
`;

export const GET_SPACE_EFFICIENCY = gql`
  query GetSpaceEfficiency {
    spaceEfficiency {
      id
      name
      utilizationPercentage
      peakUsageHours
      occupancyByRoom {
        room
        percentage
      }
    }
  }
`;

export const GET_ENERGY_USAGE_INEFFICIENCY = gql`
  query GetEnergyUsageInefficiency {
    energyUsageInefficiency {
      id
      applianceSystem
      consumption
      issues
      recommendations
    }
  }
`;

export const GET_COST_TIME_SAVING_ESTIMATE = gql`
  query GetCostTimeSavingEstimate($timeRange: String!) {
    costTimeSavingEstimate(timeRange: $timeRange) {
      id
      period
      savings
      consumption
      timestamp
    }
  }
`;

export const GET_ALERTS = gql`
  query GetAlerts {
    alerts {
      id
      type
      message
      severity
      timestamp
      isRead
    }
  }
`;

// Alias for backward compatibility
export const GET_PROPERTIES = GET_BUILDINGS;
export const GET_BUILDING_DATA = GET_BUILDINGS;