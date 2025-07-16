import React, { useEffect, useState } from 'react';
import { getAccount, getHistory } from '../services/restClient';
import type { AccountResponse, HistoryResponse } from '../services/restClient';

export const AccountPanel: React.FC = () => {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([getAccount(), getHistory()])
      .then(([acc, hist]) => {
        setAccount(acc ?? null);
        setHistory(hist ?? null);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Ładowanie danych konta...</div>;
  if (error) return <div style={{ color: 'red' }}>Błąd: {error}</div>;
  if (!account) return <div>Brak danych konta.</div>;

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 24, maxWidth: 600, margin: '24px auto', background: '#fafbfc' }}>
      <h2>Konto Binance</h2>
      <h3>Saldo</h3>
      <table style={{ width: '100%', marginBottom: 16 }}>
        <thead>
          <tr>
            <th>Waluta</th>
            <th>Ilość</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(account.balances).map(([asset, amount]) => (
            <tr key={asset}>
              <td>{asset}</td>
              <td>{amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Uprawnienia</h3>
      <ul>
        {account.permissions.map((perm) => (
          <li key={perm}>{perm}</li>
        ))}
      </ul>
      <h3>Limity</h3>
      <ul>
        {Object.entries(account.limits).map(([k, v]) => (
          <li key={k}>{k}: {v}</li>
        ))}
      </ul>
      <h3>Historia transakcji</h3>
      {history && history.history.length > 0 ? (
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Symbol</th>
              <th>Ilość</th>
              <th>Cena</th>
              <th>Typ</th>
            </tr>
          </thead>
          <tbody>
            {history.history.map((item: any, idx: number) => (
              <tr key={idx}>
                <td>{item.time || '-'}</td>
                <td>{item.symbol || '-'}</td>
                <td>{item.qty || '-'}</td>
                <td>{item.price || '-'}</td>
                <td>{item.side || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>Brak historii transakcji.</div>
      )}
    </div>
  );
};
