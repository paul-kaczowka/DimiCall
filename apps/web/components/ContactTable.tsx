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
  TableHead,
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

// Envelopper le composant avec React.memo
export function ContactTable({ data, onEditContact, onActiveContactChange, scrollContainerRef, isProcessingId, error }: ContactTableProps) {
  const [columnPinning, setColumnPinning] = React.useState<ColumnPinningState>({}); // Aucune colonne figée par défaut
  const [activeRowId, setActiveRowId] = React.useState<string | null>(null); // Garder l'ID pour la surbrillance
  const [isScrollContainerReady, setIsScrollContainerReady] = React.useState(false);

  // Utilisation de la prop error (exemple simple)
  React.useEffect(() => {
    if (error) {
      console.warn("[ContactTable] Erreur reçue:", error);
      // Idéalement, afficher cela dans l'UI de la table ou via un toast spécifique à la table.
      // Pour l'instant, un simple log.
    }
  }, [error]);

  const internalTableWrapperRef = React.useRef<HTMLDivElement>(null); // Renommé pour éviter confusion, c'est le ref du composant Table de ui/table

  React.useEffect(() => {
    if (scrollContainerRef?.current) {
      setIsScrollContainerReady(true);
      console.log("[ContactTable] Scroll container IS READY:", scrollContainerRef.current);
    } else {
      // Optionnel: remettre à false si la ref disparaît (improbable dans ce flux)
      // setIsScrollContainerReady(false);
      console.log("[ContactTable] Scroll container NOT YET READY.");
    }
    // On veut que cet effet se ré-exécute si scrollContainerRef (la prop) change OU si scrollContainerRef.current change.
    // Mettre scrollContainerRef.current directement dans les dépendances d'un useEffect est généralement déconseillé
    // car sa mutation ne déclenche pas de re-render. Cependant, ici, on s'en sert pour déclencher un état.
    // Une meilleure approche serait peut-être un callback ref, mais essayons ceci pour l'instant.
  }, [scrollContainerRef]);

  // Effet pour notifier le parent du changement de la ligne active
  React.useEffect(() => {
    if (onActiveContactChange) {
      if (activeRowId) {
        // Log plus détaillé pour les types d'ID
        // console.log("[ContactTable] Inspecting before find. activeRowId:", activeRowId, "(type:", typeof activeRowId, ") First contact ID from data:", data.length > 0 ? data[0].id : "N/A", "(type:", data.length > 0 ? typeof data[0].id : "N/A", ")");
        const activeContact = data.find(contact => contact.id === activeRowId); // Comparaison directe (string vs string ou number vs number)
        // console.log("[ContactTable] Active contact ID:", activeRowId, "Found contact:", activeContact);
        onActiveContactChange(activeContact || null);
      } else {
        // console.log("[ContactTable] Active contact ID: null");
        onActiveContactChange(null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRowId, data]); // data est ajoutée comme dépendance car le contact recherché en dépend. onActiveContactChange est stable.

  // Effet pour gérer le défilement et mettre à jour la barre de progression -- SUPPRIMÉ
  // React.useEffect(() => {
  //   const container = scrollContainerRef?.current || internalTableWrapperRef.current;
  //   if (!container) return;
  //   const handleScroll = () => {
  //     const { scrollTop, scrollHeight, clientHeight } = container;
  //     const isScrollable = scrollHeight > clientHeight;
  //     let percentage = 0;
  //     console.log(`[ContactTable] Scroll Event: scrollTop=${scrollTop}, scrollHeight=${scrollHeight}, clientHeight=${clientHeight}, isScrollable=${isScrollable}`);
  //     if (isScrollable) {
  //       percentage = (scrollTop / (scrollHeight - clientHeight)) * 100;
  //     } else if (scrollHeight > 0 && clientHeight >= scrollHeight) {
  //       percentage = 100;
  //     }
  //     if (onScrollChange) {
  //       onScrollChange(Math.max(0, Math.min(percentage, 100)), isScrollable);
  //     }
  //   };
  //   container.addEventListener('scroll', handleScroll);
  //   handleScroll();
  //   const resizeObserver = new ResizeObserver(handleScroll);
  //   resizeObserver.observe(container);
  //   return () => {
  //     container.removeEventListener('scroll', handleScroll);
  //     resizeObserver.disconnect();
  //   };
  // }, [data, onScrollChange, scrollContainerRef]);

  // Définition des colonnes à l'intérieur du composant pour l'instant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = React.useMemo<ColumnDef<Contact, any>[]>(() => [
    {
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
      accessorKey: 'email',
      header: () => <IconHeader icon={Mail} text="Email" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 250,
    },
    {
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
      accessorKey: 'comment',
      header: () => <IconHeader icon={MessageSquareText} text="Commentaire" />,
      cell: (info) => {
        const { onEditContact: metaOnEditContact } = (info.table.options.meta as TableMeta);
        return <EditableCell {...info} onEditContact={metaOnEditContact} />;
      },
      size: 200,
    },
    {
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
      accessorKey: 'dureeAppel',
      header: () => <IconHeader icon={Hourglass} text="Durée Appel" />,
      cell: (info) => {
        const value = info.getValue() as string | null | undefined;
        // DEBUG: Log la valeur pour la cellule dureeAppel
        console.log(`[ContactTable dureeAppel cell] Contact ID: ${info.row.original.id}, Value from info.getValue(): ${value}`);
        return <ReadOnlyCell value={value} emptyPlaceholder="N/A" />;
      },
      size: 150,
    },
    {
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
  ], [onEditContact]); // Assurez-vous que les dépendances sont correctes, onEditContact est stable

  const table = useReactTable<Contact>({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: 'onChange', 
    state: { // Ajout de l'état du columnPinning ici
      columnPinning,
    },
    onColumnPinningChange: setColumnPinning, // Permettre la modification du pinning
    getRowId: (originalRow) => originalRow.id, // Utiliser l'ID du contact comme ID de ligne
    meta: {
      onEditContact,
      // onDeleteContact, // Supprimé
    } as TableMeta // TableMeta est maintenant plus simple
  });

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

  // Si les données sont là mais le conteneur de défilement n'est pas encore prêt
  if (data.length > 0 && !isScrollContainerReady) {
    return (
       <div className="p-4 text-center">
           Attente du conteneur de défilement pour initialiser la virtualisation...
       </div>
    );
  }

  return (
    <div className="p-4">
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
                {headerGroup.headers.map(header => (
                  <TableHead 
                    key={header.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: header.getSize(),
                      position: header.column.getIsPinned() ? 'sticky' : 'relative',
                      left: header.column.getIsPinned() === 'left' ? `${header.column.getStart('left')}px` : undefined,
                      right: header.column.getIsPinned() === 'right' ? `${header.column.getAfter('right')}px` : undefined,
                      zIndex: header.column.getIsPinned() ? 5 : 0,
                    }}
                    className="whitespace-nowrap bg-background"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            style={{
              display: 'grid',
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: 'relative',
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
                    console.log("[ContactTable] Row clicked, ID:", row.original.id);
                    setActiveRowId(row.original.id === activeRowId ? null : row.original.id);
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
         <div className="text-center p-4">Aucun contact.</div>
      )}
    </div>
  );
}

ContactTable.displayName = 'ContactTable'; 