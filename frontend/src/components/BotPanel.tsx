import React, { useState, useEffect, useRef } from 'react';
import { getBotStatus, getBotLogs, api } from '../services/restClient';
import { WSClient } from '../services/wsClient';
import { getEnvVar } from '../services/getEnvVar';
import type { WSMessage, WSLogMessage, WSBotStatusMessage } from '../types/websocket';

// WebSocket URL dla logów bota - różne od /ws/market (dane rynkowe)
const WS_URL = getEnvVar('VITE_WS_URL', 'ws://localhost:8000/ws/bot');

export const BotPanel: React.FC = () => {
  const [settings, setSettings] = useState({ symbol: 'BTCUSDT', amount: 0.001 });
  const [status, setStatus] = useState<string>('unknown');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef<WSClient | null>(null);

  useEffect(() => {
    console.log('[BotPanel] useEffect mount');
    void getBotStatus().then((res) => {
      setStatus(res.status || 'unknown');
      setRunning(res.running || false);
    });
    void getBotLogs().then((res) => { setLogs(res.logs || []); });
    wsRef.current = new WSClient(WS_URL, (err) => {
      console.log('[BotPanel] WSClient onErrorCallback', err);
      if (err) setError(err);
    });
    wsRef.current.addListener((msg: WSMessage) => {
      console.log('[BotPanel] WSClient listener', msg);
      // Temporary debug: show alert to test WebSocket message reception
      if (msg.type === 'log') {
        alert(`Bot Log: ${(msg as WSLogMessage).message}`);
      }
      if (msg.type === 'log') {
        const logMessage = msg as WSLogMessage;
        setLogs((prev) => [...prev.slice(-99), logMessage.message]);
      }
      if (msg.type === 'bot_status') {
        const statusMessage = msg as WSBotStatusMessage;
        // Sprawdź czy status jest object z właściwością 'status'
        if (typeof statusMessage.status === 'object' && statusMessage.status !== null && 'status' in statusMessage.status) {
          setStatus(String(statusMessage.status.status || JSON.stringify(statusMessage.status)));
        } else {
          setStatus(String(statusMessage.status));
        }
        setRunning(Boolean(statusMessage.running));
      }
    });
    return () => {
      console.log('[BotPanel] useEffect cleanup (unmount/refresh)');
      wsRef.current?.close();
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings((s) => ({ ...s, [name]: name === 'amount' ? parseFloat(value) : value }));
  };

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/bot/start', settings);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/bot/stop');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 24, maxWidth: 600, margin: '24px auto', background: '#f9fafb' }}>
      <h2>Panel bota</h2>
      <form style={{ marginBottom: 16 }} onSubmit={e => { e.preventDefault(); }}>
        <label>
          Symbol:
          <input name="symbol" value={settings.symbol} onChange={handleChange} required style={{ marginLeft: 8 }} />
        </label>
        <label style={{ marginLeft: 16 }}>
          Ilość:
          <input name="amount" type="number" min={0.0001} step={0.0001} value={settings.amount} onChange={handleChange} required style={{ marginLeft: 8, width: 100 }} />
        </label>
        <button type="button" onClick={handleStart} disabled={loading || running} style={{ marginLeft: 16 }}>
          Start
        </button>
        <button type="button" onClick={handleStop} disabled={loading || !running} style={{ marginLeft: 8 }}>
          Stop
        </button>
      </form>
      <div>Status: <b>{typeof status === 'object' ? JSON.stringify(status) : String(status)}</b> {running ? '🟢' : '🔴'}</div>
      {error && <div style={{ color: 'red' }}>Błąd: {error}</div>}
      <h3>Logi bota (na żywo)</h3>
      <div style={{ background: '#222', color: '#0f0', fontFamily: 'monospace', padding: 12, height: 200, overflowY: 'auto', borderRadius: 4 }}>
        {logs.length === 0 ? <div>Brak logów.</div> : logs.map((log, i) => <div key={i}>{log}</div>)}
      </div>
    </div>
  );
};
