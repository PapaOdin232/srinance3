import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import AccountPanel from './AccountPanel';
import * as restClient from '../services/restClient';

jest.mock('../services/restClient');

const mockAccount = {
  makerCommission: 10,
  takerCommission: 10,
  buyerCommission: 0,
  sellerCommission: 0,
  commissionRates: {
    maker: '0.00100000',
    taker: '0.00100000',
    buyer: '0.00000000',
    seller: '0.00000000',
  },
  canTrade: true,
  canWithdraw: true,
  canDeposit: true,
  brokered: false,
  requireSelfTradePrevention: false,
  preventSor: false,
  updateTime: 1751456749287,
  accountType: 'SPOT',
  balances: [
    { asset: 'BTC', free: '0.5', locked: '0.0' },
    { asset: 'USDT', free: '1000', locked: '0.0' },
  ],
  permissions: ['SPOT'],
  uid: 123456789,
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
    (restClient.getAccountHistory as jest.Mock).mockResolvedValue(mockHistory);
  });

  it('renderuje saldo i historię', async () => {
    render(<AccountPanel />);
    expect(await screen.findByText('BTC')).toBeInTheDocument();
    expect(await screen.findByText('0.5')).toBeInTheDocument();
    expect(await screen.findByText('BTCUSDT')).toBeInTheDocument();
    expect(await screen.findByText('40000')).toBeInTheDocument();
  });
});
