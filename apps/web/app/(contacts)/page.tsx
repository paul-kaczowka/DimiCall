'use client';

import React, { useCallback, useEffect, useState, useRef, startTransition, useMemo } from 'react';
import { useActionState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Ribbon } from '@/components/Ribbon';
import { ContactTable } from '@/components/ContactTable';
import { TableSearchBar, type SearchableColumn } from '@/components/ui/TableSearchBar';
import { useAutosaveFile } from '@/hooks/useAutosaveFile';
import { toast } from 'react-toastify';
import { importContactsAction, updateContactAction, clearAllDataAction, callAction, hangUpCallAction } from '@/app/actions';
import { initialActionState, type ActionState } from '@/lib/actions-utils';
import {
  Loader2,
  User,
  Mail,
  Phone,
  Info,
  MessageSquareText,
  Waypoints,
  BellRing,
  CalendarDays,
  Edit3,
  Clock,
  PhoneOutgoing,
  PhoneOff
} from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from '@/components/ui/button';
import { cn, initAnimationStyles } from '@/lib/utils';
import type { Contact as ContactSchemaType } from '@/lib/schemas/contact';
import { type StatusMapping } from '@/components/ui/FunctionKeyStatusMappingGuide';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { StatusBadge, type Status as StatusType } from '@/components/ui/StatusBadge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TimePickerOnly } from '@/components/ui/TimePickerOnly';
import { AdbStatusBadge } from '@/components/ui/AdbStatusBadge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ThemeToggleButton } from '@/components/ui/ThemeToggleButton';
import UploadDropZone from '@/components/UploadDropZone';
import ColumnVisibilityDropdown from '../../components/ui/ColumnVisibilityDropdown';

// Au début du fichier, sous les imports, ajouter l'extension de Window
declare global {
  interface Window {
    _nextContactId?: string;
    _nextContactName?: string;
    _nextContactPhone?: string;
    _currentSelectedContactId?: string; // Pour suivre le contact actuellement sélectionné
  }
}

// Définition du mapping Touche Fn <-> Statut
const fnKeyMappings: StatusMapping[] = [
  { keyName: 'F2', statusName: 'Mauvais num' },
  { keyName: 'F3', statusName: 'Répondeur' },
  { keyName: 'F4', statusName: 'À rappeler' },
  { keyName: 'F5', statusName: 'Pas intéressé' },
  { keyName: 'F6', statusName: 'Argumenté' },
  { keyName: 'F7', statusName: 'D0' },
  { keyName: 'F8', statusName: 'R0' },
  { keyName: 'F9', statusName: 'Liste noire' },
  { keyName: 'F10', statusName: 'Prématuré' },
];

// Étendre le type Contact pour inclure les informations de réservation
interface ContactAppType extends ContactSchemaType {
  bookingDate?: string | null;
  bookingTime?: string | null;
  // bookingId?: string | null; // SUPPRIMÉ
  // bookingTitle?: string | null; // SUPPRIMÉ
  // bookingDuration?: number | null; // SUPPRIMÉ
}

// Fonction utilitaire pour vérifier et formater des dates de manière sécurisée
const safeFormat = (date: Date | string | null | undefined, formatStr: string, options = {}) => {
  if (!date) return null;

  try {
    // Si c'est une chaîne, essayez de la convertir en objet Date
    const dateObj = typeof date === 'string' ? parseISO(date) : date;

    // Vérifiez si la date est valide
    if (!isValid(dateObj)) {
      console.warn("Date invalide détectée:", date);
      return null;
    }

    return format(dateObj, formatStr, options);
  } catch (error) {
    console.error("Erreur lors du formatage de la date:", error, date);
    return null;
  }
};

