'use client';

import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface ThemeLocationIconProps {
  width?: number;
  height?: number;
}

const ThemeLocationIcon = ({ width = 24, height = 24 }: ThemeLocationIconProps) => {
  const { mode } = useTheme();
  
  const isDark = mode === 'dark';
  const fillColor = isDark ? '#e0e0e0' : '#5A6C83';

  return (
    <svg width={width} height={height} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.9999 14.17C9.86988 14.17 8.12988 12.44 8.12988 10.3C8.12988 8.16 9.86988 6.44 11.9999 6.44C14.1299 6.44 15.8699 8.17 15.8699 10.31C15.8699 12.45 14.1299 14.17 11.9999 14.17ZM11.9999 7.94C10.6999 7.94 9.62988 9 9.62988 10.31C9.62988 11.62 10.6899 12.68 11.9999 12.68C13.3099 12.68 14.3699 11.62 14.3699 10.31C14.3699 9 13.2999 7.94 11.9999 7.94Z" fill={fillColor}/>
      <path d="M12.0002 22.76C10.5202 22.76 9.03018 22.2 7.87018 21.09C4.92018 18.25 1.66018 13.72 2.89018 8.33C4.00018 3.44 8.27018 1.25 12.0002 1.25C12.0002 1.25 12.0002 1.25 12.0102 1.25C15.7402 1.25 20.0102 3.44 21.1202 8.34C22.3402 13.73 19.0802 18.25 16.1302 21.09C14.9702 22.2 13.4802 22.76 12.0002 22.76ZM12.0002 2.75C9.09018 2.75 5.35018 4.3 4.36018 8.66C3.28018 13.37 6.24018 17.43 8.92018 20C10.6502 21.67 13.3602 21.67 15.0902 20C17.7602 17.43 20.7202 13.37 19.6602 8.66C18.6602 4.3 14.9102 2.75 12.0002 2.75Z" fill={fillColor}/>
    </svg>
  );
};

export default ThemeLocationIcon;