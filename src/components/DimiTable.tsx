import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Theme, Contact, CallState, CallStates, ContactStatus, Civility, EmailType } from '../types';
import { APP_NAME, headerIcons, STATUS_OPTIONS, STATUS_COLORS, QUICK_COMMENTS } from '../constants';
import { VirtualizedSupabaseTable } from './VirtualizedSupabaseTable';
import { EmailDialog, RappelDialog, RendezVousDialog, QualificationDialog, GenericInfoDialog } from './Dialogs';
import { ClientFilesPanel } from './ClientFilesPanel';
import { SupabaseDataDialog } from './SupabaseDataDialog';
  import { 
    exportContactsToFile, 
    exportDimiTableToExcel,
    importDataForDimiTable
  } from '../services/dataService';
import { supabaseService } from '../services/supabaseService';
import { useSearchDebounce } from '../hooks/useDebounce';
import { v4 as uuidv4 } from 'uuid';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { cn, searchLinkedIn, searchGoogle } from '../lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
  import { 
    Phone, Mail, MessageSquare, Bell, Calendar, CalendarSearch, FileCheck, Linkedin, Globe, 
    Download, Database, Keyboard, RefreshCw, Columns, X, Loader2, PanelRightOpen, PanelRightClose, FileSpreadsheet, CheckCircle, XCircle, ChevronLeft, ChevronRight, Search, Upload, FileDown
  } from 'lucide-react';
import { CalendarModal } from './CalendarModal';

interface DimiTableProps {
  theme: Theme;
  splitPanelOpen: boolean;
  setSplitPanelOpen: (open: boolean) => void;
}

