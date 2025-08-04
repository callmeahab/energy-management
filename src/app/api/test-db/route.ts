import { NextResponse } from 'next/server';
import { initializeDatabase, runQuery } from '@/lib/database';

export async function GET() {
  try {
    await initializeDatabase();
    
    // Simple test query
    const result = await runQuery('SELECT 1 as test_value');
    
    return NextResponse.json({
      success: true,
      message: 'DuckDB connection successful',
      data: result
    });
    
  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Database test failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}