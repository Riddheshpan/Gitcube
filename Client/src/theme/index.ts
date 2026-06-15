import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#0366d6',
    secondary: '#24292e',
    background: '#ffffff',
    surface: '#f6f8fa',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#58a6ff',
    secondary: '#c9d1d9',
    background: '#0d1117',
    surface: '#161b22',
  },
};
