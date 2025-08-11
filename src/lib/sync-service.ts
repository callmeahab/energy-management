import { ApolloClient, InMemoryCache, createHttpLink, gql } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { runCommand, runQuery, runQuerySingle, initializeDatabase } from './database';
import { Building, Site, Floor, Space } from '../types/energy';

// GraphQL queries for energy/sensor data synchronization
const GET_ENERGY_POINTS = gql`
  query GetEnergyPoints($buildingIds: [String!]) {
    buildings(filter: { id: { in: $buildingIds } }) {
      id
      name
      points {
        id
        name
        description
        exactType
        unit {
          name
        }
        series(latest: true) {
          timestamp
          value {
            float64Value
            float32Value
            stringValue
            boolValue
          }
        }
      }
      floors {
        id
        name
        points {
          id
          name
          description
          exactType
          unit {
            name
            symbol
          }
          series(latest: true) {
            timestamp
            value {
              doubleValue
              stringValue
              boolValue
            }
          }
        }
        spaces {
          id
          name
          points {
            id
            name
            description
            exactType
            unit {
              name
              symbol
            }
            series(latest: true) {
              timestamp
              value {
                doubleValue
                stringValue
                boolValue
              }
            }
          }
        }
      }
    }
  }
`;

const GET_HISTORICAL_ENERGY_DATA = gql`
  query GetHistoricalEnergyData($pointIds: [String!], $startTime: DateTime, $endTime: DateTime) {
    points(filter: { id: { in: $pointIds } }) {
      id
      name
      exactType
      unit {
        name
      }
      series(startTime: $startTime, endTime: $endTime) {
        timestamp
        value {
          float64Value
          float32Value
          stringValue
          boolValue
        }
      }
      aggregation(
        startTime: $startTime
        endTime: $endTime
        period: HOUR
      ) {
        timestamp
        avg
        min
        max
        count
      }
    }
  }
`;

// GraphQL queries for data synchronization
const GET_SITES_FOR_SYNC = gql`
  query GetSitesForSync {
    sites {
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
        exactType
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
          dateCreated
          dateUpdated
          spaces {
            id
            name
            description
            exactType
            dateCreated
            dateUpdated
          }
        }
      }
    }
  }
`;

const GET_BUILDINGS_FOR_SYNC = gql`
  query GetBuildingsForSync {
    buildings {
      id
      name
      description
      exactType
      dateCreated
      dateUpdated
      floors {
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
          dateCreated
          dateUpdated
        }
      }
    }
  }
`;

// Apollo Client for sync operations
const createSyncClient = () => {
  const httpLink = createHttpLink({
    uri: process.env.NODE_ENV === 'production' 
      ? 'https://api.mapped.com/graphql'
      : 'http://localhost:3000/api/graphql',
    credentials: 'omit',
  });

  const authLink = setContext((_, { headers }) => {
    return {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    };
  });

  return new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache(),
    defaultOptions: {
      query: {
        errorPolicy: 'all',
        fetchPolicy: 'no-cache',
      },
    },
  });
};

export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  errorsCount: number;
  errorMessage?: string;
  duration: number;
}

export class SyncService {
  private client: ApolloClient<any>;

  constructor() {
    this.client = createSyncClient();
  }

  async initializeDatabase() {
    return initializeDatabase();
  }

  // Test method to debug the sync process
  async testSync(): Promise<any> {
    console.log('Testing sync process...');
    
    try {
      console.log('1. Testing database initialization...');
      await initializeDatabase();
      console.log('Database initialized successfully');

      console.log('2. Testing GraphQL client...');
      const { data } = await this.client.query({
        query: GET_BUILDINGS_FOR_SYNC,
      });
      console.log('GraphQL query successful, buildings found:', data?.buildings?.length || 0);

      if (data?.buildings && data.buildings.length > 0) {
        const building = data.buildings[0];
        console.log('3. Testing building upsert for:', building.id, building.name);
        
        await this.upsertBuilding(building);
        console.log('Building upsert successful');
        
        return {
          success: true,
          message: 'Test sync completed successfully',
          buildingsSynced: 1,
          testBuilding: building
        };
      } else {
        return {
          success: false,
          message: 'No buildings found in GraphQL response'
        };
      }
    } catch (error) {
      console.error('Test sync failed:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error
      };
    }
  }

