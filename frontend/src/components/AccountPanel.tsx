import React, { useState } from 'react';
import {
  Paper,
  Group,
  Text,
  Badge,
  Stack,
  Grid,
  Card,
  Divider,
  Box,
} from '@mantine/core';
import { IconShieldCheck, IconShieldX, IconPercentage } from '@tabler/icons-react';
import PortfolioTable from './PortfolioTable';
import { usePortfolio } from '../hooks/usePortfolio';
import { formatCurrency } from '../types/portfolio';

const AccountPanel: React.FC = () => {
  const { 
    balances, 
    loading, 
    error, 
    accountData, 
    refetch, 
    totalValue, 
    totalChange24h 
  } = usePortfolio();
  const [hideZeroBalances, setHideZeroBalances] = useState(true);

  // Calculate active assets count
  const activeAssets = Array.isArray(balances) ? balances.filter(b => b.total > 0.00000001).length : 0;

  return (
    <Stack gap="md" p="md">
      {/* Header with connection status */}
      <Paper p="md" withBorder>
        <Group justify="space-between">
          <Text size="xl" fw={700}>
            Dashboard
          </Text>
          <Group gap="xs">
            <Box
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: !error ? '#4CAF50' : '#f44336',
              }}
            />
            <Text size="sm" c="dimmed">
              {!error ? 'Połączony' : 'Rozłączony'}
            </Text>
          </Group>
        </Group>
      </Paper>

      {/* Portfolio Summary */}
      <Paper p="md" withBorder>
        <Group justify="space-between" mb="md">
          <Text size="lg" fw={600}>
            Podsumowanie Portfolio
          </Text>
          <Badge 
            color={totalChange24h >= 0 ? 'teal' : 'red'} 
            variant="light"
            size="lg"
          >
            {totalChange24h >= 0 ? '+' : ''}{totalChange24h.toFixed(2)}%
          </Badge>
        </Group>
        
        <Grid>
          <Grid.Col span={4}>
            <Text size="sm" c="dimmed">
              Całkowita wartość
            </Text>
            <Text size="xl" fw={700}>
              {formatCurrency(totalValue)}
            </Text>
          </Grid.Col>
          <Grid.Col span={4}>
            <Text size="sm" c="dimmed">
              Aktywne aktywa
            </Text>
            <Text size="xl" fw={700}>
              {activeAssets}
            </Text>
          </Grid.Col>
          <Grid.Col span={4}>
            <Text size="sm" c="dimmed">
              Zmiana 24h
            </Text>
            <Text 
              size="xl" 
              fw={700}
              c={totalChange24h >= 0 ? 'teal' : 'red'}
            >
              {formatCurrency(totalValue * (totalChange24h / 100))}
            </Text>
          </Grid.Col>
        </Grid>
      </Paper>

      {/* Account Information */}
      {accountData && (
        <Grid>
          <Grid.Col span={6}>
            <Card withBorder h="100%">
              <Text size="md" fw={600} mb="md">
                Uprawnienia Konta
              </Text>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Group gap="xs">
                    {accountData.canTrade ? (
                      <IconShieldCheck size={16} color="green" />
                    ) : (
                      <IconShieldX size={16} color="red" />
                    )}
                    <Text size="sm">Handel</Text>
                  </Group>
                  <Badge color={accountData.canTrade ? 'teal' : 'red'} variant="light">
                    {accountData.canTrade ? 'Aktywny' : 'Nieaktywny'}
                  </Badge>
                </Group>
                
                <Group justify="space-between">
                  <Group gap="xs">
                    {accountData.canWithdraw ? (
                      <IconShieldCheck size={16} color="green" />
                    ) : (
                      <IconShieldX size={16} color="red" />
                    )}
                    <Text size="sm">Wypłaty</Text>
                  </Group>
                  <Badge color={accountData.canWithdraw ? 'teal' : 'red'} variant="light">
                    {accountData.canWithdraw ? 'Aktywne' : 'Nieaktywne'}
                  </Badge>
                </Group>
                
                <Group justify="space-between">
                  <Group gap="xs">
                    {accountData.canDeposit ? (
                      <IconShieldCheck size={16} color="green" />
                    ) : (
                      <IconShieldX size={16} color="red" />
                    )}
                    <Text size="sm">Wpłaty</Text>
                  </Group>
                  <Badge color={accountData.canDeposit ? 'teal' : 'red'} variant="light">
                    {accountData.canDeposit ? 'Aktywne' : 'Nieaktywne'}
                  </Badge>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>
          
          <Grid.Col span={6}>
            <Card withBorder h="100%">
              <Text size="md" fw={600} mb="md">
                Prowizje Handlowe
              </Text>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Group gap="xs">
                    <IconPercentage size={16} />
                    <Text size="sm">Maker</Text>
                  </Group>
                  <Text size="sm" ff="monospace">
                    {(accountData.makerCommission / 10000 * 100).toFixed(3)}%
                  </Text>
                </Group>
                
                <Group justify="space-between">
                  <Group gap="xs">
                    <IconPercentage size={16} />
                    <Text size="sm">Taker</Text>
                  </Group>
                  <Text size="sm" ff="monospace">
                    {(accountData.takerCommission / 10000 * 100).toFixed(3)}%
                  </Text>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      )}

      <Divider />

      {/* Portfolio Table */}
      <PortfolioTable
        balances={balances}
        loading={loading}
        error={error}
        onRefresh={refetch}
        hideZeroBalances={hideZeroBalances}
        onHideZeroBalancesChange={setHideZeroBalances}
      />
    </Stack>
  );
};

export default AccountPanel;
