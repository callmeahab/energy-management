import { NextResponse } from 'next/server';
import { testEnergyQuery } from '@/lib/test-energy-query';

export async function GET() {
  try {
    const result = await testEnergyQuery();
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Test energy API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to test energy query', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}