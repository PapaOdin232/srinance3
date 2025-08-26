import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import './optimizations.css'
import App from './App.tsx'
import { setupGlobalPassiveListeners } from './utils/passiveListeners'
import './utils/scrollPerformanceMonitor'
import './utils/debugLogger' // Import debug helpers for global access

// Setup passive event listeners for better scroll performance
setupGlobalPassiveListeners();

// Konfiguracja dark theme dopasowana do obecnego stylu (#242424)
const theme = createTheme({
  colors: {
    dark: [
      '#C1C2C5',
      '#A6A7AB', 
      '#909296',
      '#5c5f66',
      '#373A40',
      '#2C2E33',
      '#25262b',
      '#242424', // Nasz główny kolor tła
      '#1A1B1E',
      '#141517',
    ],
  },
  primaryColor: 'blue',
  defaultRadius: 'md',
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </StrictMode>,
)
