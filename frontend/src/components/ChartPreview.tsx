/**
 * ChartPreview - Miniaturowy podgląd wyglądu wykresu świecowego
 * 
 * Pokazuje przykładowe świece z aktualnym schematem kolorów
 */

import React from 'react';
import { Paper, Group, Stack, Text, Box } from '@mantine/core';
import { IconTrendingUp, IconTrendingDown } from '@tabler/icons-react';

interface ChartPreviewProps {
  colorScheme: 'default' | 'classic' | 'modern' | 'minimal';
  isDarkTheme: boolean;
}

const colorSchemes = {
  default: {
    upColor: '#26A69A',
    downColor: '#EF5350',
    borderUpColor: '#1B5E20',
    borderDownColor: '#C62828',
  },
  classic: {
    upColor: '#00C851',
    downColor: '#FF4444',
    borderUpColor: '#00701A',
    borderDownColor: '#CC0000',
  },
  modern: {
    upColor: '#10B981',
    downColor: '#F59E0B',
    borderUpColor: '#047857',
    borderDownColor: '#D97706',
  },
  minimal: {
    upColor: '#4ADE80',
    downColor: '#F87171',
    borderUpColor: '#22C55E',
    borderDownColor: '#EF4444',
  }
};

// Przykładowe dane świec do podglądu
const sampleCandles = [
  { type: 'up', height: 24, bodyHeight: 16 },
  { type: 'down', height: 28, bodyHeight: 20 },
  { type: 'up', height: 32, bodyHeight: 12 },
  { type: 'down', height: 20, bodyHeight: 14 },
  { type: 'up', height: 26, bodyHeight: 18 }
];

export const ChartPreview: React.FC<ChartPreviewProps> = ({ colorScheme, isDarkTheme }) => {
  const colors = colorSchemes[colorScheme];
  
  const renderCandle = (candle: typeof sampleCandles[0], index: number) => {
    const isUp = candle.type === 'up';
    const candleColor = isUp ? colors.upColor : colors.downColor;
    const borderColor = isUp ? colors.borderUpColor : colors.borderDownColor;
    
    return (
      <div
        key={index}
        className="chart-preview-candle"
        style={{
          width: 12,
          height: candle.height,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isUp ? 'flex-end' : 'flex-start'
        }}
      >
        {/* Knot (wick) */}
        <div
          style={{
            width: 1,
            height: candle.height,
            backgroundColor: borderColor,
            position: 'absolute',
            top: 0
          }}
        />
        
        {/* Korpus świecy */}
        <div
          style={{
            width: 8,
            height: candle.bodyHeight,
            backgroundColor: isUp ? candleColor : isDarkTheme ? '#0D1117' : '#FFFFFF',
            border: `1px solid ${borderColor}`,
            marginTop: isUp ? 0 : (candle.height - candle.bodyHeight) / 2,
            marginBottom: isUp ? (candle.height - candle.bodyHeight) / 2 : 0
          }}
        />
      </div>
    );
  };

  return (
    <Paper 
      p="sm" 
      radius="md"
      className="chart-preview-container"
      style={{ 
        backgroundColor: isDarkTheme ? '#161B22' : '#F8F9FA',
        border: `1px solid ${isDarkTheme ? '#30363D' : '#E9ECEF'}`
      }}
    >
      <Stack gap="xs">
        <Text size="xs" fw={500} c="dimmed" ta="center">
          Podgląd świec
        </Text>
        
        {/* Miniaturowy wykres */}
        <Box
          style={{
            height: 60,
            backgroundColor: isDarkTheme ? '#0D1117' : '#FFFFFF',
            border: `1px solid ${isDarkTheme ? '#30363D' : '#E9ECEF'}`,
            borderRadius: 4,
            padding: 8,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: 4
          }}
        >
          {sampleCandles.map(renderCandle)}
        </Box>
        
        {/* Legenda kolorów */}
        <Group justify="space-around" gap="xs">
          <Group gap={4}>
            <IconTrendingUp size={12} color={colors.upColor} />
            <Text size="xs" c="dimmed">Wzrost</Text>
            <Box 
              w={12} 
              h={12} 
              style={{ 
                backgroundColor: colors.upColor,
                border: `1px solid ${colors.borderUpColor}`,
                borderRadius: 2
              }} 
            />
          </Group>
          
          <Group gap={4}>
            <IconTrendingDown size={12} color={colors.downColor} />
            <Text size="xs" c="dimmed">Spadek</Text>
            <Box 
              w={12} 
              h={12} 
              style={{ 
                backgroundColor: colors.downColor,
                border: `1px solid ${colors.borderDownColor}`,
                borderRadius: 2
              }} 
            />
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
};

export default ChartPreview;
