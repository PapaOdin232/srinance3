import { lazy, Suspense, useState } from 'react';
import { UserStreamProvider } from './store/userStream';
import { AppShell, Tabs, Loader, Center, Paper } from '@mantine/core';
import { ErrorBoundary } from './components/ErrorBoundary';
import AccountPanel from './components/AccountPanel';
import './App.css';

// Lazy load heavy components to improve initial load time
const MarketPanel = lazy(() => import('./components/MarketPanel'));
const TradingPanel = lazy(() => import('./components/TradingPanel'));
const BotPanel = lazy(() => import('./components/BotPanel'));
const OrdersPanel = lazy(() => import('./components/OrdersPanel'));
// Diagnostics panel removed

// Loading component for lazy loaded components
const LazyLoadingFallback = () => (
  <Center p="xl">
    <Paper p="xl" withBorder>
      <Loader size="lg" />
    </Paper>
  </Center>
);

function App() {
  const [activeTab, setActiveTab] = useState<string | null>('market');

  return (
    <UserStreamProvider>
      <AppShell padding="md">
      {/* Account Panel - always loaded as it's lightweight */}
      <AccountPanel />
      
      {/* Tab-based navigation to load only one heavy component at a time */}
      <Tabs value={activeTab} onChange={setActiveTab} variant="outline" radius="md">
        <Tabs.List grow>
          <Tabs.Tab value="market">Panel Rynkowy</Tabs.Tab>
          <Tabs.Tab value="trading">Trading</Tabs.Tab>
          <Tabs.Tab value="bot">Bot</Tabs.Tab>
          <Tabs.Tab value="orders">Zlecenia</Tabs.Tab>
          {/* Diagnostics tab removed */}
        </Tabs.List>

        <Tabs.Panel value="market" pt="xs">
          <ErrorBoundary>
            <Suspense fallback={<LazyLoadingFallback />}>
              <MarketPanel />
            </Suspense>
          </ErrorBoundary>
        </Tabs.Panel>

        <Tabs.Panel value="trading" pt="xs">
          <ErrorBoundary>
            <Suspense fallback={<LazyLoadingFallback />}>
              <TradingPanel />
            </Suspense>
          </ErrorBoundary>
        </Tabs.Panel>

        <Tabs.Panel value="bot" pt="xs">
          <ErrorBoundary>
            <Suspense fallback={<LazyLoadingFallback />}>
              <BotPanel />
            </Suspense>
          </ErrorBoundary>
        </Tabs.Panel>

        <Tabs.Panel value="orders" pt="xs">
          <ErrorBoundary>
            <Suspense fallback={<LazyLoadingFallback />}>
              <OrdersPanel />
            </Suspense>
          </ErrorBoundary>
        </Tabs.Panel>

  {/* Diagnostics panel removed */}
      </Tabs>
    </AppShell>
    </UserStreamProvider>
  );
}

export default App;
