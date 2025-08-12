// Test scenarios for optimistic order operations
describe('Optimistic Order Operations', () => {
  beforeEach(() => {
    cy.visit('/');
    
    // Wait for app to load and WebSocket to connect
    cy.get('[data-testid="connection-status"]', { timeout: 10000 }).should('exist');
    
    // Navigate to trading panel
    cy.contains('Trading').click();
  });

  it('should add pending order optimistically on POST and replace with real status', () => {
    // Intercept order creation API to simulate delay
    cy.intercept('POST', '/api/orders', (req) => {
      // Add delay to see optimistic behavior
      return new Promise((resolve) => {
        setTimeout(() => {
          req.reply({
            statusCode: 200,
            body: {
              success: true,
              order: {
                orderId: 123456,
                clientOrderId: req.body.clientOrderId || 'test_123',
                symbol: req.body.symbol,
                side: req.body.side,
                type: req.body.type,
                status: 'NEW',
                price: req.body.price,
                origQty: req.body.quantity,
                executedQty: '0',
                updateTime: Date.now()
              }
            }
          });
          resolve();
        }, 1000); // 1 second delay
      });
    }).as('placeOrder');

    // Mock WebSocket to simulate delayed executionReport
    cy.window().then((win) => {
      // We'll simulate WebSocket message after API response
      setTimeout(() => {
        const wsMessage = {
          type: 'order_store_batch',
          schemaVersion: 1,
          events: [{
            type: 'order_delta',
            order: {
              orderId: 123456,
              clientOrderId: 'test_123',
              symbol: 'BTCUSDT',
              side: 'BUY',
              type: 'LIMIT',
              status: 'NEW',
              price: '50000',
              origQty: '0.001',
              executedQty: '0',
              updateTime: Date.now()
            }
          }],
          batchSize: 1,
          ts: Date.now()
        };
        
        // If userStream WebSocket exists, simulate message
        if ((win as any).mockWSMessage) {
          (win as any).mockWSMessage(wsMessage);
        }
      }, 1500);
    });

    // Fill trading form
    cy.get('[data-testid="symbol-select"]').click();
    cy.contains('BTCUSDT').click();
    
    cy.get('[data-testid="side-select"]').click();
    cy.contains('BUY').click();
    
    cy.get('[data-testid="order-type-select"]').click();
    cy.contains('LIMIT').click();
    
    cy.get('[data-testid="quantity-input"]').clear().type('0.001');
    cy.get('[data-testid="price-input"]').clear().type('50000');

    // Navigate to orders panel to check optimistic update
    cy.contains('Orders').click();
    
    // Submit order
    cy.contains('Trading').click();
    cy.get('[data-testid="place-order-btn"]').click();

    // Check orders panel immediately - should show PENDING order
    cy.contains('Orders').click();
    cy.get('[data-testid="open-orders-tab"]').click();
    
    // Should see optimistic order with PENDING status
    cy.contains('PENDING', { timeout: 1000 }).should('exist');
    cy.contains('BTCUSDT').should('exist');
    
    // Wait for API response and WebSocket update
    cy.wait('@placeOrder');
    
    // Should see order status change from PENDING to NEW
    cy.contains('NEW', { timeout: 3000 }).should('exist');
    cy.contains('PENDING').should('not.exist');
  });

  it('should mark order as CANCELED optimistically on DELETE and rollback if no confirmation', () => {
    // First, ensure we have an open order
    cy.intercept('GET', '/api/orders/open', {
      statusCode: 200,
      body: {
        orders: [{
          orderId: 789012,
          clientOrderId: 'test_cancel_123',
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'LIMIT',
          status: 'NEW',
          price: '49000',
          origQty: '0.001',
          executedQty: '0',
          updateTime: Date.now()
        }]
      }
    }).as('getOpenOrders');

    // Intercept cancel order API to simulate failure (no confirmation)
    cy.intercept('DELETE', '/api/orders/789012*', (req) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          req.reply({
            statusCode: 400,
            body: {
              success: false,
              error: 'Order not found'
            }
          });
          resolve();
        }, 2000); // 2 second delay
      });
    }).as('cancelOrder');

    // Navigate to orders panel
    cy.contains('Orders').click();
    cy.get('[data-testid="open-orders-tab"]').click();
    
    // Wait for orders to load
    cy.wait('@getOpenOrders');
    cy.contains('NEW').should('exist');

    // Click cancel button
    cy.get('[data-testid="cancel-order-789012"]').click();
    
    // Should immediately show CANCELED status (optimistic)
    cy.contains('CANCELED', { timeout: 1000 }).should('exist');
    cy.contains('NEW').should('not.exist');
    
    // Wait for API response (failure)
    cy.wait('@cancelOrder');
    
    // After rollback timeout (10s in real code, but we can test shorter timeouts)
    // Order should revert to original status
    // Note: This test would need shorter timeout in test environment
    cy.contains('NEW', { timeout: 12000 }).should('exist');
    cy.contains('CANCELED').should('not.exist');
  });

  it('should handle network errors gracefully with rollback', () => {
    // Intercept order creation to simulate network error
    cy.intercept('POST', '/api/orders', {
      forceNetworkError: true
    }).as('placeOrderError');

    // Fill trading form
    cy.get('[data-testid="symbol-select"]').click();
    cy.contains('BTCUSDT').click();
    
    cy.get('[data-testid="quantity-input"]').clear().type('0.001');
    cy.get('[data-testid="order-type-select"]').click();
    cy.contains('MARKET').click();

    // Submit order
    cy.get('[data-testid="place-order-btn"]').click();

    // Check orders panel - should show PENDING initially
    cy.contains('Orders').click();
    cy.get('[data-testid="open-orders-tab"]').click();
    cy.contains('PENDING', { timeout: 1000 }).should('exist');
    
    // Wait for network error and rollback timeout
    cy.wait('@placeOrderError');
    
    // After timeout, PENDING order should disappear
    cy.contains('PENDING', { timeout: 6000 }).should('not.exist');
    
    // Should show error message in trading panel
    cy.contains('Trading').click();
    cy.contains('Failed to place order').should('exist');
  });
});