export default function ContactsPage() {
  // Initialiser les styles d'animation
  useEffect(() => {
    initAnimationStyles();
  }, []);

  const [contacts, setContacts] = useState<ContactAppType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // isDragOver n'est plus utilisé au niveau de la page car DropZone gère son propre état de glissement
  // const [isDragOver, setIsDragOver] = useState(false);
  const [activeContact, setActiveContactState] = useState<ContactAppType | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [contactInCallId, setContactInCallId] = useState<string | null>(null);
  const [isExportFormatDialogOpen, setIsExportFormatDialogOpen] = useState(false);
  const [isPollingActive, setIsPollingActive] = useState(false);
  const CALL_STATUS_POLLING_INTERVAL = 2000;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSearchColumn, setSelectedSearchColumn] = useState('firstName');

  const searchableColumns = useMemo((): SearchableColumn[] => [
    { value: 'firstName', label: 'Prénom', icon: <User className="h-4 w-4" /> },
    { value: 'lastName', label: 'Nom', icon: <User className="h-4 w-4" /> },
    { value: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
    { value: 'phoneNumber', label: 'Téléphone', icon: <Phone className="h-4 w-4" /> },
    { value: 'status', label: 'Statut', icon: <Info className="h-4 w-4" /> },
    { value: 'comment', label: 'Commentaire', icon: <MessageSquareText className="h-4 w-4" /> },
    { value: 'source', label: 'Source', icon: <Waypoints className="h-4 w-4" /> },
    { value: 'dateAppel', label: 'Date Appel', icon: <Phone className="h-4 w-4" /> },
    { value: 'dateRappel', label: 'Date Rappel', icon: <BellRing className="h-4 w-4" /> },
    { value: 'dateRendezVous', label: 'Date RDV', icon: <CalendarDays className="h-4 w-4" /> },
  ], []);

  const handleSearchChange = useCallback((newSearchTerm: string, newSelectedColumn: string) => {
    setSearchTerm(newSearchTerm);
    setSelectedSearchColumn(newSelectedColumn);
  }, []);

  // Définir filteredContacts tôt dans le composant pour éviter l'erreur "Cannot access before initialization"
  const filteredContacts = useMemo(() => {
    if (!searchTerm) return contacts;
    return contacts.filter(contact => {
      const searchableValue = contact[selectedSearchColumn as keyof ContactAppType];
      if (searchableValue && typeof searchableValue === 'string') {
        return searchableValue.toLowerCase().includes(searchTerm.toLowerCase());
      }
      return false;
    });
  }, [contacts, searchTerm, selectedSearchColumn]);

  // Calculer le pourcentage de contacts ayant un statut défini
  const statusCompletionPercentage = useMemo(() => {
    if (contacts.length === 0) return 0;

    const contactsWithStatus = contacts.filter(contact =>
      contact.status && contact.status.trim() !== ''
    );

    return Math.round((contactsWithStatus.length / contacts.length) * 100);
  }, [contacts]);

  const [importState, importFormAction, isImportPending] = useActionState(
    importContactsAction,
    initialActionState as ActionState<{ count?: number; message?: string } | null>
  );
  const [updateContactState, updateContactFormAction, isUpdateContactPending] = useActionState(
    updateContactAction,
    initialActionState as ActionState<ContactAppType | null>
  );
  const [callState, callFormAction /*, isCallPending */] = useActionState(
    callAction,
    initialActionState as ActionState<ContactAppType | null>
  );
  const [hangUpState, hangUpFormAction /*, isHangUpPending */] = useActionState(
    hangUpCallAction,
    initialActionState as ActionState<ContactAppType | null>
  );
  // L'état pour clearAllDataAction n'est plus géré par useActionState ici
  // car nous appelons clearAllDataAction directement et attendons son résultat.

  // Fonctions wrappers sécurisées pour les appels d'action
  const safeImportAction = useCallback((formData: FormData) => {
    startTransition(() => {
      importFormAction(formData);
    });
  }, [importFormAction]);

  const safeUpdateContactAction = useCallback((formData: FormData) => {
    startTransition(() => {
      updateContactFormAction(formData);
    });
  }, [updateContactFormAction]);

  const safeCallAction = useCallback((formData: FormData) => {
    startTransition(() => {
      callFormAction(formData);
    });
  }, [callFormAction]);

  const safeHangUpAction = useCallback((formData: FormData) => {
    startTransition(() => {
      hangUpFormAction(formData);
    });
  }, [hangUpFormAction]);

  const inputFileRef = useRef<HTMLInputElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tableViewportRef = useRef<HTMLDivElement>(null);
  const mainPageRef = useRef<HTMLDivElement>(null);

  const setActiveContact = (contact: ContactAppType | null) => {
    setActiveContactState(contact);
  };

  const togglePanel = () => {
    setIsPanelOpen(prev => !prev);
  };

  const fetchAndSetContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/contacts');
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status} ${response.statusText}`);
      }
      const data: ContactAppType[] = await response.json();
      setContacts(data);
    } catch (error) {
      console.error("[ContactsPage] Erreur lors de la récupération des contacts:", error);
      toast.error("Impossible de charger les contacts depuis le serveur.");
      setContacts([]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAndSetContacts();
  }, [fetchAndSetContacts]);

  useEffect(() => {
    if (importState.message) {
      if (importState.success) {
        toast.success(importState.message);
        if (inputFileRef.current) inputFileRef.current.value = "";
        fetchAndSetContacts();
      } else {
        toast.error(importState.message);
      }
    }
  }, [importState, fetchAndSetContacts]);

  const getContactsForAutosave = useCallback(async () => {
    return contacts;
  }, [contacts]);

  const {
    isSaving: isAutosaveSaving,
    error: autosaveHookError,
    fileHandle: autosaveFileHandle,
    resetFileHandle,
    requestFileHandle,
    triggerSave,
    isAutoSaveRestored
  } = useAutosaveFile(getContactsForAutosave);

  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  // État pour suivre si l'autosauvegarde est active
  const [isAutosaveActive, setIsAutosaveActive] = useState(false);

  // Référence pour tracker si une opération d'autosave est en cours
  const autosaveOperationInProgressRef = useRef(false);

  // Mettre à jour l'état isAutosaveActive quand autosaveFileHandle change ou isAutoSaveRestored change
  useEffect(() => {
    // Considérer l'autosave comme actif si le fichier handle existe OU si l'autosave a été restauré
    setIsAutosaveActive(!!autosaveFileHandle || isAutoSaveRestored);

    // Activer l'autosauvegarde si elle a été restaurée automatiquement
    if (isAutoSaveRestored) {
      toast.success("Autosauvegarde restaurée et activée automatiquement");
      console.log("[Autosave] Autosauvegarde restaurée et activée automatiquement");
    }
  }, [autosaveFileHandle, isAutoSaveRestored]);

  // Fonction pour demander l'emplacement du fichier d'autosauvegarde
  const handleRequestFileHandle = useCallback(async () => {
    try {
      // Vérifier si une demande de sélection est déjà en cours
      if (isAutosaveSaving || autosaveOperationInProgressRef.current) {
        console.log("[Autosave] Une opération d'autosave est déjà en cours");
        return false;
      }

      // Définir le verrou pour éviter les opérations multiples
      autosaveOperationInProgressRef.current = true;

      const handle = await requestFileHandle();
      if (handle) {
        // Déclencher une première sauvegarde
        await triggerSave(undefined, true);
        return true;
      }
      return false;
    } catch (error) {
      console.error("[Autosave] Erreur lors de la demande de l'emplacement du fichier:", error);
      return false;
    } finally {
      // Relâcher le verrou avec un délai pour éviter les clics multiples
      setTimeout(() => {
        autosaveOperationInProgressRef.current = false;
      }, 1000);
    }
  }, [requestFileHandle, triggerSave, isAutosaveSaving]);

  // Fonction pour activer/désactiver l'autosauvegarde
  const toggleAutosave = useCallback(() => {
    // Vérifier si une opération est déjà en cours
    if (autosaveOperationInProgressRef.current) {
      console.log("[Autosave] Une opération est déjà en cours, ignoré");
      return;
    }

    if (isAutosaveActive && autosaveFileHandle) {
      // Désactiver l'autosauvegarde
      resetFileHandle();
      toast.info("Autosauvegarde désactivée");
    } else if (!isAutosaveActive && !autosaveFileHandle) {
      // L'activation se fait via handleRequestFileHandle,
      // rien à faire ici, car le bouton appellera déjà handleRequestFileHandle
      console.log("[Autosave] Préparation de la demande d'emplacement du fichier");
    }
  }, [isAutosaveActive, autosaveFileHandle, resetFileHandle]);

  useEffect(() => {
    if (autosaveHookError) {
      toast.error(`Erreur d'autosave/téléchargement: ${autosaveHookError}`);
    }
  }, [autosaveHookError]);

  // Effet pour suivre l'état de la sauvegarde et notifier l'utilisateur
  const [wasSaving, setWasSaving] = useState(false);
  useEffect(() => {
    if (wasSaving && !isAutosaveSaving && !autosaveHookError) {
      if (autosaveFileHandle) {
        toast.success("Fichier sauvegardé automatiquement !");
      }
    }
    setWasSaving(isAutosaveSaving);
  }, [isAutosaveSaving, wasSaving, autosaveHookError, autosaveFileHandle]);

  // Déplacer les effets qui utilisent isAutosaveActive ici, après sa déclaration
  useEffect(() => {
    if (updateContactState.message) {
      if (updateContactState.success && updateContactState.data) {
        toast.success(updateContactState.message);
        const updatedContact = updateContactState.data as ContactAppType;
        setContacts(prevContacts =>
          prevContacts.map(c => c.id === updatedContact.id ? updatedContact : c)
        );
        if (activeContact && activeContact.id === updatedContact.id) {
          setActiveContactState(updatedContact);
        }

        // Déclencher l'autosauvegarde après mise à jour
        if (isAutosaveActive) {
          triggerSave(undefined, false, false);
        }
      } else {
        toast.error(updateContactState.message || "Erreur lors de la mise à jour du contact.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateContactState, isAutosaveActive]);

  useEffect(() => {
    if (callState.message) {
      if (callState.success && callState.data) {
        toast.success(callState.message);
        const updatedContact = callState.data as ContactAppType;

        setContacts(prevContacts =>
          prevContacts.map(contact =>
            contact.id === updatedContact.id ? updatedContact : contact
          )
        );
        if (activeContact && activeContact.id === updatedContact.id) {
          setActiveContactState(updatedContact);
          setContactInCallId(updatedContact.id);
        }

        // Déclencher l'autosauvegarde après appel
        if (isAutosaveActive) {
          triggerSave(undefined, false, false);
        }
      } else if (callState.success && !callState.data) {
        toast.success(callState.message + " (Données de contact non reçues pour mise à jour locale)." );
      } else {
        toast.error(callState.message);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, isAutosaveActive, fetchAndSetContacts, activeContact]);

  useEffect(() => {
    if (hangUpState.message) {
      if (hangUpState.success && hangUpState.data) {
        toast.success(hangUpState.message || "Appel terminé et durée enregistrée." );
        const updatedContact = hangUpState.data as ContactAppType;
        setContacts(prevContacts =>
          prevContacts.map(contact =>
            contact.id === updatedContact.id ? updatedContact : contact
          )
        );
        if (activeContact && activeContact.id === updatedContact.id) {
          setActiveContactState(updatedContact);
        }
        setContactInCallId(null);

        // Déclencher l'autosauvegarde après avoir raccroché et mis à jour la durée
        if (isAutosaveActive) {
          triggerSave(undefined, false, false);
        }
      } else if (hangUpState.success && !hangUpState.data) {
        toast.info(hangUpState.message || "Appel terminé. Rafraîchissement des données...");
        fetchAndSetContacts();
        setContactInCallId(null);
      } else if (!hangUpState.success) {
        toast.error(hangUpState.message || "Erreur lors de la finalisation de l'appel.");
        setContactInCallId(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hangUpState, isAutosaveActive, fetchAndSetContacts, activeContact]);

  const handleRequestClearAllData = () => {
    setIsClearConfirmOpen(true);
  };

  const confirmClearAllData = useCallback(() => {
    setIsClearConfirmOpen(false);
    startTransition(async () => {
      const result = await clearAllDataAction();
      if (result.success) {
        toast.success(result.message || "Toutes les données ont été effacées." );
        fetchAndSetContacts();
        setActiveContact(null);
        if (autosaveFileHandle) {
          resetFileHandle();
          toast.info("La session d'autosave a été réinitialisée." );
        }
      } else {
        toast.error(result.message || "Erreur lors de la suppression des données." );
      }
    });
  }, [
    // Suppression de la dépendance inutile
    // clearAllDataAction
  ]);

  // Référence pour suivre les séquences d'actions en cours
  const inActionSequence = React.useRef(false);

  // Remplacer complètement la fonction mainFnKeyActionLogic par une implémentation plus robuste
  const handleFunctionKey = useCallback((event: KeyboardEvent) => {
    const relevantKeys = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];

    // Si la touche n'est pas une touche de fonction que nous gérons, ne rien faire.
    // Cela permet aux événements normaux de saisie de fonctionner.
    if (!relevantKeys.includes(event.key)) {
      return;
    }

    // Si c'est une touche de fonction que nous voulons gérer, alors on prévient le comportement par défaut.
    event.preventDefault();

    // Vérifier si on a un contact actif
    if (!activeContact || !activeContact.id) {
      toast.info("Veuillez d'abord sélectionner un contact valide" );
      return;
    }

    // Vérifier l'état actuel
    if (isUpdateContactPending) {
      console.log("[TouchesFn] Action en cours, veuillez patienter");
      return;
    }

    if (inActionSequence.current) {
      console.log("[TouchesFn] Séquence d'actions déjà en cours, veuillez patienter");
      return;
    }

    const mapping = fnKeyMappings.find(m => m.keyName === event.key);
    if (!mapping) {
      // Ne devrait pas arriver si relevantKeys.includes(event.key) est vrai, mais par sécurité.
      return;
    }

    const contactId = activeContact.id;
    const contactName = activeContact.firstName || 'Contact';
    const newStatus = mapping.statusName;
    const isInCall = contactInCallId === contactId;

    setContacts(prevContacts =>
      prevContacts.map(contact =>
        contact.id === contactId
          ? {...contact, status: newStatus}
          : contact
      )
    );

    toast.success(`Statut "${newStatus}" appliqué à ${contactName}` );

    startTransition(() => {
      try {
        inActionSequence.current = true;

        if (isInCall) {
          console.log(`[TouchesFn] Raccrochage de l'appel en cours (ID: ${contactId})` );
          const hangUpFormData = new FormData();
          hangUpFormData.append('contactId', contactId);
          hangUpFormAction(hangUpFormData);
        }

        console.log(`[TouchesFn] Mise à jour du statut: ${newStatus} (ID: ${contactId})` );
        const statusFormData = new FormData();
        statusFormData.append('contactId', contactId);
        statusFormData.append('status', newStatus);
        updateContactFormAction(statusFormData);

        const currentIndex = filteredContacts.findIndex(c => c.id === contactId);
        const hasNextContact = currentIndex !== -1 && currentIndex < filteredContacts.length - 1;

        if (hasNextContact) {
          const nextContact = filteredContacts[currentIndex + 1];
          if (nextContact && nextContact.id) {
            console.log(`[TouchesFn] Passage au contact suivant: ${nextContact.firstName || 'Contact'} (ID: ${nextContact.id})` );
            setActiveContact(nextContact);
            if (nextContact.phoneNumber) {
              console.log(`[TouchesFn] Appel du contact suivant (ID: ${nextContact.id}, Tél: ${nextContact.phoneNumber})` );
              const callFormData = new FormData();
              callFormData.append('contactId', nextContact.id);
              callFormData.append('phoneNumber', nextContact.phoneNumber);
              callFormAction(callFormData);
            }
          }
        }

        setTimeout(() => {
          startTransition(() => {
            fetchAndSetContacts();
            inActionSequence.current = false;
          });
        }, 500);
      } catch (error) {
        console.error("[TouchesFn] Erreur pendant la séquence d'actions:", error);
        toast.error("Une erreur est survenue pendant la mise à jour" );
        inActionSequence.current = false;
      }
    });
  }, [
    activeContact,
    contactInCallId,
    filteredContacts,
    // Suppression des dépendances inutiles
    // fnKeyMappings,
    isUpdateContactPending,
    callFormAction,
    hangUpFormAction,
    updateContactFormAction,
    fetchAndSetContacts,
    setActiveContact,
    setContacts,
    // toast
  ]);

  // Utilisation d'une référence stable pour l'écouteur d'événements
  const stableHandleFunctionKey = useCallback((event: KeyboardEvent) => {
    handleFunctionKey(event);
  }, [handleFunctionKey]);

  useEffect(() => {
    // Utiliser la référence stable pour éviter les installations/suppressions inutiles
    window.addEventListener('keydown', stableHandleFunctionKey, { capture: true });

    console.log("[TouchesFn] Écouteur d'événements installé pour les touches fonction" );

    return () => {
      window.removeEventListener('keydown', stableHandleFunctionKey, { capture: true });
      console.log("[TouchesFn] Écouteur d'événements supprimé pour les touches fonction" );
    };
  }, [stableHandleFunctionKey]);

  useEffect(() => {
    const container = tableViewportRef.current;
    if (!container) return;

    const handleScroll = () => {
      // On supprime le code qui mettait à jour statusCompletionPercentage
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll();

    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [filteredContacts]);

  const handleRequestManualExport = () => {
    if (filteredContacts.length === 0) {
      toast.warn("Aucun contact à exporter." );
      return;
    }
    setIsExportFormatDialogOpen(true);
  };

  const exportToXLSX = (contactsToExport: ContactAppType[]) => {
    if (contactsToExport.length === 0) {
      toast.warn("Aucun contact à exporter." );
      return;
    }
    // Générer le timestamp pour le nom du fichier
    const now = new Date();
    const timestamp = format(now, 'yyyy_MM_dd_HH_mm_ss');
    const filename = `DimiCall_${timestamp}.xlsx`;

    const worksheet = XLSX.utils.json_to_sheet(contactsToExport.map(c => ({
      ID: c.id,
      Prénom: c.firstName,
      Nom: c.lastName,
      Email: c.email,
      Téléphone: c.phoneNumber,
      Statut: c.status,
      Source: c.source,
      Commentaire: c.comment,
      "Date d'appel": c.dateAppel,
      "Heure d'appel": c.heureAppel,
      "Date de rappel": c.dateRappel,
      "Heure de rappel": c.heureRappel,
      "Date de rendez-vous": c.dateRendezVous,
      "Heure de rendez-vous": c.heureRendezVous,
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts");
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-T-8"});
    saveAs(data, filename);
    toast.success("Contacts exportés en XLSX !" );
    setIsExportFormatDialogOpen(false);
  };

  const exportToCSV = (contactsToExport: ContactAppType[]) => {
    if (contactsToExport.length === 0) {
      toast.warn("Aucun contact à exporter." );
      return;
    }
    // Générer le timestamp pour le nom du fichier
    const now = new Date();
    const timestamp = format(now, 'yyyy_MM_dd_HH_mm_ss');
    const filename = `DimiCall_${timestamp}.csv`;

    const csvData = contactsToExport.map(c => ({
      ID: c.id,
      Prénom: c.firstName,
      Nom: c.lastName,
      Email: c.email,
      Téléphone: c.phoneNumber,
      Statut: c.status,
      Source: c.source,
      Commentaire: c.comment,
      "Date d'appel": c.dateAppel,
      "Heure d'appel": c.heureAppel,
      "Date de rappel": c.dateRappel,
      "Heure de rappel": c.heureRappel,
      "Date de rendez-vous": c.dateRendezVous,
      "Heure de rendez-vous": c.heureRendezVous,
    }));
    const worksheet = XLSX.utils.json_to_sheet(csvData);
    const csvString = XLSX.utils.sheet_to_csv(worksheet);
    const data = new Blob(["\uFEFF" + csvString], {type: "text/csv;charset=utf-8;"});
    saveAs(data, filename);
    toast.success("Contacts exportés en CSV !" );
    setIsExportFormatDialogOpen(false);
  };

  const handleBookingCreated = useCallback(async (bookingInfo: { date: string; time: string; }) => {
    if (!activeContact || !activeContact.id) {
      toast.warn("Aucun contact actif pour associer le rendez-vous. Veuillez sélectionner un contact." );
      return;
    }
    console.log("[ContactsPage] handleBookingCreated - bookingInfo:", bookingInfo, "activeContactId:", activeContact.id );

    const formData = new FormData();
    formData.append('contactId', activeContact.id);
    formData.append('bookingDate', bookingInfo.date);
    formData.append('bookingTime', bookingInfo.time);

    console.log("[ContactsPage] handleBookingCreated - Données envoyées à updateContactFormAction:", Object.fromEntries(formData.entries()) );

    safeUpdateContactAction(formData);
  }, [activeContact, safeUpdateContactAction]);

  const handleRappelDateTimeSelected = useCallback(async (dateTime: Date) => {
    if (!activeContact || !activeContact.id) {
      toast.warn("Aucun contact actif pour programmer un rappel. Veuillez sélectionner un contact." );
      return;
    }

    if (!isValid(dateTime)) {
      toast.error("La date sélectionnée n'est pas valide." );
      return;
    }

    const dateRappel = format(dateTime, 'yyyy-MM-dd');
    const heureRappel = format(dateTime, 'HH:mm');

    console.log(`[ContactsPage] Rappel programmé pour ${activeContact.firstName} ${activeContact.lastName} (ID: ${activeContact.id}) le ${dateRappel} à ${heureRappel}` );

    const formattedDisplayDate = safeFormat(dateTime, 'dd/MM/yyyy', { locale: fr });
    toast.info(`Rappel programmé pour ${activeContact.firstName} le ${formattedDisplayDate || 'date invalide'} à ${heureRappel}.` );

    const formData = new FormData();
    formData.append('contactId', activeContact.id);
    formData.append('dateRappel', dateRappel);
    formData.append('heureRappel', heureRappel);

    safeUpdateContactAction(formData);
  }, [activeContact, safeUpdateContactAction]);

  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [isFileDropConfirmOpen, setIsFileDropConfirmOpen] = useState(false);
  // Nouvel état pour suivre si un drag est en cours au-dessus de la zone du tableau
  const [isDragOverTable, setIsDragOverTable] = useState(false);

  const processFileForImport = useCallback(async (fileToProcess: File) => {
    if (!fileToProcess) {
        toast.warn("Fichier non valide pour l'importation." );
        return;
    }

    toast.info("Suppression des contacts existants avant l'importation..." );

    startTransition(async () => {
      const clearResult = await clearAllDataAction();
      if (clearResult.success) {
        toast.success("Contacts existants supprimés avec succès." );

        const formData = new FormData();
        formData.append('file', fileToProcess);
        const acceptedTypes = [".csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
        const fileName = fileToProcess.name;
        const fileExtension = "." + fileName.split('.').pop()?.toLowerCase();
        const isTypeAccepted = acceptedTypes.some(type => {
          if (type.startsWith('.')) return fileExtension === type;
          return fileToProcess.type === type;
        });

        if (!isTypeAccepted) {
          toast.error(`Type de fichier non supporté: ${fileName}. Veuillez utiliser un fichier CSV ou Excel.` );
          if (inputFileRef.current) inputFileRef.current.value = "";
          return;
        }

        toast.info("Début de l'importation du nouveau fichier..." );
        safeImportAction(formData);

      } else {
        toast.error(`Échec de la suppression des contacts : ${clearResult.message}` );
      }
    });
  }, [safeImportAction, clearAllDataAction]);

  const handleFileSelectedForDropZone = useCallback(async (file: File) => {
    console.log('[ContactsPage] Fichier sélectionné via UploadDropZone:', file );
    // Modifier pour gérer la confirmation si des contacts existent déjà
    if (contacts.length > 0) {
      setDroppedFile(file);
      setIsFileDropConfirmOpen(true);
    } else {
      // Si la table est vide, procéder directement à l'importation
      processFileForImport(file);
    }
  }, [processFileForImport, contacts.length]);

   // Nouvelle fonction pour gérer la sélection de fichier via l'input (utilisée dans Ribbon)
  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      processFileForImport(file);
    } else {
      toast.warn("Aucun fichier sélectionné pour l'importation." );
    }
  }, [processFileForImport]);

  const handleEditContactInline = useCallback(async (updatedField: Partial<ContactAppType>): Promise<ContactAppType | null> => {
    if (!updatedField.id) {
      toast.error("ID du contact manquant pour la mise à jour." );
      console.error("[ContactsPage] Tentative de mise à jour sans ID de contact.", updatedField );
      return null;
    }

    const { id: contactId, ...dataToUpdate } = updatedField;

    if (Object.keys(dataToUpdate).length === 0) {
      return null;
    }

    const formData = new FormData();
    formData.append('contactId', contactId as string);
    Object.entries(dataToUpdate).forEach(([key, value]) => {
      if (value !== undefined) {
        formData.append(key, value === null ? '' : String(value));
      }
    });

    console.log("[ContactsPage] handleEditContactInline - Données envoyées à updateContactFormAction:", Object.fromEntries(formData.entries()) );

    safeUpdateContactAction(formData);

    const currentContact = contacts.find(c => c.id === contactId);
    if (currentContact) {
      return { ...currentContact, ...dataToUpdate };
    }
    return null;
  }, [contacts, safeUpdateContactAction]);

  // Ajouter cette fonction pour vérifier l'état de l'appel périodiquement
  const checkCallStatus = useCallback(async () => {
    if (!contactInCallId) {
      setIsPollingActive(false);
      return;
    }

    try {
      const response = await fetch('/api/call/status');
      const data = await response.json();

      console.log(`[CallStatusPolling] Statut d'appel vérifié: ${JSON.stringify(data)}` );

      // Si un appel était en cours (contactInCallId existe) mais n'est plus actif selon l'API
      if (contactInCallId && !data.call_in_progress) {
        console.log(`[CallStatusPolling] Appel terminé détecté pour le contact ID: ${contactInCallId}` );

        try {
          // Appeler directement l'API hangup pour calculer la durée d'appel
          const hangupResponse = await fetch('/api/hangup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ contact_id: contactInCallId })
          });

          if (!hangupResponse.ok) {
            console.error(`[CallStatusPolling] Erreur lors de l'appel à /api/hangup: ${hangupResponse.status}` );
            // Fallback: on utilise la méthode traditionnelle avec le formulaire
            const formData = new FormData();
            formData.append('contactId', contactInCallId);
            hangUpFormAction(formData);
          } else {
            console.log(`[CallStatusPolling] Appel à /api/hangup réussi, l'appel est maintenant terminé` );

            // Récupérer les nouvelles données du contact pour rafraîchir l'interface
            const contactResponse = await fetch(`/api/contacts/${contactInCallId}`);
            if (contactResponse.ok) {
              const updatedContact = await contactResponse.json();
              // Mettre à jour le contact dans la liste
              setContacts(prev => prev.map(c => c.id === contactInCallId ? updatedContact : c));
              // Mettre à jour le contact actif si c'est celui qui était en appel
              if (activeContact && activeContact.id === contactInCallId) {
                setActiveContactState(updatedContact);
              }
              // Afficher un message de succès
              toast.success(`Appel terminé. Durée: ${updatedContact.dureeAppel || 'non disponible'}` );
            }

            // Réinitialiser l'ID du contact en appel
            setContactInCallId(null);
          }
        } catch (error) {
          console.error(`[CallStatusPolling] Exception lors de l'appel à /api/hangup:`, error );
          // Fallback vers la méthode traditionnelle
          const formData = new FormData();
          formData.append('contactId', contactInCallId);
          hangUpFormAction(formData);
        }

        // Arrêter le polling puisque l'appel est terminé
        setIsPollingActive(false);
      }
    }
    // else if (!contactInCallId && isPollingActive) { // Cette condition est déjà gérée par le useEffect plus bas
    //   setIsPollingActive(false);
    // }
     catch (error) {
      console.error(`[CallStatusPolling] Erreur lors de la vérification du statut d'appel:`, error);
    }
  }, [contactInCallId, hangUpFormAction, activeContact, setContacts, setActiveContactState]);

  // Effet pour démarrer/arrêter le polling quand contactInCallId change
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    if (contactInCallId && !isPollingActive) {
      console.log(`[CallStatusPolling] Démarrage du polling pour le contact ID: ${contactInCallId}` );
      setIsPollingActive(true);

      // Attendre 3 secondes avant de commencer le polling pour laisser l'appel s'établir
      const timeoutId = setTimeout(() => {
        intervalId = setInterval(checkCallStatus, CALL_STATUS_POLLING_INTERVAL);
        // Exécuter une première vérification immédiatement
        checkCallStatus();
      }, 3000);

      return () => {
        clearTimeout(timeoutId);
        if (intervalId) clearInterval(intervalId);
      };
    } else if (!contactInCallId && isPollingActive) {
      setIsPollingActive(false);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [contactInCallId, isPollingActive, checkCallStatus]);

  // Gestionnaires d'événements pour le drag and drop sur la zone du tableau
  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Permet le drop
    // Ne pas mettre à jour l'état ici, useDrop dans UploadDropZone s'en charge
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    console.log('[ContactsPage] handleDragEnter sur tableViewportRef');
    // Activer l'état de drag over uniquement si des contacts sont présents
    if (filteredContacts.length > 0) {
      setIsDragOverTable(true);
    }
  }, [filteredContacts.length]);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    // Vérifier si le drag leave est vraiment en dehors de l'élément ou juste d'un enfant
    if (!tableViewportRef.current?.contains(event.relatedTarget as Node)) {
      console.log('[ContactsPage] handleDragLeave hors de tableViewportRef');
      setIsDragOverTable(false);
    }
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    console.log('[ContactsPage] handleDrop sur tableViewportRef');
    setIsDragOverTable(false); // Désactiver l'état de drag over après le drop
    // La logique de traitement du fichier est gérée par UploadDropZone grâce à react-dnd
    // Ne pas appeler processFileForImport ou handleFileSelectedForDropZone ici directement
  }, []);

  // Ajout des états pour gérer les colonnes visibles
  const tableColumns = useMemo(() => [
    { id: 'id', label: 'ID' },
    { id: 'firstName', label: 'Prénom' },
    { id: 'lastName', label: 'Nom' },
    { id: 'email', label: 'Email' },
    { id: 'phoneNumber', label: 'Téléphone' },
    { id: 'status', label: 'Statut' },
    { id: 'source', label: 'Source' },
    { id: 'dateAppel', label: 'Date Appel' },
    { id: 'heureAppel', label: 'Heure Appel' },
    { id: 'dateRappel', label: 'Date Rappel' },
    { id: 'heureRappel', label: 'Heure Rappel' },
    { id: 'dateRendezVous', label: 'Date RDV' },
    { id: 'heureRendezVous', label: 'Heure RDV' },
    { id: 'comment', label: 'Commentaire' }
  ], []);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    // Initialiser avec tous les IDs de colonnes pour rendre toutes les colonnes visibles par défaut
    tableColumns.map(col => col.id)
  );

  if (isLoading && contacts.length === 0 && !importState.success) {
    let message = "Chargement des contacts...";
    if (importState.message && !importState.success) {
      message = importState.message;
    }
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-6" />
        <p className="text-xl font-medium text-muted-foreground">{message}</p>
        {!importState.success && importState.message && (
          <Button onClick={() => window.location.reload()} className="mt-4">Réessayer</Button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={mainPageRef}
      className={cn(
        "flex flex-col h-screen bg-background text-foreground relative overflow-hidden"
      )}
    >
      <header className="shrink-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
        <div className="px-2 md:px-6 py-2 md:py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 md:gap-4">
          <div className="mb-2 sm:mb-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-200">DimiCall</h1>
          </div>
          <div className="flex-grow w-full p-2 border rounded-lg border-border overflow-hidden">
            <Ribbon
              ref={ribbonRef}
              selectedContactEmail={activeContact?.email}
              inputFileRef={inputFileRef as React.RefObject<HTMLInputElement>}
              // Utiliser la nouvelle fonction pour gérer le changement de l'input file
              handleFileSelectedForImport={handleFileInputChange}
              isImportPending={isImportPending}
              isAutosaveSaving={isAutosaveSaving}
              onRequestClearAllData={handleRequestClearAllData}
              activeContact={activeContact}
              callFormAction={safeCallAction}
              hangUpFormAction={safeHangUpAction}
              contactInCallId={contactInCallId}
              onExportClick={handleRequestManualExport}
              onBookingCreated={handleBookingCreated}
              onRappelDateTimeSelected={handleRappelDateTimeSelected}
              isAutosaveActive={isAutosaveActive}
              onToggleAutosave={toggleAutosave}
              requestFileHandleForAutosave={handleRequestFileHandle}
              statusCompletionPercentage={statusCompletionPercentage}
            />
          </div>
          <ThemeToggleButton />
          <ColumnVisibilityDropdown 
            columns={tableColumns}
            visibleColumns={visibleColumns}
            setVisibleColumns={setVisibleColumns}
          />
        </div>
      </header>

      {/* Envelopper la zone principale avec DndProvider */}
      <DndProvider backend={HTML5Backend}>
        <div className="flex flex-1 overflow-hidden min-h-0 relative">
          <main className={cn(
            "flex-1 flex flex-col overflow-y-auto transition-all duration-300 ease-in-out p-2 sm:p-4 md:p-6 pt-0",
            "min-w-0"
          )}
          >
            <div className='flex-grow'>
              <div className="mb-2 sm:mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
                <div className="w-full sm:w-auto">
                  <TableSearchBar
                    columns={searchableColumns}
                    initialSelectedColumnValue={selectedSearchColumn}
                    initialSearchTerm={searchTerm}
                    onSearchChange={handleSearchChange}
                    className="w-full"
                  />
                </div>
              </div>
              <div
                ref={tableViewportRef}
                className="overflow-auto contain-paint will-change-transform relative"
                style={{ maxHeight: 'calc(100vh - 300px)' }}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                  {isLoading ? (
                    <div className="flex items-center justify-center h-[300px]">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                     </div>
                   ) : (
                    <>
                      {/* Afficher ContactTable si des contacts sont présents */}
                      {filteredContacts.length > 0 && (
                    <ContactTable
                      data={filteredContacts}
                      onEditContact={handleEditContactInline}
                      onActiveContactChange={setActiveContact}
                      scrollContainerRef={tableViewportRef}
                      isProcessingId={
                        isUpdateContactPending && activeContact && (!updateContactState.data || updateContactState.data.id !== activeContact.id) ? activeContact.id : null
                      }
                      error={updateContactState.success === false ? updateContactState.message : null}
                      columns={tableColumns}
                      visibleColumns={visibleColumns}
                      setVisibleColumns={setVisibleColumns}
                    />
                      )}

                      {/* UploadDropZone est toujours rendu, positionné absolument pour recouvrir si nécessaire */}
                      {/* Le composant interne gère son style en fonction de l'état de drag */}
                      {/* Appliquer des styles pour le positionner en overlay */}
                      {/* La visibilité en mode overlay est maintenant contrôlée par isDragOverTable */}
                      <UploadDropZone
                        onFileSelected={handleFileSelectedForDropZone}
                        className={cn(
                          // Applique le positionnement absolu uniquement si des contacts sont présents
                          filteredContacts.length > 0 ? "absolute inset-0 z-10" : "p-4",
                          // Contrôle la visibilité de l'overlay basé sur isDragOverTable si des contacts sont présents
                          filteredContacts.length > 0 && !isDragOverTable ? "opacity-0 pointer-events-none" : "",
                          // Ajoutez ici d'autres classes spécifiques si nécessaire, par exemple pour le fond en mode vide
                        )}
                    />
                    </>
                  )}
              </div>
            </div>

            <footer className="shrink-0 mt-auto pt-4 pb-2 text-xs text-muted-foreground flex items-center justify-between">
              <div>
                {autosaveFileHandle && <span className="text-green-600">(Autosave activé)</span>}
                {isAutosaveSaving && <span className="ml-2"><Loader2 className="h-3 w-3 animate-spin inline-block" /> Sauvegarde auto...</span>}
              </div>
              <div className="font-medium text-center mx-auto">
                <span className="text-sm">{filteredContacts.length} contact{filteredContacts.length === 1 ? '' : 's'}</span>
              </div>
              <div>
                <AdbStatusBadge />
              </div>
            </footer>
          </main>
        </div>
      </DndProvider>

      {isExportFormatDialogOpen && (
        <AlertDialog open={isExportFormatDialogOpen} onOpenChange={setIsExportFormatDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Choisir le format d&apos;exportation</AlertDialogTitle>
              <AlertDialogDescription>
                Sélectionnez le format dans lequel vous souhaitez exporter les contacts.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col sm:flex-row gap-2 justify-end">
              <Button
                onClick={() => exportToXLSX(filteredContacts)}
                className="w-full sm:w-auto"
              >
                Exporter en XLSX (Excel)
              </Button>
              <Button
                onClick={() => exportToCSV(filteredContacts)}
                className="w-full sm:w-auto"
                variant="outline"
              >
                Exporter en CSV
              </Button>
              <AlertDialogCancel
                onClick={() => setIsExportFormatDialogOpen(false)}
                className="w-full sm:w-auto mt-2 sm:mt-0"
              >
                Annuler
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isClearConfirmOpen && (
        <AlertDialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Êtes-vous sûr?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible et supprimera définitivement toutes les données des contacts.
                Voulez-vous vraiment continuer ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsClearConfirmOpen(false)}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmClearAllData}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Tout effacer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isFileDropConfirmOpen && (
        <AlertDialog open={isFileDropConfirmOpen} onOpenChange={setIsFileDropConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Importer de nouveaux contacts ?</AlertDialogTitle>
              <AlertDialogDescription>
                L&apos;importation d&apos;un nouveau fichier remplacera toutes les données de contacts actuellement affichées.
                Voulez-vous continuer et effacer les contacts existants ?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setIsFileDropConfirmOpen(false);
                setDroppedFile(null);
              }}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setIsFileDropConfirmOpen(false);
                  if (droppedFile) {
                    processFileForImport(droppedFile);
                    setDroppedFile(null);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Effacer et importer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {contactInCallId && (
        <div className="fixed bottom-8 right-8 z-50">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="lg"
                  className="rounded-full h-16 w-16 shadow-lg flex items-center justify-center animate-pulse"
                  onClick={() => {
                    if (activeContact && activeContact.id === contactInCallId) {
                      const formData = new FormData();
                      formData.append('contactId', contactInCallId);
                      startTransition(() => {
                        hangUpFormAction(formData);
                      });
                    }
                  }}
                >
                  <PhoneOff className="h-8 w-8" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Raccrocher l&apos;appel en cours</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
} 