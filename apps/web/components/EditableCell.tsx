import React, { useState, useEffect } from 'react';
import { CellContext } from '@tanstack/react-table';
import { Contact } from '@/types/contact';
import { Input } from '@/components/ui/input';
import { DateTimePicker, type DateTimePickerProps } from '@/components/ui/DateTimePicker';
import { Calendar } from '@/components/ui/calendar';
import { TimePickerOnly } from '@/components/ui/TimePickerOnly';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { format as formatDateFns, parseISO, isValid as isValidDate } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ClockIcon, CalendarIcon } from 'lucide-react';

// Helper function to parse DD/MM/YYYY and DD/MM/YYYY HH:mm(:ss)
const parseCustomDateString = (dateString: string, cellType: 'date' | 'datetime' | 'time'): string => {
  if (cellType === 'date' || cellType === 'datetime') {
    const dateTimeParts = dateString.split(' ');
    const datePart = dateTimeParts[0];
    const timePart = dateTimeParts.length > 1 ? dateTimeParts[1] : (cellType === 'datetime' ? '00:00:00' : null);

    const parts = datePart.split('/');
    if (parts.length === 3) {
      const day = parts[0];
      const month = parts[1];
      const year = parts[2];
      let isoString = `${year}-${month}-${day}`;
      if (timePart) {
        isoString += `T${timePart}`;
      } else if (cellType === 'datetime') {
        // Ensure T00:00:00 for datetime if no time part and not just date
         isoString += `T00:00:00`;
      }
      return isoString;
    }
  }
  return dateString; // Return original if not in DD/MM/YYYY format
};

interface EditableCellProps extends CellContext<Contact, unknown> {
  onEditContact: (contactUpdate: Partial<Contact> & { id: string }) => void;
  displayValueOverride?: React.ReactNode;
}

