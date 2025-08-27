/**
 * ChartSettings Component Tests
 * 
 * Testy dla komponentu ustawień wykresu
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import ChartSettings from './ChartSettings';

// Helper component to wrap tests with MantineProvider
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MantineProvider>{children}</MantineProvider>
);

describe('ChartSettings', () => {
  const defaultProps = {
    onThemeChange: jest.fn(),
    onColorSchemeChange: jest.fn(),
    onVolumeToggle: jest.fn(),
    currentTheme: true,
    currentColorScheme: 'default' as const,
    showVolume: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders chart settings component', () => {
    render(
      <TestWrapper>
        <ChartSettings {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText('Ustawienia Wykresu')).toBeInTheDocument();
  });

  it('displays current color scheme correctly', () => {
    render(
      <TestWrapper>
        <ChartSettings {...defaultProps} />
      </TestWrapper>
    );

    // Expand settings
    const expandButton = screen.getByRole('button');
    fireEvent.click(expandButton);

    expect(screen.getByDisplayValue('default')).toBeInTheDocument();
  });

  it('calls onThemeChange when theme toggle is clicked', () => {
    render(
      <TestWrapper>
        <ChartSettings {...defaultProps} />
      </TestWrapper>
    );

    // Expand settings
    const expandButton = screen.getByRole('button');
    fireEvent.click(expandButton);

    // Find theme toggle switch
    const themeSwitch = screen.getByTestId('theme-switch');
    fireEvent.click(themeSwitch);

    expect(defaultProps.onThemeChange).toHaveBeenCalledWith(false);
  });

  it('calls onColorSchemeChange when color scheme is changed', () => {
    render(
      <TestWrapper>
        <ChartSettings {...defaultProps} />
      </TestWrapper>
    );

    // Expand settings
    const expandButton = screen.getByRole('button');
    fireEvent.click(expandButton);

    // Find and click classic color scheme button
    const classicButton = screen.getByTestId('color-scheme-classic');
    fireEvent.click(classicButton);

    expect(defaultProps.onColorSchemeChange).toHaveBeenCalledWith('classic');
  });

  it('shows correct color swatches for current scheme', () => {
    render(
      <TestWrapper>
        <ChartSettings 
          {...defaultProps} 
          currentColorScheme="modern"
        />
      </TestWrapper>
    );

    // Expand settings
    const expandButton = screen.getByRole('button');
    fireEvent.click(expandButton);

    // Check that modern color scheme description is shown
    expect(screen.getByText('Współczesny design z żółtymi akcentami')).toBeInTheDocument();
  });

  it('calls onVolumeToggle when volume switch is toggled', () => {
    render(
      <TestWrapper>
        <ChartSettings {...defaultProps} />
      </TestWrapper>
    );

    // Expand settings
    const expandButton = screen.getByRole('button');
    fireEvent.click(expandButton);

    // Find volume toggle switch
    const volumeSwitch = screen.getByTestId('volume-switch');
    fireEvent.click(volumeSwitch);

    expect(defaultProps.onVolumeToggle).toHaveBeenCalledWith(true);
  });
});
