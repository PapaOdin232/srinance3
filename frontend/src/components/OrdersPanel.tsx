import React, { useState, useEffect } from 'react';
import { getOpenOrders, getOrdersHistory, type OrderResponse } from '../services/restClient';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`orders-tabpanel-${index}`}
      aria-labelledby={`orders-tab-${index}`}
      {...other}
    >
      {value === index && (
        <div style={{ padding: '24px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

interface OrdersPanelProps {
  symbol?: string;
}

const OrdersPanel: React.FC<OrdersPanelProps> = ({ symbol: defaultSymbol = 'BTCUSDT' }) => {
  const [tabValue, setTabValue] = useState(0);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [openOrders, setOpenOrders] = useState<OrderResponse[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT'];

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const loadOpenOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getOpenOrders(symbol);
      if (response) {
        setOpenOrders(response.orders || []);
      }
    } catch (err) {
      setError('Błąd podczas pobierania otwartych zleceń');
      console.error('Error loading open orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadOrderHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getOrdersHistory(symbol, 50); // Last 50 orders
      if (response) {
        setOrderHistory(response.orders || []);
      }
    } catch (err) {
      setError('Błąd podczas pobierania historii zleceń');
      console.error('Error loading order history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tabValue === 0) {
      loadOpenOrders();
    } else if (tabValue === 1) {
      loadOrderHistory();
    }
  }, [tabValue, symbol]);

  const formatPrice = (price: string) => {
    return parseFloat(price).toFixed(8);
  };

  const formatQuantity = (qty: string) => {
    return parseFloat(qty).toFixed(8);
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('pl-PL');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NEW':
        return '#1976d2'; // blue
      case 'FILLED':
        return '#2e7d32'; // green
      case 'PARTIALLY_FILLED':
        return '#ed6c02'; // orange
      case 'CANCELED':
        return '#d32f2f'; // red
      case 'EXPIRED':
        return '#757575'; // gray
      default:
        return '#757575';
    }
  };

  const renderOrderTable = (orders: OrderResponse[], showStatus: boolean = true) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Symbol</th>
            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Typ</th>
            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Strona</th>
            <th style={{ padding: '12px 8px', textAlign: 'right' }}>Cena</th>
            <th style={{ padding: '12px 8px', textAlign: 'right' }}>Ilość</th>
            <th style={{ padding: '12px 8px', textAlign: 'right' }}>Wykonano</th>
            {showStatus && <th style={{ padding: '12px 8px', textAlign: 'left' }}>Status</th>}
            <th style={{ padding: '12px 8px', textAlign: 'left' }}>Czas</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.orderId} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '8px' }}>{order.symbol}</td>
              <td style={{ padding: '8px' }}>{order.type}</td>
              <td style={{ padding: '8px', color: order.side === 'BUY' ? '#2e7d32' : '#d32f2f' }}>
                {order.side}
              </td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{formatPrice(order.price)}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{formatQuantity(order.origQty)}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>{formatQuantity(order.executedQty)}</td>
              {showStatus && (
                <td style={{ padding: '8px', color: getStatusColor(order.status) }}>
                  {order.status}
                </td>
              )}
              <td style={{ padding: '8px' }}>{formatTime(order.time)}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr>
              <td colSpan={showStatus ? 8 : 7} style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
                Brak zleceń
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const tabStyle = {
    padding: '12px 24px',
    margin: '0 4px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
  };

  const activeTabStyle = {
    ...tabStyle,
    borderBottomColor: '#1976d2',
    color: '#1976d2',
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '32px auto', padding: '0 16px' }}>
      <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
            Zarządzanie Zleceniami
          </h2>
          <div>
            <label style={{ marginRight: '8px', fontSize: '14px' }}>Symbol:</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              {symbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div style={{ 
            background: '#ffebee', 
            color: '#c62828', 
            padding: '12px 16px', 
            borderRadius: '4px', 
            marginBottom: '16px',
            border: '1px solid #ffcdd2'
          }}>
            {error}
          </div>
        )}

        <div style={{ borderBottom: '1px solid #ddd', marginBottom: '16px' }}>
          <div style={{ display: 'flex' }}>
            <button
              style={tabValue === 0 ? activeTabStyle : tabStyle}
              onClick={() => handleTabChange({} as React.SyntheticEvent, 0)}
            >
              Otwarte Zlecenia
            </button>
            <button
              style={tabValue === 1 ? activeTabStyle : tabStyle}
              onClick={() => handleTabChange({} as React.SyntheticEvent, 1)}
            >
              Historia Zleceń
            </button>
          </div>
        </div>

        <TabPanel value={tabValue} index={0}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
            Otwarte Zlecenia ({symbol})
          </h3>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
              <div>Ładowanie...</div>
            </div>
          ) : (
            renderOrderTable(openOrders, false)
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
            Historia Zleceń ({symbol})
          </h3>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
              <div>Ładowanie...</div>
            </div>
          ) : (
            renderOrderTable(orderHistory, true)
          )}
        </TabPanel>
      </div>
    </div>
  );
};

export default OrdersPanel;
