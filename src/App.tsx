import './index.css';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Theme, Contact, CallState, CallStates, ContactStatus, Civility, EmailType } from './types';
import { APP_NAME, COLUMN_HEADERS, CONTACT_DATA_KEYS, headerIcons } from './constants';
import { ContactTable } from './components/ContactTable';
import { EmailDialog, RappelDialog, QualificationDialog, GenericInfoDialog } from './components/Dialogs';
import { ClientFilesPanel } from './components/ClientFilesPanel';
import { SupabaseDataDialog } from './components/SupabaseDataDialog';
import { TitleBar } from './components/TitleBar';
import { 
  loadContacts, 
  saveContacts, 
  importContactsFromFile, 
  exportContactsToFile, 
  loadCallStates, 
  saveCallStates,
  saveImportedTable,
  loadImportedTable,
  clearImportedTable,
  hasImportedTable,
  getImportedTableMetadata,
  formatPhoneNumber,
  generateGmailComposeUrl
} from './services/dataService';
import { supabaseService } from './services/supabaseService';
import { useAdb } from './hooks/useAdb';
import { v4 as uuidv4 } from 'uuid';
import { Card, CardContent } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Progress } from './components/ui/progress';
import { cn } from './lib/utils';
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
  Phone, Mail, MessageSquare, Bell, Calendar as CalendarIcon, FileCheck, Linkedin, Globe, 
  Download, Database, Keyboard, RefreshCw, Sun, Moon, Columns, X, Filter, Infinity, 
  Upload, CheckCircle, XCircle, Smartphone, Wifi, WifiOff, Loader2, PanelRightOpen, PanelRightClose, FileSpreadsheet
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
import { DropZoneOverlay } from './components/Common';
import { CalendarModal } from './components/CalendarModal';

