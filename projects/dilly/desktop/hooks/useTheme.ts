'use client';
import { useState, useEffect } from 'react';

export function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('dilly_theme');
    let isDark: boolean;
    if (saved) {
      isDark = saved === 'dark';
    } else {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('dilly_theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  };

  return { dark, toggle };
}