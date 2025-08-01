import { Text } from '@mantine/core';

interface PriceCellProps {
  price: number;
  change?: 'up' | 'down';
  isUSDT?: boolean;
  decimals?: number;
  ta?: 'left' | 'right' | 'center';
}

export const PriceCell = ({ 
  price, 
  change, 
  isUSDT = false, 
  decimals = 4,
  ta = 'right' 
}: PriceCellProps) => {
  const animationStyle = change 
    ? {
        backgroundColor: change === 'up' ? '#4CAF5020' : '#f4433620',
        transition: 'background-color 0.3s ease',
      }
    : {};

  const formattedPrice = isUSDT ? '$1.00' : `$${price.toFixed(decimals)}`;

  return (
    <Text 
      ta={ta}
      ff="monospace"
      style={animationStyle}
      px="xs"
      py="2px"
      size="sm"
    >
      {formattedPrice}
    </Text>
  );
};