export const EditableCell: React.FC<EditableCellProps> = React.memo(({
  getValue,
  row,
  column,
  onEditContact,
  displayValueOverride,
}) => {
  const initialValue = getValue() as string | null | undefined;

  // RETRAIT DU CAS SPÉCIAL POUR DEBUG DUREEAPPEL
  // if (column.id === 'dureeAppel') {
  //   console.log(`[EditableCell DEBUG DUREEAPPEL] Contact ID: ${row.original.id}, initialValue:`, initialValue);
  //   return (
  //     <div className="p-2 h-full min-h-[30px] flex items-center">
  //       {initialValue ?? <span className="text-muted-foreground italic">Vide</span>}
  //     </div>
  //   );
  // }
  // FIN RETRAIT CAS SPÉCIAL

  const [currentValue, setCurrentValue] = useState(initialValue);
  const [isEditingText, setIsEditingText] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<Date | undefined>(undefined);

  // DEBUG: Log initialValue for dureeAppel
  if (column.id === 'dureeAppel') {
    console.log(`[EditableCell] Contact ID: ${row.original.id}, Column: ${column.id}, initialValue from getValue():`, initialValue);
  }

  const cellType = (column.columnDef.meta as { cellType?: string })?.cellType || 'text';

  useEffect(() => {
    // DEBUG: Log when initialValue changes for dureeAppel
    if (column.id === 'dureeAppel') {
      console.log(`[EditableCell] Contact ID: ${row.original.id}, Column: ${column.id}, useEffect setting currentValue from initialValue:`, initialValue);
    }
    setCurrentValue(initialValue);
  }, [initialValue, column.id, row.original.id]);

  const handleSave = (valueToSave: string | null | Date) => {
    let finalValue: string | null;
    if (valueToSave instanceof Date) {
      if (cellType === 'time') {
        finalValue = formatDateFns(valueToSave, 'HH:mm', { locale: fr });
      } else {
        finalValue = valueToSave.toISOString();
      }
    } else {
      finalValue = valueToSave;
    }

    if (finalValue !== initialValue) {
      console.log(`[EditableCell] Attempting to save. Column ID: ${column.id}, Original Value: ${initialValue}, New Value (finalValue): ${finalValue}`);
      onEditContact({
        id: row.original.id,
        [column.id]: finalValue,
      });
    }
    setIsPopoverOpen(false);
    setIsEditingText(false);
  };

  const handleCancelTextEdit = () => {
    setCurrentValue(initialValue);
    setIsEditingText(false);
  };

  const handleTextKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSave(currentValue as string | null);
    } else if (event.key === 'Escape') {
      handleCancelTextEdit();
    }
  };

  if (isEditingText && cellType === 'text') {
    return (
      <Input
        type="text"
        value={String(currentValue ?? '')}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={() => handleSave(currentValue as string | null)}
        onKeyDown={handleTextKeyDown}
        autoFocus
        className="h-full py-1 px-2 text-sm border-muted focus:ring-1 focus:ring-ring focus:ring-offset-0 bg-background rounded-sm min-w-[50px] w-full"
      />
    );
  }

  let displayContent: React.ReactNode;
  let initialDateForPicker: Date | undefined = undefined;
  let hasErrorParsing = false;

  // Colonnes spécifiques à traiter comme du texte si vides
  const textOnlyIfEmptyColumns = ['dateAppel', 'heureAppel'];

  try {
    if (currentValue) {
      if (cellType === 'date' || cellType === 'datetime') {
        const preProcessedValue = parseCustomDateString(currentValue as string, cellType as 'date' | 'datetime');
        const parsedDate = parseISO(preProcessedValue);
        if (!isValidDate(parsedDate)) throw new Error('Invalid date string for parsing');
        initialDateForPicker = parsedDate;
      } else if (cellType === 'time') {
        const timeParts = (currentValue as string).split(':');
        if (timeParts.length >= 2 && parseInt(timeParts[0],10) >=0 && parseInt(timeParts[0],10) <=23 && parseInt(timeParts[1],10) >=0 && parseInt(timeParts[1],10) <=59) {
          const tempDate = new Date();
          tempDate.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), timeParts[2] ? parseInt(timeParts[2], 10) : 0, 0);
          initialDateForPicker = tempDate;
        } else {
          const parsedDateFromISO = parseISO(currentValue as string);
          if (isValidDate(parsedDateFromISO)) {
            initialDateForPicker = parsedDateFromISO;
          } else {
            throw new Error('Invalid time string for HH:mm or ISO parsing');
          }
        }
      }
    }
  } catch (e) {
    console.warn(`Error parsing ${cellType} value for display: `, currentValue, e);
    displayContent = <span className="text-destructive italic">{currentValue ? `Inv: ${currentValue}`: 'Erreur'}</span>;
    hasErrorParsing = true;
  }

  if (currentValue) {
    try {
      if (cellType === 'date' || cellType === 'datetime') {
        let dateToFormat: Date;
        if (initialDateForPicker && isValidDate(initialDateForPicker)) {
          dateToFormat = initialDateForPicker;
        } else {
          let stringToProcess: string;
          if (typeof currentValue === 'string') {
            stringToProcess = currentValue;
          } else {
            stringToProcess = String(currentValue ?? '');
          }
          
          const preProcessedStringForDisplay = parseCustomDateString(stringToProcess, cellType as 'date' | 'datetime');
          dateToFormat = parseISO(preProcessedStringForDisplay);
        }

        if (!isValidDate(dateToFormat)) throw new Error('Invalid date string for display');
        displayContent = formatDateFns(dateToFormat, cellType === 'date' ? 'dd/MM/yyyy' : 'dd/MM/yyyy HH:mm', { locale: fr });
      } else if (cellType === 'time') {
        const dateForDisplay = initialDateForPicker || new Date();
        if (initialDateForPicker) {
          displayContent = formatDateFns(dateForDisplay, 'HH:mm', { locale: fr });
        } else {
          const timeParts = (currentValue as string).split(':');
          if (timeParts.length >= 2 && parseInt(timeParts[0],10) >=0 && parseInt(timeParts[0],10) <=23 && parseInt(timeParts[1],10) >=0 && parseInt(timeParts[1],10) <=59) {
            displayContent = currentValue;
          } else {
            throw new Error('Invalid time string for display after parsing attempts');
          }
        }
      } else {
        displayContent = <span>{String(currentValue ?? '')}</span>;
      }
    } catch (e) {
      console.warn(`Error parsing ${cellType} value for display: `, currentValue, e);
      displayContent = <span className="text-destructive italic">{currentValue ? `Inv: ${currentValue}`: 'Erreur'}</span>;
      hasErrorParsing = true;
    }
  } else {
    if (textOnlyIfEmptyColumns.includes(column.id)) {
      displayContent = <span className="text-muted-foreground italic">Vide</span>;
    } else if (cellType === 'date' || cellType === 'datetime') {
      displayContent = <CalendarIcon className="h-4 w-4 opacity-70" />;
    } else if (cellType === 'time') {
      displayContent = <ClockIcon className="h-4 w-4 opacity-70" />;
    } else {
      displayContent = <span className="text-muted-foreground italic">Vide</span>;
    }
  }

  if ( (cellType === 'date' || cellType === 'datetime' || cellType === 'time') && 
       (!currentValue && !textOnlyIfEmptyColumns.includes(column.id) || currentValue) ) {
    let pickerComponent: React.ReactNode;
    const defaultPickerDate = new Date();
    if (cellType !== 'time') defaultPickerDate.setHours(0,0,0,0);

    if (cellType === 'date' || cellType === 'datetime') {
      const granularity: DateTimePickerProps['granularity'] = cellType === 'date' ? 'day' : 'second';
      const placeholder = cellType === 'date' ? 'Sélectionner date' : 'Sélectionner date et heure';
      const displayFormat: DateTimePickerProps['displayFormat'] = {
        hour24: cellType === 'date' ? 'dd/MM/yyyy' : 'dd/MM/yyyy HH:mm',
        hour12: cellType === 'date' ? 'dd/MM/yyyy' : 'dd/MM/yyyy hh:mm a',
      };
       if (cellType === 'datetime' && granularity === 'second') {
        displayFormat.hour24 = 'dd/MM/yyyy HH:mm:ss';
        displayFormat.hour12 = 'dd/MM/yyyy hh:mm:ss a';
      }

      // Utiliser Calendar directement pour 'date' et DateTimePicker pour 'datetime'
      pickerComponent = cellType === 'date' ? (
        <Calendar
          mode="single"
          selected={pickerValue}
          defaultMonth={pickerValue}
          onSelect={(selectedDate) => {
            setPickerValue(selectedDate);
            handleSave(selectedDate ?? null);
            setIsPopoverOpen(false);
          }}
          className="rounded-md border"
          locale={fr}
          captionLayout="dropdown"
          fromYear={1900}
          toYear={new Date().getFullYear()}
          classNames={{
            nav_button: "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100"
          }}
          initialFocus
        />
      ) : (
        <DateTimePicker
          value={pickerValue ?? (granularity === 'day' ? defaultPickerDate : undefined)}
          onChange={(date) => {
            setPickerValue(date);
          }}
          granularity={granularity}
          hourCycle={24}
          placeholder={placeholder}
          locale={fr}
          displayFormat={displayFormat}
        />
      );
    } else {
      pickerComponent = (
        <TimePickerOnly
          date={pickerValue ?? defaultPickerDate}
          onChange={(time) => {
            setPickerValue(time);
            // Sauvegarder directement lors de la sélection d'une heure
            handleSave(time ?? null);
          }}
          onSave={(time) => handleSave(time ?? null)}
          onClosePopover={() => setIsPopoverOpen(false)}
        />
      );
    }

    return (
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-full justify-start font-normal p-2 text-left focus:ring-1 focus:ring-ring focus:ring-offset-0"
            onClick={() => {
              if (!isPopoverOpen) {
                let dateToInitPicker: Date | undefined = undefined;
                if (currentValue) {
                  try {
                    if (cellType === 'date' || cellType === 'datetime') {
                      const preProcessedForPicker = parseCustomDateString(currentValue as string, cellType as 'date' | 'datetime');
                      const parsedForPicker = parseISO(preProcessedForPicker);
                      if (isValidDate(parsedForPicker)) dateToInitPicker = parsedForPicker;
                    } else if (cellType === 'time') {
                      const timePartsForPicker = (currentValue as string).split(':');
                      if (timePartsForPicker.length >= 2) {
                        const tempDateForPicker = new Date();
                        tempDateForPicker.setHours(parseInt(timePartsForPicker[0], 10), parseInt(timePartsForPicker[1], 10), timePartsForPicker[2] ? parseInt(timePartsForPicker[2], 10) : 0, 0);
                        if (isValidDate(tempDateForPicker)) dateToInitPicker = tempDateForPicker;
                      } else {
                        const parsedFromISOForPicker = parseISO(currentValue as string);
                        if (isValidDate(parsedFromISOForPicker)) dateToInitPicker = parsedFromISOForPicker;
                      }
                    }
                  } catch (e) {
                    console.warn(`[EditableCell] PopoverTrigger: Error parsing initial date for picker: ${currentValue}`, e);
                  }
                }
                setPickerValue(dateToInitPicker || defaultPickerDate);
              }
            }}
          >
            {displayValueOverride && !isPopoverOpen ? displayValueOverride : displayContent}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {pickerComponent}
        </PopoverContent>
      </Popover>
    );
  }
  
  return (
    <div 
      className="p-2 h-full min-h-[30px] flex items-center cursor-pointer w-full" 
      onClick={() => {
        if (cellType === 'text' && !isEditingText) {
          setIsEditingText(true);
        }
      }}
    >
      {displayValueOverride && !isEditingText ? displayValueOverride : displayContent}
    </div>
  );
});

EditableCell.displayName = 'EditableCell'; 