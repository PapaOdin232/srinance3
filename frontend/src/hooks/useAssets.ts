import { useEffect, useState } from 'react';
import { fetchAllTradingPairs } from '../services/binanceAPI';
import BinanceTickerWSClient from '../services/BinanceTickerWSClient';
import type { BinanceTicker24hr } from '../services/BinanceTickerWSClient';
import type { Asset } from '../types/asset';

export interface UseAssetsReturn {
  assets: Asset[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  isConnected: boolean;
  setPreferredQuotes: (quotes: string[] | null) => void;
}

type AssetsState = {
  assets: Asset[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
};

const MAX_SUBSCRIPTIONS = Number((typeof process !== 'undefined' && (process as any).env?.VITE_MAX_TICKER_SUBS) || 100);
// UPDATED: Prefer USDC (MiCA-compliant) for portfolio calculations
const MARKET_QUOTES: string[] = (((typeof process !== 'undefined' && (process as any).env?.VITE_MARKET_QUOTES) || 'USDC,USDT,BTC,ETH,BNB'))
  .split(',')
  .map((q: string) => q.trim().toUpperCase())
  .filter(Boolean);
const FETCH_COOLDOWN = 60000; // 60s
const UPDATE_THROTTLE_MS = 750; // Increased from 500ms to 750ms for better performance

// Portfolio-focused quotes to reduce double-counting in valuation
const PORTFOLIO_PREFERRED_QUOTES = ['USDC']; // Single quote for portfolio to prevent duplication

class AssetStore {
  state: AssetsState = { assets: [], loading: true, error: null, isConnected: false };
  subscribers = new Set<(s: AssetsState) => void>();
  initialized = false;
  wsClient: BinanceTickerWSClient | null = null;
  connectionInterval: number | null = null;
  refreshInterval: number | null = null;
  lastFetch = 0;
  pendingTickers = new Map<string, BinanceTicker24hr>();
  throttleTimer: number | null = null;
  preferredQuotes: string[] | null = null; // when set, prioritize these quotes for subscriptions

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.fetchAssets(true);

    // Fallback periodic refresh if WS not connected
    this.refreshInterval = window.setInterval(() => {
      const connected = this.wsClient?.isConnected ?? false;
      if (!connected) this.fetchAssets(false);
    }, 120000);

    window.addEventListener('beforeunload', () => this.destroy());
  }

  destroy() {
    if (this.connectionInterval) {
      clearInterval(this.connectionInterval);
      this.connectionInterval = null;
    }
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    if (this.wsClient) {
      this.wsClient.destroy();
      this.wsClient = null;
    }
    this.subscribers.clear();
    this.initialized = false;
  }

  notify() {
    for (const cb of this.subscribers) cb(this.state);
  }

  async fetchAssets(force = false) {
    const now = Date.now();
    if (!force && now - this.lastFetch < FETCH_COOLDOWN) return;

    try {
      this.state = { ...this.state, loading: true, error: null };
      this.notify();
      const data = await fetchAllTradingPairs();
      this.state = { ...this.state, assets: data, loading: false };
      this.lastFetch = now;
      this.notify();
      if (!this.wsClient) this.initWS();
      else this.updateSubscriptions();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch assets';
      this.state = { ...this.state, error: msg, loading: false };
      this.notify();
    }
  }

  initWS() {
    if (this.wsClient) return;
    this.wsClient = new BinanceTickerWSClient();
    this.wsClient.addListener((tickers) => this.onTickers(tickers));
    // Connection monitor
    this.connectionInterval = window.setInterval(() => {
      const connected = this.wsClient?.isConnected ?? false;
      if (connected !== this.state.isConnected) {
        this.state = { ...this.state, isConnected: connected };
        this.notify();
      }
    }, 5000);
    this.updateSubscriptions();
  }

  updateSubscriptions() {
    if (!this.wsClient || this.state.assets.length === 0) return;
    
    // Use portfolio-preferred quotes if no specific preference is set, or use user preference
    const allowedQuotes = (this.preferredQuotes && this.preferredQuotes.length > 0)
      ? this.preferredQuotes.map(q => q.toUpperCase())
      : PORTFOLIO_PREFERRED_QUOTES.length > 0 
        ? PORTFOLIO_PREFERRED_QUOTES 
        : MARKET_QUOTES;
        
    console.log(`[Assets] Using quotes for subscriptions: ${allowedQuotes.join(', ')}`);
    const candidates = this.state.assets.filter(a => allowedQuotes.includes(a.quoteAsset));

    // Equal allocation of subscriptions per market, to avoid favoring only one quote
    const perQuote = Math.max(1, Math.floor(MAX_SUBSCRIPTIONS / Math.max(1, allowedQuotes.length)));
    const byQuote = new Map<string, Asset[]>();
    for (const q of allowedQuotes) byQuote.set(q, []);
    for (const a of candidates) byQuote.get(a.quoteAsset)?.push(a);
    for (const [_q, arr] of byQuote) arr.sort((a, b) => b.volume - a.volume);

    const picked: Asset[] = [];
    for (const q of allowedQuotes) {
      const arr = byQuote.get(q) || [];
      picked.push(...arr.slice(0, perQuote));
    }

    // If we still have free slots, fill with highest volume regardless of quote
    if (picked.length < MAX_SUBSCRIPTIONS) {
      const pickedSet = new Set(picked.map(a => a.symbol));
      const remaining = candidates
        .filter(a => !pickedSet.has(a.symbol))
        .sort((a, b) => b.volume - a.volume);
      picked.push(...remaining.slice(0, MAX_SUBSCRIPTIONS - picked.length));
    }

    const symbols = Array.from(new Set(picked.map(a => a.symbol)));
    console.log(`[Assets] Subscribing to ${symbols.length} symbols across ${allowedQuotes.length} quotes`);
    this.wsClient.setSubscriptions(symbols);
  }

  setPreferredQuotes(quotes: string[] | null) {
    this.preferredQuotes = quotes && quotes.length ? quotes.map(q => q.toUpperCase()) : null;
    this.updateSubscriptions();
  }

  onTickers(tickers: BinanceTicker24hr[]) {
    for (const t of tickers) this.pendingTickers.set(t.s, t);
    if (this.throttleTimer === null) {
      this.throttleTimer = window.setTimeout(() => {
        this.throttleTimer = null;
        if (this.pendingTickers.size === 0) return;
        
        const updates = new Map(this.pendingTickers);
        this.pendingTickers.clear();
        
        // Optimized: update only changed assets, preserve references for unchanged ones
        const next = this.state.assets.map(a => {
          const t = updates.get(a.symbol);
          if (!t) return a; // Preserve reference for unchanged assets
          
          const newPrice = parseFloat(t.c);
          const newChangePercent = parseFloat(t.P);
          const newVolume = parseFloat(t.q);
          const newHighPrice = parseFloat(t.h);
          const newLowPrice = parseFloat(t.l);
          
          // Check if values actually changed to avoid unnecessary object creation
          if (a.price === newPrice && a.priceChangePercent === newChangePercent && 
              a.volume === newVolume && a.highPrice === newHighPrice && a.lowPrice === newLowPrice) {
            return a; // No change, preserve reference
          }
          
          return {
            ...a,
            price: newPrice,
            priceChangePercent: newChangePercent,
            volume: newVolume,
            highPrice: newHighPrice,
            lowPrice: newLowPrice,
          } as Asset;
        });
        this.state = { ...this.state, assets: next };
        this.notify();
      }, UPDATE_THROTTLE_MS);
    }
  }
}

const store = new AssetStore();

export const useAssets = (): UseAssetsReturn => {
  const [state, setState] = useState<AssetsState>(store.state);

  useEffect(() => {
    store.init();
    setState(store.state);
    const cb = (s: AssetsState) => setState(s);
    store.subscribers.add(cb);
    return () => {
      store.subscribers.delete(cb);
      // Don't destroy global store on unmount of a single consumer
    };
  }, []);

  return {
    assets: state.assets,
    loading: state.loading,
    error: state.error,
    refetch: () => store.fetchAssets(true),
    isConnected: state.isConnected,
  setPreferredQuotes: (quotes: string[] | null) => store.setPreferredQuotes(quotes),
  };
};
