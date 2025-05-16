'use client';

import * as React from 'react';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TODO: Résoudre le problème de type/exécution avec useFormStatus
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';
import { buttonVariants } from "@/components/ui/button";
import { 
  Phone, Mail, UploadCloud, DownloadCloud, Loader2, Trash2, CalendarDays,
  BellRing, PhoneOff, Linkedin, /* Search, */ Globe,
  type LucideProps
} from 'lucide-react';
import { useEffect, useRef, type ReactNode, useState, useCallback, startTransition } from 'react';
import { toast } from 'react-toastify';
import { getCalApi } from "@calcom/embed-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { cn } from '@/lib/utils';
// import { AdbStatusBadge } from '@/components/ui/AdbStatusBadge'; // Supprimé
import type { Contact } from '@/lib/schemas/contact';
import { DateTimePicker24h } from './ui/DateTimePicker24h';

// TODO: Remplacez "votre-nom-utilisateur/votre-type-d-evenement" par votre slug d'événement Cal.com réel
// ou configurez la variable d'environnement NEXT_PUBLIC_CAL_COM_EVENT_SLUG
// const CAL_COM_EVENT_SLUG = process.env.NEXT_PUBLIC_CAL_COM_EVENT_SLUG || "votre-nom-utilisateur/votre-type-d-evenement"; // MODIFIEZ CECI
// Utilisation du calLink fourni par l'utilisateur
const CAL_COM_EVENT_SLUG = process.env.NEXT_PUBLIC_CAL_COM_EVENT_SLUG || "dimitri-morel-arcanis-conseil/audit-patrimonial";
const CAL_NAMESPACE = "audit-patrimonial"; // Réintroduction du namespace

interface RibbonProps {
  onClearAllData?: () => void;
  // isRowSelected?: boolean; // Décommenté car activeContact le remplace
  selectedContactEmail?: string | null; // Conservé car utilisé par handleEmail, bien que activeContact.email soit mieux
  // selectedContactId?: string | null; // Décommenté
  inputFileRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelectedForImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isImportPending?: boolean;
  isAutosaveSaving?: boolean;
  onRequestClearAllData: () => void;
  activeContact?: Contact | null;
  onBookingCreated?: (bookingInfo: { date: string; time: string; }) => void;
  callFormAction: (payload: FormData) => void;
  hangUpFormAction: (payload: FormData) => void;
  contactInCallId?: string | null;
  onExportClick?: () => void; // Gardé
  // onRappelClick?: () => void; // Supprimé, géré par DateTimePicker
  // onEmailClick?: () => void; // Supprimé, handleEmail est local
  onRappelDateTimeSelected: (dateTime: Date) => void;
}

export interface CustomButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

interface RibbonButtonProps {
  label: string;
  icon: React.ElementType<LucideProps>;
  onClick?: () => void;
  isSubmit?: boolean;
  variant?: CustomButtonProps['variant'];
  disabled?: boolean;
  tooltipContent?: ReactNode;
  className?: string;
  children?: ReactNode;
}

const RibbonButton = React.forwardRef<
    HTMLButtonElement, 
    RibbonButtonProps
