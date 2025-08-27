// components/TradingChart.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData
} from 'lightweight-charts';
import type { BinanceKlineData } from '../types/trading';

interface TradingChartProps {
  symbol: string;
  interval: string;
}

const TradingChart: React.FC<TradingChartProps> = ({ symbol, interval }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [currentData, setCurrentData] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  // Convert Binance kline data to chart format
  const convertBinanceData = (klineData: BinanceKlineData) => {
    const { k } = klineData;
    const time = Math.floor(k.t / 1000) as any; // Convert to seconds

    const candlestick: CandlestickData = {
      time,
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
    };

    const volume: HistogramData = {
      time,
      value: parseFloat(k.v),
    };

    return { candlestick, volume };
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 600,
    });

    // Create candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {});

    // Create volume series on separate scale
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });

    // Position volume at bottom (30% of chart height)
    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.7,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.resize(
          chartContainerRef.current.clientWidth,
          600
        );
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Load historical data from Binance REST API
  useEffect(() => {
    const loadHistoricalData = async () => {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`
        );
        const data = await response.json();

        const candlesticks: CandlestickData[] = data.map((item: any) => ({
          time: Math.floor(item[0] / 1000),
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
        }));

        const volumes: HistogramData[] = data.map((item: any) => ({
          time: Math.floor(item[0] / 1000) as any,
          value: parseFloat(item[5]),
        }));

        if (candlestickSeriesRef.current && volumeSeriesRef.current) {
          candlestickSeriesRef.current.setData(candlesticks);
          volumeSeriesRef.current.setData(volumes);
        }

        // Set current data from last candle
        const lastCandle = candlesticks[candlesticks.length - 1];
        const lastVolume = volumes[volumes.length - 1];
        if (lastCandle && lastVolume) {
          setCurrentData({
            open: lastCandle.open,
            high: lastCandle.high,
            low: lastCandle.low,
            close: lastCandle.close,
            volume: lastVolume.value,
          });
        }
      } catch (error) {
        console.error('Error loading historical data:', error);
      }
    };

    loadHistoricalData();
  }, [symbol, interval]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    // Skip WebSocket connection in development to avoid CORS issues
    if (process.env.NODE_ENV === 'development') {
      console.log('Skipping WebSocket connection in development mode');
      return;
    }

    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    // Use alternative WebSocket endpoint that works better with CORS
    const ws = new WebSocket(`wss://data-stream.binance.vision/ws/${streamName}`);

    ws.onopen = () => {
      console.log(`Connected to ${streamName}`);
    };

    ws.onmessage = (event) => {
      try {
        const data: BinanceKlineData = JSON.parse(event.data);
        const { candlestick, volume } = convertBinanceData(data);

        // Update current data for display
        setCurrentData({
          open: candlestick.open,
          high: candlestick.high,
          low: candlestick.low,
          close: candlestick.close,
          volume: volume.value,
        });

        if (candlestickSeriesRef.current && volumeSeriesRef.current) {
          // Always update the current candle (whether closed or not)
          candlestickSeriesRef.current.update(candlestick);
          volumeSeriesRef.current.update(volume);
        }
      } catch (error) {
        console.error('Error parsing WebSocket data:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      console.log('Trying to reconnect in 5 seconds...');
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          // Reconnect logic could be added here
        }
      }, 5000);
    };

    ws.onclose = (event) => {
      console.log('WebSocket connection closed', event.code, event.reason);
    };

    wsRef.current = ws;

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [symbol, interval]);

  return (
    <div className="w-full">
      {/* Price info header */}
      <div className="flex items-center space-x-4 p-4 border-b">
        <span className="font-bold">{symbol}</span>
        <span>{interval}</span>
        {currentData && (
          <div className="flex items-center space-x-2 text-sm">
            <span>O: {currentData.open.toFixed(2)}</span>
            <span>H: {currentData.high.toFixed(2)}</span>
            <span>L: {currentData.low.toFixed(2)}</span>
            <span>C: {currentData.close.toFixed(2)}</span>
            <span>V: {currentData.volume.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Chart container */}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};

export default TradingChart;
