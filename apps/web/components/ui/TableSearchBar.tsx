'use client';

import * as React from 'react';
import { useMemo, useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SearchableColumn {
  value: string;
  label: string;
  icon: React.ReactElement<{ className?: string }>;
}

interface TableSearchBarProps {
  columns: SearchableColumn[];
  onSearchChange: (searchTerm: string, selectedColumnValue: string) => void;
  initialSearchTerm?: string;
  initialSelectedColumnValue?: string;
  searchInputPlaceholder?: string;
  selectPlaceholder?: string;
  className?: string;
}

export function TableSearchBar({
  columns,
  onSearchChange,
  initialSearchTerm = '',
  initialSelectedColumnValue,
  searchInputPlaceholder = 'Rechercher...',
  selectPlaceholder = 'Filtrer par...',
  className,
}: TableSearchBarProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  
  const validColumns = useMemo(() => columns.filter(col => col.value && col.value.trim() !== ''), [columns]);

  const [selectedColumn, setSelectedColumn] = useState(() => {
    const initial = initialSelectedColumnValue && validColumns.find(col => col.value === initialSelectedColumnValue)
      ? initialSelectedColumnValue
      : validColumns.length > 0 ? validColumns[0].value : '';
    return initial;
  });

  useEffect(() => {
    if (initialSelectedColumnValue && validColumns.find(col => col.value === initialSelectedColumnValue)) {
      setSelectedColumn(initialSelectedColumnValue);
    }
  }, [initialSelectedColumnValue, validColumns]);

  useEffect(() => {
    onSearchChange(searchTerm, selectedColumn);
  }, [searchTerm, selectedColumn, onSearchChange]);

  const handleSearchTermChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleSelectedColumnChange = (value: string) => {
    setSelectedColumn(value);
  };

  const currentColumnData = useMemo(() => 
    validColumns.find(col => col.value === selectedColumn)
  , [selectedColumn, validColumns]);

  return (
    <div className={cn("flex items-center w-full max-w-lg rounded-full overflow-hidden", className)}>
      <Select value={selectedColumn} onValueChange={handleSelectedColumnChange}>
        <SelectTrigger 
          className="flex items-center gap-2 pl-3 pr-2 py-2 h-full text-sm text-muted-foreground border-0 focus:ring-0 focus:ring-offset-0 shadow-none bg-transparent min-w-[150px] whitespace-nowrap"
          aria-label="Sélectionner la colonne pour la recherche"
        >
          <SelectValue placeholder={selectPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {validColumns.map((column) => (
            <SelectItem key={column.value} value={column.value}>
              <div className="flex items-center gap-2">
                {React.isValidElement(column.icon) && React.cloneElement(column.icon, { className: 'h-4 w-4' })}
                {column.label}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <div className="h-6 border-l border-input mx-2 self-center"></div>
      
      <Input
        type="search"
        placeholder={searchInputPlaceholder}
        value={searchTerm}
        onChange={handleSearchTermChange}
        className="h-full flex-grow px-3 py-2 text-sm bg-transparent border-0 focus:ring-0 focus:ring-offset-0 shadow-none placeholder:text-muted-foreground"
        aria-label="Terme de recherche"
      />
    </div>
  );
}

// Exemple d'icônes Lucide pour référence (à adapter par le composant parent lors de la définition des colonnes)
// export const iconMap = {
//   user: <User />,
//   mail: <Mail />,
//   phone: <Phone />,
//   info: <Info />,
//   messageSquareText: <MessageSquareText />,
//   bellRing: <BellRing />,
//   clock: <Clock />,
//   calendarDays: <CalendarDays />,
//   phoneOutgoing: <PhoneOutgoing />,
//   hourglass: <Hourglass />,
//   waypoints: <Waypoints />,
// }; 