import React from 'react';

interface ReadOnlyCellProps {
  value: string | null | undefined;
}

export const ReadOnlyCell: React.FC<ReadOnlyCellProps> = ({ value }) => {
  return (
    <div className="p-2 h-full min-h-[30px] flex items-center w-full">
      {value ? (
        <span>{String(value)}</span>
      ) : (
        <span className="text-muted-foreground italic">Vide</span>
      )}
    </div>
  );
};

ReadOnlyCell.displayName = 'ReadOnlyCell'; 