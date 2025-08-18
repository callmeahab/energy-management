'use client';

import { ApolloProvider } from '@apollo/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import client from '@/lib/apollo-client';
import { createAppTheme } from '@/lib/theme';
import ErrorBoundary from './ErrorBoundary';
import { DataProvider } from '@/contexts/DataContext';
import { CustomThemeProvider, useTheme } from '@/contexts/ThemeContext';

function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useTheme();
  const theme = createAppTheme(mode);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ApolloProvider client={client}>
        <CustomThemeProvider>
          <AppThemeProvider>
            <DataProvider>
              {children}
            </DataProvider>
          </AppThemeProvider>
        </CustomThemeProvider>
      </ApolloProvider>
    </ErrorBoundary>
  );
}