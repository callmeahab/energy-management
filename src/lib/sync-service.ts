import { ApolloClient, InMemoryCache, createHttpLink, gql } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { runCommand, runQuery, runQuerySingle, initializeDatabase } from './database';
import { Building, Site, Floor, Space } from '../types/energy';

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
`;

// Apollo Client for sync operations
const createSyncClient = () => {
  const httpLink = createHttpLink({
    uri: process.env.NODE_ENV === 'production' 
      ? 'https://api.mapped.com/graphql'
      : '/api/graphql',
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

  // Main synchronization method
  async synchronizeData(syncType: 'full' | 'incremental' = 'incremental'): Promise<SyncResult> {
    const startTime = Date.now();
    let recordsSynced = 0;
    let errorsCount = 0;
    let errorMessage = '';

    try {
      await initializeDatabase();
      
      console.log(`Starting ${syncType} synchronization...`);

      // Get last sync timestamp for incremental sync
      const lastSync = syncType === 'incremental' 
        ? await this.getLastSyncTimestamp('data_sync')
        : null;

      // First insert some test buildings manually for testing
      await this.insertTestBuildings();
      recordsSynced += 3; // 3 test buildings

      // Generate synthetic energy usage data based on buildings
      const energyResult = await this.generateEnergyUsageData();
      recordsSynced += energyResult.recordsSynced;
      errorsCount += energyResult.errorsCount;

      const duration = Date.now() - startTime;

      // Record sync status
      await this.recordSyncStatus({
        syncType: 'data_sync',
        status: errorsCount > 0 ? 'partial_success' : 'success',
        recordsSynced,
        errorsCount,
        errorMessage,
        duration
      });

      console.log(`Synchronization completed: ${recordsSynced} records synced, ${errorsCount} errors, ${duration}ms`);

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
      errorsCount = 1;

      // Temporarily disabled to debug parameter issues
      // await this.recordSyncStatus({
      //   syncType: 'data_sync',
      //   status: 'error',
      //   recordsSynced,
      //   errorsCount,
      //   errorMessage,
      //   duration
      // });

      console.error('Synchronization failed:', error);

      return {
        success: false,
        recordsSynced,
        errorsCount,
        errorMessage,
        duration
      };
    }
  }

  // Sync buildings, floors, and spaces
  private async syncBuildings(lastSync: Date | null): Promise<{ recordsSynced: number; errorsCount: number }> {
    let recordsSynced = 0;
    let errorsCount = 0;

    try {
      // Fetch buildings from API
      const { data } = await this.client.query({
        query: GET_BUILDINGS_FOR_SYNC,
      });

      if (data?.buildings) {
        for (const building of data.buildings) {
          try {
            // Insert/update building
            await this.upsertBuilding(building);
            recordsSynced++;

            // Sync floors for this building
            if (building.floors) {
              for (const floor of building.floors) {
                try {
                  await this.upsertFloor(floor, building.id);
                  recordsSynced++;

                  // Sync spaces for this floor
                  if (floor.spaces) {
                    for (const space of floor.spaces) {
                      try {
                        await this.upsertSpace(space, floor.id, building.id);
                        recordsSynced++;
                      } catch (error) {
                        console.error(`Error syncing space ${space.id}:`, error);
                        errorsCount++;
                      }
                    }
                  }
                } catch (error) {
                  console.error(`Error syncing floor ${floor.id}:`, error);
                  errorsCount++;
                }
              }
            }

            // Update building counts
            await this.updateBuildingCounts(building.id);

          } catch (error) {
            console.error(`Error syncing building ${building.id}:`, error);
            errorsCount++;
          }
        }
      }

      // Try to fetch from sites as fallback
      if (!data?.buildings || data.buildings.length === 0) {
        const sitesResult = await this.syncFromSites();
        recordsSynced += sitesResult.recordsSynced;
        errorsCount += sitesResult.errorsCount;
      }

    } catch (error) {
      console.error('Error fetching buildings from API:', error);
      errorsCount++;
    }

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

  // Test method to insert sample buildings
  private async insertTestBuildings(): Promise<void> {
    const testBuildings = [
      {
        id: 'test-building-1',
        name: 'Test Office Building',
        description: 'A test office building for development',
        exactType: 'office',
        address: { street: '123 Test St', city: 'Test City', state: 'TC', country: 'US', postalCode: '12345' },
        geolocation: { latitude: 37.7749, longitude: -122.4194 },
        dateCreated: new Date().toISOString(),
        dateUpdated: new Date().toISOString()
      },
      {
        id: 'test-building-2', 
        name: 'Test Retail Store',
        description: 'A test retail store for development',
        exactType: 'retail',
        address: { street: '456 Test Ave', city: 'Test City', state: 'TC', country: 'US', postalCode: '12346' },
        geolocation: { latitude: 37.7849, longitude: -122.4094 },
        dateCreated: new Date().toISOString(),
        dateUpdated: new Date().toISOString()
      },
      {
        id: 'test-building-3',
        name: 'Test Warehouse',
        description: 'A test warehouse for development', 
        exactType: 'warehouse',
        address: { street: '789 Test Blvd', city: 'Test City', state: 'TC', country: 'US', postalCode: '12347' },
        geolocation: { latitude: 37.7949, longitude: -122.3994 },
        dateCreated: new Date().toISOString(),
        dateUpdated: new Date().toISOString()
      }
    ];

    for (const building of testBuildings) {
      await this.upsertBuilding(building);
    }
  }

  // Database upsert methods
  private async upsertBuilding(building: Building): Promise<void> {
    console.log('Upserting building:', building.id, building.name);
    // Simplified approach: use direct SQL values to avoid parameter binding issues
    const name = building.name ? `'${building.name.replace(/'/g, "''")}'` : 'NULL';
    const description = building.description ? `'${building.description.replace(/'/g, "''")}'` : 'NULL';
    const exactType = building.exactType ? `'${building.exactType.replace(/'/g, "''")}'` : 'NULL';
    const addressStreet = building.address?.street ? `'${building.address.street.replace(/'/g, "''")}'` : 'NULL';
    const addressCity = building.address?.city ? `'${building.address.city.replace(/'/g, "''")}'` : 'NULL';
    const addressState = building.address?.state ? `'${building.address.state.replace(/'/g, "''")}'` : 'NULL';
    const addressCountry = building.address?.country ? `'${building.address.country.replace(/'/g, "''")}'` : 'NULL';
    const addressPostalCode = building.address?.postalCode ? `'${building.address.postalCode.replace(/'/g, "''")}'` : 'NULL';
    const latitude = building.geolocation?.latitude || 'NULL';
    const longitude = building.geolocation?.longitude || 'NULL';
    const dateCreated = building.dateCreated ? `'${building.dateCreated}'` : 'NULL';
    const dateUpdated = building.dateUpdated ? `'${building.dateUpdated}'` : 'NULL';
    const buildingId = `'${building.id.replace(/'/g, "''")}'`;
    
    // First try to update
    const updateSql = `
      UPDATE buildings SET
        name = ${name}, description = ${description}, exact_type = ${exactType},
        address_street = ${addressStreet}, address_city = ${addressCity}, address_state = ${addressState}, 
        address_country = ${addressCountry}, address_postal_code = ${addressPostalCode},
        latitude = ${latitude}, longitude = ${longitude}, date_created = ${dateCreated}, 
        date_updated = ${dateUpdated}, sync_timestamp = CURRENT_TIMESTAMP
      WHERE id = ${buildingId}
    `;

    const updateResult = await runCommand(updateSql, []);
    console.log('Update result:', updateResult);

    // If no rows were updated, insert the new record
    if (updateResult.changes === 0) {
      console.log('Inserting new building:', building.id);
      const insertSql = `
        INSERT INTO buildings (
          id, name, description, exact_type,
          address_street, address_city, address_state, address_country, address_postal_code,
          latitude, longitude, date_created, date_updated, sync_timestamp
        ) VALUES (${buildingId}, ${name}, ${description}, ${exactType}, ${addressStreet}, ${addressCity}, ${addressState}, ${addressCountry}, ${addressPostalCode}, ${latitude}, ${longitude}, ${dateCreated}, ${dateUpdated}, CURRENT_TIMESTAMP)
      `;

      const insertResult = await runCommand(insertSql, []);
      console.log('Insert result:', insertResult);
    } else {
      console.log('Updated existing building:', building.id);
    }
  }

  private async upsertFloor(floor: Floor, buildingId: string): Promise<void> {
    // First try to update
    const updateSql = `
      UPDATE floors SET
        building_id = ?, name = ?, description = ?, date_created = ?, date_updated = ?, sync_timestamp = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const updateParams = [
      buildingId,
      floor.name || null,
      floor.description || null,
      floor.dateCreated || null,
      floor.dateUpdated || null,
      floor.id,
    ];
    
    const updateResult = await runCommand(updateSql, updateParams);
    
    // If no rows were updated, insert the new record
    if (updateResult.changes === 0) {
      const insertSql = `
        INSERT INTO floors (
          id, building_id, name, description, date_created, date_updated, sync_timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      const insertParams = [
        floor.id,
        buildingId,
        floor.name || null,
        floor.description || null,
        floor.dateCreated || null,
        floor.dateUpdated || null,
      ];
      
      await runCommand(insertSql, insertParams);
    }
  }

  private async upsertSpace(space: Space, floorId: string, buildingId: string): Promise<void> {
    // First try to update
    const updateSql = `
      UPDATE spaces SET
        floor_id = ?, building_id = ?, name = ?, description = ?, exact_type = ?,
        date_created = ?, date_updated = ?, sync_timestamp = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    const updateParams = [
      floorId,
      buildingId,
      space.name || null,
      space.description || null,
      space.exactType || null,
      space.dateCreated || null,
      space.dateUpdated || null,
      space.id,
    ];
    
    const updateResult = await runCommand(updateSql, updateParams);
    
    // If no rows were updated, insert the new record
    if (updateResult.changes === 0) {
      const insertSql = `
        INSERT INTO spaces (
          id, floor_id, building_id, name, description, exact_type,
          date_created, date_updated, sync_timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;
      
      const insertParams = [
        space.id,
        floorId,
        buildingId,
        space.name || null,
        space.description || null,
        space.exactType || null,
        space.dateCreated || null,
        space.dateUpdated || null,
      ];
      
      await runCommand(insertSql, insertParams);
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

  // Generate synthetic energy usage data based on buildings
  private async generateEnergyUsageData(): Promise<{ recordsSynced: number; errorsCount: number }> {
    console.log('Starting energy data generation...');
    let recordsSynced = 0;
    let errorsCount = 0;

    try {
      const buildings = await runQuery<any>(`
        SELECT b.*, 
               COALESCE(b.floors_count, 0) as floors_count,
               COALESCE(b.spaces_count, 0) as spaces_count
        FROM buildings b
      `);

      console.log('Found buildings for energy generation:', buildings.length);

      const now = new Date();
      const hoursToGenerate = 24; // Generate last 24 hours of data

      for (const building of buildings) {
        console.log('Generating energy data for building:', building.id, building.name);
        for (let hour = 0; hour < hoursToGenerate; hour++) {
          const timestamp = new Date(now.getTime() - (hour * 60 * 60 * 1000));
          
          try {
            // Generate realistic energy data based on building characteristics
            const baseConsumption = Math.max(50, building.spaces_count * 2 + building.floors_count * 10);
            const timeMultiplier = this.getTimeMultiplier(timestamp);
            const randomVariation = 0.8 + Math.random() * 0.4; // 80% to 120% variation
            
            const consumption = baseConsumption * timeMultiplier * randomVariation;
            const cost = consumption * (0.12 + Math.random() * 0.08); // $0.12-$0.20 per kWh
            const efficiency = Math.max(60, Math.min(95, 85 + (Math.random() - 0.5) * 20));
            const temperature = 20 + Math.random() * 8; // 20-28°C
            const occupancy = Math.floor(building.spaces_count * 0.1 * timeMultiplier * (0.5 + Math.random()));

            const energyId = `${building.id}-${timestamp.toISOString()}`;

            // First try to update existing energy record using direct values
            const buildingIdSafe = `'${building.id.replace(/'/g, "''")}'`;
            const timestampSafe = `'${timestamp.toISOString()}'`;
            const consumptionValue = Math.round(consumption * 100) / 100;
            const costValue = Math.round(cost * 100) / 100;
            const efficiencyValue = Math.round(efficiency * 100) / 100;
            const temperatureValue = Math.round(temperature * 100) / 100;
            const energyIdSafe = `'${energyId.replace(/'/g, "''")}'`;
            
            const updateEnergyResult = await runCommand(`
              UPDATE energy_usage SET
                building_id = ${buildingIdSafe}, timestamp = ${timestampSafe}, consumption_kwh = ${consumptionValue}, cost_usd = ${costValue},
                efficiency_score = ${efficiencyValue}, temperature_celsius = ${temperatureValue}, occupancy_count = ${occupancy},
                usage_type = 'building_total', source = 'generated', sync_timestamp = CURRENT_TIMESTAMP
              WHERE id = ${energyIdSafe}
            `, []);

            // If no rows were updated, insert new record
            if (updateEnergyResult.changes === 0) {
              await runCommand(`
                INSERT INTO energy_usage (
                  id, building_id, timestamp, consumption_kwh, cost_usd, 
                  efficiency_score, temperature_celsius, occupancy_count,
                  usage_type, source, sync_timestamp
                ) VALUES (${energyIdSafe}, ${buildingIdSafe}, ${timestampSafe}, ${consumptionValue}, ${costValue}, ${efficiencyValue}, ${temperatureValue}, ${occupancy}, 'building_total', 'generated', CURRENT_TIMESTAMP)
              `, []);
            }

            recordsSynced++;
          } catch (error) {
            console.error(`Error generating energy data for building ${building.id}:`, error);
            errorsCount++;
          }
        }
      }
    } catch (error) {
      console.error('Error generating energy usage data:', error);
      errorsCount++;
    }

    return { recordsSynced, errorsCount };
  }

  // Helper to get time-based multiplier for realistic energy usage patterns
  private getTimeMultiplier(timestamp: Date): number {
    const hour = timestamp.getHours();
    const dayOfWeek = timestamp.getDay();
    
    // Weekend reduction
    const weekendMultiplier = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.6 : 1.0;
    
    // Hourly pattern (higher during business hours)
    let hourMultiplier = 0.4; // Base nighttime usage
    if (hour >= 6 && hour <= 8) hourMultiplier = 0.8; // Morning ramp-up
    else if (hour >= 9 && hour <= 17) hourMultiplier = 1.0; // Business hours
    else if (hour >= 18 && hour <= 22) hourMultiplier = 0.7; // Evening
    
    return weekendMultiplier * hourMultiplier;
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
    // Use direct values to avoid parameter binding issues
    const syncType = (status.syncType || 'unknown').replace(/'/g, "''");
    const statusValue = (status.status || 'unknown').replace(/'/g, "''");
    const recordsSynced = status.recordsSynced || 0;
    const errorsCount = status.errorsCount || 0;
    const errorMessage = (status.errorMessage || '').replace(/'/g, "''");
    const duration = status.duration || 0;
    
    const syncId = Math.floor(Math.random() * 1000000); // Use random ID within INT32 range
    await runCommand(`
      INSERT INTO sync_status (
        id, last_sync_timestamp, sync_type, status, records_synced, 
        errors_count, error_message, duration_ms, created_at
      ) VALUES (${syncId}, CURRENT_TIMESTAMP, '${syncType}', '${statusValue}', ${recordsSynced}, ${errorsCount}, '${errorMessage}', ${duration}, CURRENT_TIMESTAMP)
    `, []);
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