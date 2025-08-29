import { render, screen, fireEvent } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { StatusCell, ActionButtons } from './TableComponents';

const renderWithMantine = (component: React.ReactElement) => {
  return render(
    <MantineProvider>
      {component}
    </MantineProvider>
  );
};

describe('StatusCell', () => {
  it('wyświetla status aktywny z zielonym kolorem', () => {
    renderWithMantine(<StatusCell isActive={true} />);
    
    const statusText = screen.getByText('Aktywny');
    expect(statusText).toBeInTheDocument();
  expect(statusText).toHaveAttribute('data-color', 'green');
  });

  it('wyświetla status nieaktywny z czerwonym kolorem', () => {
    renderWithMantine(<StatusCell isActive={false} />);
    
    const statusText = screen.getByText('Nieaktywny');
    expect(statusText).toBeInTheDocument();
  expect(statusText).toHaveAttribute('data-color', 'red');
  });

  it('używa niestandardowego tekstu dla aktywnego statusu', () => {
    renderWithMantine(<StatusCell isActive={true} activeText="Włączony" />);
    
    expect(screen.getByText('Włączony')).toBeInTheDocument();
    expect(screen.queryByText('Aktywny')).not.toBeInTheDocument();
  });

  it('używa niestandardowego tekstu dla nieaktywnego statusu', () => {
    renderWithMantine(<StatusCell isActive={false} inactiveText="Wyłączony" />);
    
    expect(screen.getByText('Wyłączony')).toBeInTheDocument();
    expect(screen.queryByText('Nieaktywny')).not.toBeInTheDocument();
  });

  it('obsługuje różne rozmiary tekstu', () => {
    renderWithMantine(<StatusCell isActive={true} size="lg" />);
    
    const statusText = screen.getByText('Aktywny');
  expect(statusText).toHaveAttribute('data-size', 'lg');
  });

  it('używa domyślnego rozmiaru small', () => {
    renderWithMantine(<StatusCell isActive={true} />);
    
    const statusText = screen.getByText('Aktywny');
  expect(statusText).toHaveAttribute('data-size', 'sm');
  });

  it('ma odpowiednią grubość czcionki', () => {
    renderWithMantine(<StatusCell isActive={true} />);
    
    const statusText = screen.getByText('Aktywny');
  expect(statusText).toHaveAttribute('data-weight', '500');
  });
});