export const DimiTable: React.FC<DimiTableProps> = ({ theme, splitPanelOpen, setSplitPanelOpen }) => {
  // État des données Supabase
  const [supabaseContacts, setSupabaseContacts] = useState<Contact[]>([]);
  const [rawSupabaseData, setRawSupabaseData] = useState<any[]>([]);
  const [supabaseColumns, setSupabaseColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 250;

  // États de l'interface
  const [searchTerm, setSearchTerm] = useState('');
  const [searchColumn, setSearchColumn] = useState<string>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedRawContact, setSelectedRawContact] = useState<any>(null);
  const [callStates, setCallStates] = useState<CallStates>({});
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // États pour la sélection de lignes
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null);
  
  // États pour l'import
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState<{
    data: any[];
    headers: string[];
    preview: any[];
    totalRows: number;
  } | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Debouncing pour la recherche
  const { debouncedSearchTerm, isDebouncing } = useSearchDebounce(searchTerm, 300);
  
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isRappelDialogOpen, setIsRappelDialogOpen] = useState(false);
  const [isRendezVousDialogOpen, setIsRendezVousDialogOpen] = useState(false);
  const [isQualificationDialogOpen, setIsQualificationDialogOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isFnKeysInfoOpen, setIsFnKeysInfoOpen] = useState(false);

  const [notifications, setNotifications] = useState<{ id: string; type: 'success' | 'error' | 'info'; message: string; duration: number }[]>([]);
  
  const [autoSearchMode, setAutoSearchMode] = useState<'disabled' | 'linkedin' | 'google'>('disabled');

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});

  const [showSupabaseDialog, setShowSupabaseDialog] = useState(false);
  const [autoSupabaseSync, setAutoSupabaseSync] = useState(true);

  // États pour le tri et colonnes
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' | null }>({
    key: null,
    direction: null,
  });
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Notifications
  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string, duration: number = 3000) => {
    const id = uuidv4();
    setNotifications(prev => [...prev, { id, type, message, duration }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  }, []);

  // Chargement des données normales (pagination)
  const loadSupabaseData = useCallback(async () => {
    if (isSearchMode) return; // Ne pas charger si on est en mode recherche
    
    setLoading(true);
    setError(null);
    try {
      const result = await supabaseService.getRawSupabaseData(currentPage * pageSize, pageSize);
      
      setRawSupabaseData(result.data);
      setSupabaseColumns(result.columns);
      setTotalCount(result.totalCount);
      
      if (Object.keys(visibleColumns).length === 0 && result.columns.length > 0) {
        const defaultVisible = result.columns.reduce((acc, col) => ({ ...acc, [col]: true }), {});
        setVisibleColumns({ ...defaultVisible, Actions: true, Utilisateur: true });
      }

      // Initialiser l'ordre des colonnes si nécessaire
      if (columnOrder.length === 0 && result.columns.length > 0) {
        setColumnOrder([...result.columns, 'Utilisateur']);
      }
      
      const converted = result.data.map((raw: any, index: number) => ({
        id: raw.id || uuidv4(),
        numeroLigne: (currentPage * pageSize) + index + 1,
        prenom: raw.prenom || '', nom: raw.nom || '',
        telephone: raw.numero || raw.telephone || '', email: raw.mail || raw.email || '',
        statut: raw.statut_final || raw.statut || ContactStatus.NonDefini,
        commentaire: raw.commentaires_appel_1 || raw.commentaire || '',
        // ... (autres champs)
      })) as Contact[];
      setSupabaseContacts(converted);

      showNotification('success', `${result.data.length} contacts chargés.`);
    } catch (err) {
      setError('Erreur de chargement Supabase.');
      showNotification('error', 'Erreur de chargement Supabase.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, showNotification, visibleColumns, isSearchMode]);

  // Recherche globale dans toute la base de données
  const performGlobalSearch = useCallback(async (searchQuery: string, column: string = 'all') => {
    if (!searchQuery.trim()) {
      setIsSearchMode(false);
      setCurrentPage(0);
      return;
    }

    setIsSearchMode(true);
    setSearchLoading(true);
    setError(null);
    
    try {
      const result = await supabaseService.searchInFullDatabaseSmart(
        searchQuery, 
        column, 
        currentPage, 
        pageSize
      );
      
      setRawSupabaseData(result.data);
      setTotalCount(result.totalCount);
      
      // Découvrir les colonnes si nécessaire
      if (result.data.length > 0 && supabaseColumns.length === 0) {
        const discoveredColumns = Object.keys(result.data[0]);
        setSupabaseColumns(discoveredColumns);
        
        if (Object.keys(visibleColumns).length === 0) {
          const defaultVisible = discoveredColumns.reduce((acc, col) => ({ ...acc, [col]: true }), {});
          setVisibleColumns({ ...defaultVisible, Actions: true, Utilisateur: true });
        }
        
        if (columnOrder.length === 0) {
          setColumnOrder([...discoveredColumns, 'Utilisateur']);
        }
      }

      const searchResultsCount = result.data.length;
      const totalResults = result.totalCount;
      
      showNotification(
        'success', 
        `Recherche: ${searchResultsCount} résultats trouvés sur ${totalResults} total pour "${searchQuery}"`,
        4000
      );
      
    } catch (err) {
      setError('Erreur lors de la recherche globale.');
      showNotification('error', 'Erreur lors de la recherche globale.');
    } finally {
      setSearchLoading(false);
    }
  }, [currentPage, pageSize, showNotification, supabaseColumns, visibleColumns, columnOrder]);

  // Effet pour la recherche avec debouncing
  useEffect(() => {
    if (debouncedSearchTerm.trim()) {
      performGlobalSearch(debouncedSearchTerm, searchColumn);
    } else {
      setIsSearchMode(false);
      setCurrentPage(0);
    }
  }, [debouncedSearchTerm, searchColumn, performGlobalSearch]);

  // Effet pour gérer le changement de page
  useEffect(() => {
    if (isSearchMode && debouncedSearchTerm.trim()) {
      performGlobalSearch(debouncedSearchTerm, searchColumn);
    } else {
      loadSupabaseData();
    }
  }, [currentPage, isSearchMode, debouncedSearchTerm, searchColumn, performGlobalSearch, loadSupabaseData]);

  // Effet initial pour charger les données au démarrage
  useEffect(() => {
    if (!isSearchMode && !debouncedSearchTerm.trim()) {
      loadSupabaseData();
    }
  }, []); // Une seule fois au montage

  // Mise à jour
  const updateContact = useCallback(async (updatedFields: Partial<Contact> & { id: string }) => {
    // ... (logique de mise à jour)
  }, [selectedContact, autoSupabaseSync]);

  // Nouvelle fonction pour mettre à jour les données brutes localement
  const updateRawData = useCallback((id: string, fieldName: string, newValue: any) => {
    setRawSupabaseData(prevData => 
      prevData.map(item => 
        item.UID === id || item.id === id 
          ? { ...item, [fieldName]: newValue }
          : item
      )
    );
    
    // Mettre à jour aussi le contact sélectionné si c'est le même
    if (selectedContact && (selectedContact.id === id)) {
      setSelectedContact(prev => prev ? { ...prev, [fieldName]: newValue } : null);
    }
    

  }, [selectedContact]);

  // Sélection de contact unique - sera définie après sortedAndFilteredData

  // Les fonctions de sélection seront définies après sortedAndFilteredData

  // Suppression
  const handleDeleteContact = useCallback((contactId: string) => {
    setRawSupabaseData(prev => prev.filter(c => c.id !== contactId));
    // ... (logique de suppression)
  }, [selectedContact, showNotification]);

  // Les données sont maintenant déjà filtrées côté serveur
  // On retourne directement rawSupabaseData qui contient les résultats de recherche ou de pagination
  const filteredRawData = useMemo(() => {
    return rawSupabaseData;
  }, [rawSupabaseData]);

  // ... (autres handlers: handleLinkedInSearch, handleGoogleSearch, etc.)

  // Raccourcis clavier
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ... (logique des raccourcis F2-F10)
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedContact, updateContact, showNotification]);

  // Export
  const handleExport = useCallback((format: 'csv' | 'xlsx') => {
    // Note: exportContactsToFile attend des `Contact[]`. On doit convertir `filteredRawData`.
    // Pour l'instant, on exporte les données brutes. Une adaptation de `exportContactsToFile` serait nécessaire.
    exportContactsToFile(filteredRawData, format);
    showNotification('success', `Export ${format.toUpperCase()} terminé`);
  }, [filteredRawData, showNotification]);

  // Fonctions de tri
  const handleSort = useCallback((columnKey: string) => {
    setSortConfig(prev => {
      if (prev.key === columnKey) {
        // Cycle through: null -> asc -> desc -> null
        const newDirection = prev.direction === null ? 'asc' : 
                           prev.direction === 'asc' ? 'desc' : null;
        return { key: newDirection ? columnKey : null, direction: newDirection };
      }
      return { key: columnKey, direction: 'asc' };
    });
  }, []);

  // Fonctions drag and drop pour colonnes
  const handleDragStart = useCallback((columnId: string) => {
    setDraggedColumn(columnId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((columnId: string) => {
    if (draggedColumn && draggedColumn !== columnId) {
      setDragOverColumn(columnId);
    }
  }, [draggedColumn]);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback((targetColumnId: string) => {
    if (!draggedColumn || draggedColumn === targetColumnId) return;

    const newOrder = [...columnOrder];
    const draggedIndex = newOrder.indexOf(draggedColumn);
    const targetIndex = newOrder.indexOf(targetColumnId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedColumn);
      setColumnOrder(newOrder);
    }

    setDraggedColumn(null);
    setDragOverColumn(null);
  }, [draggedColumn, columnOrder]);

  const handleDragEnd = useCallback(() => {
    setDraggedColumn(null);
    setDragOverColumn(null);
  }, []);

  // Pagination
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCount);

  const goToPage = useCallback((page: number) => {
    if (page >= 0 && page < totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const goToFirstPage = useCallback(() => goToPage(0), [goToPage]);
  const goToLastPage = useCallback(() => goToPage(totalPages - 1), [goToPage, totalPages]);
  const goToPrevPage = useCallback(() => goToPage(currentPage - 1), [goToPage, currentPage]);
  const goToNextPage = useCallback(() => goToPage(currentPage + 1), [goToPage, currentPage]);

  // Données triées
  const sortedAndFilteredData = useMemo(() => {
    let result = [...filteredRawData];
    
    if (sortConfig.key && sortConfig.direction) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key!];
        const bVal = b[sortConfig.key!];
        
        if (aVal === bVal) return 0;
        
        const comparison = aVal < bVal ? -1 : 1;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }
    
    return result;
  }, [filteredRawData, sortConfig]);

  // Colonnes ordonnées
  const orderedColumns = useMemo(() => {
    if (columnOrder.length === 0) return supabaseColumns;
    return columnOrder.filter(col => supabaseColumns.includes(col));
  }, [columnOrder, supabaseColumns]);

  // Sélection de contact unique (maintenant après sortedAndFilteredData)
  const handleRowSelection = useCallback((contact: Contact | null) => {
    setSelectedContact(contact);
    
    // Trouver les données brutes correspondantes
    if (contact) {
      console.log('🔍 Recherche contact brut pour:', contact);
      console.log('📋 Données disponibles:', sortedAndFilteredData.slice(0, 3));
      
      const rawContact = sortedAndFilteredData.find(raw => {
        // Multiples critères de correspondance
        const matches = [
          raw.UID && raw.UID === contact.uid,
          raw.UID && raw.UID === contact.id,
          raw.id && raw.id.toString() === contact.uid_supabase,
          raw.id && raw.id.toString() === contact.id,
          raw.id && raw.id === contact.id,
          // Correspondance par nom et téléphone comme fallback
          raw.prenom === contact.prenom && raw.nom === contact.nom && raw.numero === contact.telephone
        ];
        
        const isMatch = matches.some(Boolean);
        if (isMatch) {
          console.log('✅ Contact brut trouvé:', raw);
        }
        return isMatch;
      });
      
      if (!rawContact) {
        console.log('❌ Aucun contact brut trouvé pour:', contact);
      }
      
      setSelectedRawContact(rawContact || null);
      
      if (autoSearchMode !== 'disabled') {
        if (autoSearchMode === 'linkedin') {
          searchLinkedIn(contact.prenom, contact.nom);
        } else {
          searchGoogle(contact.prenom, contact.nom);
        }
      }
    } else {
      setSelectedRawContact(null);
    }
  }, [autoSearchMode, sortedAndFilteredData]);

  // Sélection multiple avec checkboxes
  const handleRowSelectionChange = useCallback((rowId: string, isSelected: boolean, event?: React.MouseEvent) => {
    if (event?.shiftKey && lastSelectedRowId) {
      // Sélection batch avec Shift (comme Excel)
      const currentData = sortedAndFilteredData;
      const lastIndex = currentData.findIndex(item => String(item.id || item.UID) === lastSelectedRowId);
      const currentIndex = currentData.findIndex(item => String(item.id || item.UID) === rowId);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const startIndex = Math.min(lastIndex, currentIndex);
        const endIndex = Math.max(lastIndex, currentIndex);
        
        setRowSelection(prev => {
          const newSelection = { ...prev };
          for (let i = startIndex; i <= endIndex; i++) {
            const item = currentData[i];
            const itemId = String(item.id || item.UID);
            newSelection[itemId] = isSelected;
          }
          return newSelection;
        });
      }
    } else {
      // Sélection individuelle
      setRowSelection(prev => ({
        ...prev,
        [rowId]: isSelected
      }));
    }
    
    setLastSelectedRowId(rowId);
  }, [lastSelectedRowId, sortedAndFilteredData]);

  // Sélection de toutes les lignes visibles
  const handleSelectAll = useCallback((isSelected: boolean) => {
    const newSelection: Record<string, boolean> = {};
    if (isSelected) {
      sortedAndFilteredData.forEach(item => {
        const itemId = String(item.id || item.UID);
        newSelection[itemId] = true;
      });
    }
    setRowSelection(newSelection);
  }, [sortedAndFilteredData]);

  // Obtenir les lignes sélectionnées
  const selectedRows = useMemo(() => {
    return sortedAndFilteredData.filter(item => {
      const itemId = String(item.id || item.UID);
      return rowSelection[itemId];
    });
  }, [sortedAndFilteredData, rowSelection]);

  // Nombre de lignes sélectionnées
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;

  // Fonctions d'import et export
  const handleImportSelected = useCallback(() => {
    setShowImportDialog(true);
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    setImportLoading(true);
    try {
      const result = await importDataForDimiTable(file);
      setImportData(result);
      showNotification('success', `Fichier analysé: ${result.totalRows} lignes trouvées`);
    } catch (error: any) {
      showNotification('error', error.message);
      setImportData(null);
    } finally {
      setImportLoading(false);
    }
  }, [showNotification]);

  const handleConfirmImport = useCallback(async () => {
    if (!importData) return;
    
    setImportLoading(true);
    try {
      // Valider que les colonnes nécessaires sont présentes
      const requiredColumns = ['UID'];
      const missingColumns = requiredColumns.filter(col => !importData.headers.includes(col));
      
      if (missingColumns.length > 0) {
        throw new Error(`Colonnes manquantes: ${missingColumns.join(', ')}`);
      }

      // Transformer les données pour l'import avec mapping intelligent
      const mappedData = importData.data.map(row => {
        const mapped: any = {
          UID: row.UID || row.uid || row.Id || row.ID
        };

        // Mapping flexible pour les champs d'appel
        const dateFields = ['date_appel', 'date', 'Date_appel', 'DATE_APPEL'];
        const statutFields = ['statut_appel', 'statut', 'Statut_appel', 'STATUT_APPEL'];
        const commentFields = ['commentaires_appel', 'commentaire', 'commentaires', 'Commentaires_appel', 'COMMENTAIRES_APPEL'];

        // Trouver et mapper les champs
        dateFields.forEach(field => {
          if (row[field] && !mapped.date_appel) {
            mapped.date_appel = row[field];
          }
        });

        statutFields.forEach(field => {
          if (row[field] && !mapped.statut_appel) {
            mapped.statut_appel = row[field];
          }
        });

        commentFields.forEach(field => {
          if (row[field] && !mapped.commentaires_appel) {
            mapped.commentaires_appel = row[field];
          }
        });

        return mapped;
      }).filter(item => item.UID); // Filtrer les lignes sans UID

      if (mappedData.length === 0) {
        throw new Error('Aucune ligne valide trouvée (UID manquant)');
      }

      // Effectuer l'import avec la logique de slots
      const result = await supabaseService.batchUpdateContactsWithCalls(mappedData);
      
      if (result.success > 0) {
        showNotification('success', 
          `Import réussi: ${result.success} contacts mis à jour` + 
          (result.failed > 0 ? ` (${result.failed} échecs)` : '')
        );
        
        // Recharger les données pour refléter les changements
        loadSupabaseData();
      } else {
        showNotification('error', `Import échoué: ${result.failed} erreurs`);
      }

      // Afficher les détails des résultats
      const successSlots = result.results.filter(r => r.success);
      if (successSlots.length > 0) {
        const slotSummary = successSlots.reduce((acc, r) => {
          const slot = r.usedSlot || 0;
          acc[slot] = (acc[slot] || 0) + 1;
          return acc;
        }, {} as Record<number, number>);

        const slotDetails = Object.entries(slotSummary)
          .map(([slot, count]) => `${count} en slot ${slot}`)
          .join(', ');
        
        console.log(`📊 Répartition des imports: ${slotDetails}`);
      }
      
      // Fermer le dialog
      setShowImportDialog(false);
      setImportData(null);
      
    } catch (error: any) {
      showNotification('error', 'Erreur lors de l\'import: ' + error.message);
    } finally {
      setImportLoading(false);
    }
  }, [importData, showNotification, loadSupabaseData]);

  const handleExportSelected = useCallback(() => {
    if (selectedCount === 0) {
      showNotification('info', 'Veuillez sélectionner au moins une ligne à exporter');
      return;
    }
    
    try {
      exportDimiTableToExcel(selectedRows);
      showNotification('success', `Export de ${selectedCount} lignes réussi`);
    } catch (error) {
      showNotification('error', 'Erreur lors de l\'export');
    }
  }, [selectedRows, selectedCount, showNotification]);



  const RibbonButton: React.FC<any> = ({ onClick, icon, label, disabled, className, children }) => (
    <Button
      variant="ghost" size="sm" disabled={disabled} onClick={onClick}
      className={cn("flex flex-col items-center justify-center h-12", className)}
    >
      <div className="w-4 h-4 mb-1">{icon}</div>
      <span className="text-[10px] leading-tight">{label}</span>
    </Button>
  );

  return (
    <>
      {/* Ruban d'actions */}
      <Card>
        <div className="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm">
          <div className="flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">DimiTable - Gestion des Données</h2>
              </div>
              
              {selectedCount > 0 && (
                <Badge variant="secondary" className="text-sm">
                  {selectedCount} ligne(s) sélectionnée(s)
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportSelected}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Importer
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSelected}
                disabled={selectedCount === 0}
                className="flex items-center gap-2"
              >
                <FileDown className="h-4 w-4" />
                Exporter ({selectedCount})
              </Button>
              
              {selectedCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRowSelection({})}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Désélectionner
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
      
      {/* Search Bar & Controls */}
      <div className="flex gap-2 items-center p-2">
        <Select value={searchColumn} onValueChange={setSearchColumn}>
          <SelectTrigger className="w-48 text-xs h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les colonnes</SelectItem>
            {supabaseColumns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
          </SelectContent>
        </Select>
        
        <div className="flex-1 relative">
          <Input
            placeholder="Rechercher dans toute la base de données..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs h-8 pl-8 pr-8"
          />
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          {(searchLoading || isDebouncing) && (
            <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>

        {searchTerm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearchTerm('')}
            className="h-8 px-2"
          >
            <X className="h-3 w-3" />
          </Button>
        )}

        <Badge 
          variant={isSearchMode ? "default" : "secondary"} 
          className="text-xs px-2 py-1"
        >
          {isSearchMode ? `${totalCount} résultats` : `Page ${currentPage + 1}/${totalPages}`}
        </Badge>
        
        {/* ... (autres contrôles: colonnes visibles, pagination) */}
      </div>

      {error && <div>{error}</div>}

      {/* Table Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <VirtualizedSupabaseTable
            rawData={sortedAndFilteredData}
            columns={orderedColumns}
            callStates={callStates}
            onSelectContact={handleRowSelection}
            selectedContactId={selectedContact?.id || null}
            onUpdateContact={updateContact}
            onUpdateRawData={updateRawData}
            onDeleteContact={handleDeleteContact}
            activeCallContactId={null}
            theme={theme}
            visibleColumns={visibleColumns}
            onSort={handleSort}
            sortConfig={sortConfig}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            draggedColumn={draggedColumn}
            dragOverColumn={dragOverColumn}
            showNotification={showNotification}
            // Props pour la sélection de lignes
            rowSelection={rowSelection}
            onRowSelectionChange={handleRowSelectionChange}
            onSelectAll={handleSelectAll}
            enableRowSelection={true}
          />
          
          {splitPanelOpen && (
            <div className="w-1/3 min-w-[300px]">
              <ClientFilesPanel
                contact={selectedRawContact}
                theme={theme}
                showNotification={showNotification}
                activeCallContactId={null}
                callStartTime={null}
              />
            </div>
          )}
        </div>
        
        {/* Pagination moderne - maintenant bien en dessous de la table */}
        <div className={`
          flex items-center justify-between px-4 py-3 border-t flex-shrink-0
          ${theme === Theme.Dark 
            ? 'bg-oled-surface border-oled-border' 
            : 'bg-background border-border'
          }
        `}>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {isSearchMode ? (
              <>
                <Search className="inline w-3 h-3 mr-1" />
                Recherche: {startIndex + 1} à {endIndex} sur {totalCount} résultats
                {debouncedSearchTerm && (
                  <span className="ml-1 text-xs bg-primary/10 px-2 py-0.5 rounded">
                    "{debouncedSearchTerm}"
                  </span>
                )}
              </>
            ) : (
              `Affichage de ${startIndex + 1} à ${endIndex} sur ${totalCount} entrées`
            )}
          </span>
        </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goToFirstPage}
              disabled={currentPage === 0}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
              <ChevronLeft className="h-4 w-4 -ml-1" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage === 0}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 7) {
                  pageNum = i;
                } else if (currentPage < 3) {
                  pageNum = i;
                } else if (currentPage > totalPages - 4) {
                  pageNum = totalPages - 7 + i;
                } else {
                  pageNum = currentPage - 3 + i;
                }
                
                const isCurrentPage = pageNum === currentPage;
                
                return (
                  <Button
                    key={pageNum}
                    variant={isCurrentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => goToPage(pageNum)}
                    className="h-8 w-8 p-0"
                  >
                    {pageNum + 1}
                  </Button>
                );
              })}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage >= totalPages - 1}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={goToLastPage}
              disabled={currentPage >= totalPages - 1}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
              <ChevronRight className="h-4 w-4 -ml-1" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Page {currentPage + 1} sur {totalPages}</span>
          </div>
        </div>
      </div>

      {/* Notifications & Dialogs */}

      {/* Dialog d'import */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card text-card-foreground rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Importer des données
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowImportDialog(false);
                    setImportData(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {!importData ? (
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Sélectionnez un fichier</h3>
                  <p className="text-gray-500 mb-4">
                    Formats supportés: Excel (.xlsx, .xls) ou CSV (.csv)
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileSelect(file);
                      }
                    }}
                    disabled={importLoading}
                    className="hidden"
                    id="import-file"
                  />
                  <label
                    htmlFor="import-file"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer disabled:opacity-50"
                  >
                    {importLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyse en cours...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Choisir un fichier
                      </>
                    )}
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-green-800 dark:text-green-200 mb-2">
                      Fichier analysé avec succès
                    </h3>
                    <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                      <p>• {importData.totalRows} lignes trouvées</p>
                      <p>• {importData.headers.length} colonnes détectées</p>
                      
                      {/* Validation et mapping des colonnes */}
                      {(() => {
                        const uidColumn = importData.headers.find(h => 
                          ['UID', 'uid', 'Id', 'ID'].includes(h)
                        );
                        const dateColumn = importData.headers.find(h => 
                          ['date_appel', 'date', 'Date_appel', 'DATE_APPEL'].includes(h)
                        );
                        const statutColumn = importData.headers.find(h => 
                          ['statut_appel', 'statut', 'Statut_appel', 'STATUT_APPEL'].includes(h)
                        );
                        const commentColumn = importData.headers.find(h => 
                          ['commentaires_appel', 'commentaire', 'commentaires', 'Commentaires_appel', 'COMMENTAIRES_APPEL'].includes(h)
                        );

                        return (
                          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border">
                            <p className="font-medium mb-2">🎯 Mapping des colonnes détecté :</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className={uidColumn ? 'text-green-600' : 'text-red-600'}>
                                UID: {uidColumn || '❌ Non trouvé'}
                              </div>
                              <div className={dateColumn ? 'text-green-600' : 'text-orange-600'}>
                                Date: {dateColumn || '⚠️ Optionnel'}
                              </div>
                              <div className={statutColumn ? 'text-green-600' : 'text-orange-600'}>
                                Statut: {statutColumn || '⚠️ Optionnel'}
                              </div>
                              <div className={commentColumn ? 'text-green-600' : 'text-orange-600'}>
                                Commentaire: {commentColumn || '⚠️ Optionnel'}
                              </div>
                            </div>
                            {!uidColumn && (
                              <p className="text-red-600 text-xs mt-2 font-medium">
                                ⚠️ Colonne UID requise pour identifier les contacts
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Information sur la logique d'import */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                      📋 Logique d'import des appels
                    </h4>
                    <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                      <p>• Recherche automatique du prochain slot libre (appel_1 → appel_2 → appel_3 → appel_4)</p>
                      <p>• Si date_appel_1 ET statut_appel_1 sont remplis, passage à appel_2</p>
                      <p>• Maximum 4 appels par contact</p>
                      <p>• Les commentaires sont optionnels</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Aperçu des données (5 premières lignes)</h4>
                    <div className="border rounded-lg overflow-auto max-h-64">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            {importData.headers.map((header, index) => (
                              <th key={index} className="px-3 py-2 text-left font-medium border-r">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importData.preview.map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-t">
                              {importData.headers.map((header, colIndex) => (
                                <td key={colIndex} className="px-3 py-2 border-r text-xs">
                                  {String(row[header] || '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowImportDialog(false);
                        setImportData(null);
                      }}
                      disabled={importLoading}
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={handleConfirmImport}
                      disabled={importLoading || !importData.headers.find(h => ['UID', 'uid', 'Id', 'ID'].includes(h))}
                      className="flex items-center gap-2"
                    >
                      {importLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Import en cours...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Confirmer l'import
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}; 