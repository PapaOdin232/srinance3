describe('Panel konta', () => {
  it('wyświetla saldo i historię', () => {
    cy.visit('/');
    cy.contains('Konto Binance');
    cy.contains('Saldo');
    cy.contains('Historia transakcji');
  });
});
