import { NextResponse } from 'next/server';
import { syntheticDataCleanup } from '@/lib/cleanup-synthetic-data';

export async function POST() {
  try {
    const result = await syntheticDataCleanup.removeSyntheticData();
    
    return NextResponse.json({
      success: result.success,
      message: result.message,
      recordsRemoved: result.recordsRemoved
    });
    
  } catch (error) {
    console.error('Cleanup API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to cleanup synthetic data', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}