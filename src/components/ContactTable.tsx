import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Contact, ContactStatus, CallStates, Theme } from '../types';
import { cn } from '../lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Phone, User, Mail, MessageCircle, Clock, Calendar as CalendarIcon, FileText, ArrowUpDown, 
  ArrowUp, ArrowDown, Trash2, Zap, Timer, Eye, EyeOff, Settings2, GripVertical, Move
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { formatPhoneNumber } from '../services/dataService';

type SortDirection = 'asc' | 'desc' | null;

// Configuration des colonnes
interface ColumnConfig {
  id: string;
  key: keyof Contact | 'actions';
  label: string;
  icon: React.ComponentType<any>;
  width?: string;
  minWidth?: string;
  canHide: boolean;
  canSort: boolean;
  defaultVisible: boolean;
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  {
    id: 'prenom',
    key: 'prenom',
    label: 'Prénom',
    icon: User,
    width: 'auto',
    minWidth: '100px',
    canHide: true,
    canSort: true,
    defaultVisible: true,
  },
  {
    id: 'nom',
    key: 'nom',
    label: 'Nom',
    icon: User,
    width: 'auto',
    minWidth: '100px',
    canHide: true,
    canSort: true,
    defaultVisible: true,
  },
  {
    id: 'telephone',
    key: 'telephone',
    label: 'Téléphone',
    icon: Phone,
    width: 'auto',
    minWidth: '120px',
    canHide: true,
    canSort: true,
    defaultVisible: true,
  },
  {
    id: 'email',
    key: 'email',
    label: 'Mail',
    icon: Mail,
    width: 'auto',
    minWidth: '150px',
    canHide: true,
    canSort: true,
    defaultVisible: true,
  },
  {
    id: 'statut',
    key: 'statut',
    label: 'Statut',
    icon: FileText,
    width: 'auto',
    minWidth: '120px',
    canHide: true,
    canSort: true,
    defaultVisible: true,
  },
  {
    id: 'commentaire',
    key: 'commentaire',
    label: 'Commentaire',
    icon: MessageCircle,
    width: 'auto',
    minWidth: '150px',
    canHide: true,
    canSort: true,
    defaultVisible: false,
  },
  {
    id: 'dateRappel',
    key: 'dateRappel',
    label: 'Date Rappel',
    icon: CalendarIcon,
    width: 'auto',
    minWidth: '120px',
    canHide: true,
    canSort: true,
    defaultVisible: false,
  },
  {
    id: 'heureRappel',
    key: 'heureRappel',
    label: 'Heure Rappel',
    icon: Clock,
    width: 'auto',
    minWidth: '120px',
    canHide: true,
    canSort: true,
    defaultVisible: false,
  },
  {
    id: 'dateRDV',
    key: 'dateRDV',
    label: 'Date RDV',
    icon: CalendarIcon,
    width: 'auto',
    minWidth: '120px',
    canHide: true,
    canSort: true,
    defaultVisible: false,
  },
  {
    id: 'heureRDV',
    key: 'heureRDV',
    label: 'Heure RDV',
    icon: Clock,
    width: 'auto',
    minWidth: '120px',
    canHide: true,
    canSort: true,
    defaultVisible: false,
  },
  {
    id: 'dateAppel',
    key: 'dateAppel',
    label: 'Date Appel',
    icon: CalendarIcon,
    width: 'auto',
    minWidth: '120px',
    canHide: true,
    canSort: true,
    defaultVisible: false,
  },
  {
    id: 'heureAppel',
    key: 'heureAppel',
    label: 'Heure Appel',
    icon: Clock,
    width: 'auto',
    minWidth: '120px',
    canHide: true,
    canSort: true,
    defaultVisible: false,
  },
  {
    id: 'dureeAppel',
    key: 'dureeAppel',
    label: 'Durée Appel',
    icon: Timer,
    width: 'auto',
    minWidth: '120px',
    canHide: true,
    canSort: true,
    defaultVisible: false,
  },
  {
    id: 'actions',
    key: 'actions',
    label: 'Actions',
    icon: Settings2,
    width: '80px',
    minWidth: '80px',
    canHide: false,
    canSort: false,
    defaultVisible: true,
  },
];

