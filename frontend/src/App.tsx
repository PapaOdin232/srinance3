import './App.css';

import AccountPanel from './components/AccountPanel';
import MarketPanel from './components/MarketPanel';
import BotPanel from './components/BotPanel';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <div>
      <AccountPanel />
      <ErrorBoundary>
        <MarketPanel />
      </ErrorBoundary>
      <ErrorBoundary>
        <BotPanel />
      </ErrorBoundary>
    </div>
  );
}

export default App;
