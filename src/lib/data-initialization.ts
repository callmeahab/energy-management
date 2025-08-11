import fs from 'fs';
import path from 'path';

// Singleton to track if data has been checked
let dataChecked = false;

export function ensurePopulationDataExists(): void {
  if (dataChecked) return;
  
  const projectRoot = process.cwd();
  const processedDir = path.join(projectRoot, 'population-density-data', 'processed');
  
  const requiredFiles = [
    'kontur_us.json',
    'kontur_r4.json',
    'kontur_r6.json'
  ];
  
  const missingFiles = requiredFiles.filter(file => {
    const filePath = path.join(processedDir, file);
    return !fs.existsSync(filePath);
  });
  
  if (missingFiles.length > 0) {
    console.error('❌ Missing processed population data files:', missingFiles.join(', '));
    console.error('💡 Run "npm run process-population-data" to generate them');
    throw new Error(`Missing processed data files: ${missingFiles.join(', ')}`);
  }
  
  dataChecked = true;
  console.log('✅ Population data files verified');
}