const INPUT_BASE_CLASS = "h-8 px-2 text-xs border border-border/50 rounded-md bg-background/80 focus:bg-background focus:border-primary/50 transition-colors";

interface StatusComboBoxProps {
  value: ContactStatus;
  onChange: (newStatus: ContactStatus) => void;
  theme: Theme;
}

const StatusComboBox: React.FC<StatusComboBoxProps> = ({ value, onChange, theme }) => {
  const getStatusConfig = (status: ContactStatus) => {
    switch (status) {
      case ContactStatus.NonDefini: 
        return { 
          color: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200', 
          dot: 'bg-gray-400' 
        };
      case ContactStatus.MauvaisNum: 
        return { 
          color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200', 
          dot: 'bg-red-500' 
        };
      case ContactStatus.Repondeur: 
        return { 
          color: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-200', 
          dot: 'bg-orange-500' 
        };
      case ContactStatus.ARappeler: 
        return { 
          color: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-200', 
          dot: 'bg-yellow-500' 
        };
      case ContactStatus.PasInteresse: 
        return { 
          color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200', 
          dot: 'bg-red-500' 
        };
      case ContactStatus.Argumente: 
        return { 
          color: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200', 
          dot: 'bg-blue-500' 
        };
      case ContactStatus.DO: 
        return { 
          color: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200', 
          dot: 'bg-emerald-500' 
        };
      case ContactStatus.RO: 
        return { 
          color: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-200', 
          dot: 'bg-green-500' 
        };
      case ContactStatus.ListeNoire: 
        return { 
          color: 'bg-gray-800 text-gray-100 border-gray-600 dark:bg-gray-700 dark:text-gray-100', 
          dot: 'bg-gray-600' 
        };
      case ContactStatus.Premature: 
        return { 
          color: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200', 
          dot: 'bg-purple-500' 
        };
      default: 
        return { 
          color: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200', 
          dot: 'bg-gray-400' 
        };
    }
  };

  const config = getStatusConfig(value);

  return (
    <Select value={value} onValueChange={(newValue) => onChange(newValue as ContactStatus)}>
      <SelectTrigger className="border-none bg-transparent p-0 h-auto">
        <div className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
          config.color
        )}>
          <div className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
          {value}
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover border shadow-lg">
        {Object.values(ContactStatus).map(status => {
          const statusConfig = getStatusConfig(status);
          return (
            <SelectItem key={status} value={status}>
              <div className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                statusConfig.color
              )}>
                <div className={cn("w-1.5 h-1.5 rounded-full", statusConfig.dot)} />
                {status}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

interface CommentWidgetProps {
  value: string;
  onChange: (newComment: string) => void;
  theme: Theme;
}

const CommentWidget: React.FC<CommentWidgetProps> = ({ value, onChange, theme }) => {
  const [comment, setComment] = useState(value);

  // Synchroniser l'état local avec la prop value quand elle change (ex: qualification)
  useEffect(() => {
    setComment(value);
  }, [value]);

  const handleBlur = () => {
    if (comment !== value) {
      onChange(comment);
    }
  };

  const insertQuickComment = (quickComment: string) => {
    const newComment = (comment ? comment + " " : "") + quickComment;
    setComment(newComment);
    onChange(newComment);
  };

  const quickComments = [
    "Intéressé", "Non disponible", "Rappeler plus tard", "Numéro incorrect",
    "Pas de réponse", "Occupé", "RDV fixé", "Déjà client"
  ];

  return (
    <div className="flex items-center space-x-1">
      <Input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={handleBlur}
        placeholder="Commentaire..."
        className={INPUT_BASE_CLASS}
      />
      <Select onValueChange={insertQuickComment}>
        <SelectTrigger className="h-6 w-6 p-0 border-none bg-transparent hover:bg-muted/50 rounded-sm">
          <Zap className="h-3 w-3 text-muted-foreground hover:text-primary transition-colors" />
        </SelectTrigger>
        <SelectContent className="bg-popover border shadow-lg">
          {quickComments.map(qc => (
            <SelectItem key={qc} value={qc} className="text-xs">
              {qc}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

interface DateTimeCellProps {
  value: string; 
  type: 'date' | 'time';
  onChange: (newValue: string) => void;
  theme: Theme;
}

const DateTimeCell: React.FC<DateTimeCellProps> = ({ value, type, onChange, theme }) => {
  const [currentValue, setCurrentValue] = useState(value);
  const [showInput, setShowInput] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const inputType = type === 'date' ? 'date' : 'time';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentValue(e.target.value);
  };

  const handleBlur = () => {
    if (currentValue !== value) {
      onChange(currentValue);
    }
    setShowInput(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setCurrentValue(value);
      setShowInput(false);
    }
  };

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  if (type === 'date') {
    const handleDateSelect = (date: Date | undefined) => {
      if (date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day}`;
        onChange(formattedDate);
        setSelectedDate(date);
      }
      setIsCalendarOpen(false);
    };

    const displayValue = value ? new Date(value).toLocaleDateString('fr-FR') : '';

    return (
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-8 px-2 text-xs justify-start text-left font-normal",
              !value && "text-muted-foreground",
              INPUT_BASE_CLASS
            )}
          >
            <CalendarIcon className="mr-2 h-3 w-3" />
            {displayValue || "Sélectionner"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate || (value ? new Date(value) : undefined)}
            onSelect={handleDateSelect}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (type === 'time') {
    const [isTimeOpen, setIsTimeOpen] = useState(false);
    
    const handleTimeSelect = (type: 'hour' | 'minute', timeValue: number) => {
      const parts = currentValue.split(':');
      const hours = type === 'hour' ? timeValue.toString().padStart(2, '0') : (parts[0] || '00');
      const minutes = type === 'minute' ? timeValue.toString().padStart(2, '0') : (parts[1] || '00');
      const newTime = `${hours}:${minutes}`;
      setCurrentValue(newTime);
      onChange(newTime);
    };

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = Array.from({ length: 60 }, (_, i) => i);

    return (
      <Popover open={isTimeOpen} onOpenChange={setIsTimeOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-8 px-2 text-xs justify-start text-left font-normal",
              !value && "text-muted-foreground",
              INPUT_BASE_CLASS
            )}
          >
            <Clock className="mr-2 h-3 w-3" />
            {currentValue || "Heure"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium mb-2">Heures</div>
              <ScrollArea className="h-40">
                <div className="grid gap-1">
                  {hours.map(hour => (
                    <Button
                      key={hour}
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs justify-start"
                      onClick={() => handleTimeSelect('hour', hour)}
                    >
                      {hour.toString().padStart(2, '0')}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Minutes</div>
              <ScrollArea className="h-40">
                <div className="grid gap-1">
                  {minutes.filter((_, i) => i % 5 === 0).map(minute => (
                    <Button
                      key={minute}
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs justify-start"
                      onClick={() => handleTimeSelect('minute', minute)}
                    >
                      {minute.toString().padStart(2, '0')}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Input
      type={inputType}
      value={currentValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={INPUT_BASE_CLASS}
    />
  );
};

// Composant d'en-tête sortable
interface SortableHeaderProps {
  id: string;
  column: ColumnConfig;
  sortConfig: { key: keyof Contact | null; direction: SortDirection };
  onSort: (key: keyof Contact) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  id,
  column,
  sortConfig,
  onSort,
  children,
  style,
}) => {
  const getSortIndicator = () => {
    if (sortConfig.key === column.key && column.canSort) {
      if (sortConfig.direction === 'asc') {
        return <ArrowUp className="w-3 h-3 text-primary" />;
      } else if (sortConfig.direction === 'desc') {
        return <ArrowDown className="w-3 h-3 text-primary" />;
      }
    }
    return column.canSort ? <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" /> : null;
  };

  // CRITICAL: Styles inline pour sticky headers (basé sur React Table docs)
  const getStickyHeaderStyles = (): React.CSSProperties => {
    return {
      position: 'sticky',
      top: 0,
      zIndex: 101,
      backgroundColor: 'hsl(var(--background))',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      boxShadow: '0 2px 8px 0 rgb(0 0 0 / 0.1), 0 1px 4px -1px rgb(0 0 0 / 0.1)',
      borderBottom: '1px solid hsl(var(--border))'
    };
  };

  const handleClick = () => {
    if (column.canSort && column.key !== 'actions') {
      onSort(column.key as keyof Contact);
    }
  };

  return (
    <TableHead
      style={{
        ...getStickyHeaderStyles(), // IMPORTANT: Apply sticky styles inline!
      }}
      className={cn(
        "text-foreground h-10 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] px-2 py-1.5 text-left font-medium text-xs select-none",
        column.canSort ? "cursor-pointer hover:bg-muted transition-colors" : "",
      )}
      
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        <span className="truncate">{children}</span>
        {getSortIndicator()}
      </div>
    </TableHead>
  );
};

// Composant principal de la table
interface ContactTableProps {
  contacts: Contact[];
  callStates: CallStates;
  onSelectContact: (contact: Contact | null) => void;
  selectedContactId: string | null;
  onUpdateContact: (contact: Partial<Contact> & { id: string }) => void;
  onDeleteContact: (contactId: string) => void;
  activeCallContactId: string | null;
  theme: Theme;
  visibleColumns: Record<string, boolean>;
  columnHeaders: string[];
  contactDataKeys: (keyof Contact | 'actions' | null)[];
  onToggleColumnVisibility: (header: string) => void;
}

export const ContactTable: React.FC<ContactTableProps> = ({
  contacts,
  callStates,
  onSelectContact,
  selectedContactId,
  onUpdateContact,
  onDeleteContact,
  activeCallContactId,
  theme,
  visibleColumns,
  columnHeaders,
  contactDataKeys,
  onToggleColumnVisibility,
}) => {
  const [editingCell, setEditingCell] = useState<{ contactId: string; field: keyof Contact } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof Contact | null; direction: SortDirection }>({
    key: null,
    direction: null,
  });

  // Configuration des colonnes locales avec state
  const [columnOrder, setColumnOrder] = useState<string[]>(
    DEFAULT_COLUMNS.map(col => col.id)
  );
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
    DEFAULT_COLUMNS.reduce((acc, col) => {
      acc[col.id] = col.defaultVisible;
      return acc;
    }, {} as Record<string, boolean>)
  );

  // État pour le drag & drop
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Gestion du tri
  const handleSort = useCallback((key: keyof Contact) => {
    setSortConfig(current => {
      if (current.key === key) {
        const direction = current.direction === 'asc' ? 'desc' : current.direction === 'desc' ? null : 'asc';
        return { key: direction ? key : null, direction };
      } else {
        return { key, direction: 'asc' };
      }
    });
  }, []);

  // Tri des contacts
  const sortedContacts = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return contacts;

    return [...contacts].sort((a, b) => {
      const aVal = a[sortConfig.key!];
      const bVal = b[sortConfig.key!];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal, 'fr-FR')
          : bVal.localeCompare(aVal, 'fr-FR');
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [contacts, sortConfig]);

  // Gestion de l'édition
  const handleCellDoubleClick = (contactId: string, columnKey: keyof Contact, currentValue: any) => {
    if (columnKey === 'statut') return; // Géré par le select
    setEditingCell({ contactId, field: columnKey });
    setEditValue(currentValue || '');
  };

  const handleEditCommit = () => {
    if (editingCell) {
      onUpdateContact({
        id: editingCell.contactId,
        [editingCell.field]: editValue,
      });
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleEditCommit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  };

  // Toggle visibilité des colonnes
  const handleToggleColumnVisibility = (columnId: string, visible: boolean) => {
    setColumnVisibility(prev => ({
      ...prev,
      [columnId]: visible
    }));
  };

  // Rendu du contenu des cellules
  const renderCellContent = (contact: Contact, column: ColumnConfig) => {
    const { key: columnKey } = column;
    const isEditing = editingCell?.contactId === contact.id && editingCell?.field === columnKey;

    if (columnKey === 'actions') {
      return (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDeleteContact(contact.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    if (isEditing && columnKey !== 'statut') {
      return (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleEditCommit}
          onKeyDown={handleEditKeyDown}
          className={INPUT_BASE_CLASS}
          autoFocus
        />
      );
    }

    const value = contact[columnKey];

    switch (columnKey) {
             case 'telephone':
         return (
           <span
             className="cursor-pointer hover:text-primary transition-colors"
             onDoubleClick={() => handleCellDoubleClick(contact.id, columnKey, value)}
           >
             {formatPhoneNumber(String(value || ''))}
           </span>
         );

       case 'email':
         return (
           <span
             className="cursor-pointer hover:text-primary transition-colors truncate"
             onDoubleClick={() => handleCellDoubleClick(contact.id, columnKey, value)}
             title={String(value || '')}
           >
             {value || 'N/A'}
           </span>
         );

      case 'statut':
        return (
          <StatusComboBox
            value={value as ContactStatus}
            onChange={(newStatus) => onUpdateContact({ id: contact.id, statut: newStatus })}
            theme={theme}
          />
        );

      case 'commentaire':
                 return (
           <CommentWidget
             value={String(value || '')}
             onChange={(newComment) => onUpdateContact({ id: contact.id, commentaire: newComment })}
             theme={theme}
           />
         );

       case 'dateRappel':
       case 'dateRDV':
       case 'dateAppel':
         return (
           <DateTimeCell
             value={String(value || '')}
             type="date"
             onChange={(newValue) => onUpdateContact({ id: contact.id, [columnKey]: newValue })}
             theme={theme}
           />
         );

       case 'heureRappel':
       case 'heureRDV':
       case 'heureAppel':
       case 'dureeAppel':
         return (
           <DateTimeCell
             value={String(value || '')}
             type="time"
             onChange={(newValue) => onUpdateContact({ id: contact.id, [columnKey]: newValue })}
             theme={theme}
           />
         );

      default:
        return (
          <span
            className="cursor-pointer hover:text-primary transition-colors"
            onDoubleClick={() => handleCellDoubleClick(contact.id, columnKey, value)}
          >
            {value || 'N/A'}
          </span>
        );
    }
  };

  const hiddenColumns = DEFAULT_COLUMNS.filter(col => col.canHide && !columnVisibility[col.id]);
  
  // Colonnes visibles ordonnées
  const visibleOrderedColumns = useMemo(() => {
    return columnOrder
      .map(id => DEFAULT_COLUMNS.find(col => col.id === id))
      .filter((col): col is ColumnConfig => col !== undefined && columnVisibility[col.id]);
  }, [columnOrder, columnVisibility]);
  
  const visibleColumnsCount = visibleOrderedColumns.length;

  // Gestionnaires drag & drop
  const handleDragStart = (e: React.DragEvent, columnId: string) => {
    setDraggedColumn(columnId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', columnId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumn(columnId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Ne reset que si on quitte vraiment l'élément (pas ses enfants)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    
    if (!draggedColumn || draggedColumn === targetColumnId) {
      setDraggedColumn(null);
      setDragOverColumn(null);
      return;
    }

    const newOrder = [...columnOrder];
    const draggedIndex = newOrder.indexOf(draggedColumn);
    const targetIndex = newOrder.indexOf(targetColumnId);

    // Retirer l'élément de sa position actuelle
    newOrder.splice(draggedIndex, 1);
    // L'insérer à la nouvelle position
    newOrder.splice(targetIndex, 0, draggedColumn);

    setColumnOrder(newOrder);
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  return (
    <div className="space-y-4">
      {/* Contrôles de la table */}
      <div className="flex items-center justify-end">
        {/* Menu de gestion des colonnes */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Settings2 className="h-4 w-4 mr-2" />
              Colonnes
              {hiddenColumns.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-4 px-1 text-xs">
                  {hiddenColumns.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-sm border shadow-lg">
            <DropdownMenuLabel className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Gestion des colonnes
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {DEFAULT_COLUMNS.filter(col => col.canHide).map(column => (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="flex items-center gap-2"
                checked={columnVisibility[column.id]}
                onCheckedChange={(checked) => handleToggleColumnVisibility(column.id, checked)}
              >
                <column.icon className="h-4 w-4" />
                <span className="flex-1">{column.label}</span>
              </DropdownMenuCheckboxItem>
            ))}

            {hiddenColumns.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  className="flex items-center gap-2 text-primary"
                  checked={false}
                  onCheckedChange={() => {
                    const newVisibility = { ...columnVisibility };
                    DEFAULT_COLUMNS.filter(col => col.canHide).forEach(col => {
                      newVisibility[col.id] = true;
                    });
                    setColumnVisibility(newVisibility);
                  }}
                >
                  <Eye className="h-4 w-4" />
                  Afficher toutes les colonnes
                </DropdownMenuCheckboxItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table avec drag and drop */}
      <div className="border rounded-lg overflow-hidden">
        {/* En-tête séparé et sticky */}
        <div className="sticky top-0 z-[101] bg-background border-b border-border">
          <div className="overflow-hidden">
            <Table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                 {visibleOrderedColumns.map(column => (
                    <TableHead
                      key={column.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, column.id)}
                      onDragOver={handleDragOver}
                      onDragEnter={(e) => handleDragEnter(e, column.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, column.id)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "text-foreground h-10 align-middle whitespace-nowrap px-2 py-1.5 text-left font-medium text-xs select-none transition-all duration-200",
                        column.canSort ? "cursor-pointer hover:bg-muted" : "",
                        draggedColumn === column.id && "opacity-50 scale-95",
                        dragOverColumn === column.id && "border-l-4 border-l-primary bg-primary/10",
                        "cursor-grab active:cursor-grabbing"
                      )}
                      style={{ 
                        width: column.width,
                        minWidth: column.minWidth,
                        background: 'hsl(var(--background))',
                        backdropFilter: 'blur(8px)',
                        boxShadow: 'rgba(0, 0, 0, 0.1) 0px 2px 8px 0px, rgba(0, 0, 0, 0.1) 0px 1px 4px -1px',
                        borderBottom: '1px solid hsl(var(--border))'
                      }}
                      onClick={(e) => {
                        // Empêcher le tri si on est en train de drag
                        if (!draggedColumn && column.canSort) {
                          handleSort(column.key as keyof Contact);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <GripVertical className="w-3 h-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
                        <span className="truncate">{column.label}</span>
                        {column.canSort && sortConfig.key === column.key && (
                          <>
                            {sortConfig.direction === 'asc' && <ArrowUp className="w-3 h-3 text-muted-foreground/50" />}
                            {sortConfig.direction === 'desc' && <ArrowDown className="w-3 h-3 text-muted-foreground/50" />}
                            {!sortConfig.direction && <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />}
                          </>
                        )}
                        {column.canSort && sortConfig.key !== column.key && (
                          <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />
                        )}
                      </div>
                    </TableHead>
                 ))}
                </TableRow>
              </TableHeader>
            </Table>
          </div>
        </div>
        
        {/* Corps du tableau avec scroll */}
        <div
          className="h-[740px] overflow-auto hide-scrollbar relative bg-background"
          style={{
            // CRITICAL: Container must allow scrolling for sticky to work
          }}
        >
          <Table className="relative w-full" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <TableBody>
              {sortedContacts.map((contact, contactIndex) => {
                const isSelected = selectedContactId === contact.id;
                const callState = callStates[contact.id];
                const isActiveCall = activeCallContactId === contact.id;

                return (
                  <TableRow
                    key={contact.id}
                    className={cn(
                      "hover:bg-muted/50 cursor-pointer transition-none",
                      isSelected && "bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-900/60",
                      isActiveCall && "bg-green-100 dark:bg-green-900/20 hover:bg-green-200 dark:hover:bg-green-900/30"
                    )}
                    onClick={() => onSelectContact(contact)}
                  >
                   {visibleOrderedColumns.map(column => (
                      <TableCell
                        key={column.id}
                        className={cn(
                          "px-2 py-1.5 text-xs",
                          column.minWidth && `min-w-[${column.minWidth}]`
                        )}
                        style={{ 
                          width: column.width,
                          minWidth: column.minWidth 
                        }}
                      >
                        {renderCellContent(contact, column)}
                      </TableCell>
                   ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {contacts.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Aucun contact trouvé</p>
          <p className="text-sm">Importez des contacts pour commencer</p>
        </div>
      )}
    </div>
  );
};
