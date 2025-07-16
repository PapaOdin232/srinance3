describe('Panel bota', () => {
  it('wyświetla panel bota i logi', () => {
    cy.visit('/');
    cy.contains('Panel bota');
    cy.contains('Logi bota (na żywo)');
  });
});
