import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AccountPanel } from './AccountPanel';
import * as restClient from '../services/restClient';

jest.mock('../services/restClient');

const mockAccount = {
  balances: { BTC: '0.5', USDT: '1000' },
  permissions: ['SPOT'],
  limits: { limit1: 100 },
};
const mockHistory = {
  history: [
    { time: '2024-01-01', symbol: 'BTCUSDT', qty: '0.1', price: '40000', side: 'BUY' },
  ],
};

describe('AccountPanel', () => {
  beforeEach(() => {
    (restClient.getAccount as jest.Mock).mockResolvedValue(mockAccount);
    (restClient.getHistory as jest.Mock).mockResolvedValue(mockHistory);
  });

  it('renderuje saldo i historię', async () => {
    render(<AccountPanel />);
    expect(await screen.findByText('BTC')).toBeInTheDocument();
    expect(await screen.findByText('0.5')).toBeInTheDocument();
    expect(await screen.findByText('BTCUSDT')).toBeInTheDocument();
    expect(await screen.findByText('40000')).toBeInTheDocument();
  });
});
