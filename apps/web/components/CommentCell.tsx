'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Contact } from '@/types/contact';
import { CellContext } from '@tanstack/react-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CommentCellProps extends CellContext<Contact, unknown> {
  onEditContact: (contactUpdate: Partial<Contact> & { id: string }) => void;
}

const PREDEFINED_COMMENTS = [
  'Accompagné',
  'Du métier',
  'Prospection',
  'Non exploitable',
  'Bloqué ?',
];

const CUSTOM_COMMENT_OPTION = 'Personnalisé';
const NO_COMMENT_OPTION = 'Aucun';

export const CommentCell: React.FC<CommentCellProps> = ({ getValue, row, column, onEditContact }) => {
  const [currentSelectValue, setCurrentSelectValue] = useState('');
  const [isCustomInputVisible, setIsCustomInputVisible] = useState(false);
  const [customInputValue, setCustomInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const val = getValue() as string | undefined;
    if (val && !PREDEFINED_COMMENTS.includes(val) && val !== NO_COMMENT_OPTION && val !== '') {
      setCurrentSelectValue(CUSTOM_COMMENT_OPTION);
      setCustomInputValue(val);
      setIsCustomInputVisible(true);
    } else if (val === '' || val === NO_COMMENT_OPTION) {
      setCurrentSelectValue(NO_COMMENT_OPTION);
      setCustomInputValue('');
      setIsCustomInputVisible(false);
    } else if (val) {
      setCurrentSelectValue(val);
      setCustomInputValue('');
      setIsCustomInputVisible(false);
    } else {
      setCurrentSelectValue(NO_COMMENT_OPTION);
      setCustomInputValue('');
      setIsCustomInputVisible(false);
    }
  }, [getValue]);

  useEffect(() => {
    if (isCustomInputVisible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCustomInputVisible]);

  const handleSelectValueChange = (selectedValue: string) => {
    setCurrentSelectValue(selectedValue);
    if (selectedValue === CUSTOM_COMMENT_OPTION) {
      setIsCustomInputVisible(true);
      const previousRawValue = getValue() as string | undefined;
      if (previousRawValue && !PREDEFINED_COMMENTS.includes(previousRawValue) && previousRawValue !== NO_COMMENT_OPTION && previousRawValue !== ''){
        setCustomInputValue(previousRawValue);
      } else {
        setCustomInputValue(''); 
      }
    } else {
      setIsCustomInputVisible(false);
      const finalValueToSave = selectedValue === NO_COMMENT_OPTION ? '' : selectedValue;
      onEditContact({ id: row.original.id, [column.id]: finalValueToSave });
      setCustomInputValue('');
    }
  };

  const handleCustomInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCustomInputValue(event.target.value);
  };

  const handleCustomInputBlur = () => {
    if (currentSelectValue === CUSTOM_COMMENT_OPTION) {
      onEditContact({ id: row.original.id, [column.id]: customInputValue });
    }
  };

  const handleCustomInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (currentSelectValue === CUSTOM_COMMENT_OPTION) {
        onEditContact({ id: row.original.id, [column.id]: customInputValue });
        (event.target as HTMLInputElement).blur();
      }
    }
  };

  return (
    <div className={cn("p-1 h-full min-h-[30px] flex items-center w-full space-x-1")}>
      <Select value={currentSelectValue} onValueChange={handleSelectValueChange}>
        <SelectTrigger className="flex-grow min-w-[120px]">
          <SelectValue placeholder="Choisir..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_COMMENT_OPTION}>{NO_COMMENT_OPTION}</SelectItem>
          {PREDEFINED_COMMENTS.map((comment) => (
            <SelectItem key={comment} value={comment}>
              {comment}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_COMMENT_OPTION}>{CUSTOM_COMMENT_OPTION}</SelectItem>
        </SelectContent>
      </Select>
      {isCustomInputVisible && (
        <Input
          ref={inputRef}
          type="text"
          value={customInputValue}
          onChange={handleCustomInputChange}
          onBlur={handleCustomInputBlur}
          onKeyDown={handleCustomInputKeyDown}
          placeholder="Saisir commentaire..."
          className="flex-grow min-w-[120px]"
        />
      )}
      {!isCustomInputVisible && currentSelectValue === NO_COMMENT_OPTION && (
        <span className="text-muted-foreground italic text-sm ml-2 whitespace-nowrap">Vide</span>
      )}
      {!isCustomInputVisible && currentSelectValue !== NO_COMMENT_OPTION && !PREDEFINED_COMMENTS.includes(currentSelectValue) && currentSelectValue !== CUSTOM_COMMENT_OPTION && (
         <span className="text-muted-foreground italic text-sm truncate ml-2">{currentSelectValue}</span>
      )}
    </div>
  );
}; 