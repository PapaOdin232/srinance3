import React, { useEffect, useState, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
import { getTicker, getOrderbook } from '../services/restClient';
import { getEnvVar } from '../services/testConnection';
import type { TickerResponse, OrderbookResponse } from '../services/restClient';
import { WSClient } from '../services/wsClient';
import type { WSMessage } from '../services/wsClient';

Chart.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

const SYMBOL = 'BTCUSDT';
const WS_URL = getEnvVar('VITE_WS_URL', 'ws://localhost:8000/ws/market');

export const MarketPanel: React.FC = () => {
  const [ticker, setTicker] = useState<TickerResponse | null>(null);
  const [orderbook, setOrderbook] = useState<OrderbookResponse | null>(null);
  const [chartData, setChartData] = useState<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WSClient | null>(null);

  useEffect(() => {
    console.log('[MarketPanel] useEffect mount');
    // Pobierz dane początkowe
    getTicker(SYMBOL).then(setTicker).catch((e) => setError((e as Error).message));
    getOrderbook(SYMBOL).then(setOrderbook).catch((e) => setError((e as Error).message));
    // WebSocket na żywo
    wsRef.current = new WSClient(WS_URL, (err) => {
      console.log('[MarketPanel] WSClient onErrorCallback', err);
      if (!err) setError(null);
      else setError(err);
    });
    wsRef.current.addListener((msg: any) => {
      console.log('[MarketPanel] WSClient listener', msg);
      setError(null);
      // Obsługa wiadomości typu kline
      if (msg.e === 'kline' && msg.s === SYMBOL && msg.k) {
        const closePrice = parseFloat(msg.k.c);
        setTicker({ symbol: msg.s, price: msg.k.c });
        setChartData((prev) => ({
          labels: [...prev.labels, new Date(msg.k.T).toLocaleTimeString()].slice(-20),
          data: [...prev.data, closePrice].slice(-20),
        }));
        console.log('[MarketPanel] zaktualizowano ticker i chartData z kline', closePrice);
      }
      // Obsługa wiadomości typu depthUpdate
      else if (msg.e === 'depthUpdate' && msg.s === SYMBOL) {
        setOrderbook({ bids: msg.b, asks: msg.a });
        console.log('[MarketPanel] zaktualizowano orderbook z depthUpdate', msg.b, msg.a);
      }
      // Obsługa wiadomości typu 24hrTicker
      else if (msg.e === '24hrTicker' && msg.s === SYMBOL) {
        setTicker({ symbol: msg.s, price: msg.c });
        console.log('[MarketPanel] zaktualizowano ticker z 24hrTicker', msg.c);
      }
      else {
        // fallback na nieznane typy
        console.log('[MarketPanel] nieobsługiwany typ wiadomości', msg);
      }
    });
    return () => {
      console.log('[MarketPanel] useEffect cleanup (unmount/refresh)');
      wsRef.current?.close();
    };
  }, []);

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 24, maxWidth: 900, margin: '24px auto', background: '#f7fafc' }}>
      <h2>Rynek: {SYMBOL}</h2>
      <h3>Ticker</h3>
      <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>
        {ticker ? `${ticker.symbol}: ${ticker.price}` : 'Ładowanie...'}
      </div>
      <h3>Wykres ceny (ostatnie 20 ticków)</h3>
      <div style={{ height: 300 }}>
        <Line
          data={{
            labels: chartData.labels,
            datasets: [
              {
                label: 'Cena',
                data: chartData.data,
                borderColor: '#007bff',
                backgroundColor: 'rgba(0,123,255,0.1)',
                tension: 0.2,
              },
            ],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { x: { display: true }, y: { display: true } },
          }}
        />
      </div>
      <h3>Orderbook</h3>
      {orderbook ? (
        <div style={{ display: 'flex', gap: 32 }}>
          <div>
            <b>Bids</b>
            <table>
              <tbody>
                {orderbook.bids.slice(0, 10).map(([price, qty], i) => (
                  <tr key={i}>
                    <td>{price}</td>
                    <td>{qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <b>Asks</b>
            <table>
              <tbody>
                {orderbook.asks.slice(0, 10).map(([price, qty], i) => (
                  <tr key={i}>
                    <td>{price}</td>
                    <td>{qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div>Ładowanie orderbook...</div>
      )}
      {error && <div style={{ color: 'red' }}>Błąd: {error}</div>}
    </div>
  );
};
