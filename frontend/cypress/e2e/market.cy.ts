describe('Panel rynku', () => {
  it('wyświetla ticker i orderbook', () => {
    cy.visit('/');
    cy.contains('Rynek: BTCUSDT');
    cy.contains('Ticker');
    cy.contains('Orderbook');
  });
});
