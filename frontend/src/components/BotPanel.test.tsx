import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { BotPanel } from './BotPanel';
import * as restClient from '../services/restClient';

jest.mock('../services/restClient');

const mockStatus = { status: 'stopped', running: false };
const mockLogs = { logs: ['Bot initialized'] };

describe('BotPanel', () => {
  beforeEach(() => {
    (restClient.getBotStatus as jest.Mock).mockResolvedValue(mockStatus);
    (restClient.getBotLogs as jest.Mock).mockResolvedValue(mockLogs);
  });

  it('renderuje panel bota i logi', async () => {
    render(<BotPanel />);
    expect(await screen.findByText('Panel bota')).toBeInTheDocument();
    expect(await screen.findByText('Bot initialized')).toBeInTheDocument();
  });

  it('obsługuje start bota', async () => {
    render(<BotPanel />);
    const startBtn = await screen.findByText('Start');
    fireEvent.click(startBtn);
    expect(restClient.api.post).toHaveBeenCalledWith('/bot/start', expect.anything());
  });
});
