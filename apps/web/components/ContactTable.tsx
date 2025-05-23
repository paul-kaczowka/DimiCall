'use client';

import React from 'react';
import {
  ColumnDef,
  // ColumnPinningState, // Commenté pour l'instant
  flexRender,
  getCoreRowModel,
  useReactTable,
  // createColumnHelper, // Supprimer l'import car columnHelper est commenté
  // Pour la virtualisation plus tard
  // getSortedRowModel, // Si tri nécessaire
  // getFilteredRowModel, // Si filtrage nécessaire
  // getPaginationRowModel, // Si pagination nécessaire
  Row, // Importer Row explicitement
  // Column, // Supprimé
  // Table as TanstackTableType, // Supprimé -> Ce commentaire fait référence à Table de @tanstack/react-table
  // CellContext, // Supprimé car non utilisé
  ColumnPinningState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
// import { useVirtualizer } from '@tanstack/react-virtual'; // Sera utilisé plus tard

import { Contact } from '@/types/contact'; // Assurez-vous que ce chemin est correct
// import { Button } from '@/components/ui/button'; // Supprimé car plus utilisé
import {
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Table,
} from "@/components/ui/table";
// import { Input } from "@/components/ui/input"; // Supprimé car Input n'est plus utilisé ici
import { EditableCell } from './EditableCell'; // Assurez-vous que le chemin est correct
import { StatusBadge, type Status as StatusType } from '@/components/ui/StatusBadge'; // Importer StatusBadge et le type Status
import { ReadOnlyCell } from './ReadOnlyCell'; // AJOUT: Importer ReadOnlyCell
import {
  User, 
  Mail, 
  Phone, 
  Info, 
  MessageSquareText, 
  BellRing, 
  CalendarDays, 
  Waypoints, 
  Clock, 
  Hourglass, 
  PhoneOutgoing
} from 'lucide-react';
import { cn, formatPhoneNumber } from '@/lib/utils';
import { DraggableTableHead } from "@/components/ui/DraggableTableHead"; // Ajouté
import UploadDropZone from './UploadDropZone'; // Nouvel import

// Définir les props pour ContactTable
interface ContactTableProps {
  data: Contact[];
  // setData: React.Dispatch<React.SetStateAction<Contact[]>>; // On le garde commenté pour l'instant
  onEditContact: (contactUpdate: Partial<Contact> & { id: string }) => void;
  // onActiveRowChange?: (activeRowId: string | null) => void; // Ancienne prop
  onActiveContactChange?: (contact: Contact | null) => void; // Nouvelle prop pour l'objet contact entier
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>; // Réintroduction pour le virtualiseur
  // onScrollChange?: (percentage: number, isScrollable: boolean) => void; // Supprimé
  // scrollContainerRef?: React.RefObject<HTMLDivElement | null>; // Supprimé
  // onDeleteContact: (contactId: string) => void; // Supprimé
  isProcessingId?: string | null; // AJOUT: Pour identifier la ligne en cours de traitement
  error?: string | null; // AJOUT: Pour afficher une erreur globale liée à la table/aux actions
  // isPanelOpen?: boolean; // SUPPRIMÉ: Prop non utilisée
  processFileForImport?: (file: File) => void; // Nouvelle prop pour gérer l'import de fichiers
  columns?: { id: string; label: string }[]; // Ajout: Définition des colonnes disponibles
  visibleColumns?: string[]; // Ajout: Colonnes actuellement visibles
  setVisibleColumns?: React.Dispatch<React.SetStateAction<string[]>>; // Ajout: Fonction pour modifier les colonnes visibles
}

// Définir le type pour les métadonnées de la table pour les actions
interface TableMeta {
  onEditContact: (contactUpdate: Partial<Contact> & { id: string }) => void;
  // onDeleteContact: (contactId: string) => void; // Supprimé
  // Potentiellement, ajouter une fonction pour mettre à jour les données localement pour une meilleure réactivité
  // updateData: (rowIndex: number, columnId: string, value: any) => void;
}

// Helper pour la définition des colonnes
// const columnHelper = createColumnHelper<Contact>(); // Commenté car non utilisé pour l'instant

const IconHeader = ({ icon: IconComponent, text }: { icon: React.ElementType, text: string }) => (
  <div className="flex items-center gap-2">
    <IconComponent size={16} aria-hidden="true" />
    {text}
  </div>
);

// Composant optimisé pour la cellule avec la durée d'appel
const DureeAppelCell = React.memo(({ contactId, value }: { contactId: string, value: string | null | undefined }) => {
  console.log(`[ContactTable dureeAppel cell] Contact ID: ${contactId}, Value from info.getValue(): ${value || ''}`);
  
  return (
    <ReadOnlyCell 
      value={value} 
      emptyPlaceholder="Non appelé" 
    />
  );
});
DureeAppelCell.displayName = 'DureeAppelCell';

// Envelopper le composant avec React.memo
export const ContactTable = React.memo(function ContactTableComponent({ 
  data, 
  onEditContact, 
  onActiveContactChange, 
  scrollContainerRef, 
  isProcessingId, 
  error,
  processFileForImport,
  visibleColumns,
  setVisibleColumns
}: ContactTableProps) {
  const [columnPinning, setColumnPinning] = React.useState<ColumnPinningState>({});
  const [activeRowId, setActiveRowId] = React.useState<string | null>(null);
  const [isScrollContainerReady, setIsScrollContainerReady] = React.useState(false);

  // AJOUT: État pour l'ordre des colonnes
  const [columnOrder, setColumnOrder] = React.useState<string[]>([]);

  // Optimiser la fonction de clic sur une ligne - POSITIONNER AVANT D'AUTRES HOOKS
  const handleRowClick = React.useCallback((row: Row<Contact>) => {
    console.log(`[ContactTable] Row clicked, ID: ${row.original.id}`);
    setActiveRowId(row.original.id);
  }, []);

  // Utilisation de la prop error (exemple simple)
  React.useEffect(() => {
    if (error) {
      console.warn("[ContactTable] Erreur reçue:", error);
      // Idéalement, afficher cela dans l'UI de la table ou via un toast spécifique à la table.
      // Pour l'instant, un simple log.
    }
  }, [error]);

  // Effet pour notifier le parent du changement de la ligne active - RÉAJOUTÉ
  React.useEffect(() => {
    if (onActiveContactChange && activeRowId) {
      const activeContact = data.find(contact => contact.id === activeRowId);
      onActiveContactChange(activeContact || null);
    } else if (onActiveContactChange && !activeRowId) {
      onActiveContactChange(null);
    }
  }, [activeRowId, data, onActiveContactChange]);

  const internalTableWrapperRef = React.useRef<HTMLDivElement>(null); // Renommé pour éviter confusion, c'est le ref du composant Table de ui/table

  // Réduire la fréquence des rendus en vérifiant l'état du container une seule fois
  React.useEffect(() => {
    if (scrollContainerRef?.current) {
      setIsScrollContainerReady(true);
      console.log("[ContactTable] Scroll container IS READY:", scrollContainerRef.current);
    }
  }, [scrollContainerRef]);

  // Optimisation: mémoriser les colonnes pour éviter les recréations non nécessaires
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = React.useMemo<ColumnDef<Contact, any>[]>(() => [
    {
      id: 'firstName', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'firstName',
      header: () => <IconHeader icon={User} text="Prénom" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 150,
      meta: { isPinned: true },
    },
    {
      id: 'lastName', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'lastName',
      header: () => <IconHeader icon={User} text="Nom" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 150,
      meta: { isPinned: true },
    },
    {
      id: 'email', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'email',
      header: () => <IconHeader icon={Mail} text="Email" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 250,
    },
    {
      id: 'phoneNumber', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'phoneNumber',
      header: () => <IconHeader icon={Phone} text="Téléphone" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        const originalValue = info.getValue() as string | null | undefined;
        const formattedValueNode = <span>{formatPhoneNumber(originalValue)}</span>; 
        return <EditableCell {...info} displayValueOverride={formattedValueNode} onEditContact={metaOnEditContact} />;
      },
      size: 180,
    },
    {
      id: 'status', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'status',
      header: () => <IconHeader icon={Info} text="Statut" />,
      cell: ({ row, table }) => {
        const currentStatus = row.getValue("status") as StatusType;
        const { onEditContact } = (table.options.meta as TableMeta);

        const handleStatusChange = (newStatus: StatusType) => {
          // Appeler onEditContact pour mettre à jour le statut
          // L'ID de la ligne est accessible via row.original.id (si votre type Contact a un champ id)
          if (row.original.id) {
            onEditContact({ id: row.original.id, status: newStatus });
          } else {
            console.error("L'ID du contact est manquant, impossible de mettre à jour le statut.");
          }
        };

        return (
          <StatusBadge
            currentStatus={currentStatus}
            onChangeStatus={handleStatusChange}
          />
        );
      },
      size: 120, // Vous pouvez ajuster la taille si nécessaire pour le badge/dropdown
    },
    {
      id: 'comment', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'comment',
      header: () => <IconHeader icon={MessageSquareText} text="Commentaire" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 200,
    },
    {
      id: 'dateRappel', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'dateRappel',
      header: () => <IconHeader icon={BellRing} text="Date Rappel" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 160,
      meta: { cellType: 'date' },
    },
    {
      id: 'heureRappel', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'heureRappel',
      header: () => <IconHeader icon={Clock} text="Heure Rappel" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 150,
      meta: { cellType: 'time' },
    },
    {
      id: 'dateRendezVous', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'dateRendezVous',
      header: () => <IconHeader icon={CalendarDays} text="Date RDV" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 160,
      meta: { cellType: 'date' },
    },
    {
      id: 'heureRendezVous', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'heureRendezVous',
      header: () => <IconHeader icon={Clock} text="Heure RDV" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 150,
      meta: { cellType: 'time' },
    },
    {
      id: 'dateAppel', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'dateAppel',
      header: () => <IconHeader icon={PhoneOutgoing} text="Date Appel" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 160,
      meta: { cellType: 'date' },
    },
     {
      id: 'heureAppel', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'heureAppel',
      header: () => <IconHeader icon={Clock} text="Heure Appel" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 150,
      meta: { cellType: 'time' },
    },
    {
      id: 'dureeAppel', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'dureeAppel',
      header: () => <IconHeader icon={Hourglass} text="Durée Appel" />,
      cell: (info) => <DureeAppelCell contactId={info.row.original.id} value={info.getValue()} />,
      size: 80,
    },
    {
      id: 'source', // Assurez-vous que chaque colonne a un ID unique
      accessorKey: 'source',
      header: () => <IconHeader icon={Waypoints} text="Source" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 150,
    },
    /* // COLONNE Heure RDV (Cal) SUPPRIMÉE
    {
      accessorKey: 'bookingTime',
      header: () => <IconHeader icon={Clock} text="Heure RDV (Cal)" />,
      cell: (info) => <ReadOnlyCell {...info} value={info.getValue() as string | null} />,
      size: 150,
    },
    */
    /* // COLONNE SUPPRIMÉE
    {
      accessorKey: 'bookingTitle',
      header: () => <IconHeader icon={Info} text="Titre RDV (Cal)" />,
      cell: (info) => <ReadOnlyCell {...info} value={info.getValue() as string | null} />,
      size: 200,
    },
    */
    /* // COLONNE SUPPRIMÉE
    {
      accessorKey: 'bookingDuration',
      header: () => <IconHeader icon={Hourglass} text="Durée RDV (Cal)" />,
      cell: (info) => {
        const duration = info.getValue() as number | null;
        return <ReadOnlyCell {...info} value={duration ? `${duration} min` : ''} />;
      },
      size: 150,
    },
    */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  // AJOUT: Initialiser columnOrder basé sur les colonnes initiales
  React.useEffect(() => {
    setColumnOrder(columns.map(c => c.id!)); // Utiliser l'id de ColumnDef
  }, [columns]);

  const table = useReactTable<Contact>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange', 
    state: {
      columnVisibility: visibleColumns ? 
        // Remplacer l'implémentation actuelle pour la visibilité des colonnes
        // L'état devrait être un objet où les clés sont les ID des colonnes et les valeurs sont des booléens
        // Générer un objet avec TOUTES les colonnes d'abord, puis mettre à true seulement celles dans visibleColumns
        columns.reduce((acc, column) => {
          acc[column.id!] = visibleColumns.includes(column.id!);
          return acc;
        }, {} as Record<string, boolean>) 
        : {},
      columnPinning,
      columnOrder,
    },
    onColumnOrderChange: setColumnOrder,
    onColumnPinningChange: setColumnPinning,
    onColumnVisibilityChange: (updater) => {
      if (setVisibleColumns) {
        const nextVisibility = typeof updater === 'function' ? updater(table.getState().columnVisibility) : updater;
        const currentlyVisible = Object.entries(nextVisibility)
          .filter(([, isVisible]) => isVisible)
          .map(([columnId]) => columnId);
        setVisibleColumns(currentlyVisible);
      }
    },
    getRowId: (originalRow) => originalRow.id,
    meta: {
      onEditContact,
    } as TableMeta
  });

  // AJOUT: Fonction pour déplacer les colonnes
  const moveColumn = (dragIndex: number, hoverIndex: number) => {
    const newColumnOrder = [...columnOrder];
    const draggedColumnId = newColumnOrder.splice(dragIndex, 1)[0];
    newColumnOrder.splice(hoverIndex, 0, draggedColumnId);
    setColumnOrder(newColumnOrder);
  };

  const { rows } = table.getRowModel();

  // Log pour débogage
  console.log(`[ContactTable] Render. rows.length: ${rows.length}, scrollContainerRef.current:`, scrollContainerRef?.current, `isScrollContainerReady: ${isScrollContainerReady}`);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 48, 
    getScrollElement: () => scrollContainerRef?.current || null, // Utilisation de la prop pour le virtualiseur
    overscan: 10, 
    enabled: isScrollContainerReady && !!scrollContainerRef?.current, // Activer seulement lorsque le conteneur est prêt
  });

  // Log après initialisation
  console.log(`[ContactTable] Virtualizer instance. virtualItems.length: ${rowVirtualizer.getVirtualItems().length}, getTotalSize: ${rowVirtualizer.getTotalSize()}, enabled: ${isScrollContainerReady && !!scrollContainerRef?.current}`);

  // Ajouter un gestionnaire pour UploadDropZone
  const handleFileSelected = React.useCallback((file: File) => {
    console.log('[ContactTable] Fichier sélectionné via UploadDropZone:', file);
    if (processFileForImport) {
      processFileForImport(file);
    } else {
      console.warn('[ContactTable] processFileForImport non défini, impossible de traiter le fichier.');
    }
  }, [processFileForImport]);

  // Si les données sont là mais le conteneur de défilement n'est pas encore prêt
  if (data.length > 0 && !isScrollContainerReady) {
    return (
       <div className="p-4 text-center">
           Attente du conteneur de défilement pour initialiser la virtualisation...
       </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* <p className="mb-2">Tableau des contacts (Base)</p> */}
      <div className="border rounded-md">
        <Table
          ref={internalTableWrapperRef} // Le ref du composant Table de ui/table (div externe)
          style={{
            display: 'grid',
            minWidth: table.getTotalSize(),
            minHeight: `${rowVirtualizer.getTotalSize()}px` // Ajout de minHeight
          }}
          className="min-w-full"
        >
          <TableHeader
            style={{
              display: 'grid',
              position: 'sticky',
              top: 0,
              zIndex: 25,
            }}
            className="[&_tr]:border-b bg-background"
          >
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow
                key={headerGroup.id}
                style={{ display: 'flex', width: '100%' }}
              >
                {headerGroup.headers.map((header) => {
                  const columnId = header.column.id;
                  return (
                    <DraggableTableHead
                    key={header.id}
                      id={columnId}
                      index={columnOrder.indexOf(columnId)}
                      header={header}
                      moveColumn={moveColumn}
                    style={{
                      width: header.getSize(),
                      position: header.column.getIsPinned() ? 'sticky' : 'relative',
                      left: header.column.getIsPinned() === 'left' ? `${header.column.getStart('left')}px` : undefined,
                      right: header.column.getIsPinned() === 'right' ? `${header.column.getAfter('right')}px` : undefined,
                      zIndex: header.column.getIsPinned() ? 5 : 0,
                    }}
                    className="whitespace-nowrap bg-background"
                    />
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            style={{
              display: 'grid',
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
              contain: 'paint',
            }}
          >
            {/* Affichage conditionnel des messages de chargement/état */}
            {data.length > 0 && rows.length === 0 && (
              <TableRow style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px' }}>
                  <TableCell colSpan={columns.length} className="text-center">
                      Préparation des données de la table... (Contacts: {data.length}, Lignes de table: 0)
                  </TableCell>
              </TableRow>
            )}
            {isScrollContainerReady && rows.length > 0 && rowVirtualizer.getVirtualItems().length === 0 && rowVirtualizer.getTotalSize() > 0 && (
                <TableRow style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px' }}>
                    <TableCell colSpan={columns.length} className="text-center">
                        Calcul des lignes visibles... (Virt: 0, Lignes: {rows.length}, Taille Totale Virt: {rowVirtualizer.getTotalSize()}px)
                    </TableCell>
                </TableRow>
            )}
            {isScrollContainerReady && rowVirtualizer.getTotalSize() > 0 && rowVirtualizer.getVirtualItems().map(virtualRow => {
              const row = rows[virtualRow.index] as Row<Contact>;
              const isSelected = row.id === activeRowId; // Déterminer si la ligne est sélectionnée
              // const callEnded = !!row.original.dureeAppel && row.original.dureeAppel.trim() !== ""; // Ancienne vérification
              const callEnded = !!row.original.dateAppel && row.original.dateAppel.trim() !== ""; // Nouvelle vérification basée sur dateAppel

              return (
                <TableRow
                  key={row.id}
                  data-index={virtualRow.index} // L'index de l'élément virtuel
                  ref={node => rowVirtualizer.measureElement(node)} // Mesurer l'élément
                  onClick={() => {
                    handleRowClick(row);
                  }}
                  data-state={isSelected ? "selected" : "none"} // Utiliser data-state="selected"
                  className={cn(
                    "flex absolute w-full", // Classes de base pour la virtualisation
                    "duration-300", // Ajout pour affecter `transition-colors` (qui est déjà présent sur TableRow)
                    !isSelected && "hover:bg-muted/50", // Effet de survol pour les non-sélectionnés
                    isSelected && "border-l-4 border-primary", // Notre bordure gauche personnalisée
                    isSelected && "border-b-transparent", // Rend la bordure inf. transparente si sélectionnée
                    // contactStatus === "Argumenté" && !isSelected && "bg-emerald-600 text-white hover:bg-emerald-600/90", // Ancienne condition
                    // contactStatus === "Argumenté" && isSelected && "bg-emerald-700 text-white border-emerald-800 hover:bg-emerald-700/90" // Ancienne condition
                    callEnded && !isSelected && "bg-emerald-600 text-white hover:bg-emerald-600/90", // Ligne verte si appel terminé
                    callEnded && isSelected && "bg-emerald-700 text-white border-emerald-800 hover:bg-emerald-700/90", // Ligne verte plus foncée si appel terminé et sélectionné
                    row.id === activeRowId ? "bg-muted" : "",
                    isProcessingId && isProcessingId === row.original.id ? "opacity-50 pointer-events-none" : "" // Griser si en cours de traitement
                  )}
                  style={{
                    height: `${virtualRow.size}px`, // Hauteur dynamique de la ligne virtuelle
                    transform: `translateY(${virtualRow.start}px)`, // Positionnement de la ligne virtuelle
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell 
                      key={cell.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: cell.column.getSize(),
                        position: cell.column.getIsPinned() ? 'sticky' : 'relative',
                        left: cell.column.getIsPinned() === 'left' ? `${cell.column.getStart('left')}px` : undefined,
                        right: cell.column.getIsPinned() === 'right' ? `${cell.column.getAfter('right')}px` : undefined,
                        zIndex: cell.column.getIsPinned() ? 1 : 0,
                        backgroundColor: cell.column.getIsPinned() ? 'hsl(var(--background))' : 'inherit',
                      }}
                      className={cell.column.getIsPinned() ? "bg-background" : ""}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {data.length === 0 && (
        <div className="p-4">
          <UploadDropZone onFileSelected={handleFileSelected} />
        </div>
      )}
    </div>
  );
});

ContactTable.displayName = 'ContactTable'; 