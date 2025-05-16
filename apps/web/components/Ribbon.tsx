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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { format, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

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

// Type pour les états du toggle
type AutoSearchMode = 'disabled' | 'linkedin' | 'google';

// Composant TriStateToggle pour la recherche automatique
interface TriStateToggleProps {
  value: AutoSearchMode;
  onChange: (value: AutoSearchMode) => void;
  disabled?: boolean;
}

const TriStateToggle: React.FC<TriStateToggleProps> = ({ value, onChange, disabled = false }) => {
  const handleClick = () => {
    if (disabled) return;
    
    // Cycle entre les états: disabled -> linkedin -> google -> disabled
    const nextValue = 
      value === 'disabled' ? 'linkedin' : 
      value === 'linkedin' ? 'google' : 
      'disabled';
    
    onChange(nextValue);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            onClick={handleClick}
            className={cn(
              "relative h-7 w-16 rounded-full transition-colors duration-300 cursor-pointer overflow-hidden",
              disabled ? "opacity-50 cursor-not-allowed" : "",
              "border border-input",
              value === 'disabled' ? "bg-muted" : 
              value === 'linkedin' ? "bg-[#0077B5]/20" : 
              "bg-blue-500/20",
              // Ajout d'un effet de hover
              !disabled && "hover:border-primary/50"
            )}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
          >
            {/* Fond avec dégradé subtil */}
            <div className="absolute inset-0 w-full h-full opacity-10 bg-gradient-to-r from-[#0077B5]/40 via-transparent to-blue-500/40"></div>
            
            {/* Icônes miniatures à l'intérieur du toggle */}
            <div className="absolute top-1/2 left-2 transform -translate-y-1/2 text-[#0077B5] opacity-70">
              <Linkedin className="h-3 w-3" />
            </div>
            
            <div className="absolute top-1/2 right-2 transform -translate-y-1/2 text-blue-600 opacity-70">
              <Globe className="h-3 w-3" />
            </div>
            
            {/* Indicateur mobile avec animation plus élaborée */}
            <div 
              className={cn(
                "absolute top-1 h-5 w-5 rounded-full transform transition-all duration-300",
                // Animation plus fluide avec cubic-bezier
                "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                value === 'disabled' ? "left-[calc(50%-10px)] bg-gray-400" :
                value === 'linkedin' ? "left-2 bg-[#0077B5]" : 
                "left-[calc(100%-26px)] bg-blue-500",
                "shadow-md flex items-center justify-center"
              )}
            >
              {/* Effet de lueur intérieure */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-transparent opacity-80"></div>
              
              {/* Cercle central uniquement visible en position centrale (désactivé) */}
              {value === 'disabled' && (
                <div className="w-2 h-2 bg-gray-200 rounded-full shadow-inner"></div>
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p>
            {value === 'disabled' 
              ? "Recherche auto désactivée" 
              : value === 'linkedin' 
                ? "Recherche LinkedIn automatique à l'appel" 
                : "Recherche Google automatique à l'appel"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Type pour les rendez-vous
type MeetingType = 'D0' | 'R0-int' | 'R0-ext';
type GenderType = 'Monsieur' | 'Madame';

// Templates d'emails
const EMAIL_TEMPLATES = {
  'D0': (lastName: string, dateTime: string, gender: GenderType) => 
    `Bonjour ${gender} ${lastName}, merci pour votre temps lors de notre échange téléphonique. 
 
Suite à notre appel, je vous confirme notre entretien du ${dateTime} en visio.

Pour rappel, notre entretien durera une trentaine de minutes. Le but est de vous présenter plus en détail Arcanis Conseil, d'effectuer ensemble l'état des lieux de votre situation patrimoniale (revenus, patrimoine immobilier, épargne constituée etc.), puis de vous donner un diagnostic de votre situation. Notre métier est de vous apporter un conseil pertinent et personnalisé sur l'optimisation de votre patrimoine.

Vous pouvez également visiter notre site internet pour de plus amples renseignements : www.arcanis-conseil.fr
 
N'hésitez pas à revenir vers moi en cas de question ou d'un besoin supplémentaire d'information.

Bien cordialement,`,

  'R0-int': (lastName: string, dateTime: string, gender: GenderType) => 
    `Bonjour ${gender} ${lastName}, merci pour votre temps lors de notre échange téléphonique. 
 
Suite à notre appel, je vous confirme notre entretien du ${dateTime} dans nos locaux au 22 rue la boétie.

Pour rappel, notre entretien durera une trentaine de minutes. Le but est de vous présenter plus en détail Arcanis Conseil, d'effectuer ensemble l'état des lieux de votre situation patrimoniale (revenus, patrimoine immobilier, épargne constituée etc.), puis de vous donner un diagnostic de votre situation. Notre métier est de vous apporter un conseil pertinent et personnalisé sur l'optimisation de votre patrimoine.

Vous pouvez également visiter notre site internet pour de plus amples renseignements : www.arcanis-conseil.fr
 
N'hésitez pas à revenir vers moi en cas de question ou d'un besoin supplémentaire d'information.

Bien cordialement,`,

  'R0-ext': (lastName: string, dateTime: string, gender: GenderType) => 
    `Bonjour ${gender} ${lastName}, merci pour votre temps lors de notre échange téléphonique. 
 
Suite à notre appel, je vous confirme notre entretien du ${dateTime} à (adresse du client)

Pour rappel, notre entretien durera une trentaine de minutes. Le but est de vous présenter plus en détail Arcanis Conseil, d'effectuer ensemble l'état des lieux de votre situation patrimoniale (revenus, patrimoine immobilier, épargne constituée etc.), puis de vous donner un diagnostic de votre situation. Notre métier est de vous apporter un conseil pertinent et personnalisé sur l'optimisation de votre patrimoine.

Vous pouvez également visiter notre site internet pour de plus amples renseignements : www.arcanis-conseil.fr
 
N'hésitez pas à revenir vers moi en cas de question ou d'un besoin supplémentaire d'information.

Bien cordialement,`
};

// Composant sélecteur de date et heure personnalisé
const SimpleDateTimePicker = ({ 
  date, 
  setDate
}: { 
  date: Date | undefined, 
  setDate: (date: Date | undefined) => void 
}) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate && isValid(selectedDate)) {
      const newDateToSet = date ? new Date(date) : new Date();
      newDateToSet.setFullYear(selectedDate.getFullYear());
      newDateToSet.setMonth(selectedDate.getMonth());
      newDateToSet.setDate(selectedDate.getDate());
      if (!date) { 
        newDateToSet.setHours(14, 0, 0, 0); // Heure par défaut: 14h
      }
      setDate(newDateToSet);
    }
  };

  const handleTimeChange = (
    type: "hour" | "minute",
    value: string
  ) => {
    const newDateToSet = date ? new Date(date) : new Date(); 
    if (type === "hour") {
      newDateToSet.setHours(parseInt(value));
    } else if (type === "minute") {
      newDateToSet.setMinutes(parseInt(value));
    }
    if (isValid(newDateToSet)) {
      setDate(newDateToSet);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col space-y-2">
        <h3 className="font-medium text-sm">Date et heure du rendez-vous</h3>
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleDateSelect}
          className="border rounded-md"
          locale={fr}
          captionLayout="dropdown"
          fromYear={new Date().getFullYear() - 1}
          toYear={new Date().getFullYear() + 2}
        />
      </div>
      
      <div className="flex items-center space-x-4">
        <div className="flex flex-col space-y-1 flex-1">
          <Label htmlFor="hour">Heure</Label>
          <select
            id="hour"
            className="h-10 border border-input bg-background rounded-md px-3"
            onChange={(e) => handleTimeChange("hour", e.target.value)}
            value={date?.getHours() ?? 14}
          >
            {hours.map((hour) => (
              <option key={hour} value={hour}>
                {hour.toString().padStart(2, '0')}h
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col space-y-1 flex-1">
          <Label htmlFor="minute">Minute</Label>
          <select
            id="minute"
            className="h-10 border border-input bg-background rounded-md px-3"
            onChange={(e) => handleTimeChange("minute", e.target.value)}
            value={date?.getMinutes() ?? 0}
          >
            {[0, 15, 30, 45].map((minute) => (
              <option key={minute} value={minute}>
                {minute.toString().padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export const Ribbon = React.forwardRef<HTMLDivElement, RibbonProps>((
  { 
    selectedContactEmail,
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
    onBookingCreated,
    onRappelDateTimeSelected
  },
  ref
) => {
  // État pour suivre le mode de recherche automatique
  const [autoSearchMode, setAutoSearchMode] = useState<AutoSearchMode>('disabled');
  
  // États pour le modal d'email
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedMeetingType, setSelectedMeetingType] = useState<MeetingType>('D0');
  const [selectedGender, setSelectedGender] = useState<GenderType>('Monsieur');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    () => {
      const date = new Date();
      date.setHours(14, 0, 0, 0); // Par défaut à 14h
      return date;
    }
  );

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
    console.log('[Ribbon] performCallAction: autoSearchMode =', autoSearchMode);
    console.log('[Ribbon] performCallAction: activeContact =', activeContact);

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
        
        console.log('[Ribbon] performCallAction: Dans startTransition, autoSearchMode =', autoSearchMode);
        // Si le mode de recherche automatique est activé, déclencher la recherche appropriée
        if (autoSearchMode === 'linkedin') {
          console.log('[Ribbon] performCallAction: Appel de handleLinkedInSearch...');
          handleLinkedInSearch();
        } else if (autoSearchMode === 'google') {
          console.log('[Ribbon] performCallAction: Appel de handleGoogleSearch...');
          handleGoogleSearch();
        }
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

  // Fonction pour formater la date et l'heure en français
  const formatDateTimeForEmail = (date: Date | undefined) => {
    if (!date || !isValid(date)) return "date et heure à déterminer";
    
    // Obtenir le jour de la semaine en français
    const weekday = date.toLocaleDateString('fr-FR', { weekday: 'long' });
    
    // Formater le jour, mois, année
    const day = date.getDate();
    const month = date.toLocaleDateString('fr-FR', { month: 'long' });
    const year = date.getFullYear();
    
    // Formater l'heure
    const hour = date.getHours();
    const minute = date.getMinutes();
    const formattedTime = `${hour}h${minute > 0 ? minute.toString().padStart(2, '0') : ''}`;
    
    return `${weekday} ${day} ${month} ${year} à ${formattedTime}`;
  };

  // Fonction pour générer et ouvrir l'email
  const generateAndOpenEmail = () => {
    if (!activeContact || !activeContact.email || !activeContact.lastName) {
      toast.error("Les informations du contact sont incomplètes.");
      return;
    }

    const formattedDateTime = formatDateTimeForEmail(selectedDate);
    const emailSubject = `Confirmation rendez-vous ${selectedMeetingType === 'D0' ? 'visio' : 'présentiel'} - Arcanis Conseil`;
    const emailBody = EMAIL_TEMPLATES[selectedMeetingType](
      activeContact.lastName, 
      formattedDateTime, 
      selectedGender
    );
    
    // Encoder le sujet et le corps pour l'URL Gmail
    const encodedSubject = encodeURIComponent(emailSubject);
    const encodedBody = encodeURIComponent(emailBody);
    const encodedTo = encodeURIComponent(activeContact.email);
    
    // Créer l'URL Gmail pour la composition d'un nouveau message
    const gmailUrl = `https://mail.google.com/mail/u/0/?to=${encodedTo}&su=${encodedSubject}&body=${encodedBody}&tf=cm`;
    
    // Ouvrir dans un nouvel onglet
    window.open(gmailUrl, '_blank');
    
    // Fermer le modal
    setEmailModalOpen(false);
    
    toast.success("Email préparé avec succès dans Gmail !");
  };

  // Remplacer la fonction handleEmail existante
  const handleEmail = () => {
    if (!activeContact || !activeContact.email) {
      toast.info(activeContact ? "L'email de ce contact n'est pas renseigné." : "Veuillez sélectionner un contact pour envoyer un email.");
      return;
    }
    
    // Ouvrir le modal au lieu d'ouvrir directement l'email
    setEmailModalOpen(true);
    
    // Définir le genre par défaut en fonction du prénom (si disponible)
    if (activeContact.firstName) {
      // Logique simple: si le prénom se termine par 'a', 'e', ou certaines autres lettres, considérer comme féminin
      // Cette logique est simpliste et ne fonctionne pas pour tous les prénoms
      const lastChar = activeContact.firstName.toLowerCase().slice(-1);
      if (['a', 'e', 'é', 'è', 'ê', 'i', 'y'].includes(lastChar)) {
        setSelectedGender('Madame');
      } else {
        setSelectedGender('Monsieur');
      }
    }
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
    console.log('[Ribbon] handleLinkedInSearch: autoSearchMode =', autoSearchMode);
    console.log('[Ribbon] handleLinkedInSearch: activeContact =', activeContact);
    if (activeContact && activeContact.firstName && activeContact.lastName) {
      const query = encodeURIComponent(`${activeContact.firstName} ${activeContact.lastName}`);
      console.log('[Ribbon] handleLinkedInSearch: Ouverture LinkedIn avec query =', query);
      window.open(`https://www.linkedin.com/search/results/people/?keywords=${query}`, LINKEDIN_WINDOW_NAME);
    } else {
      console.warn('[Ribbon] handleLinkedInSearch: Conditions non remplies (contact, nom, prénom).');
      toast.info("Veuillez sélectionner un contact avec un nom et prénom pour la recherche LinkedIn.");
    }
  };

  const handleGoogleSearch = () => {
    console.log('[Ribbon] handleGoogleSearch: autoSearchMode =', autoSearchMode);
    console.log('[Ribbon] handleGoogleSearch: activeContact =', activeContact);
    if (activeContact && activeContact.firstName && activeContact.lastName) {
      const query = encodeURIComponent(`${activeContact.firstName} ${activeContact.lastName}`);
      console.log('[Ribbon] handleGoogleSearch: Ouverture Google avec query =', query);
      window.open(`https://www.google.com/search?q=${query}`, GOOGLE_WINDOW_NAME);
    } else {
      console.warn('[Ribbon] handleGoogleSearch: Conditions non remplies (contact, nom, prénom).');
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
    <div ref={ref} className="flex flex-wrap sm:flex-nowrap items-stretch gap-1 md:gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        <input 
          type="file" 
        ref={inputFileRef as React.RefObject<HTMLInputElement>} 
          onChange={handleFileSelectedForImport}
          className="hidden" 
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
      />

      {/* Groupe 1: Appeler, Raccrocher */}
      <div className="flex items-center gap-1 p-1 border border-muted rounded-md shadow-sm mb-1 sm:mb-0 w-full sm:w-auto">
        <RibbonButton 
          label="Appeler"
          icon={Phone} 
          onClick={performCallAction}
          disabled={!activeContact || (!!contactInCallId && contactInCallId === activeContact?.id) || isImportPending}
          tooltipContent="Appeler le contact sélectionné"
          className="flex-1 sm:flex-initial"
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
          className="flex-1 sm:flex-initial"
        />
      </div>

        <RibbonSeparator />

      {/* Groupe 2: Email, Rappel, Rendez-vous */}
      <div className="flex items-center gap-1 p-1 border border-muted rounded-md shadow-sm mb-1 sm:mb-0 w-full sm:w-auto">
        <RibbonButton 
          label="Email" 
          icon={Mail} 
          onClick={handleEmail}
          disabled={!activeContact || !activeContact.email || isImportPending}
          tooltipContent="Envoyer un email au contact sélectionné"
          className="flex-1 sm:flex-initial"
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
                  className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), "flex-1 sm:flex-initial flex-col h-auto p-2 min-w-[70px] data-[state=open]:bg-accent data-[state=open]:text-accent-foreground")}
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
          className="flex-1 sm:flex-initial"
        />
      </div>
        
        <RibbonSeparator />

      {/* Groupe 3: LinkedIn, Google - Ajout de l'encadrement */}
      <div className="flex items-center gap-1 p-1 border border-muted rounded-md shadow-sm mb-1 sm:mb-0 w-full sm:w-auto">
        <RibbonButton 
          label="LinkedIn"
          icon={Linkedin}
          onClick={handleLinkedInSearch}
          disabled={!activeContact || !activeContact.firstName || !activeContact.lastName}
          tooltipContent="Rechercher le contact sur LinkedIn"
          className="flex-1 sm:flex-initial"
        />
        
        {/* Ajout du toggle de recherche automatique entre les deux boutons */}
        <div className="flex flex-col items-center justify-center mx-1 min-w-[60px]">
          <TriStateToggle 
            value={autoSearchMode} 
            onChange={setAutoSearchMode}
            disabled={!activeContact || !activeContact.firstName || !activeContact.lastName}
          />
          <span className="text-xs mt-1 text-muted-foreground">Recherche auto</span>
        </div>
        
        <RibbonButton
          label="Google"
          icon={Globe}
          onClick={handleGoogleSearch}
          disabled={!activeContact || !activeContact.firstName || !activeContact.lastName}
          tooltipContent="Rechercher le contact sur Google"
          className="flex-1 sm:flex-initial"
        />
        </div>

        <RibbonSeparator />

      {/* Groupe 4: Importer, Exporter, Tout Effacer */}
      <div className="flex items-center gap-1 p-1 border border-muted rounded-md shadow-sm w-full sm:w-auto">
        <RibbonButton 
          label="Importer"
          icon={UploadCloud} 
          onClick={handleImportClick} 
          disabled={isImportPending || isAutosaveSaving}
          tooltipContent={isImportPending ? "Importation en cours..." : (isAutosaveSaving ? "Sauvegarde auto en cours..." : "Importer des contacts (fichier CSV/Excel)")}
          className="flex-1 sm:flex-initial"
        />
        <RibbonButton 
          label="Exporter"
          icon={DownloadCloud} 
          onClick={onExportClick}
          disabled={isImportPending || isAutosaveSaving}
          tooltipContent="Exporter les contacts actuels"
          className="flex-1 sm:flex-initial"
        />
        <RibbonButton 
          label="Tout effacer"
          icon={Trash2} 
          onClick={onRequestClearAllData} 
          variant="destructive"
          disabled={isImportPending || isAutosaveSaving}
          tooltipContent="Effacer tous les contacts (demande une confirmation)"
          className="flex-1 sm:flex-initial"
        />
      </div>

      {/* Modal pour la création d'email */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Création d'email</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-5 py-4">
            {/* Sélecteur de type de rendez-vous */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Type de rendez-vous</h3>
              <div className="flex gap-4 flex-wrap">
                <Button
                  variant={selectedMeetingType === 'D0' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSelectedMeetingType('D0')}
                >
                  D0 (Visio)
                </Button>
                <Button
                  variant={selectedMeetingType === 'R0-int' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSelectedMeetingType('R0-int')}
                >
                  R0 (Interne)
                </Button>
                <Button
                  variant={selectedMeetingType === 'R0-ext' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setSelectedMeetingType('R0-ext')}
                >
                  R0 (Externe)
                </Button>
              </div>
            </div>
            
            {/* Sélecteur de civilité */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm">Civilité</h3>
              <RadioGroup 
                value={selectedGender} 
                onValueChange={(value: string) => setSelectedGender(value as GenderType)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Monsieur" id="monsieur" />
                  <Label htmlFor="monsieur">Monsieur</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Madame" id="madame" />
                  <Label htmlFor="madame">Madame</Label>
                </div>
              </RadioGroup>
            </div>
            
            {/* Sélecteur de date et heure */}
            <SimpleDateTimePicker date={selectedDate} setDate={setSelectedDate} />
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailModalOpen(false)}>
              Annuler
            </Button>
            <Button onClick={generateAndOpenEmail}>
              Générer l'email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
Ribbon.displayName = "Ribbon"; 

export default Ribbon; 