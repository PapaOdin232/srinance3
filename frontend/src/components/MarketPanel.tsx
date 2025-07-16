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
const WS_URL = getEnvVar('VITE_WS_URL', 'ws://localhost:8000/ws');

export const MarketPanel: React.FC = () => {
  const [ticker, setTicker] = useState<TickerResponse | null>(null);
  const [orderbook, setOrderbook] = useState<OrderbookResponse | null>(null);
  const [chartData, setChartData] = useState<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WSClient | null>(null);

  useEffect(() => {
    // Pobierz dane początkowe
    getTicker(SYMBOL).then(setTicker).catch((e) => setError((e as Error).message));
    getOrderbook(SYMBOL).then(setOrderbook).catch((e) => setError((e as Error).message));
    // WebSocket na żywo
    wsRef.current = new WSClient(WS_URL);
    wsRef.current.addListener((msg: WSMessage) => {
      if (msg.type === 'ticker' && msg.symbol === SYMBOL) {
        setTicker({ symbol: msg.symbol, price: msg.price });
        setChartData((prev) => ({
          labels: [...prev.labels, new Date().toLocaleTimeString()].slice(-20),
          data: [...prev.data, parseFloat(msg.price)].slice(-20),
        }));
      }
      if (msg.type === 'orderbook' && msg.symbol === SYMBOL) {
        setOrderbook({ bids: msg.bids, asks: msg.asks });
      }
    });
    return () => wsRef.current?.close();
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
