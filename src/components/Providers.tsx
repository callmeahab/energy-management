'use client';

import { ApolloProvider } from '@apollo/client';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import client from '@/lib/apollo-client';
import theme from '@/lib/theme';
import ErrorBoundary from './ErrorBoundary';
import { DataProvider } from '@/contexts/DataContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ApolloProvider client={client}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <DataProvider>
            {children}
          </DataProvider>
        </ThemeProvider>
      </ApolloProvider>
    </ErrorBoundary>
  );
}