describe('ActionButtons', () => {
  const mockOnEdit = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnToggle = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renderuje przycisk edycji gdy podano onEdit', () => {
    renderWithMantine(<ActionButtons onEdit={mockOnEdit} />);
    
    const editButton = screen.getByText('Edytuj');
    expect(editButton).toBeInTheDocument();
  });

  it('renderuje przycisk usuwania gdy podano onDelete', () => {
    renderWithMantine(<ActionButtons onDelete={mockOnDelete} />);
    
    const deleteButton = screen.getByText('Usuń');
    expect(deleteButton).toBeInTheDocument();
  });

  it('renderuje przycisk przełączania gdy podano onToggle', () => {
    renderWithMantine(<ActionButtons onToggle={mockOnToggle} />);
    
    const toggleButton = screen.getByText('Przełącz');
    expect(toggleButton).toBeInTheDocument();
  });

  it('wywołuje onEdit po kliknięciu przycisku edycji', () => {
    renderWithMantine(<ActionButtons onEdit={mockOnEdit} />);
    
    const editButton = screen.getByText('Edytuj');
    fireEvent.click(editButton);
    
    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it('wywołuje onDelete po kliknięciu przycisku usuwania', () => {
    renderWithMantine(<ActionButtons onDelete={mockOnDelete} />);
    
    const deleteButton = screen.getByText('Usuń');
    fireEvent.click(deleteButton);
    
    expect(mockOnDelete).toHaveBeenCalledTimes(1);
  });

  it('wywołuje onToggle po kliknięciu przycisku przełączania', () => {
    renderWithMantine(<ActionButtons onToggle={mockOnToggle} />);
    
    const toggleButton = screen.getByText('Przełącz');
    fireEvent.click(toggleButton);
    
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it('używa niestandardowych etykiet przycisków', () => {
    renderWithMantine(
      <ActionButtons 
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        editLabel="Modify"
        deleteLabel="Remove"
        toggleLabel="Switch"
      />
    );
    
    expect(screen.getByText('Modify')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
    expect(screen.getByText('Switch')).toBeInTheDocument();
  });

  it('dezaktywuje wszystkie przyciski gdy disabled=true', () => {
    renderWithMantine(
      <ActionButtons 
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        disabled
      />
    );
    
    const editButton = screen.getByText('Edytuj');
    const deleteButton = screen.getByText('Usuń');
    const toggleButton = screen.getByText('Przełącz');
    
    expect(editButton).toBeDisabled();
    expect(deleteButton).toBeDisabled();
    expect(toggleButton).toBeDisabled();
  });

  it('nie wywołuje funkcji gdy przyciski są dezaktywowane', () => {
    renderWithMantine(
      <ActionButtons 
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
        disabled
      />
    );
    
    const editButton = screen.getByText('Edytuj');
    const deleteButton = screen.getByText('Usuń');
    const toggleButton = screen.getByText('Przełącz');
    
    fireEvent.click(editButton);
    fireEvent.click(deleteButton);
    fireEvent.click(toggleButton);
    
    expect(mockOnEdit).not.toHaveBeenCalled();
    expect(mockOnDelete).not.toHaveBeenCalled();
    expect(mockOnToggle).not.toHaveBeenCalled();
  });

  it('renderuje wszystkie przyciski razem', () => {
    renderWithMantine(
      <ActionButtons 
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );
    
    expect(screen.getByText('Edytuj')).toBeInTheDocument();
    expect(screen.getByText('Usuń')).toBeInTheDocument();
    expect(screen.getByText('Przełącz')).toBeInTheDocument();
  });

  it('ma odpowiednie kolory przycisków', () => {
    renderWithMantine(
      <ActionButtons 
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        onToggle={mockOnToggle}
      />
    );
    
    const editButton = screen.getByText('Edytuj');
    const deleteButton = screen.getByText('Usuń');
    const toggleButton = screen.getByText('Przełącz');
    
    expect(editButton).toHaveStyle({ color: '#228be6' }); // Blue
    expect(deleteButton).toHaveStyle({ color: '#fa5252' }); // Red
    expect(toggleButton).toHaveStyle({ color: '#40c057' }); // Green
  });

  it('ma odpowiednie style podstawowe', () => {
    renderWithMantine(<ActionButtons onEdit={mockOnEdit} />);
    
    const editButton = screen.getByText('Edytuj');
    expect(editButton).toHaveStyle({
      background: 'none',
      borderWidth: '0',
      appearance: 'none',
      cursor: 'pointer',
      fontSize: '12px'
    });
  });

  it('zmienia kursor gdy jest dezaktywowany', () => {
    renderWithMantine(<ActionButtons onEdit={mockOnEdit} disabled />);
    
    const editButton = screen.getByText('Edytuj');
    expect(editButton).toHaveStyle({
      cursor: 'not-allowed'
    });
  });

  it('nie renderuje przycisków gdy nie podano funkcji callback', () => {
    renderWithMantine(<ActionButtons />);
    
    expect(screen.queryByText('Edytuj')).not.toBeInTheDocument();
    expect(screen.queryByText('Usuń')).not.toBeInTheDocument();
    expect(screen.queryByText('Przełącz')).not.toBeInTheDocument();
  });

  it('renderuje tylko wybrane przyciski', () => {
    renderWithMantine(<ActionButtons onEdit={mockOnEdit} onToggle={mockOnToggle} />);
    
    expect(screen.getByText('Edytuj')).toBeInTheDocument();
    expect(screen.getByText('Przełącz')).toBeInTheDocument();
    expect(screen.queryByText('Usuń')).not.toBeInTheDocument();
  });
});
