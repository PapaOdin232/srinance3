import './App.css';

import AccountPanel from './components/AccountPanel';
import MarketPanel from './components/MarketPanel';
import BotPanel from './components/BotPanel';
import OrdersPanel from './components/OrdersPanel';
import TradingPanel from './components/TradingPanel';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <div>
      <AccountPanel />
      <ErrorBoundary>
        <MarketPanel />
      </ErrorBoundary>
      <ErrorBoundary>
        <TradingPanel />
      </ErrorBoundary>
      <ErrorBoundary>
        <BotPanel />
      </ErrorBoundary>
      <ErrorBoundary>
        <OrdersPanel />
      </ErrorBoundary>
    </div>
  );
}

export default App;
