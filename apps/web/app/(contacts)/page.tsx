'use client';

import React, { useCallback, useEffect, useState, useRef, startTransition, useMemo } from 'react';
import { useActionState } from 'react';
import { format, parseISO, isValid } from 'date-fns';
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
  PanelLeftOpen,
  PanelRightClose,
  BellRing,
  CalendarDays,
  Edit3,
  Clock,
  PhoneOutgoing
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
import { fr } from 'date-fns/locale';

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
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeContact, setActiveContactState] = useState<ContactAppType | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [contactInCallId, setContactInCallId] = useState<string | null>(null);
  const [isExportFormatDialogOpen, setIsExportFormatDialogOpen] = useState(false);
  
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

  const setActiveContact = (contact: ContactAppType | null) => {
    setActiveContactState(contact);
    if (!contact && isPanelOpen) {
        setIsPanelOpen(false);
    }
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
        toast.success(callState.message + " (Données de contact non reçues pour mise à jour locale).");
      } else {
        toast.error(callState.message);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, activeContact, isAutosaveActive]);

  useEffect(() => {
    if (hangUpState.message) {
      if (hangUpState.success && hangUpState.data) {
        toast.success(hangUpState.message);
        const updatedContact = hangUpState.data as ContactAppType;
        setContacts(prevContacts => 
          prevContacts.map(c => c.id === updatedContact.id ? updatedContact : c)
        );
        if (activeContact && activeContact.id === updatedContact.id) {
          setActiveContactState(updatedContact);
        }
        setContactInCallId(null);
        
        // Déclencher l'autosauvegarde après raccrochage
        if (isAutosaveActive) {
          triggerSave(undefined, false, false);
        }
      } else {
        toast.error(hangUpState.message || "Erreur lors du raccrochage de l'appel.");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hangUpState, activeContact, isAutosaveActive]);

  const handleRequestClearAllData = () => {
    setIsClearConfirmOpen(true);
  };

  const confirmClearAllData = () => {
    setIsClearConfirmOpen(false);
    startTransition(async () => {
      const result = await clearAllDataAction();
      if (result.success) {
        toast.success(result.message || "Toutes les données ont été effacées.");
        fetchAndSetContacts();
        setActiveContact(null);
        if (autosaveFileHandle) {
          resetFileHandle();
          toast.info("La session d'autosave a été réinitialisée.");
        }
      } else {
        toast.error(result.message || "Erreur lors de la suppression des données.");
      }
    });
  };

  // Référence pour suivre les séquences d'actions en cours
  const inActionSequence = React.useRef(false);

  // Remplacer complètement la fonction mainFnKeyActionLogic par une implémentation plus robuste
  const handleFunctionKey = useCallback((event: KeyboardEvent) => {
    // Prévenir le comportement par défaut du navigateur pour les touches de fonction
    event.preventDefault();

    // Vérifier si c'est une touche de fonction pertinente
    const relevantKeys = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
    if (!relevantKeys.includes(event.key)) {
      return;
    }

    // Vérifier si on a un contact actif
    if (!activeContact || !activeContact.id) {
      toast.info("Veuillez d'abord sélectionner un contact valide");
      return;
    }

    // Vérifier l'état actuel
    if (isUpdateContactPending) {
      // Éviter les actions multiples simultanées
      console.log("[TouchesFn] Action en cours, veuillez patienter");
      return;
    }

    // Éviter les actions multiples simultanées
    if (inActionSequence.current) {
      console.log("[TouchesFn] Séquence d'actions déjà en cours, veuillez patienter");
      return;
    }

    // Trouver le statut correspondant à la touche
    const mapping = fnKeyMappings.find(m => m.keyName === event.key);
    if (!mapping) {
      return;
    }

    // Données du contact actuel
    const contactId = activeContact.id;
    const contactName = activeContact.firstName || 'Contact';
    const newStatus = mapping.statusName;
    const isInCall = contactInCallId === contactId;

    // Mise à jour optimiste immédiate de l'interface
    setContacts(prevContacts => 
      prevContacts.map(contact => 
        contact.id === contactId 
          ? {...contact, status: newStatus}
          : contact
      )
    );

    // Une seule notification claire pour l'utilisateur
    toast.success(`Statut "${newStatus}" appliqué à ${contactName}`);

    // Séquence d'actions regroupée dans une seule transition pour éviter les rendus intermédiaires
    startTransition(() => {
      try {
        inActionSequence.current = true;

        // Étape 1: Raccrocher si nécessaire
        if (isInCall) {
          console.log(`[TouchesFn] Raccrochage de l'appel en cours (ID: ${contactId})`);
          const hangUpFormData = new FormData();
          hangUpFormData.append('contactId', contactId);
          hangUpFormAction(hangUpFormData);
        }

        // Étape 2: Mise à jour du statut auprès du serveur
        console.log(`[TouchesFn] Mise à jour du statut: ${newStatus} (ID: ${contactId})`);
        const statusFormData = new FormData();
        statusFormData.append('contactId', contactId);
        statusFormData.append('status', newStatus);
        updateContactFormAction(statusFormData);

        // Étape 3: Trouver et sélectionner le contact suivant
        const currentIndex = filteredContacts.findIndex(c => c.id === contactId);
        const hasNextContact = currentIndex !== -1 && currentIndex < filteredContacts.length - 1;
        
        if (hasNextContact) {
          const nextContact = filteredContacts[currentIndex + 1];
          if (nextContact && nextContact.id) {
            console.log(`[TouchesFn] Passage au contact suivant: ${nextContact.firstName || 'Contact'} (ID: ${nextContact.id})`);
            
            // Mise à jour synchrone du contact actif
            setActiveContact(nextContact);
            
            // Étape 4: Appeler le contact suivant
            if (nextContact.phoneNumber) {
              console.log(`[TouchesFn] Appel du contact suivant (ID: ${nextContact.id}, Tél: ${nextContact.phoneNumber})`);
              const callFormData = new FormData();
              callFormData.append('contactId', nextContact.id);
              callFormData.append('phoneNumber', nextContact.phoneNumber);
              callFormAction(callFormData);
            }
          }
        }

        // Au lieu de fetchAndSetContacts après la séquence, on le programme
        // pour qu'il soit exécuté après que les autres actions aient eu le temps de finir
        setTimeout(() => {
          startTransition(() => {
            fetchAndSetContacts();
            inActionSequence.current = false; // On relâche le verrou après le rafraîchissement
          });
        }, 500); // Un délai raisonnable pour permettre aux autres actions de se terminer
      } catch (error) {
        console.error("[TouchesFn] Erreur pendant la séquence d'actions:", error);
        toast.error("Une erreur est survenue pendant la mise à jour");
        inActionSequence.current = false; // Assurez-vous de libérer le verrou même en cas d'erreur
      }
    });
  }, [
    activeContact, 
    contactInCallId, 
    filteredContacts, 
    fnKeyMappings,
    isUpdateContactPending,
    callFormAction,
    hangUpFormAction, 
    updateContactFormAction,
    fetchAndSetContacts,
    setActiveContact,
    setContacts,
    toast
  ]);

  // Utilisation d'une référence stable pour l'écouteur d'événements
  const stableHandleFunctionKey = useCallback((event: KeyboardEvent) => {
    handleFunctionKey(event);
  }, [handleFunctionKey]);

  useEffect(() => {
    // Utiliser la référence stable pour éviter les installations/suppressions inutiles
    window.addEventListener('keydown', stableHandleFunctionKey, { capture: true });
    
    console.log("[TouchesFn] Écouteur d'événements installé pour les touches fonction");

    return () => {
      window.removeEventListener('keydown', stableHandleFunctionKey, { capture: true });
      console.log("[TouchesFn] Écouteur d'événements supprimé pour les touches fonction");
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
      toast.warn("Aucun contact à exporter.");
      return;
    }
    setIsExportFormatDialogOpen(true);
  };

  const exportToXLSX = (contactsToExport: ContactAppType[]) => {
    if (contactsToExport.length === 0) {
      toast.warn("Aucun contact à exporter.");
      return;
    }
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
    saveAs(data, "contacts.xlsx");
    toast.success("Contacts exportés en XLSX !");
    setIsExportFormatDialogOpen(false);
  };

  const exportToCSV = (contactsToExport: ContactAppType[]) => {
    if (contactsToExport.length === 0) {
      toast.warn("Aucun contact à exporter.");
      return;
    }
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
    saveAs(data, "contacts.csv");
    toast.success("Contacts exportés en CSV !");
    setIsExportFormatDialogOpen(false);
  };

  const handleBookingCreated = useCallback(async (bookingInfo: { date: string; time: string; }) => {
    if (!activeContact || !activeContact.id) {
      toast.warn("Aucun contact actif pour associer le rendez-vous. Veuillez sélectionner un contact.");
      return;
    }
    console.log("[ContactsPage] handleBookingCreated - bookingInfo:", bookingInfo, "activeContactId:", activeContact.id);

    const formData = new FormData();
    formData.append('contactId', activeContact.id);
    formData.append('bookingDate', bookingInfo.date);
    formData.append('bookingTime', bookingInfo.time);

    console.log("[ContactsPage] handleBookingCreated - Données envoyées à updateContactFormAction:", Object.fromEntries(formData.entries()));

    safeUpdateContactAction(formData);
  }, [activeContact, safeUpdateContactAction]);

  const handleRappelDateTimeSelected = useCallback(async (dateTime: Date) => {
    if (!activeContact || !activeContact.id) {
      toast.warn("Aucun contact actif pour programmer un rappel. Veuillez sélectionner un contact.");
      return;
    }

    if (!isValid(dateTime)) {
      toast.error("La date sélectionnée n'est pas valide.");
      return;
    }

    const dateRappel = format(dateTime, 'yyyy-MM-dd');
    const heureRappel = format(dateTime, 'HH:mm');

    console.log(`[ContactsPage] Rappel programmé pour ${activeContact.firstName} ${activeContact.lastName} (ID: ${activeContact.id}) le ${dateRappel} à ${heureRappel}`);
    
    const formattedDisplayDate = safeFormat(dateTime, 'dd/MM/yyyy', { locale: fr });
    toast.info(`Rappel programmé pour ${activeContact.firstName} le ${formattedDisplayDate || 'date invalide'} à ${heureRappel}.`);

    const formData = new FormData();
    formData.append('contactId', activeContact.id);
    formData.append('dateRappel', dateRappel);
    formData.append('heureRappel', heureRappel);

    safeUpdateContactAction(formData);
  }, [activeContact, safeUpdateContactAction]);

  const processFileForImport = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const acceptedTypes = [".csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
    const fileExtension = "." + file.name.split('.').pop()?.toLowerCase();
    const isTypeAccepted = acceptedTypes.some(type => {
      if (type.startsWith('.')) return fileExtension === type;
      return file.type === type;
    });

    if (!isTypeAccepted) {
      toast.error(`Type de fichier non supporté: ${file.name}. Veuillez utiliser un fichier CSV ou Excel.`);
      if (inputFileRef.current) inputFileRef.current.value = "";
      return;
    }

    safeImportAction(formData);
  };

  const handleFileSelectedForImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      processFileForImport(file);
    } else {
      toast.warn("Aucun fichier sélectionné ou sélection annulée.");
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) {
      return;
    }
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (inputFileRef.current) inputFileRef.current.value = "";

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      processFileForImport(file);
      event.dataTransfer.clearData();
    } else {
      toast.warn("Aucun fichier n'a été déposé ou le type n'est pas correct.");
    }
  };

  const handleEditContactInline = useCallback(async (updatedField: Partial<ContactAppType>): Promise<ContactAppType | null> => {
    if (!updatedField.id) {
      toast.error("ID du contact manquant pour la mise à jour.");
      console.error("[ContactsPage] Tentative de mise à jour sans ID de contact.", updatedField);
      return null;
    }

    const { id: contactId, ...dataToUpdate } = updatedField;

    if (Object.keys(dataToUpdate).length === 0) {
      return null;
    }

    const formData = new FormData();
    formData.append('contactId', contactId as string);
    Object.entries(dataToUpdate).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, String(value));
      }
    });

    console.log("[ContactsPage] handleEditContactInline - Données envoyées à updateContactFormAction:", Object.fromEntries(formData.entries()));

    safeUpdateContactAction(formData);

    const currentContact = contacts.find(c => c.id === contactId);
    if (currentContact) {
      return { ...currentContact, ...dataToUpdate };
    }
    return null;
  }, [contacts, safeUpdateContactAction]);

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
      className={cn(
        "flex flex-col h-screen bg-background text-foreground relative overflow-hidden",
        isDragOver && "outline-dashed outline-2 outline-offset-[-4px] outline-primary rounded-lg"
      )}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
              handleFileSelectedForImport={handleFileSelectedForImport}
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
          <Button 
            variant="outline" 
            size="icon" 
            onClick={togglePanel}
            className="h-9 w-9 rounded-full shadow-md bg-background hover:bg-muted shrink-0 self-end sm:self-auto"
            aria-label={isPanelOpen ? "Fermer le panneau" : "Ouvrir le panneau"}
          >
            {isPanelOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        <main className={cn(
          "flex-1 flex flex-col overflow-y-auto transition-all duration-300 ease-in-out p-2 sm:p-4 md:p-6 pt-0",
          "min-w-0"
        )}>
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
              className="overflow-auto contain-paint will-change-transform"
              style={{ maxHeight: 'calc(100vh - 300px)' }} 
            >
              {isLoading ? (
                <div className="flex items-center justify-center h-[300px]">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
              ) : (
          <ContactTable
            data={filteredContacts}
            onEditContact={handleEditContactInline}
            onActiveContactChange={setActiveContact}
            scrollContainerRef={tableViewportRef}
                  isProcessingId={
                    isUpdateContactPending && activeContact && (!updateContactState.data || updateContactState.data.id !== activeContact.id) ? activeContact.id : null
                  }
                  error={updateContactState.success === false ? updateContactState.message : null}
                />
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
              <div className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium rounded-md border border-red-600/50" data-state="closed" data-slot="tooltip-trigger">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle-x h-5 w-5 text-red-600" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="m15 9-6 6"></path>
                  <path d="m9 9 6 6"></path>
                </svg>
                <span className="text-red-600 whitespace-nowrap">Déconnecté</span>
              </div>
            </div>
          </footer>
      </main>

        <aside 
          ref={panelRef}
          className={cn(
            "h-full bg-card border-l shadow-lg transition-all duration-300 ease-in-out z-40",
            "overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent",
            "fixed top-0 right-0",
            "lg:relative lg:right-auto",
            isPanelOpen ? "w-[90vw] sm:w-[350px] p-4" : "w-0 p-0 border-l-0 opacity-0"
          )}
        >
          {isPanelOpen && (activeContact ? (
            <div className="p-0 flex flex-col h-full">
              <div className="flex-grow p-4 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                <div className="flex flex-col items-center mb-4">
                  <span className="relative flex size-8 shrink-0 overflow-hidden rounded-full h-16 w-16 text-2xl flex-shrink-0">
                    <span className="bg-muted flex size-full items-center justify-center rounded-full">
                      {activeContact.firstName?.[0]}{activeContact.lastName?.[0]}
                    </span>
                  </span>
                  <h2 className="text-xl font-semibold mt-2">
                    {activeContact.firstName} {activeContact.lastName}
                  </h2>
                  <p className="text-sm text-muted-foreground">ID: {activeContact.id}</p>
                </div>
                <div className="md:grid md:grid-cols-2 md:gap-x-6">
                  <div className="space-y-3">
                    <section>
                      <h3 className="text-xs font-semibold text-primary mb-1.5">Coordonnées</h3>
                      <div className="space-y-1.5">
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <Mail className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">E-mail</p>
                              <div 
                                className="font-medium min-h-[28px] flex items-center transition-colors duration-150 ease-in-out text-sm hover:bg-muted/30 rounded-md -m-px p-px cursor-text"
                                onClick={(event) => {
                                  const container = event.currentTarget as HTMLElement;
                                  container.innerHTML = '';
                                  const input = document.createElement('input');
                                  input.type = 'text';
                                  input.value = activeContact.email || '';
                                  input.className = 'h-full py-1 px-2 text-sm border-muted focus:ring-1 focus:ring-ring focus:ring-offset-0 bg-background rounded-sm min-w-[50px] w-full';
                                  input.style.width = '100%';
                                  
                                  container.appendChild(input);
                                  
                                  input.focus();
                                  
                                  const handleSave = () => {
                                    if (input.value !== activeContact.email) {
                                      handleEditContactInline({ 
                                        id: activeContact.id, 
                                        email: input.value 
                                      });
                                    }
                                    container.innerHTML = input.value || 'Non renseigné';
                                  };
                                  
                                  input.addEventListener('blur', handleSave);
                                  input.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSave();
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      container.innerHTML = activeContact.email || 'Non renseigné';
                                    }
                                  });
                                }}
                              >
                                {activeContact.email || "Non renseigné"}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <Phone className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">Téléphone Mobile</p>
                              <div 
                                className="font-medium min-h-[28px] flex items-center transition-colors duration-150 ease-in-out text-sm hover:bg-muted/30 rounded-md -m-px p-px cursor-text"
                                onClick={(event) => {
                                  const container = event.currentTarget as HTMLElement;
                                  container.innerHTML = '';
                                  
                                  const input = document.createElement('input');
                                  input.type = 'text';
                                  input.value = activeContact.phoneNumber || '';
                                  input.className = 'h-full py-1 px-2 text-sm border-muted focus:ring-1 focus:ring-ring focus:ring-offset-0 bg-background rounded-sm min-w-[50px] w-full';
                                  input.style.width = '100%';
                                  
                                  container.appendChild(input);
                                  
                                  input.focus();
                                  
                                  const handleSave = () => {
                                    if (input.value !== activeContact.phoneNumber) {
                                      handleEditContactInline({ 
                                        id: activeContact.id, 
                                        phoneNumber: input.value 
                                      });
                                    }
                                    container.innerHTML = input.value || 'Non renseigné';
                                  };
                                  
                                  input.addEventListener('blur', handleSave);
                                  input.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSave();
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      container.innerHTML = activeContact.phoneNumber || 'Non renseigné';
                                    }
                                  });
                                }}
                              >
                                {activeContact.phoneNumber || "Non renseigné"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                    <Separator className="my-2" />
                    <section>
                      <h3 className="text-xs font-semibold text-primary mb-1.5">Statut &amp; Source</h3>
                      <div className="space-y-1.5">
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <Info className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">Statut</p>
                              <div className="font-medium min-h-[28px] flex items-center">
                                <StatusBadge 
                                  currentStatus={activeContact.status as StatusType || ""}
                                  onChangeStatus={(newStatus) => {
                                    handleEditContactInline({ id: activeContact.id, status: newStatus });
                                  }}
                                />
          </div>
        </div>
                          </div>
                        </div>
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <Waypoints className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">Source</p>
                              <div 
                                className="font-medium min-h-[28px] flex items-center transition-colors duration-150 ease-in-out text-sm italic text-muted-foreground/70 hover:bg-muted/30 rounded-md -m-px p-px cursor-text"
                                onClick={(event) => {
                                  const container = event.currentTarget as HTMLElement;
                                  container.innerHTML = '';
                                  
                                  const input = document.createElement('input');
                                  input.type = 'text';
                                  input.value = activeContact.source || '';
                                  input.className = 'h-full py-1 px-2 text-sm border-muted focus:ring-1 focus:ring-ring focus:ring-offset-0 bg-background rounded-sm min-w-[50px] w-full';
                                  input.style.width = '100%';
                                  
                                  container.appendChild(input);
                                  
                                  input.focus();
                                  
                                  const handleSave = () => {
                                    if (input.value !== activeContact.source) {
                                      handleEditContactInline({ 
                                        id: activeContact.id, 
                                        source: input.value 
                                      });
                                    }
                                    container.innerHTML = input.value || 'Source du contact';
                                  };
                                  
                                  input.addEventListener('blur', handleSave);
                                  input.addEventListener('keydown', (e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSave();
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      container.innerHTML = activeContact.source || 'Source du contact';
                                    }
                                  });
                                }}
                              >
                                {activeContact.source || "Source du contact"}
        </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                  <div className="space-y-3 mt-3 md:mt-0">
                    <section>
                      <h3 className="text-xs font-semibold text-primary mb-1.5">Dates Importantes</h3>
                      <div className="space-y-1.5">
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <PhoneOutgoing className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">Date du dernier appel</p>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div className="font-medium min-h-[28px] flex items-center transition-colors duration-150 ease-in-out text-sm italic text-muted-foreground/70 hover:bg-muted/30 rounded-md -m-px p-px cursor-text">
                                    {activeContact.dateAppel ? 
                                      safeFormat(parseISO(activeContact.dateAppel), 'dd/MM/yyyy', { locale: fr }) || "Date invalide" : 
                                      "Non renseigné"}
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <Calendar
                                    mode="single"
                                    selected={activeContact.dateAppel ? 
                                      (() => {
                                        try {
                                          const parsedDate = parseISO(activeContact.dateAppel);
                                          return isValid(parsedDate) ? parsedDate : undefined;
                                        } catch {
                                          return undefined;
                                        }
                                      })() : 
                                      undefined}
                                    onSelect={(date) => {
                                      if (date && isValid(date)) {
                                        handleEditContactInline({ 
                                          id: activeContact.id, 
                                          dateAppel: format(date, 'yyyy-MM-dd') 
                                        });
                                      }
                                    }}
                                    locale={fr}
                                    captionLayout="dropdown"
                                    fromYear={1900}
                                    toYear={2100}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        </div>
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <Clock className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">Heure du dernier appel</p>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div className="font-medium min-h-[28px] flex items-center transition-colors duration-150 ease-in-out text-sm italic text-muted-foreground/70 hover:bg-muted/30 rounded-md -m-px p-px cursor-text">
                                    {activeContact.heureAppel || "HH:MM"}
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <TimePickerOnly
                                    date={activeContact.heureAppel ? (() => {
                                      try {
                                        const [hours, minutes] = activeContact.heureAppel.split(':');
                                        const hoursNum = parseInt(hours, 10);
                                        const minutesNum = parseInt(minutes, 10);
                                        
                                        if (isNaN(hoursNum) || isNaN(minutesNum) || 
                                            hoursNum < 0 || hoursNum > 23 || 
                                            minutesNum < 0 || minutesNum > 59) {
                                          console.warn("Heure invalide:", activeContact.heureAppel);
                                          return new Date();
                                        }
                                        
                                        const date = new Date();
                                        date.setHours(hoursNum, minutesNum, 0, 0);
                                        return date;
                                      } catch (e) {
                                        console.error("Erreur parsing heure:", e);
                                        return new Date();
                                      }
                                    })() : new Date()}
                                    onChange={(date) => {
                                      if (date && isValid(date)) {
                                        handleEditContactInline({ 
                                          id: activeContact.id, 
                                          heureAppel: format(date, 'HH:mm') 
                                        });
                                      }
                                    }}
                                    hourCycle={24}
                                  />
                                </PopoverContent>
                              </Popover>
        </div>
      </div>
                        </div>
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <BellRing className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">Date de rappel programmée</p>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div className="font-medium min-h-[28px] flex items-center transition-colors duration-150 ease-in-out text-sm hover:bg-muted/30 rounded-md -m-px p-px cursor-text">
                                    {activeContact.dateRappel ? 
                                      safeFormat(parseISO(activeContact.dateRappel), 'dd/MM/yyyy', { locale: fr }) || "Date invalide" : 
                                      "Non renseigné"}
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <Calendar
                                    mode="single"
                                    selected={activeContact.dateRappel ? 
                                      (() => {
                                        try {
                                          const parsedDate = parseISO(activeContact.dateRappel);
                                          return isValid(parsedDate) ? parsedDate : undefined;
                                        } catch {
                                          return undefined;
                                        }
                                      })() : 
                                      undefined}
                                    onSelect={(date) => {
                                      if (date && isValid(date)) {
                                        handleEditContactInline({ 
                                          id: activeContact.id, 
                                          dateRappel: format(date, 'yyyy-MM-dd') 
                                        });
                                      }
                                    }}
                                    locale={fr}
                                    captionLayout="dropdown"
                                    fromYear={1900}
                                    toYear={2100}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        </div>
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <Clock className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">Heure de rappel</p>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div className="font-medium min-h-[28px] flex items-center transition-colors duration-150 ease-in-out text-sm italic text-muted-foreground/70 hover:bg-muted/30 rounded-md -m-px p-px cursor-text">
                                    {activeContact.heureRappel || "HH:MM"}
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <TimePickerOnly
                                    date={activeContact.heureRappel ? (() => {
                                      try {
                                        const [hours, minutes] = activeContact.heureRappel.split(':');
                                        const hoursNum = parseInt(hours, 10);
                                        const minutesNum = parseInt(minutes, 10);
                                        
                                        if (isNaN(hoursNum) || isNaN(minutesNum) || 
                                            hoursNum < 0 || hoursNum > 23 || 
                                            minutesNum < 0 || minutesNum > 59) {
                                          console.warn("Heure invalide:", activeContact.heureRappel);
                                          return new Date();
                                        }
                                        
                                        const date = new Date();
                                        date.setHours(hoursNum, minutesNum, 0, 0);
                                        return date;
                                      } catch (e) {
                                        console.error("Erreur parsing heure:", e);
                                        return new Date();
                                      }
                                    })() : new Date()}
                                    onChange={(date) => {
                                      if (date && isValid(date)) {
                                        handleEditContactInline({ 
                                          id: activeContact.id, 
                                          heureRappel: format(date, 'HH:mm') 
                                        });
                                      }
                                    }}
                                    hourCycle={24}
                                  />
                                </PopoverContent>
                              </Popover>
        </div>
                          </div>
                        </div>
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <CalendarDays className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">Date de rendez-vous</p>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div className="font-medium min-h-[28px] flex items-center transition-colors duration-150 ease-in-out text-sm italic text-muted-foreground/70 hover:bg-muted/30 rounded-md -m-px p-px cursor-text">
                                    {activeContact.dateRendezVous ? 
                                      safeFormat(parseISO(activeContact.dateRendezVous), 'dd/MM/yyyy', { locale: fr }) || "Date invalide" : 
                                      "Non renseigné"}
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <Calendar
                                    mode="single"
                                    selected={activeContact.dateRendezVous ? 
                                      (() => {
                                        try {
                                          const parsedDate = parseISO(activeContact.dateRendezVous);
                                          return isValid(parsedDate) ? parsedDate : undefined;
                                        } catch {
                                          return undefined;
                                        }
                                      })() : 
                                      undefined}
                                    onSelect={(date) => {
                                      if (date && isValid(date)) {
                                        handleEditContactInline({ 
                                          id: activeContact.id, 
                                          dateRendezVous: format(date, 'yyyy-MM-dd') 
                                        });
                                      }
                                    }}
                                    locale={fr}
                                    captionLayout="dropdown"
                                    fromYear={1900}
                                    toYear={2100}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        </div>
                        <div className="py-1 group relative">
                          <div className="flex items-start space-x-3">
                            <Clock className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-muted-foreground">Heure de rendez-vous</p>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <div className="font-medium min-h-[28px] flex items-center transition-colors duration-150 ease-in-out text-sm italic text-muted-foreground/70 hover:bg-muted/30 rounded-md -m-px p-px cursor-text">
                                    {activeContact.heureRendezVous || "HH:MM"}
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                  <TimePickerOnly
                                    date={activeContact.heureRendezVous ? (() => {
                                      try {
                                        const [hours, minutes] = activeContact.heureRendezVous.split(':');
                                        const hoursNum = parseInt(hours, 10);
                                        const minutesNum = parseInt(minutes, 10);
                                        
                                        if (isNaN(hoursNum) || isNaN(minutesNum) || 
                                            hoursNum < 0 || hoursNum > 23 || 
                                            minutesNum < 0 || minutesNum > 59) {
                                          console.warn("Heure invalide:", activeContact.heureRendezVous);
                                          return new Date();
                                        }
                                        
                                        const date = new Date();
                                        date.setHours(hoursNum, minutesNum, 0, 0);
                                        return date;
                                      } catch (e) {
                                        console.error("Erreur parsing heure:", e);
                                        return new Date();
                                      }
                                    })() : new Date()}
                                    onChange={(date) => {
                                      if (date && isValid(date)) {
                                        handleEditContactInline({ 
                                          id: activeContact.id, 
                                          heureRendezVous: format(date, 'HH:mm') 
                                        });
                                      }
                                    }}
                                    hourCycle={24}
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
                <Separator className="my-2" />
                <section className="md:col-span-2">
                  <div className="flex justify-between items-center mb-1.5">
                    <h3 className="text-xs font-semibold text-primary">Commentaire</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(event) => {
                        event.stopPropagation();
                        const commentContainer = event.currentTarget.closest('section')?.querySelector('[role="button"]') as HTMLElement;
                        if (commentContainer) {
                          // Simuler un clic sur le conteneur de commentaire pour lancer l'édition
                          commentContainer.click();
                        }
                      }}
                    >
                      <Edit3 className="h-4 w-4 text-muted-foreground hover:text-primary" />
                    </Button>
                  </div>
                  <div 
                    className="text-sm whitespace-pre-wrap min-h-[60px] p-3 rounded-md border border-dashed border-transparent hover:border-muted hover:bg-muted/50 cursor-pointer transition-colors italic text-muted-foreground" 
                    role="button" 
                    tabIndex={0}
                    onClick={(event) => {
                      const container = event.currentTarget;
                      const oldContent = container.innerHTML;
                      container.innerHTML = '';
                      
                      const textarea = document.createElement('textarea');
                      textarea.value = activeContact.comment || '';
                      textarea.className = 'w-full min-h-[60px] h-full p-3 text-sm border-muted focus:ring-1 focus:ring-ring focus:ring-offset-0 bg-background rounded-md';
                      textarea.style.resize = 'vertical';
                      
                      container.appendChild(textarea);
                      
                      textarea.focus();
                      
                      const handleSave = () => {
                        if (textarea.value !== activeContact.comment) {
                          handleEditContactInline({ 
                            id: activeContact.id, 
                            comment: textarea.value 
                          });
                        }
                        container.innerHTML = textarea.value || "Aucun commentaire. Cliquez ou appuyez sur Entrée pour ajouter.";
                      };
                      
                      textarea.addEventListener('blur', handleSave);
                      textarea.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          container.innerHTML = oldContent;
                        }
                      });
                    }}
                  >
                    {activeContact.comment || "Aucun commentaire. Cliquez ou appuyez sur Entrée pour ajouter."}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="p-0 flex flex-col h-full">
              <div className="flex-grow p-4 space-y-3 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                <div className="flex flex-col items-center justify-center h-full">
                  <User className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">Aucun contact sélectionné</p>
                  <p className="text-sm text-muted-foreground text-center">Veuillez sélectionner un contact dans la liste pour voir ses détails.</p>
                </div>
              </div>
            </div>
          ))}
        </aside>
      </div>

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
    </div>
  );
} 