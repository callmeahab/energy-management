import { runCommand, runQuery, initializeDatabase } from './database';

export class SyntheticDataCleanup {
  async removeSyntheticData(): Promise<{ success: boolean; message: string; recordsRemoved: number }> {
    let recordsRemoved = 0;
    
    try {
      await initializeDatabase();
      
      console.log('Removing all synthetic test data...');
      
      // Count and remove test buildings 
      const testBuildingCount = await runQuery(`SELECT COUNT(*) as count FROM buildings WHERE id LIKE 'test-building-%'`);
      const buildingDeleteCount = testBuildingCount[0]?.count || 0;
      
      await runCommand(`DELETE FROM buildings WHERE id LIKE 'test-building-%'`);
      recordsRemoved += buildingDeleteCount;
      console.log(`Removed ${buildingDeleteCount} synthetic test buildings`);
      
      // Count and remove synthetic energy data
      const energyCount = await runQuery(`SELECT COUNT(*) as count FROM energy_usage WHERE source = 'synthetic' OR source = 'calculated' OR building_id LIKE 'test-building-%'`);
      const energyDeleteCount = energyCount[0]?.count || 0;
      
      await runCommand(`DELETE FROM energy_usage WHERE source = 'synthetic' OR source = 'calculated' OR building_id LIKE 'test-building-%'`);
      recordsRemoved += energyDeleteCount;
      console.log(`Removed ${energyDeleteCount} synthetic energy records`);
      
      // Count and remove floors and spaces associated with test buildings
      const floorsCount = await runQuery(`SELECT COUNT(*) as count FROM floors WHERE building_id LIKE 'test-building-%'`);
      const floorsDeleteCount = floorsCount[0]?.count || 0;
      
      await runCommand(`DELETE FROM floors WHERE building_id LIKE 'test-building-%'`);
      recordsRemoved += floorsDeleteCount;
      console.log(`Removed ${floorsDeleteCount} synthetic floor records`);
      
      const spacesCount = await runQuery(`SELECT COUNT(*) as count FROM spaces WHERE building_id LIKE 'test-building-%'`);
      const spacesDeleteCount = spacesCount[0]?.count || 0;
      
      await runCommand(`DELETE FROM spaces WHERE building_id LIKE 'test-building-%'`);
      recordsRemoved += spacesDeleteCount;
      console.log(`Removed ${spacesDeleteCount} synthetic space records`);
      
      console.log(`Total synthetic records removed: ${recordsRemoved}`);
      
      return {
        success: true,
        message: `Successfully removed ${recordsRemoved} synthetic records`,
        recordsRemoved
      };
      
    } catch (error) {
      console.error('Error removing synthetic data:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        recordsRemoved
      };
    }
  }
}

export const syntheticDataCleanup = new SyntheticDataCleanup();