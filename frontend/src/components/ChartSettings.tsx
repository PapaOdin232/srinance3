/**
 * ChartSettings - Komponent do konfiguracji wyglądu wykresu
 * 
 * Oferuje użytkownikowi opcje dostosowania:
 * - Schematy kolorów świec
 * - Tryb jasny/ciemny
 * - Opcje wyświetlania
 */

import React, { useState } from 'react';
import {
  Paper,
  Group,
  Stack,
  Button,
  Select,
  Switch,
  Text,
  Divider,
  ColorSwatch,
  SimpleGrid
} from '@mantine/core';
import { IconSettings, IconPalette, IconSun, IconMoon, IconChevronDown, IconChevronUp } from '@tabler/icons-react';

import ChartPreview from './ChartPreview';

interface ChartSettingsProps {
  onThemeChange: (isDark: boolean) => void;
  onColorSchemeChange: (scheme: 'default' | 'classic' | 'modern' | 'minimal') => void;
  onVolumeToggle: (show: boolean) => void;
  currentTheme?: boolean; // true = dark, false = light
  currentColorScheme?: 'default' | 'classic' | 'modern' | 'minimal';
  showVolume?: boolean;
}

interface ColorScheme {
  label: string;
  description: string;
  upColor: string;
  downColor: string;
}

const colorSchemes: Record<string, ColorScheme> = {
  default: {
    label: 'Domyślny',
    description: 'Profesjonalne kolory teal i czerwony',
    upColor: '#26A69A',
    downColor: '#EF5350'
  },
  classic: {
    label: 'Klasyczny',
    description: 'Tradycyjne zielono-czerwone kolory giełdy',
    upColor: '#00C851',
    downColor: '#FF4444'
  },
  modern: {
    label: 'Nowoczesny',
    description: 'Współczesny design z żółtymi akcentami',
    upColor: '#10B981',
    downColor: '#F59E0B'
  },
  minimal: {
    label: 'Minimalistyczny',
    description: 'Subtelne kolory dla czystego wyglądu',
    upColor: '#4ADE80',
    downColor: '#F87171'
  }
};

export const ChartSettings: React.FC<ChartSettingsProps> = ({
  onThemeChange,
  onColorSchemeChange,
  onVolumeToggle,
  currentTheme = true,
  currentColorScheme = 'default',
  showVolume = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleColorSchemeChange = (scheme: string | null) => {
    if (scheme && scheme in colorSchemes) {
      onColorSchemeChange(scheme as 'default' | 'classic' | 'modern' | 'minimal');
    }
  };

  return (
    <Paper shadow="sm" p="md" radius="md" style={{ marginBottom: '1rem' }}>
      <Group justify="space-between" mb="sm">
        <Group>
          <IconSettings size={20} />
          <Text fw={500}>Ustawienia Wykresu</Text>
        </Group>
        <Button
          variant="light"
          onClick={() => setIsExpanded(!isExpanded)}
          size="sm"
          className="chart-settings-button"
          leftSection={<IconPalette size={18} />}
          rightSection={isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        >
          {isExpanded ? 'Zwiń' : 'Rozwiń'}
        </Button>
      </Group>

      {isExpanded && (
        <Stack gap="md">
          <Divider />
          
          {/* Tryb ciemny/jasny */}
          <Group justify="space-between">
            <Group>
              {currentTheme ? <IconMoon size={16} /> : <IconSun size={16} />}
              <Text size="sm">Motyw</Text>
            </Group>
            <Switch
              checked={currentTheme}
              onChange={(event) => onThemeChange(event.currentTarget.checked)}
              onLabel="Ciemny"
              offLabel="Jasny"
              size="sm"
              className="theme-switch"
              data-testid="theme-switch"
            />
          </Group>

          {/* Schemat kolorów */}
          <Stack gap="xs">
            <Text size="sm" fw={500}>Schemat Kolorów Świec</Text>
            <Select
              value={currentColorScheme}
              onChange={handleColorSchemeChange}
              data={Object.entries(colorSchemes).map(([key, scheme]) => ({
                value: key,
                label: scheme.label
              }))}
              size="sm"
            />
            
            {/* Podgląd kolorów */}
            <Group gap="xs" mt="xs">
              <Text size="xs" c="dimmed">Podgląd:</Text>
              <ColorSwatch 
                color={colorSchemes[currentColorScheme].upColor} 
                size={20}
                radius="sm"
                className="color-swatch-preview"
              />
              <Text size="xs" c="dimmed">Wzrost</Text>
              <ColorSwatch 
                color={colorSchemes[currentColorScheme].downColor} 
                size={20}
                radius="sm"
                className="color-swatch-preview"
              />
              <Text size="xs" c="dimmed">Spadek</Text>
            </Group>
            <Text size="xs" c="dimmed">
              {colorSchemes[currentColorScheme].description}
            </Text>
          </Stack>

          {/* Szybkie przyciski schematów */}
          <Stack gap="xs">
            <Text size="sm" fw={500}>Szybki Wybór</Text>
            <SimpleGrid cols={2} spacing="xs">
              {Object.entries(colorSchemes).map(([key, scheme]) => (
                <Button
                  key={key}
                  variant={currentColorScheme === key ? 'filled' : 'light'}
                  size="xs"
                  onClick={() => handleColorSchemeChange(key)}
                  className={`color-scheme-button ${currentColorScheme === key ? 'active' : ''}`}
                  leftSection={
                    <Group gap={4}>
                      <ColorSwatch color={scheme.upColor} size={12} radius="sm" />
                      <ColorSwatch color={scheme.downColor} size={12} radius="sm" />
                    </Group>
                  }
                  data-testid={`color-scheme-${key}`}
                >
                  {scheme.label}
                </Button>
              ))}
            </SimpleGrid>
          </Stack>

          {/* Opcje wyświetlania */}
          <Stack gap="xs">
            <Text size="sm" fw={500}>Opcje Wyświetlania</Text>
            <Group justify="space-between">
              <Text size="sm">Pokaż wolumen</Text>
              <Switch
                checked={showVolume}
                onChange={(event) => onVolumeToggle(event.currentTarget.checked)}
                size="sm"
                data-testid="volume-switch"
              />
            </Group>
          </Stack>

          {/* Podgląd wykresu */}
          <Stack gap="xs">
            <Text size="sm" fw={500}>Podgląd</Text>
            <ChartPreview 
              colorScheme={currentColorScheme}
              isDarkTheme={currentTheme}
            />
          </Stack>
        </Stack>
      )}
    </Paper>
  );
};

export default ChartSettings;
