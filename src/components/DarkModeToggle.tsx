'use client';

import React from 'react';
import { IconButton } from '@mui/material';
import { DarkModeOutlined, LightModeOutlined } from '@mui/icons-material';
import { useTheme } from '@/contexts/ThemeContext';

const DarkModeToggle = () => {
  const { mode, toggleTheme } = useTheme();

  return (
    <IconButton
      onClick={toggleTheme}
      className="MuiIconButton-bordered"
      aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
      sx={{
        color: mode === 'dark' ? '#e0e0e0' : '#5A6C83',
      }}
    >
      {mode === 'light' ? (
        <DarkModeOutlined />
      ) : (
        <LightModeOutlined />
      )}
    </IconButton>
  );
};

export default DarkModeToggle;