// Composant DonutChart moderne
const DonutChart: React.FC<{ progress: number; size?: number }> = ({ progress, size = 32 }) => {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          className="text-muted-foreground/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="text-primary transition-all duration-300 ease-in-out"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[9px] font-medium text-muted-foreground">
          {progress}%
        </span>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // State declarations
  const [theme, setTheme] = useState<Theme>(Theme.Dark);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [callStates, setCallStates] = useState<CallStates>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [searchColumn, setSearchColumn] = useState<keyof Contact | 'all'>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [activeCallContactId, setActiveCallContactId] = useState<string | null>(null);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isRappelDialogOpen, setIsRappelDialogOpen] = useState(false);
  const [isQualificationDialogOpen, setIsQualificationDialogOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [isFnKeysInfoOpen, setIsFnKeysInfoOpen] = useState(false);
  const [isSupabaseDataDialogOpen, setIsSupabaseDataDialogOpen] = useState(false);
  const [isAdbLogsDialogOpen, setIsAdbLogsDialogOpen] = useState(false);

  const [notifications, setNotifications] = useState<{ id: string; type: 'success' | 'error' | 'info'; message: string; duration: number }[]>([]);
  const [importProgress, setImportProgress] = useState<{ percentage: number; message: string } | null>(null);
  
  const [autoSearchMode, setAutoSearchMode] = useState<'disabled' | 'linkedin' | 'google'>('disabled');
  const [splitPanelOpen, setSplitPanelOpen] = useState(true);

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    "Prénom": true, "Nom": true, "Téléphone": true, "Mail": true, "Statut": true,
    "Commentaire": true, "Date Rappel": true, "Heure Rappel": true,
    "Date RDV": true, "Heure RDV": true, "Date Appel": true, "Heure Appel": true, "Durée Appel": true,
    "Actions": true
  });

  // ADB Hook
  const { 
    connectionState: adbConnectionState, 
    isConnecting: adbConnecting, 
    connect: connectAdb, 
    disconnect: disconnectAdb,
    getLogs: getAdbLogs,
    setAutoDetection: setAdbAutoDetection,
    restartAdbServer: restartAdb,
    makeCall: makeAdbCall,
    endCall: adbEndCall,
    sendSms,
    getCurrentCallState,
    getLastCallNumber,
    checkCallState,
    onCallEnd
  } = useAdb();

  // Settings state
  const [currentTab, setCurrentTab] = useState<'table' | 'adb' | 'files' | 'performance' | 'supabase'>('table');
  const [isImporting, setIsImporting] = useState(false);
  const [showSupabaseDialog, setShowSupabaseDialog] = useState(false);
  
  // Configuration pour la synchronisation Supabase automatique
  const [autoSupabaseSync, setAutoSupabaseSync] = useState(false);

  // Stable helper functions
  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string, duration: number = 3000) => {
    const id = uuidv4();
    setNotifications(prev => [...prev, { id, type, message, duration }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  }, []);

  const updateContact = useCallback(async (updatedFields: Partial<Contact> & { id: string }) => {
    const existingContact = contacts.find(c => c.id === updatedFields.id);
    if (!existingContact) {
      console.warn(`Contact avec l'ID ${updatedFields.id} non trouvé pour mise à jour`);
      return;
    }

    const updatedContact = { ...existingContact, ...updatedFields };
    const updatedContacts = contacts.map(c => c.id === updatedFields.id ? updatedContact : c);
    
    setContacts(updatedContacts);
    
    // Sauvegarder les contacts mis à jour
    saveContacts(updatedContacts);
    
    // Si on a une table importée, la mettre à jour aussi
    if (hasImportedTable()) {
      const savedTable = loadImportedTable();
      if (savedTable && savedTable.metadata) {
        saveImportedTable(updatedContacts, savedTable.metadata);
        console.log('📱 Table importée mise à jour avec les nouvelles données de contact');
      }
    }

    // 🔄 Mise à jour en temps réel du contact sélectionné dans le panneau latéral
    if (selectedContact?.id === updatedFields.id) {
      setSelectedContact(updatedContact);
      console.log('📱 Panneau latéral mis à jour en temps réel:', updatedFields);
    }

    // Synchronisation avec Supabase uniquement si activée
    if (autoSupabaseSync && supabaseService.isReady()) {
      try {
        console.log('🔄 Synchronisation avec Supabase...', updatedFields);
        await supabaseService.updateContact(updatedFields.id, updatedFields);
        console.log('✅ Contact synchronisé avec Supabase');
      } catch (error) {
        console.error('❌ Erreur de synchronisation Supabase:', error);
        showNotification('error', 'Erreur de synchronisation avec Supabase', 5000);
      }
    }
  }, [contacts, selectedContact, autoSupabaseSync, showNotification]);

  const addContact = useCallback(async (newContact: Omit<Contact, 'id' | 'numeroLigne'>) => {
    const contactWithId = {
      ...newContact,
      id: uuidv4(),
      numeroLigne: contacts.length + 1,
    };

    // Ajout local immédiat
    setContacts(prev => [...prev, contactWithId].map((c, idx) => ({ ...c, numeroLigne: idx + 1 })));

    // Synchronisation avec Supabase uniquement si activée
    if (autoSupabaseSync && supabaseService.isReady()) {
      try {
        console.log('🔄 Ajout contact vers Supabase...', newContact);
        await supabaseService.createContact(newContact);
        console.log('✅ Contact ajouté à Supabase');
        showNotification('success', `Contact ${newContact.prenom} ${newContact.nom} ajouté et synchronisé`);
      } catch (error) {
        console.error('❌ Erreur d\'ajout Supabase:', error);
        showNotification('error', 'Erreur d\'ajout vers Supabase', 5000);
      }
    } else {
      showNotification('success', `Contact ${newContact.prenom} ${newContact.nom} ajouté localement`);
    }

    return contactWithId;
  }, [contacts, autoSupabaseSync, showNotification]);

  const updateCallState = useCallback((contactId: string, newState: Partial<CallState>) => {
    setCallStates(prev => ({ ...prev, [contactId]: { ...(prev[contactId] || {}), ...newState } }));
  }, []);
  
  const refreshData = useCallback(() => {
    const loadedContacts = loadContacts();
    const contactsWithIds = loadedContacts.map((c, idx) => ({
      ...c,
      telephone: formatPhoneNumber(c.telephone || ""),
      id: c.id || uuidv4(),
      numeroLigne: idx + 1,
    }));
    setContacts(contactsWithIds);
    setCallStates(loadCallStates());
    
    // Vérifier si le contact sélectionné existe toujours
    if (selectedContact) {
      const stillExists = contactsWithIds.find(c => c.id === selectedContact.id);
      if (!stillExists) {
        setSelectedContact(null);
      }
    }
  }, [selectedContact]);

  const handleRowSelection = useCallback((contact: Contact | null) => {
    console.log('Sélection contact:', contact ? `${contact.prenom} ${contact.nom} (ID: ${contact.id})` : 'Aucun');
    setSelectedContact(contact);
  }, []);

  const handleDeleteContact = useCallback(async (contactId: string) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce contact ?")) {
      const contactToDelete = contacts.find(c => c.id === contactId);
      
      // Suppression locale immédiate
      setContacts(prev => prev.filter(c => c.id !== contactId).map((c, idx) => ({...c, numeroLigne: idx + 1})));
      setCallStates(prev => {
        const newStates = {...prev};
        delete newStates[contactId];
        return newStates;
      });
      if (selectedContact?.id === contactId) {
        setSelectedContact(null);
      }
      if (activeCallContactId === contactId) {
        setActiveCallContactId(null);
        setCallStartTime(null);
      }

      // Synchronisation avec Supabase uniquement si activée
      if (autoSupabaseSync && supabaseService.isReady() && contactToDelete) {
        try {
          console.log('🔄 Suppression contact de Supabase...', contactId);
          await supabaseService.deleteContact(contactId);
          console.log('✅ Contact supprimé de Supabase');
          showNotification('info', `Contact ${contactToDelete.prenom} ${contactToDelete.nom} supprimé et synchronisé.`);
        } catch (error) {
          console.error('❌ Erreur de suppression Supabase:', error);
          showNotification('error', 'Erreur de suppression de Supabase', 5000);
        }
      } else {
        showNotification('info', "Contact supprimé localement.");
      }
    }
  }, [contacts, selectedContact, activeCallContactId, autoSupabaseSync, showNotification]);

  const endActiveCall = useCallback((markAsError = false, contactIdToEnd?: string) => {
    const idToProcess = contactIdToEnd || activeCallContactId;
    if (idToProcess && callStates[idToProcess]?.isCalling) {
      updateCallState(idToProcess, { isCalling: false, hasBeenCalled: !markAsError });
      if (callStartTime && !markAsError) {
        const durationMs = new Date().getTime() - callStartTime.getTime();
        const seconds = Math.floor((durationMs / 1000) % 60);
        const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
        const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        updateContact({id: idToProcess, dureeAppel: durationStr });
      } else if (markAsError) {
        updateContact({id: idToProcess, dureeAppel: "Erreur" });
      }
      if (activeCallContactId === idToProcess) {
        setActiveCallContactId(null);
        setCallStartTime(null);
      }
      showNotification('info', "Appel terminé (simulé).");
    }
  }, [activeCallContactId, callStates, callStartTime, updateCallState, updateContact, showNotification]);

  // Search handlers
  const handleLinkedInSearch = useCallback((contact?: Contact) => {
    const target = contact || selectedContact;
    if (!target) {
      showNotification('info', "Sélectionnez un contact pour la recherche LinkedIn.");
      return;
    }
    const query = `${target.prenom} ${target.nom}`;
    window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`, '_blank');
  }, [selectedContact, showNotification]);

  const handleGoogleSearch = useCallback((contact?: Contact) => {
    const target = contact || selectedContact;
    if (!target) {
      showNotification('info', "Sélectionnez un contact pour la recherche Google.");
      return;
    }
    const query = `${target.prenom} ${target.nom}`;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
  }, [selectedContact, showNotification]);

  const handleSms = useCallback(async (contact?: Contact) => {
    const target = contact || selectedContact;
    if (!target) {
        showNotification('info', "Sélectionnez un contact pour envoyer un SMS.");
        return;
    }

    // Vérifier la connexion ADB
    if (!adbConnectionState.isConnected) {
      showNotification('error', "Aucun appareil Android connecté via ADB. Connectez votre téléphone d'abord.");
      return;
    }

    // Vérifier que le contact a un numéro de téléphone
    if (!target.telephone) {
      showNotification('error', `Aucun numéro de téléphone pour ${target.prenom} ${target.nom}.`);
      return;
    }

    // Créer le nom d'accueil
    const greetingName = `${target.prenom} ${target.nom}`.trim() || "client(e)";
    
    // Message SMS de l'ancienne application
    const messageBody = `Bonjour ${greetingName}, Pour resituer mon appel, je suis gérant privé au sein du cabinet de gestion de patrimoine Arcanis Conseil. Je vous envoie l'adresse de notre site web que vous puissiez en savoir d'avantage : https://arcanis-conseil.fr Le site est avant tout une vitrine, le mieux est de m'appeler si vous souhaitez davantage d'informations ou de prendre un créneau de 30 minutes dans mon agenda via ce lien : https://calendly.com/dimitri-morel-arcanis-conseil/audit Bien à vous, Dimitri MOREL - Arcanis Conseil`;

    // Nettoyer le numéro de téléphone
    const phoneNumberCleaned = target.telephone.replace(/\s/g, '');

    try {
      showNotification('info', "Préparation du SMS...");
      
      // Préparer le SMS avec le message pré-rempli
      const result = await sendSms(phoneNumberCleaned, messageBody);
      
      if (result.success) {
        showNotification('success', "L'application de messagerie s'est ouverte avec votre message pré-rempli. Vous n'avez plus qu'à vérifier et envoyer.");
      } else {
        showNotification('error', `Échec de la préparation du SMS: ${result.message}`);
      }
    } catch (error) {
      showNotification('error', `Erreur lors de la préparation du SMS: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }, [selectedContact, showNotification, adbConnectionState.isConnected, sendSms]);



  const makePhoneCall = useCallback(async (contactToCall?: Contact) => {
    const targetContact = contactToCall || selectedContact;

    if (!targetContact) {
      showNotification('error', "Sélectionnez un contact pour appeler.");
      return;
    }
    if (activeCallContactId && activeCallContactId !== targetContact.id) {
      endActiveCall(false, activeCallContactId); 
    }

    // Vérifier la connexion ADB
    if (!adbConnectionState.isConnected) {
      showNotification('error', "Aucun appareil Android connecté via ADB. Connectez votre téléphone d'abord.");
      return;
    }

    // Nettoyer le numéro de téléphone pour l'appel
    const cleanPhoneNumber = targetContact.telephone.replace(/[^0-9+]/g, '');
    
    try {
      showNotification('info', `Appel en cours vers ${targetContact.prenom} ${targetContact.nom} au ${targetContact.telephone}...`);
      
              // Faire l'appel réel via ADB
        const callResult = await makeAdbCall(cleanPhoneNumber);
        
        if (callResult.success) {
          // Appel réussi
          console.log(`📞 Configuration de l'appel pour le contact ${targetContact.id}...`);
          updateCallState(targetContact.id, { isCalling: true, hasBeenCalled: false });
          setActiveCallContactId(targetContact.id);
          setCallStartTime(new Date());
          console.log(`📞 Contact actif défini: ${targetContact.id}, heure de début: ${new Date()}`);
          
          const now = new Date();
          updateContact({
            id: targetContact.id,
            dateAppel: now.toISOString().split('T')[0],
            heureAppel: now.toTimeString().substring(0,5),
            dureeAppel: "00:00" 
          });
          setSelectedContact(targetContact);
        
        showNotification('success', `Appel initié vers ${targetContact.prenom} ${targetContact.nom}`);
        
        // Recherche automatique selon le mode configuré
        if (autoSearchMode === 'linkedin') {
          handleLinkedInSearch(targetContact);
          showNotification('info', 'Ouverture automatique LinkedIn', 2000);
        } else if (autoSearchMode === 'google') {
          handleGoogleSearch(targetContact);
          showNotification('info', 'Ouverture automatique Google', 2000);
        }
        // Si 'disabled', ne rien faire
      } else {
        // Échec de l'appel
        showNotification('error', `Échec de l'appel: ${callResult.message}`);
      }
    } catch (error) {
      showNotification('error', `Erreur lors de l'appel: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }, [selectedContact, activeCallContactId, endActiveCall, updateCallState, updateContact, autoSearchMode, 
      showNotification, handleLinkedInSearch, handleGoogleSearch, adbConnectionState.isConnected, makeAdbCall]);

  // Surveillance robuste des fins d'appel via événements ADB
  useEffect(() => {
    console.log('🔧 Configuration de la surveillance des fins d\'appels...');
    
    const unsubscribeCallEnd = onCallEnd((callEndEvent) => {
      console.log('📞 Événement de fin d\'appel reçu:', callEndEvent);
      
      if (activeCallContactId) {
        // Calculer la durée d'appel formatée
        const seconds = Math.floor((callEndEvent.durationMs / 1000) % 60);
        const minutes = Math.floor((callEndEvent.durationMs / (1000 * 60)) % 60);
        const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        console.log(`📞 Mise à jour du contact ${activeCallContactId} avec durée: ${durationStr}`);
        
        // Mettre à jour le contact avec la durée réelle
        updateContact({
          id: activeCallContactId, 
          dureeAppel: durationStr
        });
        
        // Terminer l'appel dans l'interface
        updateCallState(activeCallContactId, { isCalling: false, hasBeenCalled: true });
        setActiveCallContactId(null);
        setCallStartTime(null);
        
        showNotification('success', `Appel terminé - Durée: ${durationStr}`);
      } else {
        console.log('📞 Fin d\'appel détectée mais aucun appel actif dans l\'interface');
        showNotification('info', "Appel terminé détecté.");
      }
    });
    
    return () => {
      console.log('🔧 Nettoyage de la surveillance des fins d\'appels...');
      unsubscribeCallEnd();
    };
  }, [activeCallContactId, onCallEnd, updateContact, updateCallState, showNotification]);

  // Auto-connexion ADB au démarrage si pas encore connecté
  useEffect(() => {
    if (!adbConnectionState.isConnected && !adbConnecting) {
      // Essayer de se connecter automatiquement après 2 secondes
      const timer = setTimeout(() => {
        connectAdb().catch(error => {
          console.log('Auto-connexion ADB échouée:', error);
        });
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [adbConnectionState.isConnected, adbConnecting, connectAdb]);

  // useEffects
  useEffect(() => {
    if (theme === Theme.Dark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.backgroundColor = 'hsl(220 9% 4%)';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.backgroundColor = 'hsl(0 0% 100%)';
    }
  }, [theme]);

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // S'exécuter une seule fois au démarrage
    if (!isInitialized) {
      // Vérifier s'il y a une table importée sauvegardée
      if (hasImportedTable()) {
        const savedTable = loadImportedTable();
        if (savedTable && savedTable.contacts.length > 0) {
          const metadata = savedTable.metadata;
          console.log(`🔄 Restauration de la table importée: ${savedTable.contacts.length} contacts (${metadata?.fileName})`);
          
          const contactsWithIds = savedTable.contacts.map((c, idx) => ({
            ...c,
            telephone: formatPhoneNumber(c.telephone || ""),
            id: c.id || uuidv4(),
            numeroLigne: idx + 1,
          }));
          
          setContacts(contactsWithIds);
          setCallStates(loadCallStates());
          showNotification('success', `Table importée restaurée: ${contactsWithIds.length} contacts (${metadata?.fileName})`, 4000);
          setIsInitialized(true);
          return; // Ne pas charger les contacts par défaut
        }
      }
      
      // Chargement normal si pas de table importée
      refreshData();
      setIsInitialized(true);
    }
  }, [isInitialized, showNotification]);

  useEffect(() => {
    // Ne sauvegarder que si on n'est pas en train de restaurer
    if (contacts.length > 0) {
      saveContacts(contacts);
    }
  }, [contacts]);

  useEffect(() => {
    saveCallStates(callStates);
  }, [callStates]);

  // Configuration des mises à jour temps réel Supabase
  useEffect(() => {
    if (supabaseService.isReady()) {
      console.log('🔄 Configuration des mises à jour temps réel Supabase...');
      
      // Initialiser le temps réel
      supabaseService.initializeRealtime();
      
      // Écouter les mises à jour temps réel
      const handleRealtimeUpdate = (update: any) => {
        console.log('📡 Mise à jour temps réel reçue:', update);
        
        switch (update.type) {
          case 'INSERT':
            // Nouveau contact ajouté depuis un autre client
            setContacts(prev => {
              const exists = prev.find(c => c.id === update.contact.id);
              if (!exists) {
                showNotification('info', `Nouveau contact ajouté: ${update.contact.prenom} ${update.contact.nom}`);
                return [...prev, update.contact].map((c, idx) => ({ ...c, numeroLigne: idx + 1 }));
              }
              return prev;
            });
            break;
            
          case 'UPDATE':
            // Contact modifié depuis un autre client
            setContacts(prev => {
              const updated = prev.map(c => {
                if (c.id === update.contact.id) {
                  // Ne pas écraser les modifications locales en cours
                  return { ...c, ...update.contact };
                }
                return c;
              });
              
              // Afficher notification seulement si ce n'est pas nous qui avons fait la modification
              const changed = prev.find(c => c.id === update.contact.id);
              if (changed && JSON.stringify(changed) !== JSON.stringify(update.contact)) {
                showNotification('info', `Contact mis à jour: ${update.contact.prenom} ${update.contact.nom}`, 2000);
              }
              
              return updated;
            });
            break;
            
          case 'DELETE':
            // Contact supprimé depuis un autre client
            setContacts(prev => {
              const exists = prev.find(c => c.id === update.contact.id);
              if (exists) {
                showNotification('info', `Contact supprimé: ${exists.prenom} ${exists.nom}`);
                return prev.filter(c => c.id !== update.contact.id).map((c, idx) => ({ ...c, numeroLigne: idx + 1 }));
              }
              return prev;
            });
            break;
        }
      };
      
      supabaseService.onRealtimeUpdate(handleRealtimeUpdate);
      
      return () => {
        // Cleanup lors du démontage
        supabaseService.cleanup();
      };
    }
  }, [showNotification]); // Pas de dependencies sur contacts pour éviter les loops
  
  const filteredContacts = useMemo(() => {
    if (!searchTerm) return contacts;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return contacts.filter(contact => {
      if (searchColumn === 'all') {
        return Object.values(contact).some(value =>
          String(value).toLowerCase().includes(lowerSearchTerm)
        );
      }
      const contactValue = contact[searchColumn as keyof Contact];
      return String(contactValue).toLowerCase().includes(lowerSearchTerm);
    });
     }, [contacts, searchTerm, searchColumn]);

   // Handler pour les raccourcis globaux Electron
   useEffect(() => {
     let isProcessing = false; // Protection contre les appels multiples

     const handleGlobalFnKey = (event: any, key: string) => {
       console.log(`🌐 [ELECTRON_FN] Raccourci global reçu: ${key}`);
       
       if (isProcessing) {
         console.log(`⏳ [ELECTRON_FN] Workflow en cours, ${key} ignoré`);
         return;
       }
       
       if (!selectedContact) {
         console.log(`❌ [ELECTRON_FN] Aucun contact sélectionné pour ${key}`);
         return;
       }
       
       // Mapper les touches F vers les statuts
       const fnKeyStatusMap: Record<string, ContactStatus> = {
         'F2': ContactStatus.Premature,
         'F3': ContactStatus.MauvaisNum,
         'F4': ContactStatus.Repondeur,
         'F5': ContactStatus.ARappeler,
         'F6': ContactStatus.PasInteresse,
         'F7': ContactStatus.Argumente,
         'F8': ContactStatus.DO,
         'F9': ContactStatus.RO,
         'F10': ContactStatus.ListeNoire
       };
       
       const newStatus = fnKeyStatusMap[key];
       if (!newStatus) {
         console.log(`❌ [ELECTRON_FN] Touche ${key} non supportée`);
         return;
       }
       
       console.log(`🎯 [ELECTRON_FN] Traitement ${key} → ${newStatus} pour ${selectedContact.prenom}`);
       
       isProcessing = true; // Bloquer les nouveaux workflows
       
       // WORKFLOW OPTIMISÉ: 1) Raccrocher → 2) Appliquer statut → 3) Sélectionner suivant → 4) Appeler suivant
       if (activeCallContactId === selectedContact.id) {
         console.log(`📞 🔥 [WORKFLOW] Étape 1/4: Raccrochage ADB pour ${key} → ${newStatus}`);
         
         adbEndCall().then((result: any) => {
           console.log(`✅ [WORKFLOW] Étape 1/4: Raccrochage réussi - ${result.message}`);
           endActiveCall(false, selectedContact.id);
           
           // Étape 2: Appliquer le statut immédiatement
           console.log(`📝 [WORKFLOW] Étape 2/4: Application du statut "${newStatus}"`);
           updateContact({ id: selectedContact.id, statut: newStatus });
           showNotification('success', `${key}: ${selectedContact.prenom} → "${newStatus}"`);
           
           // Étape 3: Trouver et sélectionner le contact suivant
           const currentIndex = filteredContacts.findIndex(c => c.id === selectedContact.id);
           if (currentIndex !== -1 && currentIndex < filteredContacts.length - 1) {
             const nextContact = filteredContacts[currentIndex + 1];
             console.log(`➡️ [WORKFLOW] Étape 3/4: Sélection du contact suivant - ${nextContact.prenom}`);
             setSelectedContact(nextContact);
             
             // Étape 4: Lancer l'appel après délai
             setTimeout(() => {
               console.log(`📞 [WORKFLOW] Étape 4/4: Lancement appel automatique vers ${nextContact.prenom}`);
               makePhoneCall(nextContact);
               isProcessing = false; // Débloquer après le workflow complet
             }, 400);
           } else {
             console.log(`🏁 [WORKFLOW] Fin de liste atteinte`);
             showNotification('info', "Fin de la liste atteinte.");
             isProcessing = false; // Débloquer 
           }
           
         }).catch((error: any) => {
           console.error('❌ [WORKFLOW] Erreur raccrochage:', error);
           // Fallback: continuer le workflow même si raccrochage échoue
           endActiveCall(false, selectedContact.id);
           updateContact({ id: selectedContact.id, statut: newStatus });
           showNotification('error', `${key}: ${newStatus} (raccrochage partiel)`);
           
           // Continuer avec contact suivant
           const currentIndex = filteredContacts.findIndex(c => c.id === selectedContact.id);
           if (currentIndex !== -1 && currentIndex < filteredContacts.length - 1) {
             const nextContact = filteredContacts[currentIndex + 1];
             setSelectedContact(nextContact);
             setTimeout(() => {
               makePhoneCall(nextContact);
               isProcessing = false; // Débloquer après fallback
             }, 400);
           } else {
             isProcessing = false; // Débloquer si fin de liste
           }
         });
       } else {
         // Pas d'appel en cours - workflow simplifié
         console.log(`📝 [WORKFLOW] Pas d'appel actif - Application directe ${key} → ${newStatus}`);
         updateContact({ id: selectedContact.id, statut: newStatus });
         showNotification('info', `${key}: ${selectedContact.prenom} → "${newStatus}"`);
         
         // Passer au contact suivant et appeler
         const currentIndex = filteredContacts.findIndex(c => c.id === selectedContact.id);
         if (currentIndex !== -1 && currentIndex < filteredContacts.length - 1) {
           const nextContact = filteredContacts[currentIndex + 1];
           setSelectedContact(nextContact);
           setTimeout(() => {
             makePhoneCall(nextContact);
             isProcessing = false; // Débloquer après workflow direct
           }, 200);
         } else {
           showNotification('info', "Fin de la liste atteinte.");
           isProcessing = false; // Débloquer si fin de liste
         }
       }
     };

     // Vérifier l'API Electron via window.electronAPI
     if (window.electronAPI?.ipcRenderer) {
       try {
         window.electronAPI.ipcRenderer.on('global-fn-key', handleGlobalFnKey);
         console.log('✅ [ELECTRON_FN] Raccourcis globaux Electron activés via electronAPI');
         
         return () => {
           window.electronAPI.ipcRenderer.removeListener('global-fn-key', handleGlobalFnKey);
           console.log('🔄 [ELECTRON_FN] Handler global nettoyé');
         };
       } catch (error) {
         console.error('❌ [ELECTRON_FN] Erreur activation raccourcis:', error);
       }
     } else {
       console.log('⚠️ [ELECTRON_FN] API Electron non trouvée. Disponible:', !!window.electronAPI);
       console.log('🔍 [ELECTRON_FN] Propriétés electronAPI:', Object.keys(window.electronAPI || {}));
     }
   }, [selectedContact, activeCallContactId, filteredContacts, adbEndCall, endActiveCall, updateContact, showNotification, makePhoneCall]);

  // Handler local supprimé - utilisation uniquement du handler global Electron
  // Voir handleGlobalFnKey plus haut pour la gestion complète des touches F2-F10
  
  // Handler Enter pour les appels
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Enter') && selectedContact && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && !document.querySelector('.fixed.inset-0.z-50')) { 
        event.preventDefault();
        makePhoneCall();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedContact, makePhoneCall]);

  // Other handlers - version optimisée pour gros fichiers
  const handleImportFile = async (droppedFiles: FileList) => {
    if (droppedFiles && droppedFiles[0]) {
      const file = droppedFiles[0];
      const fileSizeMB = file.size / (1024 * 1024);
      
      setImportProgress({ 
        message: `Importation de "${file.name}" (${fileSizeMB.toFixed(1)} MB)...`, 
        percentage: 0 
      });
      
      try {
        // Analyse de la taille du fichier
        if (fileSizeMB > 50) {
          setImportProgress({ 
            message: `⚠️ Fichier volumineux détecté (${fileSizeMB.toFixed(1)} MB). Traitement optimisé...`, 
            percentage: 5 
          });
          await new Promise(res => setTimeout(res, 1000));
        }
        
        setImportProgress({ message: `📖 Lecture du fichier...`, percentage: 10 });
        await new Promise(res => setTimeout(res, 200));
        
        setImportProgress({ message: `⚙️ Traitement par chunks...`, percentage: 20 });
        
        // Import optimisé
        const newContacts = await importContactsFromFile(file);
        
        setImportProgress({ message: `📝 Préparation des données...`, percentage: 80 });
        await new Promise(res => setTimeout(res, 100));
        
        const updatedContacts = newContacts.map((c, idx) => ({ 
          ...c, 
          numeroLigne: idx + 1, 
          id: c.id || uuidv4() 
        }));
        
        setImportProgress({ message: `💾 Sauvegarde...`, percentage: 90 });
        
        // Sauvegarder la table importée pour persistance
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        const source = fileExtension === 'csv' ? 'csv' : 'xlsx';
        saveImportedTable(updatedContacts, {
          fileName: file.name,
          source: source as 'csv' | 'xlsx',
          totalRows: updatedContacts.length
        });
        
        setContacts(updatedContacts);
        setCallStates({});
        setSelectedContact(null);
        
        setImportProgress({ message: `✅ Finalisation...`, percentage: 100 });
        await new Promise(res => setTimeout(res, 500)); 
        setImportProgress(null);
        
        const message = fileSizeMB > 10 
          ? `🎉 ${updatedContacts.length} contacts importés avec succès depuis un fichier de ${fileSizeMB.toFixed(1)} MB !`
          : `✅ ${updatedContacts.length} contacts importés avec succès !`;
          
        showNotification('success', message);
        
      } catch (error) {
        console.error("Import error:", error);
        setImportProgress(null);
        showNotification('error', `❌ Erreur d'importation: ${error instanceof Error ? error.message : "Erreur inconnue"}. Vérifiez le format de votre fichier.`);
      }
    }
  };
  
  const handleSupabaseImport = (selectedSupabaseContacts: Partial<Contact>[]) => {
     setImportProgress({ message: "Traitement de l'import Supabase...", percentage: 0 });
    const newContactsFromSupabase: Contact[] = selectedSupabaseContacts.map((importedContact) => {
      const tel = importedContact?.telephone || (importedContact as any)?.numero || (importedContact as any)?.Téléphone || '';
      const mail = importedContact?.email || (importedContact as any)?.mail || (importedContact as any)?.Mail || '';
      const src = importedContact?.source || (importedContact as any)?.ecole || (importedContact as any)?.source || (importedContact as any)?.Source || '';
      const status = importedContact?.statut || (importedContact as any)?.['Statut Final'] || ContactStatus.NonDefini;
      const comment = importedContact?.commentaire || (importedContact as any)?.['Commentaires Appel 1'] || '';

      return {
        id: importedContact?.id || uuidv4(),
        numeroLigne: 0,
        prenom: String(importedContact?.prenom || (importedContact as any)?.['Prénom'] || ''),
        nom: String(importedContact?.nom || (importedContact as any)?.['Nom'] || ''),
        telephone: formatPhoneNumber(String(tel)),
        email: String(mail),
        source: String(src),
        statut: Object.values(ContactStatus).includes(status as ContactStatus) ? status as ContactStatus : ContactStatus.NonDefini,
        commentaire: String(comment),
        dateRappel: String(importedContact?.dateRappel || ''),
        heureRappel: String(importedContact?.heureRappel || ''),
        dateRDV: String(importedContact?.dateRDV || ''),
        heureRDV: String(importedContact?.heureRDV || ''),
        dateAppel: String(importedContact?.dateAppel || ''),
        heureAppel: String(importedContact?.heureAppel || ''),
        dureeAppel: String(importedContact?.dureeAppel || 'N/A'),
        sexe: String(importedContact?.sexe || (importedContact as any)?.Sexe || ''),
        don: String(importedContact?.don || (importedContact as any)?.Don || ''),
        qualite: String(importedContact?.qualite || (importedContact as any)?.Qualité || ''),
        type: String(importedContact?.type || (importedContact as any)?.Type || ''),
        date: String(importedContact?.date || (importedContact as any)?.Date || ''),
        uid: String(importedContact?.uid || (importedContact as any)?.UID || ''),
        uid_supabase: String(importedContact?.uid_supabase || (importedContact as any)?.id || ''),
      };
    });
    const finalContacts = newContactsFromSupabase.map((c,idx) => ({...c, numeroLigne: idx + 1}));
    
    // Sauvegarder la table importée pour persistance
    saveImportedTable(finalContacts, {
      fileName: `Import Supabase - ${new Date().toLocaleDateString()}`,
      source: 'supabase',
      totalRows: finalContacts.length
    });
    
    setContacts(finalContacts);
    setCallStates({}); 
    setSelectedContact(null);
    setImportProgress(null);
    showNotification('success', `${newContactsFromSupabase.length} contacts importés depuis Supabase et sauvegardés.`);
    setIsSupabaseDataDialogOpen(false);
  };

  const handleExport = (format: 'csv' | 'xlsx') => {
    if (contacts.length === 0) {
      showNotification('info', "Aucun contact à exporter.");
      return;
    }
    exportContactsToFile(contacts, format);
    showNotification('success', `Contacts exportés au format ${format.toUpperCase()}.`);
  };



  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === Theme.Light ? Theme.Dark : Theme.Light));
  };
  
  const toggleColumnVisibility = (header: string) => {
    if (header === "#" || header === "Prénom" || header === "Nom" || header === "Actions") return;
    setVisibleColumns(prev => ({ ...prev, [header]: !prev[header] }));
  };

  const handleRefresh = () => {
    showNotification('info', 'Rafraîchissement des données...');
    refreshData();
  };

  // Derived state & constants for rendering
  const searchColumnsOptions = useMemo(() => [
    { value: 'all', label: 'Toutes les colonnes' },
    ...COLUMN_HEADERS.slice(1, COLUMN_HEADERS.length -1) 
      .map((header, idx) => {
        const dataKeyIndex = idx + 1; 
        const dataKey = CONTACT_DATA_KEYS[dataKeyIndex] as keyof Contact | null;
        return {
          value: dataKey || 'all',
          label: header
        };
      })
  ], []);

  const totalContacts = contacts.length;
  const processedContacts = contacts.filter(c => c.statut !== ContactStatus.NonDefini).length;
  const progressPercentage = totalContacts > 0 ? Math.round((processedContacts / totalContacts) * 100) : 0;

  // RibbonButton component homogénéisé
  const RibbonButton: React.FC<{
    onClick?: () => void;
    icon: React.ReactNode;
    label: string;
    disabled?: boolean;
    className?: string;
    isDropdown?: boolean;
    children?: React.ReactNode;
  }> = ({ onClick, icon, label, disabled, className, isDropdown = false, children }) => {

    const buttonContent = (
      <>
        {/* Shimmer effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
        </div>
        
        {/* Glow effect */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-radial from-primary/20 via-transparent to-transparent blur-xl" />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full w-full">
          <div className="w-4 h-4 mb-1 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">
            {icon}
          </div>
          <span className="text-[10px] leading-tight truncate w-full transition-all duration-300 group-hover:font-semibold text-center">
            {label}
          </span>
        </div>
        {children}
      </>
    );

    const buttonClasses = cn(
      "flex flex-col items-center justify-center min-w-[60px] max-w-[70px] h-12 ribbon-button-modern",
      "relative overflow-hidden transition-all duration-300 ease-out",
      "hover:scale-105 hover:shadow-lg hover:shadow-primary/20",
      "group cursor-pointer",
      "border border-transparent hover:bg-gradient-to-br hover:from-primary/10 hover:to-accent/10 hover:border-primary/30",
      !disabled && "hover:transform hover:rotate-1",
      disabled && "opacity-50 cursor-not-allowed pointer-events-none",
      className
    );

    if (isDropdown) {
      return (
        <div className={cn(
          // Classes de base du Button ghost sm de shadcn/ui
          "whitespace-nowrap text-sm font-medium disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
          "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          "hover:text-accent-foreground dark:hover:bg-accent/50",
          "rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
          // Classes custom du ribbon
          buttonClasses
        )}>
          {buttonContent}
        </div>
      );
    }

    return (
      <Button
        onClick={onClick}
        variant="ghost"
        size="sm"
        disabled={disabled}
        className={buttonClasses}
      >
        {buttonContent}
      </Button>
    );
  };

  // Fonction pour ouvrir le modal Cal.com
  const handleCalendarClick = useCallback(() => {
    if (!selectedContact) {
      showNotification('error', 'Veuillez sélectionner un contact pour prendre un rendez-vous');
      return;
    }
    
    console.log('🗓️ Ouverture du modal calendrier pour:', selectedContact.prenom, selectedContact.nom);
    
    // ⚠️ SOLUTION TEMPORAIRE pour X-Frame-Options
    // Cal.com bloque l'embedding avec X-Frame-Options: sameorigin
    // On peut soit essayer l'embed (qui va échouer) soit aller directement au nouvel onglet
    
    const useDirectOpen = true; // Changez à false pour essayer l'embed d'abord
    
    if (useDirectOpen) {
      console.log('🗓️ Ouverture directe en nouvel onglet (contournement X-Frame-Options)');
      handleDirectCalendarOpen();
    } else {
      console.log('🗓️ Tentative d\'embedding Cal.com (risque d\'échec X-Frame-Options)');
      setIsCalendarModalOpen(true);
    }
  }, [selectedContact, showNotification]);

  // Fonction pour ouvrir directement Cal.com en nouvel onglet
  const handleDirectCalendarOpen = useCallback(() => {
    if (!selectedContact) {
      showNotification('error', 'Veuillez sélectionner un contact');
      return;
    }
    
    const calUrl = "https://cal.com/dimitri-morel-arcanis-conseil/audit-patrimonial";
    const queryParams = new URLSearchParams();
    
    if (selectedContact.nom) queryParams.append('name', selectedContact.nom);
    if (selectedContact.prenom) queryParams.append('Prenom', selectedContact.prenom);
    if (selectedContact.email) queryParams.append('email', selectedContact.email);
    if (selectedContact.telephone) {
      let phoneNumber = selectedContact.telephone.replace(/[\s\-\(\)]/g, '');
      if (!phoneNumber.startsWith('+')) {
        if (phoneNumber.startsWith('0')) {
          phoneNumber = '+33' + phoneNumber.substring(1);
        } else if (!phoneNumber.startsWith('33')) {
          phoneNumber = '+33' + phoneNumber;
        } else {
          phoneNumber = '+' + phoneNumber;
        }
      }
      queryParams.append('smsReminderNumber', phoneNumber);
    }
    
    const finalUrl = `${calUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    console.log('🔗 Ouverture Cal.com:', finalUrl);
    
    window.open(finalUrl, '_blank');
    showNotification('info', `Calendrier ouvert pour ${selectedContact.prenom} ${selectedContact.nom}`);
  }, [selectedContact, showNotification]);

  // Fonction callback quand un RDV est pris avec succès
  const handleCalendarSuccess = useCallback(() => {
    if (selectedContact) {
      showNotification('success', `Rendez-vous pris avec ${selectedContact.prenom} ${selectedContact.nom}`);
      // Optionnel : mettre à jour la date/heure de RDV du contact
      // updateContact({ id: selectedContact.id, dateRDV: new Date().toISOString().split('T')[0] });
    }
    setIsCalendarModalOpen(false);
  }, [selectedContact, showNotification]);

  // JSX Return
  return (
    <div className={cn("flex flex-col h-screen overflow-visible pt-8", theme === Theme.Dark ? "dark" : "")}>
      {/* Barre de titre personnalisée pour Electron */}
      <TitleBar theme={theme} title="DimiCall - Gestion des contacts" />
      
      {/* Notifications */}
      <div className="fixed top-4 right-4 z-[100] space-y-2">
        {notifications.map(notif => (
          <div
            key={notif.id}
            className={cn(
              "p-3 rounded-lg shadow-lg border animate-slide-in flex items-center gap-2 text-white text-sm relative",
              notif.type === 'success' && "bg-green-500",
              notif.type === 'error' && "bg-red-500",
              notif.type === 'info' && "bg-blue-500"
            )}
          >
            {notif.message}
            <button 
              onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))} 
              className="absolute top-1 right-1 text-lg font-bold opacity-70 hover:opacity-100 leading-none p-1"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Modal de progression */}
      {importProgress && (
        <Dialog open={true} onOpenChange={() => setImportProgress(null)}>
          <DialogContent className="sm:max-w-md" aria-describedby="import-progress-desc">
            <DialogHeader>
              <DialogTitle className="sr-only">Progression d'import</DialogTitle>
            </DialogHeader>
            <div id="import-progress-desc" className="flex flex-col items-center space-y-4 p-4">
              <div className="w-12 h-12 border-4 border-muted rounded-full animate-spin border-t-primary" />
              <div className="text-center space-y-2">
                <p className="text-sm font-medium">{importProgress.message}</p>
                {importProgress.percentage !== null && (
                  <div className="w-full">
                    <Progress value={importProgress.percentage} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{importProgress.percentage}%</p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      
      {/* Main content */}
      <main className="flex-1 flex flex-col p-2 space-y-2 overflow-visible">
        {/* Ribbon */}
        <Card className="p-2 ribbon-container">
          <div className="flex items-stretch justify-center gap-1 relative">
            {/* Actions group */}
            <div className="flex flex-wrap gap-1 p-1 border-r border-border pr-2 mr-1">
              <RibbonButton onClick={() => makePhoneCall()} icon={<Phone />} label="Appeler" disabled={!selectedContact} />
              <RibbonButton onClick={() => selectedContact && setIsEmailDialogOpen(true)} icon={<Mail />} label="Email" disabled={!selectedContact} />
              <RibbonButton onClick={() => handleSms()} icon={<MessageSquare />} label="SMS" disabled={!selectedContact} />
              <RibbonButton onClick={() => selectedContact && setIsRappelDialogOpen(true)} icon={<Bell />} label="Rappel" disabled={!selectedContact} />
              <RibbonButton onClick={handleCalendarClick} icon={<CalendarIcon />} label="RDV" disabled={!selectedContact} />
              <RibbonButton onClick={() => selectedContact && setIsQualificationDialogOpen(true)} icon={<FileCheck />} label="Qualif." disabled={!selectedContact} />
            </div>

            {/* Search group */}
            <div className="flex flex-wrap gap-1 p-1 border-r border-border pr-2 mr-1">
              <RibbonButton onClick={() => handleLinkedInSearch()} icon={<Linkedin />} label="LinkedIn" disabled={!selectedContact} />
              <RibbonButton onClick={() => handleGoogleSearch()} icon={<Globe />} label="Google" disabled={!selectedContact} />
              
              {/* Dropdown Auto-Search */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "flex flex-col items-center justify-center min-w-[60px] max-w-[70px] h-12 ribbon-button-modern",
                      "relative overflow-hidden transition-all duration-300 ease-out",
                      "hover:scale-105 hover:shadow-lg hover:shadow-primary/20",
                      "group cursor-pointer",
                      "border border-transparent hover:bg-gradient-to-br hover:from-primary/10 hover:to-accent/10 hover:border-primary/30",
                      "hover:transform hover:rotate-1"
                    )}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                    </div>
                    
                    {/* Glow effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-radial from-primary/20 via-transparent to-transparent blur-xl" />
                    
                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center justify-center h-full w-full">
                      <div className="w-4 h-4 mb-1 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">
                        {autoSearchMode === 'disabled' ? <X /> :
                         autoSearchMode === 'linkedin' ? <Linkedin /> :
                         <Globe />}
                      </div>
                      <span className="text-[10px] leading-tight truncate w-full transition-all duration-300 group-hover:font-semibold text-center">
                        {autoSearchMode === 'disabled' ? 'Désactivé' :
                         autoSearchMode === 'linkedin' ? 'Auto-LinkedIn' :
                         'Auto-Google'}
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  className="w-56 border shadow-lg !bg-white dark:!bg-gray-800 !opacity-100" 
                  align="center"
                  style={{
                    backgroundColor: theme === Theme.Dark ? '#1f2937' : '#ffffff',
                    opacity: '1 !important',
                    zIndex: 9999,
                    color: theme === Theme.Dark ? '#f9fafb' : '#111827'
                  }}
                >
                  <DropdownMenuLabel 
                    className="flex items-center gap-2 !opacity-100"
                    style={{
                      backgroundColor: theme === Theme.Dark ? '#1f2937' : '#ffffff',
                      color: theme === Theme.Dark ? '#f9fafb' : '#111827',
                      opacity: '1 !important'
                    }}
                  >
                    <Infinity className="w-4 h-4" />
                    Mode de recherche automatique
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator 
                    style={{
                      backgroundColor: theme === Theme.Dark ? '#374151' : '#e5e7eb',
                      opacity: '1 !important'
                    }}
                  />
                  <DropdownMenuGroup>
                    <DropdownMenuItem 
                      onClick={() => setAutoSearchMode('disabled')}
                      className="cursor-pointer !opacity-100"
                      style={{
                        backgroundColor: autoSearchMode === 'disabled' 
                          ? (theme === Theme.Dark ? '#374151' : '#f3f4f6') 
                          : (theme === Theme.Dark ? '#1f2937' : '#ffffff'),
                        color: theme === Theme.Dark ? '#f9fafb' : '#111827',
                        opacity: '1 !important'
                      }}
                    >
                      <X className="mr-2 h-4 w-4 text-red-500" />
                      <span>Désactivé</span>
                      {autoSearchMode === 'disabled' && <span className="ml-auto text-xs opacity-70">Actuel</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setAutoSearchMode('linkedin')}
                      className="cursor-pointer !opacity-100"
                      style={{
                        backgroundColor: autoSearchMode === 'linkedin' 
                          ? (theme === Theme.Dark ? '#374151' : '#f3f4f6') 
                          : (theme === Theme.Dark ? '#1f2937' : '#ffffff'),
                        color: theme === Theme.Dark ? '#f9fafb' : '#111827',
                        opacity: '1 !important'
                      }}
                    >
                      <Linkedin className="mr-2 h-4 w-4 text-blue-500" />
                      <span>Auto-LinkedIn</span>
                      {autoSearchMode === 'linkedin' && <span className="ml-auto text-xs opacity-70">Actuel</span>}
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setAutoSearchMode('google')}
                      className="cursor-pointer !opacity-100"
                      style={{
                        backgroundColor: autoSearchMode === 'google' 
                          ? (theme === Theme.Dark ? '#374151' : '#f3f4f6') 
                          : (theme === Theme.Dark ? '#1f2937' : '#ffffff'),
                        color: theme === Theme.Dark ? '#f9fafb' : '#111827',
                        opacity: '1 !important'
                      }}
                    >
                      <Globe className="mr-2 h-4 w-4 text-green-500" />
                      <span>Auto-Google</span>
                      {autoSearchMode === 'google' && <span className="ml-auto text-xs opacity-70">Actuel</span>}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Data group */}
            <div className="flex flex-wrap gap-1 p-1 border-r border-border pr-2 mr-1">
              <RibbonButton onClick={() => document.getElementById('fileImporter')?.click()} icon={<Upload />} label="Importer" />
              <input type="file" id="fileImporter" accept=".csv, .tsv, .xlsx, .xls" className="hidden" onChange={(e) => e.target.files && handleImportFile(e.target.files)} />
              
              {/* Bouton Export avec menu déroulant */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={contacts.length === 0}
                    className={cn(
                      "flex flex-col items-center justify-center min-w-[60px] max-w-[70px] h-12 ribbon-button-modern",
                      "relative overflow-hidden transition-all duration-300 ease-out",
                      "hover:scale-105 hover:shadow-lg hover:shadow-primary/20",
                      "group cursor-pointer",
                      "border border-transparent hover:bg-gradient-to-br hover:from-primary/10 hover:to-accent/10 hover:border-primary/30",
                      contacts.length > 0 && "hover:transform hover:rotate-1"
                    )}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
                    </div>
                    
                    {/* Glow effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-radial from-primary/20 via-transparent to-transparent blur-xl" />
                    
                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center justify-center h-full w-full">
                      <div className="w-4 h-4 mb-1 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">
                        <Download />
                      </div>
                      <span className="text-[10px] leading-tight truncate w-full transition-all duration-300 group-hover:font-semibold text-center">
                        Export
                      </span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  className="w-40 border shadow-lg bg-white dark:bg-gray-900 z-50 !opacity-100" 
                  align="center"
                  style={{
                    backgroundColor: theme === Theme.Dark ? '#1f2937' : '#ffffff',
                    border: theme === Theme.Dark ? '1px solid #374151' : '1px solid #e5e7eb',
                    color: theme === Theme.Dark ? '#f9fafb' : '#1f2937',
                    zIndex: 250,
                    opacity: 1
                  }}
                >
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Format d'export
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                                         <DropdownMenuItem 
                       onClick={() => handleExport('csv')}
                       className="cursor-pointer"
                       disabled={contacts.length === 0}
                     >
                       <span className="mr-2 text-green-600">CSV</span>
                       <span className="text-xs text-muted-foreground">Fichier texte</span>
                     </DropdownMenuItem>
                     <DropdownMenuItem 
                       onClick={() => handleExport('xlsx')}
                       className="cursor-pointer"
                       disabled={contacts.length === 0}
                     >
                       <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                       <span>Excel</span>
                       <span className="ml-auto text-xs text-muted-foreground">.xlsx</span>
                     </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              
                              <RibbonButton onClick={() => setIsFnKeysInfoOpen(true)} icon={<Keyboard />} label="Fn Keys"
                />
            </div>

            {/* Tools group */}
            <div className="flex flex-wrap gap-1 p-1">
              <RibbonButton
                onClick={() => setShowSupabaseDialog(true)}
                icon={<Database />}
                label="Supabase"
              />
              <RibbonButton
                onClick={() => setAutoSupabaseSync(!autoSupabaseSync)}
                icon={autoSupabaseSync ? <CheckCircle /> : <XCircle />}
                label={autoSupabaseSync ? "Sync ON" : "Sync OFF"}
              />
            </div>

            {/* Theme toggle - positioned absolutely to not affect centering */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <RibbonButton
                onClick={toggleTheme}
                icon={theme === Theme.Dark ? <Sun /> : <Moon />}
                label={theme === Theme.Dark ? "Mode Clair" : "Mode Sombre"}
                className="min-w-[50px] max-w-[60px] h-10"
              />
            </div>
          </div>
        </Card>

        {/* Search bar */}
        <div className="flex gap-2 items-center">
          <Select value={searchColumn} onValueChange={(value) => setSearchColumn(value as keyof Contact | 'all')}>
            <SelectTrigger className="w-40 text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {searchColumnsOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex-1 relative">
            <Input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs h-8 pl-8"
            />
            <Filter className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              onClick={() => setSplitPanelOpen(!splitPanelOpen)}
              variant="outline"
              size="sm"
              className={cn(
                "gap-1.5 h-6 text-xs py-0.5 px-1.5 relative overflow-hidden",
                "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                "hover:scale-105 hover:shadow-lg active:scale-95",
                "group toggle-button-pulse",
                splitPanelOpen 
                  ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20 active" 
                  : "hover:bg-muted/50"
              )}
            >
              {/* Effet de shimmer sur le bouton */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out" />
              </div>
              
              {/* Icône avec animation de rotation et de transformation */}
              <div className={cn(
                "relative z-10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                "group-hover:rotate-12 group-hover:scale-110",
                splitPanelOpen && "text-primary"
              )}>
                {splitPanelOpen ? (
                  <PanelRightClose className="w-3 h-3 animate-pulse" />
                ) : (
                  <PanelRightOpen className="w-3 h-3" />
                )}
              </div>
              
              {/* Petit indicateur de statut */}
              {splitPanelOpen && (
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
              )}
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 flex overflow-visible">
          {/* Contact table */}
          <div className={cn("flex-1 flex flex-col overflow-visible", splitPanelOpen && "w-2/3")}>

            <div className="flex-1">
              <ContactTable
                contacts={filteredContacts}
                callStates={callStates}
                onSelectContact={handleRowSelection}
                selectedContactId={selectedContact?.id || null}
                onUpdateContact={updateContact}
                onDeleteContact={handleDeleteContact}
                activeCallContactId={activeCallContactId}
                theme={theme}
                visibleColumns={visibleColumns}
                columnHeaders={COLUMN_HEADERS}
                contactDataKeys={CONTACT_DATA_KEYS as (keyof Contact | 'actions' | null)[]}
                onToggleColumnVisibility={toggleColumnVisibility}
              />
            </div>
          </div>

          {/* Side panel avec animation ultra smooth et moderne - OCCUPE TOUT L'ESPACE */}
          <div 
            className={cn(
              "h-full flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              "will-change-transform-gpu hardware-accelerated bg-muted/5",
              splitPanelOpen 
                ? 'w-1/3 min-w-[300px] opacity-100' 
                : 'w-0 min-w-0 opacity-0'
            )}
            style={{
              animationFillMode: 'both',
              backfaceVisibility: 'hidden',
              willChange: splitPanelOpen ? 'transform, opacity, box-shadow' : 'auto',
              filter: splitPanelOpen ? 'brightness(1.02)' : 'brightness(1)'
            }}
          >
            {splitPanelOpen && (
              <div 
                className={cn(
                  "h-full w-full flex flex-col",
                  "transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  splitPanelOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                )}
                style={{
                  transitionDelay: splitPanelOpen ? '100ms' : '0ms'
                }}
              >
                <ClientFilesPanel
                  contact={selectedContact}
                  theme={theme}
                  showNotification={showNotification}
                  activeCallContactId={activeCallContactId}
                  callStartTime={callStartTime}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-8 border-t flex items-center justify-between px-3 text-xs shrink-0 bg-card">
        <div className="flex items-center space-x-3">
          <div className="flex items-center gap-3">
            <div className="relative inline-flex items-center justify-center px-2 py-0.5">
              <svg width="32" height="32" className="transform -rotate-90">
                <circle 
                  cx="16" 
                  cy="16" 
                  r="14" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  fill="transparent" 
                  className="text-muted-foreground/20"
                />
                <circle 
                  cx="16" 
                  cy="16" 
                  r="14" 
                  stroke="#3B82F6" 
                  strokeWidth="2" 
                  fill="transparent" 
                  strokeDasharray="87.96459430051421" 
                  strokeDashoffset={87.96459430051421 - (87.96459430051421 * progressPercentage / 100)}
                  className="transition-all duration-300 ease-in-out" 
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[9px] font-medium text-muted-foreground">{Math.round(progressPercentage)}%</span>
              </div>
            </div>

          </div>
          
          {/* Badge ADB centralisé avec toutes les informations */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant={adbConnectionState.isConnected ? 'default' : 'outline'} 
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 cursor-pointer transition-all duration-200 hover:scale-105",
                    adbConnectionState.isConnected && "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20",
                    !adbConnectionState.isConnected && adbConnectionState.error && "bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20",
                    !adbConnectionState.isConnected && !adbConnectionState.error && "bg-gray-500/10 text-gray-600 border-gray-500/20 hover:bg-gray-500/20",
                    adbConnecting && "animate-pulse",
                    activeCallContactId && "ring-2 ring-blue-500/50" // Indicateur visuel pour appel en cours
                  )}
                  onClick={async (e) => {
                    // Ctrl+Clic pour afficher les logs
                    if (e.ctrlKey || e.metaKey) {
                      setIsAdbLogsDialogOpen(true);
                      return;
                    }
                    
                    if (adbConnectionState.isConnected) {
                      await disconnectAdb();
                      showNotification('info', 'ADB déconnecté');
                    } else if (!adbConnecting) {
                      const success = await connectAdb();
                      showNotification(success ? 'success' : 'error', success ? 'ADB connecté' : 'Échec de connexion ADB');
                    }
                  }}
                >
                  {adbConnecting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : adbConnectionState.isConnected ? (
                    <Smartphone className="w-3 h-3" />
                  ) : (
                    <WifiOff className="w-3 h-3" />
                  )}
                  <span className="font-medium">
                    {adbConnecting ? 'Connexion...' : 
                     adbConnectionState.isConnected ? 
                       (activeCallContactId ? 'ADB Connecté - Appel en cours' : 'ADB Connecté') : 
                     adbConnectionState.error ? 'ADB Erreur' :
                     'ADB Hors-ligne'}
                  </span>
                  
                  {/* Informations de batterie et appel en cours */}
                  {adbConnectionState.isConnected && (
                    <div className="flex items-center gap-1 text-xs opacity-75">
                      {adbConnectionState.batteryLevel !== undefined && (
                        <span>
                          🔋 {adbConnectionState.batteryLevel}%{adbConnectionState.isCharging ? '⚡' : ''}
                        </span>
                      )}
                      {activeCallContactId && (
                        <span className="text-blue-500 font-medium animate-pulse">
                          📞
                        </span>
                      )}
                    </div>
                  )}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm">
                <div className="space-y-2">
                  <div className="font-semibold text-xs">
                    État ADB: {adbConnectionState.isConnected ? '✅ Connecté' : '❌ Déconnecté'}
                  </div>
                  
                  {adbConnectionState.device && (
                    <div className="text-xs text-muted-foreground">
                      📱 {adbConnectionState.device.name} ({adbConnectionState.device.serial})
                    </div>
                  )}
                  
                  {adbConnectionState.batteryLevel !== undefined && (
                    <div className="text-xs">
                      🔋 Batterie: {adbConnectionState.batteryLevel}% {adbConnectionState.isCharging ? '⚡ (En charge)' : '🔋 (Sur batterie)'}
                    </div>
                  )}
                  
                  {activeCallContactId && callStartTime && (
                    <div className="text-xs text-blue-500 font-medium">
                      📞 Appel en cours depuis {Math.floor((Date.now() - callStartTime.getTime()) / 60000)}min
                    </div>
                  )}
                  
                  {adbConnectionState.currentCallState && adbConnectionState.currentCallState !== 'idle' && (
                    <div className="text-xs text-blue-500">
                      📱 État appel: {adbConnectionState.currentCallState}
                    </div>
                  )}
                  
                  {adbConnectionState.error && (
                    <div className="text-xs text-red-500">
                      ⚠️ {adbConnectionState.error}
                    </div>
                  )}
                  
                  <div className="text-xs">
                    🔍 Détection auto: {adbConnectionState.autoDetectionEnabled ? '✅ Activée' : '❌ Désactivée'}
                  </div>
                  
                  {adbConnectionState.lastLog && (
                    <div className="text-xs text-muted-foreground border-t pt-1">
                      📝 {adbConnectionState.lastLog}
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground border-t pt-1">
                    💡 Clic: Connecter/Déconnecter • Ctrl+Clic: Logs complets
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center space-x-2">
          {activeCallContactId && (
            <Button onClick={() => endActiveCall()} size="sm" variant="destructive" className="text-xs py-0.5 px-1.5 h-6">
              Terminer Appel
            </Button>
          )}
        </div>
      </footer>

      {/* Dialogs */}
      {selectedContact && isEmailDialogOpen && (
        <EmailDialog
          isOpen={isEmailDialogOpen}
          onClose={() => setIsEmailDialogOpen(false)}
          contactName={`${selectedContact.prenom} ${selectedContact.nom}`}
          contactEmail={selectedContact.email}
          showNotification={showNotification}
        />
      )}
      {selectedContact && isRappelDialogOpen && (
        <RappelDialog
          isOpen={isRappelDialogOpen}
          onClose={() => setIsRappelDialogOpen(false)}
          contact={selectedContact}
          onSave={(date, time) => {
            updateContact({ id: selectedContact.id, dateRappel: date, heureRappel: time });
            showNotification('success', `Rappel défini pour ${selectedContact.prenom} le ${date} à ${time}.`);
            setIsRappelDialogOpen(false);
          }}
        />
      )}
      {selectedContact && isQualificationDialogOpen && (
        <QualificationDialog
          isOpen={isQualificationDialogOpen}
          onClose={() => setIsQualificationDialogOpen(false)}
          onSave={(comment) => {
            updateContact({ id: selectedContact.id, commentaire: comment });
            showNotification('success', `Qualification enregistrée pour ${selectedContact.prenom}.`);
            setIsQualificationDialogOpen(false);
          }}
          theme={theme}
        />
      )}
      {isFnKeysInfoOpen && (
        <GenericInfoDialog
          isOpen={isFnKeysInfoOpen}
          onClose={() => setIsFnKeysInfoOpen(false)}
          title="Raccourcis Clavier"
          content={
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Utilisez les touches F2 à F10 pour changer rapidement le statut du contact sélectionné :
              </p>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { key: 'F2', status: 'Prématuré' },
                  { key: 'F3', status: 'Mauvais num' },
                  { key: 'F4', status: 'Répondeur' },
                  { key: 'F5', status: 'À rappeler' },
                  { key: 'F6', status: 'Pas intéressé' },
                  { key: 'F7', status: 'Argumenté' },
                  { key: 'F8', status: 'DO' },
                  { key: 'F9', status: 'RO' },
                  { key: 'F10', status: 'Liste noire' }
                ].map(({ key, status }) => (
                  <div key={key} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                    <Badge variant="outline" className="font-mono text-xs">
                      {key}
                    </Badge>
                    <span className="text-sm">{status}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-xs">Entrée</Badge>
                  <span className="text-sm">Appeler le contact sélectionné</span>
                </div>
              </div>
            </div>
          }
          theme={theme}
        />
      )}
      {isSupabaseDataDialogOpen && (
        <SupabaseDataDialog
            isOpen={isSupabaseDataDialogOpen}
            onClose={() => setIsSupabaseDataDialogOpen(false)}
            onImport={handleSupabaseImport}
            theme={theme}
        />
      )}
      
      {/* Dialog des logs ADB */}
      {isAdbLogsDialogOpen && (
        <Dialog open={isAdbLogsDialogOpen} onOpenChange={setIsAdbLogsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh]" aria-describedby="adb-logs-desc">
            <DialogHeader>
              <DialogTitle>Logs ADB - Debug</DialogTitle>
            </DialogHeader>
            <div id="adb-logs-desc" className="space-y-4">
              <div className="flex items-center justify-between">
                <div></div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAdbAutoDetection(!adbConnectionState.autoDetectionEnabled)}
                  >
                    {adbConnectionState.autoDetectionEnabled ? 'Désactiver' : 'Activer'} détection auto
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      const success = await restartAdb();
                      showNotification(success ? 'success' : 'error', success ? 'Serveur ADB redémarré' : 'Erreur lors du redémarrage ADB');
                    }}
                  >
                    Redémarrer ADB
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const logs = getAdbLogs().join('\n');
                      navigator.clipboard.writeText(logs);
                      showNotification('success', 'Logs copiés dans le presse-papier');
                    }}
                  >
                    Copier logs
                  </Button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>État:</strong> {adbConnectionState.isConnected ? '✅ Connecté' : '❌ Déconnecté'}
                </div>
                <div>
                  <strong>Détection auto:</strong> {adbConnectionState.autoDetectionEnabled ? '✅ Activée' : '❌ Désactivée'}
                </div>
                {adbConnectionState.device && (
                  <>
                    <div>
                      <strong>Appareil:</strong> {adbConnectionState.device.name}
                    </div>
                    <div>
                      <strong>Série:</strong> {adbConnectionState.device.serial}
                    </div>
                  </>
                )}
                {adbConnectionState.batteryLevel && (
                  <div>
                    <strong>Batterie:</strong> {adbConnectionState.batteryLevel}% {adbConnectionState.isCharging ? '🔌' : '🔋'}
                  </div>
                )}
              </div>
              
              {adbConnectionState.error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <strong className="text-red-600">Erreur:</strong> {adbConnectionState.error}
                </div>
              )}
              
              <div className="space-y-2">
                <h3 className="font-medium">Logs en temps réel:</h3>
                <div className="bg-muted/50 rounded-lg p-3 max-h-96 overflow-y-auto hide-scrollbar font-mono text-xs">
                  {getAdbLogs().length > 0 ? (
                    getAdbLogs().map((log, index) => (
                      <div key={index} className="mb-1">
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">Aucun log disponible</div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal Cal.com */}
      <CalendarModal
        open={isCalendarModalOpen}
        onOpenChange={setIsCalendarModalOpen}
        contact={selectedContact || undefined}
        theme={theme}
        onSuccess={handleCalendarSuccess}
      />
    </div>
  );
};

export default App;