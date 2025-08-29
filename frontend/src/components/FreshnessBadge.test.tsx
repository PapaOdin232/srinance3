import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { FreshnessBadge } from './FreshnessBadge';

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('FreshnessBadge', () => {
  it('pokazuje "Świeże <5s" dla świeżych danych (< 5s)', () => {
    renderWithMantine(<FreshnessBadge freshnessMs={3000} />);
    
    expect(screen.getByText('Świeże <5s')).toBeInTheDocument();
  });

  it('wyświetla "OK <15s" dla dokładnie 15 sekund', () => {
    renderWithMantine(<FreshnessBadge freshnessMs={15000} />);
    
    expect(screen.getByText('OK <15s')).toBeInTheDocument();
  });

  it('pokazuje "Stare >15s" dla starych danych (> 15s)', () => {
    renderWithMantine(<FreshnessBadge freshnessMs={20000} />);
    
    expect(screen.getByText('Stare >15s')).toBeInTheDocument();
  });

  it('pokazuje "Fallback REST" gdy fallback jest true', () => {
    renderWithMantine(<FreshnessBadge freshnessMs={1000} fallback={true} />);
    
    expect(screen.getByText('Fallback REST')).toBeInTheDocument();
  });

  it('fallback ma priorytet nad freshnessMs', () => {
    renderWithMantine(<FreshnessBadge freshnessMs={30000} fallback={true} />);
    
    // Nawet dla starych danych, fallback powinien mieć priorytet
    expect(screen.getByText('Fallback REST')).toBeInTheDocument();
    expect(screen.queryByText('Stare >15s')).not.toBeInTheDocument();
  });

  it('pokazuje tooltip z odpowiednim czasem dla normalnych danych', async () => {
    const user = userEvent.setup();
    renderWithMantine(<FreshnessBadge freshnessMs={7500} />);
    
    const badge = screen.getByText('OK <15s');
    await user.hover(badge);
    
    // 7500ms = 8s (zaokrąglone)
    expect(await screen.findByText('Ostatni event z backendu 8s temu')).toBeInTheDocument();
  });

  it('pokazuje tooltip z informacją o fallback', async () => {
    const user = userEvent.setup();
    renderWithMantine(<FreshnessBadge freshnessMs={2000} fallback={true} />);
    
    const badge = screen.getByText('Fallback REST');
    await user.hover(badge);
    
    expect(await screen.findByText('Ostatni event z backendu 2s temu (awaryjny REST)')).toBeInTheDocument();
  });

  it('zaokrągla sekundy poprawnie', async () => {
    const user = userEvent.setup();
    renderWithMantine(<FreshnessBadge freshnessMs={3456} />);
    
    const badge = screen.getByText('Świeże <5s');
    await user.hover(badge);
    
    // 3456ms = 3s (zaokrąglone)
    expect(await screen.findByText('Ostatni event z backendu 3s temu')).toBeInTheDocument();
  });

  it('obsługuje graniczne wartości dla kategorii', () => {
    // Dokładnie 5s - powinno być "OK <15s"
    renderWithMantine(<FreshnessBadge freshnessMs={5000} />);
    expect(screen.getByText('OK <15s')).toBeInTheDocument();
  });

  it('obsługuje graniczne wartości dla kategorii - 15s', () => {
    // Dokładnie 15s - powinno być "OK <15s"
    renderWithMantine(<FreshnessBadge freshnessMs={15000} />);
    expect(screen.getByText('OK <15s')).toBeInTheDocument();
  });

  it('obsługuje graniczne wartości dla kategorii - powyżej 15s', () => {
    // Powyżej 15s - powinno być "Stare >15s"
    renderWithMantine(<FreshnessBadge freshnessMs={15001} />);
    expect(screen.getByText('Stare >15s')).toBeInTheDocument();
  });

  it('obsługuje bardzo małe wartości (< 1s)', async () => {
    const user = userEvent.setup();
    renderWithMantine(<FreshnessBadge freshnessMs={500} />);
    
    expect(screen.getByText('Świeże <5s')).toBeInTheDocument();
    
    const badge = screen.getByText('Świeże <5s');
    await user.hover(badge);
    
    // 500ms = 1s (zaokrąglone w górę)
    expect(await screen.findByText('Ostatni event z backendu 1s temu')).toBeInTheDocument();
  });

  it('obsługuje bardzo duże wartości', async () => {
    const user = userEvent.setup();
    renderWithMantine(<FreshnessBadge freshnessMs={120000} />);
    
    expect(screen.getByText('Stare >15s')).toBeInTheDocument();
    
    const badge = screen.getByText('Stare >15s');
    await user.hover(badge);
    
    // 120000ms = 120s
    expect(await screen.findByText('Ostatni event z backendu 120s temu')).toBeInTheDocument();
  });
});
