import React, { useState, useEffect } from 'react';
import { getAccount } from '../services/restClient';
import type { AccountResponse, Balance } from '../services/restClient';

const AccountPanel: React.FC = () => {
  const [accountData, setAccountData] = useState<AccountResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connected'>('disconnected');

  // Fetch account data on component mount
  useEffect(() => {
    const fetchAccountData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getAccount();
        if (data) {
          setAccountData(data);
          setConnectionStatus('connected');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Błąd podczas pobierania danych konta');
        setConnectionStatus('disconnected');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccountData();
  }, []);

  // Filter balances to show only non-zero balances
  const nonZeroBalances = accountData?.balances?.filter(
    (balance: Balance) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
  ) || [];

  return (
    <div style={{ 
      padding: '20px', 
      backgroundColor: '#2a2a2a', 
      borderRadius: '8px', 
      margin: '10px',
      color: 'white',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: 0, fontSize: '24px' }}>Panel konta</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: connectionStatus === 'connected' ? '#4CAF50' : '#f44336',
            }}
          />
          <span style={{ fontSize: '14px', color: '#ccc' }}>
            {connectionStatus === 'connected' ? 'Połączony' : 'Rozłączony'}
          </span>
        </div>
      </div>

      <h3 style={{ marginBottom: '15px', fontSize: '20px' }}>Panel Rynkowy</h3>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div>Ładowanie danych konta...</div>
        </div>
      )}

      {error && (
        <div style={{ 
          color: '#f44336', 
          backgroundColor: '#ffebee', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #f44336'
        }}>
          {error}
        </div>
      )}

      {accountData && !isLoading && (
        <>
          {/* Account Permissions */}
          <div style={{ 
            backgroundColor: '#363636', 
            padding: '15px', 
            borderRadius: '6px',
            marginBottom: '20px'
          }}>
            <h4 style={{ marginTop: 0, marginBottom: '10px', color: '#fff' }}>Uprawnienia Konta</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
              <div>
                <span style={{ color: '#ccc' }}>Handel: </span>
                <span style={{ color: accountData.canTrade ? '#4CAF50' : '#f44336' }}>
                  {accountData.canTrade ? 'Tak' : 'Nie'}
                </span>
              </div>
              <div>
                <span style={{ color: '#ccc' }}>Wypłaty: </span>
                <span style={{ color: accountData.canWithdraw ? '#4CAF50' : '#f44336' }}>
                  {accountData.canWithdraw ? 'Tak' : 'Nie'}
                </span>
              </div>
              <div>
                <span style={{ color: '#ccc' }}>Wpłaty: </span>
                <span style={{ color: accountData.canDeposit ? '#4CAF50' : '#f44336' }}>
                  {accountData.canDeposit ? 'Tak' : 'Nie'}
                </span>
              </div>
            </div>
          </div>

          {/* Commission Rates */}
          <div style={{ 
            backgroundColor: '#363636', 
            padding: '15px', 
            borderRadius: '6px',
            marginBottom: '20px'
          }}>
            <h4 style={{ marginTop: 0, marginBottom: '10px', color: '#fff' }}>Prowizje Handlowe</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
              <div>
                <span style={{ color: '#ccc' }}>Maker: </span>
                <span style={{ color: '#fff' }}>{(accountData.makerCommission / 10000 * 100).toFixed(3)}%</span>
              </div>
              <div>
                <span style={{ color: '#ccc' }}>Taker: </span>
                <span style={{ color: '#fff' }}>{(accountData.takerCommission / 10000 * 100).toFixed(3)}%</span>
              </div>
            </div>
          </div>

          {/* Account Balances */}
          <div style={{ 
            backgroundColor: '#363636', 
            padding: '15px', 
            borderRadius: '6px'
          }}>
            <h4 style={{ marginTop: 0, marginBottom: '15px', color: '#fff' }}>
              Salda Konta ({nonZeroBalances.length} aktywnych)
            </h4>
            
            {nonZeroBalances.length === 0 ? (
              <div style={{ color: '#ccc', textAlign: 'center', padding: '20px' }}>
                Brak aktywnych sald na koncie
              </div>
            ) : (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                gap: '12px' 
              }}>
                {nonZeroBalances.map((balance: Balance) => {
                  const freeAmount = parseFloat(balance.free);
                  const lockedAmount = parseFloat(balance.locked);
                  const totalAmount = freeAmount + lockedAmount;
                  
                  return (
                    <div
                      key={balance.asset}
                      style={{
                        backgroundColor: '#4a4a4a',
                        padding: '12px',
                        borderRadius: '4px',
                        border: '1px solid #555'
                      }}
                    >
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '16px', 
                        marginBottom: '8px',
                        color: '#fff'
                      }}>
                        {balance.asset}
                      </div>
                      <div style={{ fontSize: '14px', color: '#ccc' }}>
                        <div>Wolne: <span style={{ color: '#4CAF50' }}>{freeAmount.toFixed(8)}</span></div>
                        <div>Zablokowane: <span style={{ color: '#ff9800' }}>{lockedAmount.toFixed(8)}</span></div>
                        <div style={{ marginTop: '4px', fontWeight: '500' }}>
                          Razem: <span style={{ color: '#fff' }}>{totalAmount.toFixed(8)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AccountPanel;
