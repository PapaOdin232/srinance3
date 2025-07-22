import React, { useEffect, useState } from 'react';
import { getAccount, getAccountHistory } from '../services/restClient';
import type { AccountResponse, HistoryResponse } from '../services/restClient';

export const AccountPanel: React.FC = () => {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // Przykładowo pobieramy historię dla symbolu BTCUSDT
    const symbol = 'BTCUSDT';
    Promise.all([getAccount(), getAccountHistory(symbol)])
      .then(([acc, hist]) => {
        setAccount(acc);
        setHistory(hist);
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

      {/* Sekcja podstawowa */}
      <div style={{ marginBottom: 16 }}>
        <strong>Typ konta:</strong> {account.accountType || '-'}<br />
        <strong>UID:</strong> {account.uid || '-'}<br />
        <strong>Ostatnia aktualizacja:</strong> {account.updateTime ? new Date(account.updateTime).toLocaleString() : '-'}
      </div>

      {/* Sekcja prowizji */}
      <h3>Prowizje</h3>
      <ul>
        <li><strong>Maker:</strong> {account.makerCommission}</li>
        <li><strong>Taker:</strong> {account.takerCommission}</li>
        <li><strong>Kupujący:</strong> {account.buyerCommission}</li>
        <li><strong>Sprzedający:</strong> {account.sellerCommission}</li>
      </ul>
      {account.commissionRates && (
        <>
          <h4>Szczegółowe stawki prowizji</h4>
          <ul>
            <li><strong>Maker:</strong> {account.commissionRates.maker}</li>
            <li><strong>Taker:</strong> {account.commissionRates.taker}</li>
            <li><strong>Kupujący:</strong> {account.commissionRates.buyer}</li>
            <li><strong>Sprzedający:</strong> {account.commissionRates.seller}</li>
          </ul>
        </>
      )}

      {/* Sekcja statusów konta */}
      <h3>Status konta</h3>
      <ul>
        <li><strong>Może handlować:</strong> {account.canTrade ? 'Tak' : 'Nie'}</li>
        <li><strong>Może wypłacać:</strong> {account.canWithdraw ? 'Tak' : 'Nie'}</li>
        <li><strong>Może wpłacać:</strong> {account.canDeposit ? 'Tak' : 'Nie'}</li>
        <li><strong>Brokered:</strong> {account.brokered ? 'Tak' : 'Nie'}</li>
        <li><strong>Wymaga self-trade prevention:</strong> {account.requireSelfTradePrevention ? 'Tak' : 'Nie'}</li>
        <li><strong>Prevent SOR:</strong> {account.preventSor ? 'Tak' : 'Nie'}</li>
      </ul>

      {/* Sekcja salda */}
      <h3>Saldo</h3>
      <table style={{ width: '100%', marginBottom: 16 }}>
        <thead>
          <tr>
            <th>Waluta</th>
            <th>Dostępne</th>
            <th>Zablokowane</th>
          </tr>
        </thead>
        <tbody>
          {(account.balances || []).map((bal) => (
            <tr key={bal.asset}>
              <td>{bal.asset}</td>
              <td>{bal.free}</td>
              <td>{bal.locked}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Sekcja uprawnień */}
      <h3>Uprawnienia</h3>
      <ul>
        {(account.permissions || []).map((perm) => (
          <li key={perm}>{perm}</li>
        ))}
      </ul>

      {/* Sekcja limitów */}
      {account.limits && (
        <>
          <h3>Limity</h3>
          <ul>
            {Object.entries(account.limits).map(([k, v]) => (
              <li key={k}>{k}: {v}</li>
            ))}
          </ul>
        </>
      )}

      {/* Sekcja historii transakcji */}
      <h3>Historia transakcji</h3>
      {history && Array.isArray(history.history) && history.history.length > 0 ? (
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
            {history.history.map((item: unknown, idx: number) => {
              const trade = item as { time?: string; symbol?: string; qty?: string; price?: string; side?: string };
              return (
                <tr key={idx}>
                  <td>{trade.time || '-'}</td>
                  <td>{trade.symbol || '-'}</td>
                  <td>{trade.qty || '-'}</td>
                  <td>{trade.price || '-'}</td>
                  <td>{trade.side || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div>Brak historii transakcji.</div>
      )}
    </div>
  );
};
