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
import { cn } from '@/lib/utils';
import type { Contact as ContactSchemaType } from '@/lib/schemas/contact';
import { FunctionKeyStatusMappingGuide, type StatusMapping } from '@/components/ui/FunctionKeyStatusMappingGuide';
import { AdbStatusBadge } from '@/components/ui/AdbStatusBadge';
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
  const [contacts, setContacts] = useState<ContactAppType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeContact, setActiveContactState] = useState<ContactAppType | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [contactInCallId, setContactInCallId] = useState<string | null>(null);
  const [isExportFormatDialogOpen, setIsExportFormatDialogOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSearchColumn, setSelectedSearchColumn] = useState('firstName');

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
      } else {
        toast.error(updateContactState.message || "Erreur lors de la mise à jour du contact.");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateContactState]);

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
      } else if (callState.success && !callState.data) {
        toast.success(callState.message + " (Données de contact non reçues pour mise à jour locale).");
      } else {
        toast.error(callState.message);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callState, activeContact]);

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
      } else {
        toast.error(hangUpState.message || "Erreur lors du raccrochage de l'appel.");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hangUpState, activeContact]);

  const getContactsForAutosave = useCallback(async () => {
    return contacts;
  }, [contacts]);

  const { 
    isSaving: isAutosaveSaving,
    error: autosaveHookError,
    fileHandle: autosaveFileHandle,
    resetFileHandle,
  } = useAutosaveFile(getContactsForAutosave);

  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  useEffect(() => {
    if (autosaveHookError) {
      toast.error(`Erreur d'autosave/téléchargement: ${autosaveHookError}`);
    }
  }, [autosaveHookError]);

  const [wasSaving, setWasSaving] = useState(false);
  useEffect(() => {
    if (wasSaving && !isAutosaveSaving && !autosaveHookError) {
      if (autosaveFileHandle) {
         toast.success("Fichier sauvegardé automatiquement !");
      }
    }
    setWasSaving(isAutosaveSaving);
  }, [isAutosaveSaving, wasSaving, autosaveHookError, autosaveFileHandle]);

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

    startTransition(() => {
      importFormAction(formData);
    });
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

    startTransition(() => {
      updateContactFormAction(formData);
    });

    const currentContact = contacts.find(c => c.id === contactId);
    if (currentContact) {
      return { ...currentContact, ...dataToUpdate };
    }
    return null;
  }, [contacts, updateContactFormAction]);

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

  const mainFnKeyActionLogic = useCallback((event: KeyboardEvent) => {
    const { key } = event;
    console.log(`[TouchesFn] Touche traitée: ${key}. Contact actif: ${activeContact?.firstName}`);

    const mapping = fnKeyMappings.find(m => m.keyName === key);
    if (!mapping) {
        console.warn(`[TouchesFn] Pas de mapping pour la touche ${key}`);
        return;
    }

    if (!activeContact || !activeContact.id) {
        toast.info("Veuillez d'abord sélectionner un contact valide");
        return;
    }

    console.log(`[TouchesFn DEBUG] Contact actif au début: ID=${activeContact.id}, Nom=${activeContact.firstName}`);

    // Capturer toutes les données nécessaires immédiatement
    const currentContactId = activeContact.id;
    const currentContactFirstName = activeContact.firstName;
    const newStatus = mapping.statusName;
    
    // *** ÉTAPE 1: Raccrocher l'appel en cours ***
    const hangUpCurrentCall = (onDone: () => void) => {
      console.log(`[TouchesFn] Étape 1: Vérification d'appel en cours`);
      
      if (!contactInCallId) {
        console.log('[TouchesFn] Aucun appel en cours, passage à l\'étape suivante');
        onDone(); // Passer directement à l'étape suivante
        return;
      }
      
      console.log(`[TouchesFn] Raccrochage de l'appel (ID: ${contactInCallId})`);
      
      const hangUpFormData = new FormData();
      hangUpFormData.append('contactId', contactInCallId);
      hangUpFormAction(hangUpFormData);
      
      toast.info(`Raccrochage de l'appel en cours...`);
      
      // Attendre un court moment avant de passer à l'étape suivante
      setTimeout(onDone, 800);
    };
    
    // *** ÉTAPE 2: Appliquer le statut ***
    const applyStatusToContact = (onDone: () => void) => {
      console.log(`[TouchesFn] Étape 2: Application du statut "${newStatus}" au contact ${currentContactId}`);
      
      // Mise à jour côté serveur
      const statusFormData = new FormData();
      statusFormData.append('contactId', currentContactId);
      statusFormData.append('status', newStatus);
      
      // Envelopper l'appel d'action dans startTransition
      startTransition(() => {
        updateContactFormAction(statusFormData);
        
        // Mise à jour locale immédiate
        setContacts(prevContacts => prevContacts.map(contact => 
          contact.id === currentContactId 
            ? {...contact, status: newStatus}
            : contact
        ));
        
        if (activeContact?.id === currentContactId) {
          setActiveContact({...activeContact, status: newStatus});
        }
        
        toast.success(`Statut "${newStatus}" appliqué à ${currentContactFirstName}`);
        
        // Passer à l'étape suivante après un court délai
        setTimeout(onDone, 500);
      });
    };
    
    // *** ÉTAPE 3: Trouver et sélectionner le contact suivant ***
    const selectNextContact = (onDone: (id: string, name: string, phone?: string | null) => void) => {
      console.log(`[TouchesFn] Étape 3: Recherche du contact suivant`);
      
      // Trouver l'index actuel
      const currentIndex = filteredContacts.findIndex(c => c.id === currentContactId);
      console.log(`[TouchesFn] Index actuel: ${currentIndex}, Total contacts: ${filteredContacts.length}`);
      
      if (currentIndex === -1 || currentIndex >= filteredContacts.length - 1) {
        const reason = currentIndex === -1 
          ? `Le contact actif n'a pas été trouvé dans la liste` 
          : `C'était le dernier contact de la liste`;
          
        console.log(`[TouchesFn] Pas de contact suivant: ${reason}`);
        toast.info(reason);
        return; // Fin de la séquence
      }
      
      // Obtenir le contact suivant
      const nextContact = filteredContacts[currentIndex + 1];
      if (!nextContact || !nextContact.id) {
        console.error(`[TouchesFn] Contact suivant invalide`);
        toast.error(`Données du contact suivant invalides`);
        return; // Fin de la séquence
      }
      
      const nextContactId = nextContact.id;
      const nextContactName = nextContact.firstName || 'Contact';
      const nextContactPhone = nextContact.phoneNumber;
      
      console.log(`[TouchesFn] Contact suivant trouvé: ${nextContactName} (ID: ${nextContactId})`);
      
      // Mettre à jour le contact actif dans l'interface
      startTransition(() => {
        setActiveContact(nextContact);
        toast.success(`Passage au contact: ${nextContactName}`);
        
        // Laisser l'interface se mettre à jour avant d'appeler le contact
        setTimeout(() => {
          if (onDone) onDone(nextContactId, nextContactName, nextContactPhone);
        }, 500);
      });
    };
    
    // *** ÉTAPE 4: Appeler le contact suivant ***
    const callContact = (contactId: string, contactName: string, contactPhone?: string | null) => {
      console.log(`[TouchesFn] Étape 4: Appel du contact ${contactName} (ID: ${contactId})`);
      
      if (!contactId) {
        console.error(`[TouchesFn] ID du contact manquant pour l'appel`);
        toast.error(`Impossible d'appeler le contact: ID manquant`);
        return;
      }
      
      // Envelopper l'appel d'action dans startTransition
      startTransition(() => {
        const callFormData = new FormData();
        callFormData.append('contactId', contactId);
        
        if (contactPhone) {
          console.log(`[TouchesFn] Numéro utilisé: ${contactPhone}`);
          callFormData.append('phoneNumber', contactPhone);
        }
        
        callFormAction(callFormData);
        toast.info(`Appel en cours pour ${contactName}...`);
        
        console.log(`[TouchesFn] Séquence complète terminée avec succès`);
      });
    };
    
    // Orchestrer la séquence complète
    hangUpCurrentCall(() => {
      applyStatusToContact(() => {
        selectNextContact((nextId, nextName, nextPhone) => {
          callContact(nextId, nextName, nextPhone);
        });
      });
    });
    
  }, [activeContact, contactInCallId, filteredContacts, fnKeyMappings, callFormAction, hangUpFormAction, updateContactFormAction, setActiveContact, setContacts, toast]);

  useEffect(() => {
    console.log("[TouchesFn] Installation d'un gestionnaire unique pour les touches fonction");
    
    // Définir une seule fonction de gestionnaire
    const handleFunctionKey = async (event: KeyboardEvent) => {
      const relevantKeys = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
      
      // Vérifier si c'est une touche pertinente
      if (!relevantKeys.includes(event.key)) {
        return;
      }

      // Logs détaillés
      console.log(`[TouchesFn] TOUCHE DÉTECTÉE: ${event.key} - Type d'événement: ${event.type} - Phase: ${event.eventPhase}`);
      
      // Bloquer le comportement par défaut du navigateur
      event.preventDefault();
      
      // Vérifier si on a un contact actif
      if (!activeContact || !activeContact.id) {
        console.log("[TouchesFn] Aucun contact actif ou ID manquant, impossible de traiter la touche");
        toast.info("Veuillez d'abord sélectionner un contact valide");
        return;
      }

      console.log(`[TouchesFn] Contact actif trouvé: ${activeContact.firstName} (ID: ${activeContact.id})`);
      
      // Exécuter immédiatement la logique principale sans conditions supplémentaires
      try {
        console.log(`[TouchesFn] Exécution directe de la logique pour la touche ${event.key}`);
        mainFnKeyActionLogic(event);
      } catch (error) {
        console.error("[TouchesFn] ERREUR lors du traitement:", error);
        toast.error("Erreur lors du traitement de l'action");
      }
    };

    // Ajouter plusieurs écouteurs pour s'assurer que l'événement est capturé
    // 1. Au niveau window avec capture
    window.addEventListener('keydown', handleFunctionKey, { capture: true });
    
    // 2. Au niveau document avec capture
    document.addEventListener('keydown', handleFunctionKey, { capture: true });
    
    // 3. Via la propriété onkeydown
    const originalOnKeyDown = document.onkeydown;
    document.onkeydown = function(e) {
      const relevantKeys = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'];
      if (relevantKeys.includes(e.key)) {
        console.log(`[TouchesFn] Touche interceptée via document.onkeydown: ${e.key}`);
        handleFunctionKey(e);
        return false;
      }
      return originalOnKeyDown ? originalOnKeyDown.call(this, e) : true;
    };
    
    console.log("[TouchesFn] Écouteurs d'événements installés avec succès");

    return () => {
      console.log("[TouchesFn] Nettoyage des écouteurs d'événements");
      window.removeEventListener('keydown', handleFunctionKey, { capture: true });
      document.removeEventListener('keydown', handleFunctionKey, { capture: true });
      document.onkeydown = originalOnKeyDown;
    };
  }, [mainFnKeyActionLogic, activeContact, toast]);

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

    startTransition(() => {
      updateContactFormAction(formData);
    });
  }, [activeContact, updateContactFormAction]);

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

    startTransition(() => {
      updateContactFormAction(formData);
    });
  }, [activeContact, updateContactFormAction]);

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
            <AdbStatusBadge />
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
              callFormAction={callFormAction}
              hangUpFormAction={hangUpFormAction}
              contactInCallId={contactInCallId}
              onExportClick={handleRequestManualExport}
              onBookingCreated={handleBookingCreated}
              onRappelDateTimeSelected={handleRappelDateTimeSelected}
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
              <FunctionKeyStatusMappingGuide mappings={fnKeyMappings} className="mt-2 sm:mt-0 w-full sm:w-auto" />
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
          
          <footer className="shrink-0 mt-auto pt-4 pb-2 text-center text-xs text-muted-foreground flex items-center justify-between">
            <div>
              <span>{contacts.length} contact{contacts.length === 1 ? '' : 's'}</span>
              {autosaveFileHandle && <span className="ml-2 text-green-600">(Autosave activé)</span>}
              {isAutosaveSaving && <span className="ml-2"><Loader2 className="h-3 w-3 animate-spin inline-block" /> Sauvegarde auto...</span>}
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