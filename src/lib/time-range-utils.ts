import { TimeRange } from '@/types/energy';

export interface TimeRangeConfig {
  sqlTrunc: string;
  sqlFormat: string;
  labelFormat: (date: Date, index?: number) => string;
  aggregation: string;
}

export const getTimeRangeConfig = (timeRange: TimeRange): TimeRangeConfig => {
  switch (timeRange) {
    case 'hour':
      return {
        sqlTrunc: 'minute', // 15-minute intervals for hour view
        sqlFormat: '%Y-%m-%d %H:%M:00',
        labelFormat: (date: Date) => date.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        }),
        aggregation: 'minute'
      };
    
    case 'day':
      return {
        sqlTrunc: 'hour',
        sqlFormat: '%Y-%m-%d %H:00:00',
        labelFormat: (date: Date) => date.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          hour12: true 
        }),
        aggregation: 'hourly'
      };
    
    case 'week':
      return {
        sqlTrunc: 'day',
        sqlFormat: '%Y-%m-%d',
        labelFormat: (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short' }),
        aggregation: 'daily'
      };
    
    case 'month':
      return {
        sqlTrunc: 'week',
        sqlFormat: '%Y-%W', // Year-Week format
        labelFormat: (date: Date, index?: number) => {
          // For month view, show week numbers
          if (typeof index === 'number') {
            return `Week ${index + 1}`;
          }
          // Fallback: calculate week number from date
          const weekNumber = getWeekNumber(date);
          return `Week ${weekNumber}`;
        },
        aggregation: 'weekly'
      };
    
    default:
      return getTimeRangeConfig('day');
  }
};

// Helper function to get week number of month
const getWeekNumber = (date: Date): number => {
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const dayOfMonth = date.getDate();
  const startDayOfWeek = startOfMonth.getDay();
  
  // Calculate which week of the month this date falls into
  const weekNumber = Math.ceil((dayOfMonth + startDayOfWeek) / 7);
  return weekNumber;
};

// Helper function to format chart labels
export const formatChartLabel = (
  period: string, 
  timeRange: TimeRange, 
  index?: number
): string => {
  const config = getTimeRangeConfig(timeRange);
  const date = new Date(period);
  return config.labelFormat(date, index);
};

// Helper function to get time range duration in milliseconds
export const getTimeRangeDuration = (timeRange: TimeRange): number => {
  switch (timeRange) {
    case 'hour':
      return 60 * 60 * 1000; // 1 hour
    case 'day':
      return 24 * 60 * 60 * 1000; // 24 hours
    case 'week':
      return 7 * 24 * 60 * 60 * 1000; // 7 days
    case 'month':
      return 30 * 24 * 60 * 60 * 1000; // 30 days
    default:
      return 24 * 60 * 60 * 1000;
  }
};