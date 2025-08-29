import { Badge, Tooltip } from '@mantine/core';

interface FreshnessBadgeProps {
  freshnessMs: number;
  fallback?: boolean;
}

function getCategory(freshnessMs: number, fallback?: boolean): { color: string; label: string } {
  if (fallback) return { color: 'gray', label: 'Fallback REST' };
  if (freshnessMs < 5000) return { color: 'green', label: 'Świeże <5s' };
  if (freshnessMs <= 15000) return { color: 'yellow', label: 'OK <15s' };
  return { color: 'red', label: 'Stare >15s' };
}

export const FreshnessBadge = ({ freshnessMs, fallback }: FreshnessBadgeProps) => {
  const { color, label } = getCategory(freshnessMs, fallback);
  const seconds = Math.round(freshnessMs / 1000);
  return (
    <Tooltip label={`Ostatni event z backendu ${seconds}s temu${fallback ? ' (awaryjny REST)' : ''}`}> 
      <Badge color={color} variant="light">{label}</Badge>
    </Tooltip>
  );
};
