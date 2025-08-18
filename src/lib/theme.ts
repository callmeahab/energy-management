import { createTheme } from "@mui/material/styles";

type ThemeMode = 'light' | 'dark';

export const createAppTheme = (mode: ThemeMode) => {
  const isDark = mode === 'dark';
  
  return createTheme({
    palette: {
      mode,
      primary: {
        main: "#1976d2",
        light: "#42a5f5",
        dark: "#1565c0",
      },
      secondary: {
        main: "#dc004e",
      },
      background: {
        default: isDark ? "#121212" : "#f5f5f5",
        paper: isDark ? "#1e1e1e" : "#ffffff",
      },
      success: {
        main: "#2e7d32",
      },
      warning: {
        main: "#ed6c02",
      },
      error: {
        main: "#d32f2f",
      },
      grey: {
        50: isDark ? "#424242" : "#fafafa",
        100: isDark ? "#616161" : "#f5f5f5",
        200: isDark ? "#757575" : "#eeeeee",
        300: isDark ? "#9e9e9e" : "#e0e0e0",
        400: isDark ? "#bdbdbd" : "#bdbdbd",
        500: isDark ? "#e0e0e0" : "#9e9e9e",
        600: isDark ? "#f5f5f5" : "#757575",
        700: isDark ? "#fafafa" : "#616161",
        800: isDark ? "#ffffff" : "#424242",
        900: isDark ? "#ffffff" : "#212121",
      },
    },
    typography: {
      h4: {
        fontWeight: 600,
      },
      h5: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 600,
      },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            border: `1px solid ${isDark ? "#333333" : "#DBDBDB"}`,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: "none",
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            '&.MuiIconButton-bordered': {
              border: `1px solid ${isDark ? "#555555" : "#DBDBDB"}`,
              backgroundColor: isDark ? "#1e1e1e" : "#ffffff",
              color: isDark ? "#e0e0e0" : "#5A6C83",
              '&:hover': {
                backgroundColor: isDark ? "#333333" : "#f5f5f5",
                borderColor: isDark ? "#777777" : "#BBBBBB",
              },
            },
          },
        },
      },
    },
  });
};

const theme = createAppTheme('light');

export default theme;
