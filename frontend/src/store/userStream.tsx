import React, { useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import EnhancedWSClient, { ConnectionState } from '../services/wsClient';
import { getEnvVar } from '../services/getEnvVar';

// Typy odpowiadające protokołowi WEBSOCKET_PROTOCOL.md
interface OrderExternal {
  orderId: number;
  clientOrderId?: string;
  symbol: string;
  side: string;
  type?: string;
  timeInForce?: string;
  price?: string;
  origQty?: string;
  executedQty?: string;
  cummulativeQuoteQty?: string;
  avgPrice?: string;
  status: string;
  updateTime?: number;
  fills?: any[];
  [k: string]: any;
}

interface BalanceExternal { asset: string; free: string; locked: string; }

type UserWSMessage =
  | { type: 'welcome'; ts: number; message: string }
  | { type: 'orders_snapshot'; openOrders: OrderExternal[]; balances: BalanceExternal[]; history?: OrderExternal[]; lastEventAgeMs?: number|null; fallback?: boolean; mergeStats?: any; ts: number }
  | { type: 'order_store_batch'; schemaVersion: number; events: any[]; batchSize: number; ts: number; lastEventAgeMs?: number|null }
  | { type: 'user_heartbeat'; ts: number; lastEventAgeMs?: number|null }
  | { type: 'system'; level: string; message: string; ts: number; lastEventAgeMs?: number|null; mergeStats?: any }
  | { type: 'pong'; ts: number }
  | { type: 'error'; message: string }
  | { type: string; [k: string]: any };

interface UserStreamState {
  connectionState: ConnectionState;
  openOrders: Record<number, OrderExternal>;
  balances: Record<string, BalanceExternal>;
  history: OrderExternal[]; // limited snapshot
  lastSnapshotTs?: number;
  lastEventAgeMs?: number|null;
  freshnessMs?: number|null; // dynamic client computed
  systemMessages: { level: string; message: string; ts: number }[];
  schemaVersion?: number;
  fallback?: boolean;
}

const UserStreamContext = React.createContext<{
  state: UserStreamState;
  sendResnapshot: () => void;
  getFreshnessCategory: () => 'green'|'yellow'|'red'|'unknown';
  addPendingOrder: (order: OrderExternal, timeoutMs?: number) => void;
  addOptimisticCancel: (orderId: number, timeoutMs?: number) => void;
} | null>(null);

export const UserStreamProvider: React.FC<{ baseUrl?: string; children: React.ReactNode }> = ({ baseUrl = '', children }) => {
  // DEBUG / DIAGNOSTYKA: uspójnienie URL oraz dodatkowe logi aby zidentyfikować brak połączenia /ws/user

  // Dodaj tymczasowe zlecenie (PENDING) do openOrders, rollback po timeout jeśli nie pojawi się NEW/REJECTED
  const addPendingOrder = useCallback((order: OrderExternal, timeoutMs: number = 15000) => {
    setState((s: UserStreamState) => {
      const key = order.orderId ?? order.clientOrderId ?? Math.random();
      return {
        ...s,
        openOrders: {
          ...s.openOrders,
          [key]: { ...order, status: 'PENDING' }
        }
      };
    });
    setTimeout(() => {
      setState((s: UserStreamState) => {
        const key = order.orderId ?? order.clientOrderId;
        const found = Object.values(s.openOrders).find((o: OrderExternal) => (o.clientOrderId === order.clientOrderId) && o.status === 'PENDING');
        if (found && key) {
          const newOpen = { ...s.openOrders };
          delete newOpen[key];
          return { ...s, openOrders: newOpen };
        }
        return s;
      });
    }, timeoutMs);
  }, []);

  // Optymistycznie oznacz zlecenie jako CANCELED, rollback po timeout jeśli nie przyjdzie delta z WebSocket
  const addOptimisticCancel = useCallback((orderId: number, timeoutMs: number = 10000) => {
    // Zapisz oryginalny status dla potencjalnego rollback
    let originalOrder: OrderExternal | null = null;
    setState((s: UserStreamState) => {
      originalOrder = s.openOrders[orderId] || null;
      if (!originalOrder) return s; // Nie ma zlecenia do anulowania
      
      return {
        ...s,
        openOrders: {
          ...s.openOrders,
          [orderId]: { ...originalOrder, status: 'CANCELED' }
        }
      };
    });

    // Rollback po timeout jeśli WebSocket nie potwierdzi anulowania
    setTimeout(() => {
      if (originalOrder) {
        setState((s: UserStreamState) => {
          const currentOrder = s.openOrders[orderId];
          // Rollback tylko jeśli nadal ma status CANCELED (nie było delty z WebSocket)
          if (currentOrder && currentOrder.status === 'CANCELED' && currentOrder.updateTime === originalOrder!.updateTime) {
            return {
              ...s,
              openOrders: {
                ...s.openOrders,
                [orderId]: originalOrder!
              }
            };
          }
          return s;
        });
      }
    }, timeoutMs);
  }, []);
  const [state, setState] = useState<UserStreamState>({
    connectionState: ConnectionState.DISCONNECTED,
    openOrders: {},
    balances: {},
    history: [],
    systemMessages: []
  });

  const wsRef = useRef<EnhancedWSClient | null>(null);
  const lastUpdateMonotonic = useRef<number>(performance.now());
  const lastEventAgeAtReceive = useRef<number|null>(null);

  // Dynamic freshness updater
  useEffect(() => {
    const id = setInterval(() => {
      if (lastEventAgeAtReceive.current != null) {
        const elapsed = performance.now() - lastUpdateMonotonic.current; // ms since last message with lastEventAgeMs
        const freshness = lastEventAgeAtReceive.current + elapsed;
        setState(s => ({ ...s, freshnessMs: freshness }));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Connect WS
  useEffect(() => {
    if (wsRef.current) return; // already connected
    const envBase = getEnvVar('VITE_WS_URL', '');
    let rawBase = baseUrl || envBase;
    if (!rawBase) {
      const loc = window.location;
      const assumedBackend = loc.hostname === 'localhost' ? 'localhost:8001' : loc.host;
      rawBase = `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${assumedBackend}`;
    }
    // Normalizacja bazowego URL aby uniknąć duplikacji segmentów
    let wsBase = rawBase.replace(/\s+/g,'').replace(/\/+$/, '');
    // Jeśli ktoś podał już pełny endpoint /ws/user to użyj jak jest
    let finalUrl: string;
    if (/\/ws\/user$/i.test(wsBase)) {
      finalUrl = wsBase; // już kompletny
    } else if (/\/ws$/i.test(wsBase)) {
      finalUrl = wsBase + '/user';
    } else if (/\/user$/i.test(wsBase) && !/\/ws\/user$/i.test(wsBase)) {
      // Zamień końcowe /user na /ws/user
      finalUrl = wsBase.replace(/\/user$/i, '/ws/user');
    } else {
      finalUrl = wsBase + '/ws/user';
    }
    // Ochrona przed przypadkową podwójną sekwencją /ws/user/ws/user
    finalUrl = finalUrl.replace(/(\/ws\/user)+(\/ws\/user)+/gi, '/ws/user');
    // Log diagnostyczny (nie używamy console.debug by widoczne było domyślnie)
    // eslint-disable-next-line no-console
    console.log('[UserStream] Connecting to', finalUrl, '(raw base:', rawBase, ')');
    const client = new EnhancedWSClient(finalUrl, { debug: true });
    wsRef.current = client;
    client.addStateListener(cs => setState(s => ({ ...s, connectionState: cs })));
    client.addListener((raw: any) => {
      // Process heavy operations asynchronously to avoid blocking main thread
      setTimeout(() => {
        const msg = raw as UserWSMessage;
        if ('lastEventAgeMs' in msg) {
          if (typeof msg.lastEventAgeMs === 'number') {
              lastEventAgeAtReceive.current = msg.lastEventAgeMs;
              lastUpdateMonotonic.current = performance.now();
          }
        }
        switch (msg.type) {
          case 'orders_snapshot': {
            // Use more efficient object creation
            const openMap: Record<number, OrderExternal> = {};
            const balMap: Record<string, BalanceExternal> = {};
            
            // Process in smaller chunks to avoid blocking
            const processOrders = () => {
              if (msg.openOrders) {
                for (const o of msg.openOrders) {
                  if (o.orderId != null) openMap[o.orderId] = o;
                }
              }
            };
            
            const processBalances = () => {
              if (msg.balances) {
                for (const b of msg.balances) {
                  balMap[b.asset] = b;
                }
              }
            };
            
            processOrders();
            processBalances();
            
            setState(s => ({
              ...s,
              openOrders: openMap,
              balances: balMap,
              history: msg.history || s.history,
              lastSnapshotTs: Date.now(),
              lastEventAgeMs: msg.lastEventAgeMs ?? s.lastEventAgeMs,
              fallback: msg.fallback === true
            }));
            break;
          }
        case 'order_store_batch': {
          // Process asynchronously to avoid blocking main thread
          setTimeout(() => {
            setState(s => {
              const openOrders = { ...s.openOrders };
              const balances = { ...s.balances };
              
              for (const ev of msg.events || []) {
                if (ev.type === 'order_delta' && ev.order?.orderId != null) {
                  openOrders[ev.order.orderId] = { ...openOrders[ev.order.orderId], ...ev.order };
                  if (!['NEW','PARTIALLY_FILLED'].includes(ev.order.status)) {
                    if (['FILLED','CANCELED','REJECTED','EXPIRED'].includes(ev.order.status)) {
                      delete openOrders[ev.order.orderId];
                    }
                  }
                } else if (ev.type === 'balance_delta') {
                  (ev.balances || []).forEach((b: BalanceExternal) => { balances[b.asset] = b; });
                }
              }
              return { ...s, openOrders, balances, lastEventAgeMs: msg.lastEventAgeMs ?? s.lastEventAgeMs, schemaVersion: msg.schemaVersion };
            });
          }, 0);
          break;
        }
        case 'user_heartbeat': {
          setState(s => ({ ...s, lastEventAgeMs: msg.lastEventAgeMs ?? s.lastEventAgeMs }));
          break;
        }
        case 'system': {
          setState(s => ({ ...s, systemMessages: [...s.systemMessages.slice(-19), { level: msg.level, message: msg.message, ts: Date.now() }] }));
          break;
        }
        default:
          break;
      }
      }, 0); // Close setTimeout
    });
    return () => { client.destroy(); };
  }, [baseUrl]);

  const sendResnapshot = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.isConnected()) {
      ws.send({ type: 'resnapshot' });
    } else {
      ws.waitUntilOpen(4000).then(() => ws.send({ type: 'resnapshot' })).catch(() => {
        // silently ignore timeout
      });
    }
  }, []);

  const getFreshnessCategory = useCallback(() => {
    const f = state.freshnessMs ?? state.lastEventAgeMs;
    if (f == null) return 'unknown';
    if (f < 5000) return 'green';
    if (f < 15000) return 'yellow';
    return 'red';
  }, [state.freshnessMs, state.lastEventAgeMs]);

  const value = useMemo(() => ({ state, sendResnapshot, getFreshnessCategory, addPendingOrder, addOptimisticCancel }), [state, sendResnapshot, getFreshnessCategory, addPendingOrder, addOptimisticCancel]);
  return <UserStreamContext.Provider value={value}>{children}</UserStreamContext.Provider>;
};

export function useUserStream() {
  const ctx = useContext(UserStreamContext);
  if (!ctx) throw new Error('useUserStream must be used within UserStreamProvider');
  return ctx;
}
