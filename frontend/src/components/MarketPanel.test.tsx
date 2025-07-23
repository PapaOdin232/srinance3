// Mock dla react-chartjs-2 i chart.js, aby uniknąć problemów z canvas w jsdom
jest.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="mock-line-chart" />,
  Bar: () => <div data-testid="mock-bar-chart" />,
}));

jest.mock('chart.js', () => ({
  Chart: {
    register: jest.fn(),
  },
  LineController: {},
  LineElement: {},
  PointElement: {},
  LinearScale: {},
  CategoryScale: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}));
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import MarketPanel from './MarketPanel';
import * as restClient from '../services/restClient';

jest.mock('../services/restClient');

const mockTicker = { symbol: 'BTCUSDT', price: '50000' };
const mockOrderbook = {
  bids: [['49900', '0.5']],
  asks: [['50100', '0.3']],
};

describe('MarketPanel', () => {
  beforeEach(() => {
    (restClient.getTicker as jest.Mock).mockResolvedValue(mockTicker);
    (restClient.getOrderbook as jest.Mock).mockResolvedValue(mockOrderbook);
  });

  it('renderuje ticker i orderbook', async () => {
    render(<MarketPanel />);
    expect(await screen.findByText('BTCUSDT: 50000')).toBeInTheDocument();
    expect(await screen.findByText('49900')).toBeInTheDocument();
    expect(await screen.findByText('50100')).toBeInTheDocument();
  });
});