>(({ 
    label, 
    icon: Icon, 
    onClick, 
    isSubmit,
    variant = "ghost", 
    disabled,
    tooltipContent,
    className,
    children
}, ref) => {
    const { pending: formPending } = useFormStatus();
    const actualDisabled = disabled || (isSubmit && formPending);

    const buttonContent = children ? children : (
        <div className="flex flex-col items-center justify-center h-full">
            <Icon className={cn("h-5 w-5 mb-1", actualDisabled ? "text-muted-foreground" : "")} />
            <span className={cn("text-xs", actualDisabled ? "text-muted-foreground" : "")} >{label}</span>
        </div>
    );

    const ButtonComponent = isSubmit ? 'button' : Button;

    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    {isSubmit && children ? (
                         <Button 
                            ref={ref} 
                            variant={variant} 
                            size="lg"
                            type="submit" 
                            disabled={actualDisabled}
                            className={cn("flex-1 flex-col h-auto p-2 min-w-[70px]", className)}
                        >
                            {formPending ? <Loader2 className="h-5 w-5 animate-spin" /> : children}
                        </Button>
                    ) : (
                        <ButtonComponent
                            ref={ref}
                            variant={variant}
                            size="lg"
                            onClick={onClick}
                            type={isSubmit ? "submit" : "button"}
                            disabled={actualDisabled}
                            className={cn(
                                buttonVariants({ variant, size: 'lg' }),
                                "flex-1 flex-col h-auto p-2 min-w-[70px]", 
                                className
                            )}
                        >
                             {(isSubmit && formPending) ? <Loader2 className="h-5 w-5 animate-spin" /> : buttonContent}
                        </ButtonComponent>
                    )}
                </TooltipTrigger>
                <TooltipContent>
                    <p>{tooltipContent || label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
});
RibbonButton.displayName = "RibbonButton";

const RibbonSeparator = () => (
    <div className="h-12 w-px bg-border mx-2 self-center"></div>
);

// Constante pour l'URL de l'API
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const Ribbon = React.forwardRef<HTMLDivElement, RibbonProps>((
  { 
    selectedContactEmail, // Peut être retiré si handleEmail utilise uniquement activeContact
    inputFileRef,
    handleFileSelectedForImport,
    isImportPending,
    isAutosaveSaving,
    onRequestClearAllData,
    activeContact,
    callFormAction,
    hangUpFormAction,
    contactInCallId,
    onExportClick,
    // onRappelClick, // Supprimé
    // onEmailClick, // Supprimé
    onBookingCreated,
    onRappelDateTimeSelected
  },
  ref
) => {
  const initializeCal = async () => {
    try {
      // Initialisation AVEC le namespace pour une config globale
      const cal = await getCalApi({ namespace: CAL_NAMESPACE }); 
      // Configuration de l'UI selon l'exemple utilisateur
      cal("ui", {
        theme:"dark",
        styles:{
          branding:{
            brandColor:"#000000" // Vous pouvez aussi personnaliser cette couleur si besoin
          }
        },
        hideEventTypeDetails:false,
        layout:"month_view"
      });
    } catch (error) {
      console.error("Erreur lors de l'initialisation de Cal.com API:", error);
      toast.error("Impossible d'initialiser l'API de planification Cal.com.");
    }
  };
  
  useEffect(() => {
    initializeCal();

    // Écouteur pour l'événement de réservation réussie
    const setupCalEventListeners = async () => {
      try {
        const cal = await getCalApi({ namespace: CAL_NAMESPACE });
        cal("on", {
          action: "bookingSuccessful",
          callback: (e) => {
            console.log("[Ribbon] Cal.com bookingSuccessful event:", e);
            const { data } = e.detail;
            // Les noms exacts des champs peuvent varier, il faudra peut-être inspecter 'data'
            // ou consulter la documentation de Cal.com pour les champs exacts.
            // Exemples de noms de champs potentiels :
            // data.date_time, data.eventTypeId, data.responses.email, data.uid
            // data.startTime, data.endTime, data.bookingId, data.title, data.length (duration in minutes)

            // Structure de data selon le linter:
            // { booking: unknown; eventType: unknown; date: string; duration: number | undefined; organizer: { name: string; email: string; timeZone: string; }; confirmed: boolean; }

            const bookingDateStr = data.date; // data.date est une string ISO UTC
            const bookingDuration = data.duration; // en minutes

            // Tentative d'extraction de l'ID et du titre depuis les objets 'unknown'
            let bookingIdVal: string | undefined;
            let bookingTitleVal: string | undefined;

            if (data.booking && typeof data.booking === 'object' && 'uid' in data.booking && typeof (data.booking as any).uid === 'string') {
              bookingIdVal = (data.booking as any).uid;
            } else if (data.booking && typeof data.booking === 'object' && 'id' in data.booking && (typeof (data.booking as any).id === 'string' || typeof (data.booking as any).id === 'number')) {
              bookingIdVal = String((data.booking as any).id);
            }

            if (data.eventType && typeof data.eventType === 'object' && 'title' in data.eventType && typeof (data.eventType as any).title === 'string') {
              bookingTitleVal = (data.eventType as any).title;
            }

            if (bookingDateStr && onBookingCreated) { 
              const bookingDate = new Date(bookingDateStr).toLocaleDateString(undefined, {
                year: 'numeric', month: '2-digit', day: '2-digit'
              });
              const bookingTime = new Date(bookingDateStr).toLocaleTimeString(undefined, {
                hour: '2-digit', minute: '2-digit'
              });
              
              onBookingCreated({
                date: bookingDate, 
                time: bookingTime, 
              });
              toast.success(`Rendez-vous ${bookingTitleVal ? `"${bookingTitleVal}" ` : ''}confirmé pour le ${bookingDate} à ${bookingTime}.`);
            } else {
              console.warn("[Ribbon] Données de réservation Cal.com (date) incomplètes ou callback onBookingCreated manquant:", { data, bookingDateStr });
              if (onBookingCreated) { 
                onBookingCreated({
                  date: bookingDateStr ? new Date(bookingDateStr).toLocaleDateString() : 'Date inconnue',
                  time: bookingDateStr ? new Date(bookingDateStr).toLocaleTimeString() : 'Heure inconnue',
                });
              }
            }
          },
        });
      } catch (error) {
        console.error("Erreur lors de la configuration des écouteurs d'événements Cal.com:", error);
      }
    };

    setupCalEventListeners();

    // La fonction de nettoyage n'est pas explicitement documentée pour cal("on"),
    // mais il est bon de garder à l'esprit que si une méthode cal("off") existait,
    // elle serait appelée ici. Pour l'instant, on suppose que l'API gère cela.

  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[onBookingCreated]); // Ajout de onBookingCreated aux dépendances

  const performCallAction = () => {
    if (activeContact && activeContact.phoneNumber && activeContact.id) {
      if (activeContact.id === contactInCallId) {
        toast.info("Un appel est déjà en cours pour ce contact.");
        return;
      }
      const formData = new FormData();
      formData.append('phoneNumber', activeContact.phoneNumber);
      formData.append('contactId', activeContact.id);
      startTransition(() => {
        callFormAction(formData);
      });
      // La logique pour définir l'appel en cours est maintenant dans page.tsx via le retour de callAction
    } else {
      toast.warn("Veuillez sélectionner un contact avec un numéro de téléphone pour appeler.");
    }
  };

  const performHangUpAction = () => {
    if (activeContact && activeContact.id && activeContact.id === contactInCallId) {
      const formData = new FormData();
      formData.append('contactId', activeContact.id);
      startTransition(() => {
        hangUpFormAction(formData);
      });
      // La logique pour réinitialiser l'appel en cours est dans page.tsx via le retour de hangUpCallAction
    } else {
      toast.warn("Aucun appel en cours pour ce contact ou contact non sélectionné.");
    }
  };

  const handleEmail = () => {
    if (!activeContact || !activeContact.email) {
      toast.info(activeContact ? "L'email de ce contact n'est pas renseigné." : "Veuillez sélectionner un contact pour envoyer un email.");
      return;
    }
    window.location.href = `mailto:${activeContact.email}`; // Utilise activeContact.email
  };

  const handleImportClick = () => {
    inputFileRef.current?.click();
  };
  
  const handleCalComRendezVous = async () => {
    if (!activeContact) {
        toast.info("Veuillez sélectionner un contact pour planifier un rendez-vous.");
        return;
    }

    try {
        // Récupération de l'API AVEC le namespace
        const cal = await getCalApi({ namespace: CAL_NAMESPACE }); 

        const prefillConfig: {
            name?: string;
            Prenom?: string;
            email?: string;
            smsReminderNumber?: string;
        } = {};

        if (activeContact) {
            if (activeContact.lastName) {
                prefillConfig.name = activeContact.lastName;
                if (activeContact.firstName) {
                    prefillConfig.Prenom = activeContact.firstName;
                }
            } else if (activeContact.firstName) {
                prefillConfig.name = activeContact.firstName;
            }
            
            if (activeContact.email) {
                prefillConfig.email = activeContact.email;
            }
            if (activeContact.phoneNumber) {
                prefillConfig.smsReminderNumber = activeContact.phoneNumber;
            }
        }
        
        cal("modal", {
            calLink: CAL_COM_EVENT_SLUG,
            config: prefillConfig
        });
        
    } catch (error) {
        console.error("Erreur lors de l'ouverture de Cal.com:", error);
        toast.error("Impossible d'ouvrir Cal.com.");
    }
  };
  
  const LINKEDIN_WINDOW_NAME = "linkedinSearchWindow";
  const GOOGLE_WINDOW_NAME = "googleSearchWindow";

  const handleLinkedInSearch = () => {
    if (activeContact && activeContact.firstName && activeContact.lastName) {
      const query = encodeURIComponent(`${activeContact.firstName} ${activeContact.lastName}`);
      // Ouvre dans une fenêtre nommée (réutilisée si elle existe)
      window.open(`https://www.linkedin.com/search/results/people/?keywords=${query}`, LINKEDIN_WINDOW_NAME);
    } else {
      toast.info("Veuillez sélectionner un contact avec un nom et prénom pour la recherche LinkedIn.");
    }
  };

  const handleGoogleSearch = () => {
    if (activeContact && activeContact.firstName && activeContact.lastName) {
      const query = encodeURIComponent(`${activeContact.firstName} ${activeContact.lastName}`);
      // Ouvre dans une fenêtre nommée (réutilisée si elle existe)
      window.open(`https://www.google.com/search?q=${query}`, GOOGLE_WINDOW_NAME);
    } else {
      toast.info("Veuillez sélectionner un contact avec un nom et prénom pour la recherche Google.");
    }
  };
  
  const rappelButtonContent = (
    <div className="flex flex-col items-center justify-center h-full">
      <BellRing className="h-5 w-5 mb-1" />
      <span className="text-xs">Rappel</span>
    </div>
  );

  const renderTooltip = (child: React.ReactElement, tooltipContent: string, ariaLabel: string, disabled?: boolean) => {
    let trigger = child;
    const childProps = child.props as { disabled?: boolean; [key: string]: unknown };
    const isDisabled = disabled ?? childProps?.disabled;

    if (React.isValidElement(child) && (disabled !== undefined || childProps?.disabled !== undefined)) {
        trigger = React.cloneElement(child as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>, { disabled: isDisabled });
    }

    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            {trigger}
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipContent}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div ref={ref} className="flex items-stretch gap-1 md:gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
      <input 
        type="file" 
        ref={inputFileRef as React.RefObject<HTMLInputElement>} 
        onChange={handleFileSelectedForImport}
        className="hidden"
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
      />

      {/* Groupe 1: Appeler, Raccrocher */}
      <div className="flex items-center gap-1 p-1 border border-muted rounded-md shadow-sm">
        <RibbonButton 
          label="Appeler"
          icon={Phone} 
          onClick={() => {
            if (activeContact && activeContact.id) {
              const formData = new FormData();
              formData.append('contactId', activeContact.id);
              startTransition(() => {
                callFormAction(formData);
              });
            }
          }} 
          disabled={!activeContact || (!!contactInCallId && contactInCallId === activeContact?.id) || isImportPending}
          tooltipContent="Appeler le contact sélectionné"
        />
        <RibbonButton 
          label="Raccrocher"
          icon={PhoneOff} 
          onClick={() => {
            if (activeContact && activeContact.id && contactInCallId === activeContact.id) {
              const formData = new FormData();
              formData.append('contactId', activeContact.id);
              startTransition(() => {
                hangUpFormAction(formData);
              });
            }
          }} 
          disabled={!activeContact || !contactInCallId || contactInCallId !== activeContact?.id || isImportPending}
          tooltipContent="Raccrocher l'appel en cours"
        />
      </div>

      <RibbonSeparator />

      {/* Groupe 2: Email, Rappel, Rendez-vous */}
      <div className="flex items-center gap-1 p-1 border border-muted rounded-md shadow-sm">
        <RibbonButton 
          label="Email" 
          icon={Mail} 
          onClick={handleEmail}
          disabled={!activeContact || !activeContact.email || isImportPending}
          tooltipContent="Envoyer un email au contact sélectionné"
        />
        
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DateTimePicker24h
                onDateTimeSelected={onRappelDateTimeSelected}
                initialDateTime={activeContact?.dateRappel && activeContact?.heureRappel 
                  ? new Date(`${activeContact.dateRappel}T${activeContact.heureRappel}`) 
                  : null
                }
              >
                <Button
                  variant="ghost"
                  className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), "flex-1 flex-col h-auto p-2 min-w-[70px] data-[state=open]:bg-accent data-[state=open]:text-accent-foreground")}
                  disabled={!activeContact || isImportPending}
                  type="button"
                  aria-label="Rappel"
                >
                  {rappelButtonContent}
                </Button>
              </DateTimePicker24h>
            </TooltipTrigger>
            <TooltipContent>
              <p>Planifier un rappel pour le contact sélectionné</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <RibbonButton
          label="Rendez-vous"
          icon={CalendarDays}
          onClick={handleCalComRendezVous}
          disabled={!activeContact}
          tooltipContent="Prendre un rendez-vous (Cal.com)"
        />
      </div>
      
      <RibbonSeparator />

      {/* Groupe 3: LinkedIn, Google - Ajout de l'encadrement */}
      <div className="flex items-center gap-1 p-1 border border-muted rounded-md shadow-sm">
        <RibbonButton
          label="LinkedIn"
          icon={Linkedin}
          onClick={handleLinkedInSearch}
          disabled={!activeContact || !activeContact.firstName || !activeContact.lastName}
          tooltipContent="Rechercher le contact sur LinkedIn"
        />
        <RibbonButton
          label="Google"
          icon={Globe}
          onClick={handleGoogleSearch}
          disabled={!activeContact || !activeContact.firstName || !activeContact.lastName}
          tooltipContent="Rechercher le contact sur Google"
        />
      </div>

      <RibbonSeparator />
      
      {/* Groupe 4: Importer, Exporter, Tout Effacer */}
      <div className="flex items-center gap-1 p-1 border border-muted rounded-md shadow-sm">
        <RibbonButton 
          label="Importer"
          icon={UploadCloud} 
          onClick={handleImportClick} 
          disabled={isImportPending || isAutosaveSaving}
          tooltipContent={isImportPending ? "Importation en cours..." : (isAutosaveSaving ? "Sauvegarde auto en cours..." : "Importer des contacts (fichier CSV/Excel)")}
        />
        <RibbonButton 
          label="Exporter"
          icon={DownloadCloud} 
          onClick={onExportClick}
          disabled={isImportPending || isAutosaveSaving}
          tooltipContent="Exporter les contacts actuels"
        />
        <RibbonButton 
          label="Tout effacer"
          icon={Trash2} 
          onClick={onRequestClearAllData} 
          variant="destructive"
          disabled={isImportPending || isAutosaveSaving}
          tooltipContent="Effacer tous les contacts (demande une confirmation)"
        />
      </div>
    </div>
  );
});
Ribbon.displayName = "Ribbon";

export default Ribbon; 