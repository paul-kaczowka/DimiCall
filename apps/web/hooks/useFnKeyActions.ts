'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { callAction, hangUpCallAction, updateContactAction } from '@/app/actions';
import { StatusMapping } from '@/components/ui/FunctionKeyStatusMappingGuide';
import type { Contact } from '@/lib/schemas/contact';
import { ActionState } from '@/lib/actions-utils';

// Type pour le contexte d'actions des touches Fn
type FnKeyContext = {
  contactId: string;
  contactName: string;
  newStatus: string;
  phoneNumber?: string | null;
  nextContactId?: string;
  nextContactName?: string;
  nextContactPhone?: string | null;
};

export function useFnKeyActions(
  fnKeyMappings: StatusMapping[],
  activeContact: Contact | null,
  contactInCallId: string | null,
  filteredContacts: Contact[],
  setActiveContact: (contact: Contact | null) => void,
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>
) {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  // Création d'un état initial typé pour les actions
  const typedInitialState: ActionState<Contact | null> = {
    success: false,
    message: '',
    data: null
  };

  // Mutation pour raccrocher un appel
  const hangUpMutation = useMutation({
    mutationFn: async (contactId: string) => {
      console.log(`[FnKeyActions] Raccrochage de l'appel pour le contact ${contactId}`);
      const formData = new FormData();
      formData.append('contactId', contactId);
      return hangUpCallAction(typedInitialState, formData);
    },
    onSuccess: () => {
      console.log(`[FnKeyActions] Raccrochage réussi`);
      toast.info("Appel raccroché avec succès");
    },
    onError: (error) => {
      console.error(`[FnKeyActions] Erreur lors du raccrochage:`, error);
      toast.error('Erreur lors du raccrochage');
    }
  });

  // Mutation pour mettre à jour le statut d'un contact
  const updateStatusMutation = useMutation({
    mutationFn: async ({ contactId, status }: { contactId: string; status: string }) => {
      console.log(`[FnKeyActions] Mise à jour du statut à "${status}" pour le contact ${contactId}`);
      const formData = new FormData();
      formData.append('contactId', contactId);
      formData.append('status', status);
      return updateContactAction(typedInitialState, formData);
    },
    onSuccess: (data, variables) => {
      const { contactId, status } = variables;
      console.log(`[FnKeyActions] Mise à jour du statut réussie`);
      
      // Mettre à jour localement pour une meilleure UX
      setContacts((prevContacts) => 
        prevContacts.map((contact) => 
          contact.id === contactId ? { ...contact, status } : contact
        )
      );
      
      // Mettre à jour le contact actif si c'est celui modifié
      if (activeContact && activeContact.id === contactId) {
        setActiveContact({ ...activeContact, status });
      }
      
      toast.success(`Statut "${status}" appliqué avec succès`);
      
      // Invalider le cache pour actualiser les données
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (error) => {
      console.error(`[FnKeyActions] Erreur lors de la mise à jour du statut:`, error);
      toast.error('Erreur lors de la mise à jour du statut');
    }
  });

  // Mutation pour appeler un contact
  const callContactMutation = useMutation({
    mutationFn: async ({ contactId, phoneNumber }: { contactId: string; phoneNumber?: string | null }) => {
      console.log(`[FnKeyActions] Appel du contact ${contactId}${phoneNumber ? ` au numéro ${phoneNumber}` : ''}`);
      const formData = new FormData();
      formData.append('contactId', contactId);
      if (phoneNumber) {
        formData.append('phoneNumber', phoneNumber);
      }
      return callAction(typedInitialState, formData);
    },
    onSuccess: () => {
      console.log(`[FnKeyActions] Appel lancé avec succès`);
      toast.info("Appel en cours...");
    },
    onError: (error) => {
      console.error(`[FnKeyActions] Erreur lors de l'appel:`, error);
      toast.error("Erreur lors de l'appel");
    }
  });

  // Fonction principale pour gérer les touches Fn
  const handleFnKey = async (key: string) => {
    if (isProcessing) {
      console.log(`[FnKeyActions] Une action est déjà en cours, ignorée la touche ${key}`);
      toast.warn('Une action est déjà en cours, veuillez patienter...');
      return;
    }

    const mapping = fnKeyMappings.find((m) => m.keyName === key);
    if (!mapping) {
      console.warn(`[FnKeyActions] Pas de mapping pour la touche ${key}`);
      return;
    }

    if (!activeContact || !activeContact.id) {
      toast.info('Veuillez d\'abord sélectionner un contact valide');
      return;
    }

    try {
      setIsProcessing(true);
      console.log(`[FnKeyActions] Début du traitement de la touche ${key}`);

      const context: FnKeyContext = {
        contactId: activeContact.id,
        contactName: activeContact.firstName || 'Contact',
        newStatus: mapping.statusName,
        phoneNumber: activeContact.phoneNumber
      };

      // Étape 1: Raccrocher l'appel en cours si nécessaire
      if (contactInCallId) {
        await hangUpMutation.mutateAsync(contactInCallId);
        // Attendre un court instant pour s'assurer que l'appel est bien raccroché
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      // Étape 2: Appliquer le nouveau statut au contact actuel
      await updateStatusMutation.mutateAsync({
        contactId: context.contactId,
        status: context.newStatus
      });
      
      // Attendre un court instant pour la mise à jour visuelle
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Étape 3: Trouver et sélectionner le contact suivant
      const currentIndex = filteredContacts.findIndex((c) => c.id === context.contactId);
      if (currentIndex !== -1 && currentIndex < filteredContacts.length - 1) {
        const nextContact = filteredContacts[currentIndex + 1];
        
        // Mettre à jour le contact actif
        setActiveContact(nextContact);
        toast.success(`Passage au contact: ${nextContact.firstName || 'Contact'}`);
        
        // Mise à jour du contexte avec les informations du prochain contact
        context.nextContactId = nextContact.id;
        context.nextContactName = nextContact.firstName || 'Contact';
        context.nextContactPhone = nextContact.phoneNumber;
        
        // Attendre un court instant pour la mise à jour de l'interface
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        // Étape 4: Appeler le prochain contact
        if (context.nextContactId) {
          await callContactMutation.mutateAsync({
            contactId: context.nextContactId,
            phoneNumber: context.nextContactPhone
          });
        }
      } else {
        const reason = currentIndex === -1 
          ? 'Contact non trouvé dans la liste filtrée.' 
          : 'C\'était le dernier contact de la liste.';
          
        console.log(`[FnKeyActions] Pas de contact suivant: ${reason}`);
        toast.info(reason);
      }
      
      console.log(`[FnKeyActions] Traitement de la touche ${key} terminé avec succès`);
    } catch (error) {
      console.error(`[FnKeyActions] Erreur lors du traitement de la touche ${key}:`, error);
      toast.error('Une erreur est survenue lors du traitement');
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    handleFnKey,
    isProcessing,
    hangUpMutation,
    updateStatusMutation,
    callContactMutation
  };
} 