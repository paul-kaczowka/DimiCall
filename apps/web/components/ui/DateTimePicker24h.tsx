"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format, isValid } from "date-fns";
import { fr } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface DateTimePicker24hProps {
  onDateTimeSelected: (date: Date) => void;
  initialDateTime?: Date | null;
  buttonLabel?: string;
  buttonVariant?: "outline" | "ghost" | "default" | "link" | "secondary" | "destructive" | null | undefined;
  buttonClassName?: string;
  children?: React.ReactNode;
}

export function DateTimePicker24h({ 
  onDateTimeSelected, 
  initialDateTime = null,
  buttonLabel = "MM/DD/YYYY hh:mm",
  buttonVariant = "outline",
  buttonClassName,
  children
}: DateTimePicker24hProps) {
  const [date, setDate] = React.useState<Date | undefined>(initialDateTime ?? undefined);
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    setDate(initialDateTime ?? undefined);
  }, [initialDateTime]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate && isValid(selectedDate)) {
      const newDateToSet = date ? new Date(date) : new Date();
      newDateToSet.setFullYear(selectedDate.getFullYear());
      newDateToSet.setMonth(selectedDate.getMonth());
      newDateToSet.setDate(selectedDate.getDate());
      if (!date) { 
        newDateToSet.setHours(0,0,0,0);
      }
      setDate(newDateToSet);
    }
  };

  const handleTimeChange = (
    type: "hour" | "minute",
    value: string
  ) => {
    const newDateToSet = date ? new Date(date) : new Date(); 
    if (type === "hour") {
      newDateToSet.setHours(parseInt(value));
    } else if (type === "minute") {
      newDateToSet.setMinutes(parseInt(value));
    }
    if (isValid(newDateToSet)) {
      setDate(newDateToSet);
    } else {
      console.error("Date invalide après modification de l'heure:", newDateToSet);
    }
  };

  const handleConfirm = () => {
    if (date && isValid(date)) {
      onDateTimeSelected(date);
      setIsOpen(false);
    } else if (date) {
      console.error("Tentative de confirmation avec une date invalide:", date);
    }
  };
  
  const PopoverTriggerContent = React.useMemo(() => {
    if (children) {
      if (React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, { 'aria-expanded': isOpen });
      }
      return <>{children}</>; 
    }
    return (
      <Button
        variant={buttonVariant}
        className={cn(
          "w-full justify-start text-left font-normal",
          !date && "text-muted-foreground",
          buttonClassName
        )}
        aria-expanded={isOpen}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {date && isValid(date) ? (
          format(date, "dd/MM/yyyy HH:mm", { locale: fr })
        ) : (
          <span>{buttonLabel}</span>
        )}
      </Button>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, date, isOpen, buttonVariant, buttonClassName, buttonLabel]);
  
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {PopoverTriggerContent}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <div className="sm:flex">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            initialFocus
            locale={fr} 
            captionLayout="dropdown-buttons"
            fromYear={new Date().getFullYear() - 5}
            toYear={new Date().getFullYear() + 5}
          />
          <div className="flex flex-col sm:flex-row sm:h-[300px] divide-y sm:divide-y-0 sm:divide-x border-t sm:border-t-0 sm:border-l">
            <ScrollArea className="h-[150px] sm:h-auto sm:w-auto">
              <div className="flex sm:flex-col p-2 gap-1">
                {hours.map((hour) => (
                  <Button
                    key={`hour-${hour}`}
                    size="sm" 
                    variant={date && date.getHours() === hour ? "default" : "ghost"}
                    className="sm:w-full shrink-0 aspect-square sm:aspect-auto" 
                    onClick={() => handleTimeChange("hour", hour.toString())}
                  >
                    {hour.toString().padStart(2, '0')}
                  </Button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="sm:hidden" />
            </ScrollArea>
            <ScrollArea className="h-[150px] sm:h-auto sm:w-auto">
              <div className="flex sm:flex-col p-2 gap-1">
                {Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => (
                  <Button
                    key={`minute-${minute}`}
                    size="sm" 
                    variant={date && date.getMinutes() === minute ? "default" : "ghost"}
                    className="sm:w-full shrink-0 aspect-square sm:aspect-auto"
                    onClick={() => handleTimeChange("minute", minute.toString())}
                  >
                    {minute.toString().padStart(2, '0')}
                  </Button>
                ))}
              </div>
              <ScrollBar orientation="horizontal" className="sm:hidden" />
            </ScrollArea>
          </div>
        </div>
        <div className="p-2 border-t flex justify-end">
          <Button onClick={handleConfirm} disabled={!date}>Confirmer</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
} 