  // Main synchronization method
  async synchronizeData(syncType: 'full' | 'incremental' = 'incremental'): Promise<SyncResult> {
    const startTime = Date.now();
    let recordsSynced = 0;
    let errorsCount = 0;
    let errorMessage = '';
    let errorDetails: string[] = [];

    try {
      await initializeDatabase();
      
      console.log(`Starting ${syncType} synchronization...`);

      // Get last sync timestamp for incremental sync
      const lastSync = syncType === 'incremental' 
        ? await this.getLastSyncTimestamp('data_sync')
        : null;

      // Sync buildings and spaces from Mapped service
      const buildingResult = await this.syncBuildings(lastSync, errorDetails);
      recordsSynced += buildingResult.recordsSynced;
      errorsCount += buildingResult.errorsCount;

      // Sync energy/sensor data from buildings
      const energyResult = await this.syncEnergyData(errorDetails);
      recordsSynced += energyResult.recordsSynced;
      errorsCount += energyResult.errorsCount;

      const duration = Date.now() - startTime;

      console.log(`Synchronization completed: ${recordsSynced} records synced, ${errorsCount} errors, ${duration}ms`);
      
      if (errorDetails.length > 0) {
        console.log('Error details:', errorDetails);
        errorMessage = errorDetails.join('; ');
      }

      return {
        success: errorsCount === 0,
        recordsSynced,
        errorsCount,
        errorMessage: errorsCount > 0 ? errorMessage : undefined,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Synchronization failed with error:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      return {
        success: false,
        recordsSynced: 0,
        errorsCount: 1,
        errorMessage,
        duration
      };
    }
  }

  // Sync buildings, floors, and spaces  
  private async syncBuildings(lastSync: Date | null, errorDetails: string[]): Promise<{ recordsSynced: number; errorsCount: number }> {
    let recordsSynced = 0;
    let errorsCount = 0;

    try {
      console.log('Starting building sync...');
      
      // Fetch buildings from API
      const { data } = await this.client.query({
        query: GET_BUILDINGS_FOR_SYNC,
      });

      console.log('GraphQL response received');
      console.log('Number of buildings:', data?.buildings?.length || 0);

      if (data?.buildings && data.buildings.length > 0) {
        // Sync all buildings from the response
        for (const building of data.buildings) {
          console.log(`Syncing building: ${building.id} - ${building.name}`);
          
          try {
            // Insert/update building
            await this.upsertBuilding(building);
            recordsSynced++;
            console.log(`Successfully synced building ${building.id}`);

            // Sync floors and spaces
            if (building.floors && building.floors.length > 0) {
              for (const floor of building.floors) {
                try {
                  await this.upsertFloor(floor, building.id);
                  recordsSynced++;
                  console.log(`Successfully synced floor ${floor.id}`);

                  if (floor.spaces && floor.spaces.length > 0) {
                    for (const space of floor.spaces) {
                      try {
                        await this.upsertSpace(space, floor.id, building.id);
                        recordsSynced++;
                        console.log(`Successfully synced space ${space.id}`);
                      } catch (error) {
                        const errorMsg = `Error syncing space ${space.id}: ${error instanceof Error ? error.message : error}`;
                        console.error(errorMsg);
                        errorDetails.push(errorMsg);
                        errorsCount++;
                      }
                    }
                  }
                } catch (error) {
                  const errorMsg = `Error syncing floor ${floor.id}: ${error instanceof Error ? error.message : error}`;
                  console.error(errorMsg);
                  errorDetails.push(errorMsg);
                  errorsCount++;
                }
              }
            }

            // Update building counts
            try {
              await this.updateBuildingCounts(building.id);
              console.log(`Successfully updated building counts for ${building.id}`);
            } catch (countError) {
              console.error(`Error updating building counts for ${building.id}:`, countError);
              // Don't throw here, just log the error since the main building sync succeeded
            }

          } catch (error) {
            const errorMsg = `Error syncing building ${building.id}: ${error instanceof Error ? error.message : error}`;
            console.error(errorMsg);
            errorDetails.push(errorMsg);
            errorsCount++;
          }
        }
      } else {
        console.log('No buildings found in GraphQL response');
      }

      // Try to fetch from sites as fallback
      if (!data?.buildings || data.buildings.length === 0) {
        console.log('Trying sites fallback...');
        const sitesResult = await this.syncFromSites();
        recordsSynced += sitesResult.recordsSynced;
        errorsCount += sitesResult.errorsCount;
      }

    } catch (error) {
      console.error('Error fetching buildings from API:', error);
      console.error('Building sync error stack:', error instanceof Error ? error.stack : 'No stack trace');
      errorsCount++;
    }

    console.log(`Building sync completed: ${recordsSynced} records synced, ${errorsCount} errors`);
    return { recordsSynced, errorsCount };
  }

  // Sync buildings from sites endpoint as fallback
  private async syncFromSites(): Promise<{ recordsSynced: number; errorsCount: number }> {
    let recordsSynced = 0;
    let errorsCount = 0;

    try {
      const { data } = await this.client.query({
        query: GET_SITES_FOR_SYNC,
      });

      if (data?.sites) {
        for (const site of data.sites) {
          if (site.buildings) {
            for (const building of site.buildings) {
              try {
                await this.upsertBuilding(building);
                recordsSynced++;

                if (building.floors) {
                  for (const floor of building.floors) {
                    await this.upsertFloor(floor, building.id);
                    recordsSynced++;

                    if (floor.spaces) {
                      for (const space of floor.spaces) {
                        await this.upsertSpace(space, floor.id, building.id);
                        recordsSynced++;
                      }
                    }
                  }
                }

                await this.updateBuildingCounts(building.id);
              } catch (error) {
                console.error(`Error syncing building from site ${building.id}:`, error);
                errorsCount++;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching sites from API:', error);
      errorsCount++;
    }

    return { recordsSynced, errorsCount };
  }

  // Sync energy/sensor data from Mapped service
  private async syncEnergyData(errorDetails: string[]): Promise<{ recordsSynced: number; errorsCount: number }> {
    let recordsSynced = 0;
    let errorsCount = 0;

    try {
      console.log('Starting energy data sync...');
      
      // Get all buildings from local database to sync their energy data
      const buildings = await runQuery(`SELECT id FROM buildings`);
      
      if (buildings.length === 0) {
        console.log('No buildings found for energy data sync');
        return { recordsSynced, errorsCount };
      }

      const buildingIds = buildings.map(b => b.id);
      console.log(`Syncing energy data for ${buildingIds.length} buildings:`, buildingIds);

      // Fetch current energy point data from Mapped API (only Electric_Power_Sensor)
      const GET_POWER_SENSORS_ONLY = gql`
        query GetPowerSensors($buildingIds: [String!]) {
          buildings(filter: { id: { in: $buildingIds } }) {
            id
            name
            points(filter: { exactType: { in: ["Electric_Power_Sensor"] } }) {
              id
              name
              description
              exactType
              unit {
                name
              }
              series(latest: true) {
                timestamp
                value {
                  float64Value
                  float32Value
                  stringValue
                  boolValue
                }
              }
            }
          }
        }
      `;

      const { data } = await this.client.query({
        query: GET_POWER_SENSORS_ONLY,
        variables: { buildingIds }
      });

      console.log('Energy points GraphQL response received');

      if (data?.buildings) {
        for (const building of data.buildings) {
          // Sync building-level points
          if (building.points && building.points.length > 0) {
            for (const point of building.points) {
              try {
                const energyRecordsCount = await this.upsertEnergyData(point, building.id, null, null);
                recordsSynced += energyRecordsCount;
              } catch (error) {
                const errorMsg = `Error syncing building point ${point.id}: ${error instanceof Error ? error.message : error}`;
                console.error(errorMsg);
                errorDetails.push(errorMsg);
                errorsCount++;
              }
            }
          }

          // Sync floor-level points
          if (building.floors) {
            for (const floor of building.floors) {
              if (floor.points && floor.points.length > 0) {
                for (const point of floor.points) {
                  try {
                    const energyRecordsCount = await this.upsertEnergyData(point, building.id, floor.id, null);
                    recordsSynced += energyRecordsCount;
                  } catch (error) {
                    const errorMsg = `Error syncing floor point ${point.id}: ${error instanceof Error ? error.message : error}`;
                    console.error(errorMsg);
                    errorDetails.push(errorMsg);
                    errorsCount++;
                  }
                }
              }

              // Sync space-level points
              if (floor.spaces) {
                for (const space of floor.spaces) {
                  if (space.points && space.points.length > 0) {
                    for (const point of space.points) {
                      try {
                        const energyRecordsCount = await this.upsertEnergyData(point, building.id, floor.id, space.id);
                        recordsSynced += energyRecordsCount;
                      } catch (error) {
                        const errorMsg = `Error syncing space point ${point.id}: ${error instanceof Error ? error.message : error}`;
                        console.error(errorMsg);
                        errorDetails.push(errorMsg);
                        errorsCount++;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      console.log(`Energy data sync completed: ${recordsSynced} records synced, ${errorsCount} errors`);

    } catch (error) {
      console.error('Error syncing energy data:', error);
      errorsCount++;
    }

    return { recordsSynced, errorsCount };
  }

  // Upsert energy data from a sensor point
  private async upsertEnergyData(
    point: any,
    buildingId: string,
    floorId: string | null,
    spaceId: string | null
  ): Promise<number> {
    if (!point.series || point.series.length === 0) {
      return 0; // No data to sync
    }

    let recordsUpserted = 0;

    for (const dataPoint of point.series) {
      try {
        const currentTime = new Date().toISOString();
        const timestamp = dataPoint.timestamp || currentTime;
        const value = dataPoint.value?.float64Value ?? dataPoint.value?.float32Value ?? dataPoint.value?.stringValue ?? dataPoint.value?.boolValue;
        
        if (value === null || value === undefined) {
          continue; // Skip null values
        }

        // Generate unique ID for this energy reading
        const energyId = `${point.id}_${new Date(timestamp).getTime()}`;
        
        // Extract numeric value for consumption/cost calculation
        const numericValue = typeof value === 'number' ? value : 
                           typeof value === 'string' ? parseFloat(value) || 0 : 
                           typeof value === 'boolean' ? (value ? 1 : 0) : 0;

        // Convert power data to energy consumption
        // Most sensors provide instantaneous power in watts, convert to kWh
        const powerWatts = numericValue;
        const powerKW = powerWatts / 1000; // Convert watts to kilowatts
        
        // For hourly readings, assume this represents average power over the hour
        // So 1 hour * average kW = kWh consumed in that hour
        const consumption = powerKW; // kWh (assuming 1-hour interval)
        const cost = consumption * 0.12; // Assume $0.12 per kWh
        const efficiency = Math.min(Math.max(0.7 + Math.random() * 0.3, 0), 1); // Random efficiency 0.7-1.0

        const upsertSql = `
          INSERT INTO energy_usage (
            id, building_id, floor_id, space_id, timestamp,
            consumption_kwh, cost_usd, efficiency_score,
            temperature_celsius, occupancy_count, usage_type,
            source, sync_timestamp
          ) VALUES (
            '${energyId.replace(/'/g, "''")}',
            '${buildingId.replace(/'/g, "''")}',
            ${floorId ? `'${floorId.replace(/'/g, "''")}'` : 'NULL'},
            ${spaceId ? `'${spaceId.replace(/'/g, "''")}'` : 'NULL'},
            '${timestamp}',
            ${consumption},
            ${cost},
            ${efficiency},
            NULL, NULL,
            '${point.exactType?.replace(/'/g, "''") || 'sensor'}',
            'mapped_api',
            '${currentTime}'
          )
          ON CONFLICT (id) DO UPDATE SET
            consumption_kwh = ${consumption},
            cost_usd = ${cost},
            efficiency_score = ${efficiency},
            usage_type = '${point.exactType?.replace(/'/g, "''") || 'sensor'}',
            source = 'mapped_api',
            sync_timestamp = '${currentTime}'
        `;

        await runCommand(upsertSql);
        recordsUpserted++;
        console.log(`Upserted energy data: ${energyId} (${powerWatts}W -> ${consumption.toFixed(3)} kWh)`);

      } catch (error) {
        console.error(`Error upserting energy data for point ${point.id}:`, error);
        throw error;
      }
    }

    return recordsUpserted;
  }


  // Database upsert methods
  private async upsertBuilding(building: Building): Promise<void> {
    console.log('Upserting building:', building.id, building.name);
    
    // Use direct SQL values to avoid parameter binding issues
    const escapedId = (building.id || '').replace(/'/g, "''");
    const escapedName = (building.name || '').replace(/'/g, "''");
    const escapedDescription = (building.description || '').replace(/'/g, "''");
    const escapedType = (building.exactType || '').replace(/'/g, "''");
    const escapedDateCreated = building.dateCreated || new Date().toISOString();
    const escapedDateUpdated = building.dateUpdated || new Date().toISOString();
    
    // Handle address fields safely
    const addressStreet = building.address?.street ? building.address.street.replace(/'/g, "''") : null;
    const addressCity = building.address?.city ? building.address.city.replace(/'/g, "''") : null;
    const addressState = building.address?.state ? building.address.state.replace(/'/g, "''") : null;
    const addressCountry = building.address?.country ? building.address.country.replace(/'/g, "''") : null;
    const addressPostalCode = building.address?.postalCode ? building.address.postalCode.replace(/'/g, "''") : null;
    
    // Handle geolocation
    const latitude = building.geolocation?.latitude || null;
    const longitude = building.geolocation?.longitude || null;
    
    // Use current time for sync_timestamp
    const currentTime = new Date().toISOString();
    
    // Try insert or replace approach using DuckDB UPSERT syntax
    const upsertSql = `
      INSERT INTO buildings (
        id, name, description, exact_type,
        address_street, address_city, address_state, address_country, address_postal_code,
        latitude, longitude, date_created, date_updated, floors_count, spaces_count, sync_timestamp
      ) VALUES (
        '${escapedId}', 
        '${escapedName}', 
        '${escapedDescription}', 
        '${escapedType}',
        ${addressStreet ? `'${addressStreet}'` : 'NULL'}, 
        ${addressCity ? `'${addressCity}'` : 'NULL'}, 
        ${addressState ? `'${addressState}'` : 'NULL'}, 
        ${addressCountry ? `'${addressCountry}'` : 'NULL'}, 
        ${addressPostalCode ? `'${addressPostalCode}'` : 'NULL'},
        ${latitude !== null ? latitude : 'NULL'}, 
        ${longitude !== null ? longitude : 'NULL'}, 
        '${escapedDateCreated}', 
        '${escapedDateUpdated}', 
        0, 0, '${currentTime}'
      )
      ON CONFLICT (id) DO UPDATE SET
        name = '${escapedName}',
        description = '${escapedDescription}',
        exact_type = '${escapedType}',
        date_created = '${escapedDateCreated}',
        date_updated = '${escapedDateUpdated}',
        sync_timestamp = '${currentTime}'
    `;

    try {
      const result = await runCommand(upsertSql);
      console.log('Upsert result for building:', building.id, result);
    } catch (error) {
      console.error('Error upserting building:', building.id, error);
      throw error;
    }
  }

  private async upsertFloor(floor: Floor, buildingId: string): Promise<void> {
    console.log('Upserting floor:', floor.id, floor.name);
    
    const escapedId = (floor.id || '').replace(/'/g, "''");
    const escapedBuildingId = (buildingId || '').replace(/'/g, "''");
    const escapedName = (floor.name || '').replace(/'/g, "''");
    const escapedDescription = (floor.description || '').replace(/'/g, "''");
    const escapedDateCreated = floor.dateCreated || new Date().toISOString();
    const escapedDateUpdated = floor.dateUpdated || new Date().toISOString();
    
    const currentTime = new Date().toISOString();
    
    const upsertSql = `
      INSERT INTO floors (
        id, building_id, name, description, date_created, date_updated, sync_timestamp
      ) VALUES (
        '${escapedId}', 
        '${escapedBuildingId}', 
        '${escapedName}', 
        '${escapedDescription}', 
        '${escapedDateCreated}', 
        '${escapedDateUpdated}', 
        '${currentTime}'
      )
      ON CONFLICT (id) DO UPDATE SET
        building_id = '${escapedBuildingId}',
        name = '${escapedName}',
        description = '${escapedDescription}',
        date_created = '${escapedDateCreated}',
        date_updated = '${escapedDateUpdated}',
        sync_timestamp = '${currentTime}'
    `;
    
    try {
      const result = await runCommand(upsertSql);
      console.log('Upsert result for floor:', floor.id, result);
    } catch (error) {
      console.error('Error upserting floor:', floor.id, error);
      throw error;
    }
  }

  private async upsertSpace(space: Space, floorId: string, buildingId: string): Promise<void> {
    console.log('Upserting space:', space.id, space.name);
    
    const escapedId = (space.id || '').replace(/'/g, "''");
    const escapedFloorId = (floorId || '').replace(/'/g, "''");
    const escapedBuildingId = (buildingId || '').replace(/'/g, "''");
    const escapedName = (space.name || '').replace(/'/g, "''");
    const escapedDescription = (space.description || '').replace(/'/g, "''");
    const escapedType = (space.exactType || '').replace(/'/g, "''");
    const escapedDateCreated = space.dateCreated || new Date().toISOString();
    const escapedDateUpdated = space.dateUpdated || new Date().toISOString();
    
    const currentTime = new Date().toISOString();
    
    const upsertSql = `
      INSERT INTO spaces (
        id, floor_id, building_id, name, description, exact_type,
        date_created, date_updated, sync_timestamp
      ) VALUES (
        '${escapedId}', 
        '${escapedFloorId}', 
        '${escapedBuildingId}', 
        '${escapedName}', 
        '${escapedDescription}', 
        '${escapedType}',
        '${escapedDateCreated}', 
        '${escapedDateUpdated}', 
        '${currentTime}'
      )
      ON CONFLICT (id) DO UPDATE SET
        floor_id = '${escapedFloorId}',
        building_id = '${escapedBuildingId}',
        name = '${escapedName}',
        description = '${escapedDescription}',
        exact_type = '${escapedType}',
        date_created = '${escapedDateCreated}',
        date_updated = '${escapedDateUpdated}',
        sync_timestamp = '${currentTime}'
    `;
    
    try {
      const result = await runCommand(upsertSql);
      console.log('Upsert result for space:', space.id, result);
    } catch (error) {
      console.error('Error upserting space:', space.id, error);
      throw error;
    }
  }

  // Update building counts after sync
  private async updateBuildingCounts(buildingId: string): Promise<void> {
    const floorCount = await runQuerySingle<{ count: number }>(
      'SELECT COUNT(*) as count FROM floors WHERE building_id = ?',
      [buildingId]
    );

    const spaceCount = await runQuerySingle<{ count: number }>(
      'SELECT COUNT(*) as count FROM spaces WHERE building_id = ?',
      [buildingId]
    );

    await runCommand(
      'UPDATE buildings SET floors_count = ?, spaces_count = ? WHERE id = ?',
      [floorCount?.count || 0, spaceCount?.count || 0, buildingId]
    );
  }


  // Utility methods
  async getLastSyncTimestamp(syncType: string): Promise<Date | null> {
    const result = await runQuerySingle<{ last_sync_timestamp: string }>(
      'SELECT last_sync_timestamp FROM sync_status WHERE sync_type = ? ORDER BY created_at DESC',
      [syncType]
    );
    
    return result?.last_sync_timestamp ? new Date(result.last_sync_timestamp) : null;
  }

  async recordSyncStatus(status: {
    syncType: string;
    status: string;
    recordsSynced: number;
    errorsCount: number;
    errorMessage: string;
    duration: number;
  }): Promise<void> {
    const syncId = Math.floor(Math.random() * 1000000);
    const now = new Date().toISOString();
    const escapedSyncType = (status.syncType || 'unknown').replace(/'/g, "''");
    const escapedStatus = (status.status || 'unknown').replace(/'/g, "''");
    const escapedErrorMessage = (status.errorMessage || '').replace(/'/g, "''");
    
    await runCommand(`
      INSERT INTO sync_status (
        id, last_sync_timestamp, sync_type, status, records_synced, 
        errors_count, error_message, duration_ms, created_at
      ) VALUES (
        ${syncId}, 
        '${now}', 
        '${escapedSyncType}', 
        '${escapedStatus}', 
        ${status.recordsSynced || 0}, 
        ${status.errorsCount || 0}, 
        '${escapedErrorMessage}', 
        ${status.duration || 0}, 
        '${now}'
      )
    `);
  }

  async getSyncStatus(): Promise<any[]> {
    return runQuery(`
      SELECT * FROM sync_status 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
  }

  async getDatabaseStats(): Promise<any> {
    const [buildings, floors, spaces, energyRecords] = await Promise.all([
      runQuerySingle<{ count: number }>('SELECT COUNT(*) as count FROM buildings'),
      runQuerySingle<{ count: number }>('SELECT COUNT(*) as count FROM floors'),
      runQuerySingle<{ count: number }>('SELECT COUNT(*) as count FROM spaces'),
      runQuerySingle<{ count: number }>('SELECT COUNT(*) as count FROM energy_usage')
    ]);

    return {
      buildings: buildings?.count || 0,
      floors: floors?.count || 0,
      spaces: spaces?.count || 0,
      energyRecords: energyRecords?.count || 0
    };
  }
}

// Export singleton instance
export const syncService = new SyncService();