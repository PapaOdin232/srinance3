import { Text } from '@mantine/core';

interface StatusCellProps {
  isActive: boolean;
  size?: 'sm' | 'md' | 'lg';
  activeText?: string;
  inactiveText?: string;
}

export const StatusCell = ({ 
  isActive, 
  size = 'sm',
  activeText = 'Aktywny',
  inactiveText = 'Nieaktywny'
}: StatusCellProps) => {
  return (
    <Text 
      c={isActive ? 'green' : 'red'} 
      size={size}
      fw={500}
  data-color={isActive ? 'green' : 'red'}
  data-size={size}
  data-weight="500"
    >
      {isActive ? activeText : inactiveText}
    </Text>
  );
};

interface ActionButtonsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onToggle?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  toggleLabel?: string;
  disabled?: boolean;
}

export const ActionButtons = ({
  onEdit,
  onDelete,
  onToggle,
  editLabel = 'Edytuj',
  deleteLabel = 'Usuń',
  toggleLabel = 'Przełącz',
  disabled = false
}: ActionButtonsProps) => {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {onEdit && (
        <button 
          type="button"
          onClick={onEdit}
          disabled={disabled}
          style={{ 
            background: 'none', 
            border: 'none', 
            borderWidth: 0,
            appearance: 'none',
            outline: 'none',
            color: '#228be6', 
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '12px'
          }}
        >
          {editLabel}
        </button>
      )}
      {onToggle && (
        <button 
          type="button"
          onClick={onToggle}
          disabled={disabled}
          style={{ 
            background: 'none', 
            border: 'none', 
            borderWidth: 0,
            appearance: 'none',
            outline: 'none',
            color: '#40c057', 
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '12px'
          }}
        >
          {toggleLabel}
        </button>
      )}
      {onDelete && (
        <button 
          type="button"
          onClick={onDelete}
          disabled={disabled}
          style={{ 
            background: 'none', 
            border: 'none', 
            borderWidth: 0,
            appearance: 'none',
            outline: 'none',
            color: '#fa5252', 
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '12px'
          }}
        >
          {deleteLabel}
        </button>
      )}
    </div>
  );
};
