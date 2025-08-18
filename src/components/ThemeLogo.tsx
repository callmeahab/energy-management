'use client';

import React from 'react';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useTheme } from '@/contexts/ThemeContext';

interface ThemeLogoProps {
  width?: number;
  height?: number;
}

const ThemeLogo = ({ width = 44, height = 44 }: ThemeLogoProps) => {
  const { mode } = useTheme();
  const muiTheme = useMuiTheme();
  
  const isDark = mode === 'dark';
  const strokeColor = isDark ? '#e0e0e0' : '#5A6C83';
  const fillColor = isDark ? '#1e1e1e' : 'white';
  const borderColor = isDark ? '#555555' : '#DBDBDB';

  return (
    <svg width={width} height={height} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="19.5" fill={fillColor} stroke={borderColor}/>
      <path 
        d="M20 26V23" 
        stroke={strokeColor} 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <path 
        d="M18.0698 10.82L11.1398 16.37C10.3598 16.99 9.85978 18.3 10.0298 19.28L11.3598 27.24C11.5998 28.66 12.9598 29.81 14.3998 29.81H25.5998C27.0298 29.81 28.3998 28.65 28.6398 27.24L29.9698 19.28C30.1298 18.3 29.6298 16.99 28.8598 16.37L21.9298 10.83C20.8598 9.96997 19.1298 9.96997 18.0698 10.82Z" 
        stroke={strokeColor} 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default ThemeLogo;