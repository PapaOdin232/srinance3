import './App.css';
import { AccountPanel } from './components/AccountPanel';
import { MarketPanel } from './components/MarketPanel';
import { BotPanel } from './components/BotPanel';

function App() {
  return (
    <div>
      <AccountPanel />
      <MarketPanel />
      <BotPanel />
    </div>
  );
}

export default App;
