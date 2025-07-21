// cypress/e2e/ws.cy.ts

describe('WebSocket /ws/market', () => {
  it('should echo messages', (done) => {
    const ws = new WebSocket('ws://localhost:8000/ws/market');
    ws.onopen = () => {
      ws.send('test123');
    };
    ws.onmessage = (event) => {
      expect(event.data).to.equal('Echo: test123');
      ws.close();
      done();
    };
    ws.onerror = (err) => {
      done(err);
    };
  });
});
