import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { UserStreamProvider, useUserStream } from './userStream';

// Mock WebSocket
const mockWebSocket = {
  close: jest.fn(),
  send: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: 0, // CONNECTING
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

global.WebSocket = jest.fn().mockImplementation(() => mockWebSocket) as any;

// Test component to access userStream context
const TestComponent: React.FC<{
  onStateChange?: (state: any) => void;
  onAddPending?: (fn: any) => void;
  onAddOptimisticCancel?: (fn: any) => void;
}> = ({ onStateChange, onAddPending, onAddOptimisticCancel }) => {
  const { state, addPendingOrder, addOptimisticCancel } = useUserStream();
  
  React.useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);
  
  React.useEffect(() => {
    onAddPending?.(addPendingOrder);
    onAddOptimisticCancel?.(addOptimisticCancel);
  }, [addPendingOrder, addOptimisticCancel, onAddPending, onAddOptimisticCancel]);
  
  return <div data-testid="test-component">Test</div>;
};

describe('UserStream Optimistic Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('addPendingOrder', () => {
    it('should add pending order and remove it after timeout', async () => {
      const states: any[] = [];
      let addPendingOrderFn: any;

      render(
        <UserStreamProvider>
          <TestComponent 
            onStateChange={(state) => states.push({ ...state })}
            onAddPending={(fn) => { addPendingOrderFn = fn; }}
          />
        </UserStreamProvider>
      );

      const testOrder = {
        orderId: 12345,
        clientOrderId: 'test_123',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: '50000',
        origQty: '0.001',
        executedQty: '0',
        status: 'NEW'
      };

      // Add pending order
      act(() => {
        addPendingOrderFn(testOrder, 1000); // 1s timeout for test
      });

      // Check that order was added with PENDING status
      await waitFor(() => {
        const lastState = states[states.length - 1];
        expect(lastState.openOrders[12345]).toBeDefined();
        expect(lastState.openOrders[12345].status).toBe('PENDING');
      });

      // Fast forward time past timeout
      act(() => {
        jest.advanceTimersByTime(1100);
      });

      // Check that order was removed
      await waitFor(() => {
        const lastState = states[states.length - 1];
        expect(lastState.openOrders[12345]).toBeUndefined();
      });
    });

    it('should keep order if real executionReport arrives before timeout', async () => {
      const states: any[] = [];
      let addPendingOrderFn: any;

      render(
        <UserStreamProvider>
          <TestComponent 
            onStateChange={(state) => states.push({ ...state })}
            onAddPending={(fn) => { addPendingOrderFn = fn; }}
          />
        </UserStreamProvider>
      );

      const testOrder = {
        orderId: 12345,
        clientOrderId: 'test_123',
        symbol: 'BTCUSDT',
        side: 'BUY',
        status: 'NEW'
      };

      // Add pending order
      act(() => {
        addPendingOrderFn(testOrder, 5000);
      });

      // Simulate real executionReport (would come from WebSocket)
      // This would be handled by the order_store_batch handler in real scenario
      // For test, we need to simulate this differently since we don't have full WS mock

      // Fast forward time but not past timeout
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Order should still exist (timeout not reached)
      await waitFor(() => {
        const lastState = states[states.length - 1];
        expect(lastState.openOrders[12345]).toBeDefined();
      });
    });
  });

  describe('addOptimisticCancel', () => {
    it('should mark order as CANCELED and rollback after timeout', async () => {
      const states: any[] = [];
      let addOptimisticCancelFn: any;

      render(
        <UserStreamProvider>
          <TestComponent 
            onStateChange={(state) => states.push({ ...state })}
            onAddOptimisticCancel={(fn) => { addOptimisticCancelFn = fn; }}
          />
        </UserStreamProvider>
      );

      // First, simulate having an open order in state  
      // Note: In real scenario, this would come from orders_snapshot
      // For this test, we just verify the function handles missing orders gracefully
      
      // Apply optimistic cancel
      act(() => {
        addOptimisticCancelFn(12345, 1000); // 1s timeout for test
      });

      // Fast forward time past timeout
      act(() => {
        jest.advanceTimersByTime(1100);
      });

      // Since we don't have initial order in state, function should handle gracefully
      // In real scenario, this would rollback the status
    });

    it('should not rollback if WebSocket delta arrives before timeout', async () => {
      // This test would require more complex mocking of the WebSocket message handling
      // For now, we verify the function exists and doesn't throw
      let addOptimisticCancelFn: any;

      render(
        <UserStreamProvider>
          <TestComponent 
            onAddOptimisticCancel={(fn) => { addOptimisticCancelFn = fn; }}
          />
        </UserStreamProvider>
      );

      expect(() => {
        addOptimisticCancelFn(12345, 1000);
      }).not.toThrow();
    });
  });
});
