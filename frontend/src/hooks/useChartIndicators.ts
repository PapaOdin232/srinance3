import { useRef, useCallback, useState } from 'react';
import { LineSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, LineData } from 'lightweight-charts';
import type { CandleData } from '../indicators';
import {
  calculateRSI,
  calculateMovingAverage,
  calculateMACD,
  calculateBollingerBands,
  DEFAULT_RSI_CONFIG,
  DEFAULT_MA_CONFIG,
  DEFAULT_MACD_CONFIG,
  DEFAULT_BOLLINGER_BANDS_CONFIG,
  type RSIConfig,
  type MovingAverageConfig,
  type MACDConfig,
  type BollingerBandsConfig
} from '../indicators';

export interface IndicatorSeries {
  id: string;
  type: 'RSI' | 'MA' | 'MACD' | 'BB';
  name: string;
  series: ISeriesApi<'Line'>[];
  visible: boolean;
  config: any;
}

/**
 * Hook for managing technical indicators on charts
 */
export function useChartIndicators(chartInstance: IChartApi | null) {
  const [indicators, setIndicators] = useState<IndicatorSeries[]>([]);
  const indicatorsRef = useRef<IndicatorSeries[]>([]);

  // Update ref when indicators change
  useCallback(() => {
    indicatorsRef.current = indicators;
  }, [indicators]);

  // Convert CandlestickData to CandleData format
  const convertToIndicatorData = useCallback((data: any[]): CandleData[] => {
    return data.map(item => ({
      time: typeof item.time === 'number' ? item.time : new Date(item.time).getTime() / 1000,
      open: typeof item.open === 'number' ? item.open : parseFloat(item.open),
      high: typeof item.high === 'number' ? item.high : parseFloat(item.high),
      low: typeof item.low === 'number' ? item.low : parseFloat(item.low),
      close: typeof item.close === 'number' ? item.close : parseFloat(item.close),
      volume: item.volume ? (typeof item.volume === 'number' ? item.volume : parseFloat(item.volume)) : undefined
    }));
  }, []);

  // Add RSI indicator
  const addRSI = useCallback((data: any[], config: RSIConfig = DEFAULT_RSI_CONFIG) => {
    if (!chartInstance) return null;

    const indicatorData = convertToIndicatorData(data);
    const rsiValues = calculateRSI(indicatorData, config);
    
    const rsiSeries = chartInstance.addSeries(LineSeries, {
      color: '#FF6B35',
      lineWidth: 2,
      title: `RSI(${config.period})`,
      priceScaleId: 'rsi',
    });

    // Convert to LineData format
    const lineData: LineData[] = rsiValues.map(value => ({
      time: value.time as any,
      value: value.value
    }));

    rsiSeries.setData(lineData);

    // Add horizontal lines for overbought/oversold levels
    const overboughtSeries = chartInstance.addSeries(LineSeries, {
      color: '#FF4444',
      lineWidth: 1,
      lineStyle: 2, // dashed
      priceScaleId: 'rsi',
    });

    const oversoldSeries = chartInstance.addSeries(LineSeries, {
      color: '#44FF44',
      lineWidth: 1,
      lineStyle: 2, // dashed
      priceScaleId: 'rsi',
    });

    // Create horizontal line data
    if (rsiValues.length > 0) {
      const startTime = rsiValues[0].time;
      const endTime = rsiValues[rsiValues.length - 1].time;
      
      overboughtSeries.setData([
        { time: startTime as any, value: config.overbought },
        { time: endTime as any, value: config.overbought }
      ]);

      oversoldSeries.setData([
        { time: startTime as any, value: config.oversold },
        { time: endTime as any, value: config.oversold }
      ]);
    }

    const indicator: IndicatorSeries = {
      id: `rsi-${Date.now()}`,
      type: 'RSI',
      name: `RSI(${config.period})`,
      series: [rsiSeries, overboughtSeries, oversoldSeries],
      visible: true,
      config
    };

    setIndicators(prev => [...prev, indicator]);
    return indicator.id;
  }, [chartInstance, convertToIndicatorData]);

  // Add Moving Average indicator
  const addMovingAverage = useCallback((data: any[], config: MovingAverageConfig = DEFAULT_MA_CONFIG) => {
    if (!chartInstance) return null;

    const indicatorData = convertToIndicatorData(data);
    const maValues = calculateMovingAverage(indicatorData, config);
    
    const maSeries = chartInstance.addSeries(LineSeries, {
      color: config.type === 'SMA' ? '#2962FF' : '#FF9800',
      lineWidth: 2,
      title: `${config.type}(${config.period})`,
    });

    const lineData: LineData[] = maValues.map(value => ({
      time: value.time as any,
      value: value.value
    }));

    maSeries.setData(lineData);

    const indicator: IndicatorSeries = {
      id: `ma-${Date.now()}`,
      type: 'MA',
      name: `${config.type}(${config.period})`,
      series: [maSeries],
      visible: true,
      config
    };

    setIndicators(prev => [...prev, indicator]);
    return indicator.id;
  }, [chartInstance, convertToIndicatorData]);

  // Add MACD indicator
  const addMACD = useCallback((data: any[], config: MACDConfig = DEFAULT_MACD_CONFIG) => {
    if (!chartInstance) return null;

    const indicatorData = convertToIndicatorData(data);
    const macdValues = calculateMACD(indicatorData, config);
    
    const macdSeries = chartInstance.addSeries(LineSeries, {
      color: '#2196F3',
      lineWidth: 2,
      title: `MACD(${config.fastPeriod},${config.slowPeriod},${config.signalPeriod})`,
      priceScaleId: 'macd',
    });

    const signalSeries = chartInstance.addSeries(LineSeries, {
      color: '#FF5722',
      lineWidth: 2,
      title: 'Signal',
      priceScaleId: 'macd',
    });

    const macdLineData: LineData[] = macdValues.map(value => ({
      time: value.time as any,
      value: value.macd
    }));

    const signalLineData: LineData[] = macdValues.map(value => ({
      time: value.time as any,
      value: value.signal
    }));

    macdSeries.setData(macdLineData);
    signalSeries.setData(signalLineData);

    const indicator: IndicatorSeries = {
      id: `macd-${Date.now()}`,
      type: 'MACD',
      name: `MACD(${config.fastPeriod},${config.slowPeriod},${config.signalPeriod})`,
      series: [macdSeries, signalSeries],
      visible: true,
      config
    };

    setIndicators(prev => [...prev, indicator]);
    return indicator.id;
  }, [chartInstance, convertToIndicatorData]);

  // Add Bollinger Bands indicator
  const addBollingerBands = useCallback((data: any[], config: BollingerBandsConfig = DEFAULT_BOLLINGER_BANDS_CONFIG) => {
    if (!chartInstance) return null;

    const indicatorData = convertToIndicatorData(data);
    const bbValues = calculateBollingerBands(indicatorData, config);
    
    const upperSeries = chartInstance.addSeries(LineSeries, {
      color: '#9C27B0',
      lineWidth: 1,
      title: `BB Upper(${config.period})`,
    });

    const middleSeries = chartInstance.addSeries(LineSeries, {
      color: '#673AB7',
      lineWidth: 2,
      title: `BB Middle(${config.period})`,
    });

    const lowerSeries = chartInstance.addSeries(LineSeries, {
      color: '#9C27B0',
      lineWidth: 1,
      title: `BB Lower(${config.period})`,
    });

    const upperData: LineData[] = bbValues.map(value => ({
      time: value.time as any,
      value: value.upper
    }));

    const middleData: LineData[] = bbValues.map(value => ({
      time: value.time as any,
      value: value.middle
    }));

    const lowerData: LineData[] = bbValues.map(value => ({
      time: value.time as any,
      value: value.lower
    }));

    upperSeries.setData(upperData);
    middleSeries.setData(middleData);
    lowerSeries.setData(lowerData);

    const indicator: IndicatorSeries = {
      id: `bb-${Date.now()}`,
      type: 'BB',
      name: `BB(${config.period})`,
      series: [upperSeries, middleSeries, lowerSeries],
      visible: true,
      config
    };

    setIndicators(prev => [...prev, indicator]);
    return indicator.id;
  }, [chartInstance, convertToIndicatorData]);

  // Remove indicator
  const removeIndicator = useCallback((indicatorId: string) => {
    if (!chartInstance) return;

    const indicator = indicators.find(ind => ind.id === indicatorId);
    if (indicator) {
      indicator.series.forEach(series => {
        chartInstance.removeSeries(series);
      });

      setIndicators(prev => prev.filter(ind => ind.id !== indicatorId));
    }
  }, [chartInstance, indicators]);

  // Toggle indicator visibility
  const toggleIndicator = useCallback((indicatorId: string) => {
    setIndicators(prev => prev.map(indicator => {
      if (indicator.id === indicatorId) {
        const newVisibility = !indicator.visible;
        indicator.series.forEach(series => {
          series.applyOptions({
            visible: newVisibility
          });
        });
        return { ...indicator, visible: newVisibility };
      }
      return indicator;
    }));
  }, []);

  // Clear all indicators
  const clearAllIndicators = useCallback(() => {
    if (!chartInstance) return;

    indicators.forEach(indicator => {
      indicator.series.forEach(series => {
        chartInstance.removeSeries(series);
      });
    });

    setIndicators([]);
  }, [chartInstance, indicators]);

  return {
    indicators,
    addRSI,
    addMovingAverage,
    addMACD,
    addBollingerBands,
    removeIndicator,
    toggleIndicator,
    clearAllIndicators
  };
}
