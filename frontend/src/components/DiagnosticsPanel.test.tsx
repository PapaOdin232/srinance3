import { render } from '@testing-library/react';
import DiagnosticsPanel from './DiagnosticsPanel';

describe('DiagnosticsPanel', () => {
  it('renderuje null (pusty komponent)', () => {
    const { container } = render(<DiagnosticsPanel />);
    
    // Komponent zwraca null, więc container powinien być pusty
    expect(container.firstChild).toBeNull();
  });

  it('nie rzuca błędów przy renderowaniu', () => {
    expect(() => {
      render(<DiagnosticsPanel />);
    }).not.toThrow();
  });
});
