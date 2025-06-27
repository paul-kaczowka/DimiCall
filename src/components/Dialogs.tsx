import React, { useState, useEffect } from 'react';
import { Contact, Theme, EmailType, Civility, QualificationStatutMarital, QualificationSituationPro } from '../types';
import { Button, Input, Select, Modal } from './Common';
import { generateGmailComposeUrl } from '../services/dataService';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from './ui/dialog';
import { Button as ShadcnButton } from './ui/button';
import { Input as ShadcnInput } from './ui/input';

interface EmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  showNotification: (type: 'success' | 'error' | 'info', message: string, duration?: number) => void;
}

const EmailDialog: React.FC<EmailDialogProps> = ({ isOpen, onClose, contact, showNotification }) => {
  const [emailType, setEmailType] = useState<EmailType>(EmailType.PremierContact);
  const [civility, setCivility] = useState<Civility>(Civility.Monsieur);

  if (!contact) return null;

  const handleGenerateEmail = () => {
    if (!contact.email || !contact.email.includes('@')) {
      showNotification('error', 'Adresse email invalide ou manquante');
      return;
    }

    const emailUrl = generateGmailComposeUrl(contact, emailType, civility);
    
    try {
      window.open(emailUrl, '_blank');
      showNotification('success', 'Email Gmail ouvert dans un nouvel onglet');
      onClose();
    } catch (error) {
      console.error('Erreur lors de l\'ouverture de Gmail:', error);
      showNotification('error', 'Impossible d\'ouvrir Gmail. Vérifiez que votre navigateur autorise les pop-ups.');
    }
  };

  const emailTypeOptions = [
    { value: EmailType.PremierContact, label: 'Premier Contact' },
    { value: EmailType.D0Visio, label: 'D0 Visio' },
    { value: EmailType.R0Interne, label: 'R0 Interne' },
    { value: EmailType.R0Externe, label: 'R0 Externe' }
  ];

  const civilityOptions = [
    { value: Civility.Monsieur, label: 'Monsieur' },
    { value: Civility.Madame, label: 'Madame' }
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Générer un Email" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-foreground">Contact</label>
            <div className="p-2 bg-muted text-muted-foreground rounded border text-sm">
              <div><strong>Nom:</strong> {contact.prenom} {contact.nom}</div>
              <div><strong>Email:</strong> {contact.email}</div>
            </div>
          </div>
          <div className="space-y-3">
            <Select
              value={civility}
              onChange={(value) => setCivility(value as Civility)}
              options={civilityOptions}
              placeholder="Civilité"
              className="w-full"
            />
            <Select
              value={emailType}
              onChange={(value) => setEmailType(value as EmailType)}
              options={emailTypeOptions}
              placeholder="Type d'email"
              className="w-full"
            />
          </div>
        </div>
        
        <div className="bg-muted text-muted-foreground p-3 rounded text-sm">
          <strong>Aperçu:</strong> Email {emailTypeOptions.find(opt => opt.value === emailType)?.label} 
          pour {civilityOptions.find(opt => opt.value === civility)?.label} {contact.prenom} {contact.nom}
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={handleGenerateEmail}>
            Générer Email Gmail
          </Button>
        </div>
      </div>
    </Modal>
  );
};

interface RappelDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
  onSave: (date: string, time: string) => void;
}

const RappelDialog: React.FC<RappelDialogProps> = ({ isOpen, onClose, contact, onSave }) => {
  const [date, setDate] = useState(contact?.dateRappel || '');
  const [time, setTime] = useState(contact?.heureRappel || '');

  const handleSave = () => {
    onSave(date, time);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Programmer un Rappel" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Contact: <strong>{contact?.prenom} {contact?.nom}</strong>
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" type="date" />
          <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="HH:mm" type="time" />
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={handleSave}>Sauvegarder</Button>
        </div>
      </div>
    </Modal>
  );
};

interface RendezVousDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
  onSave: (date: string, time: string) => void;
}

const RendezVousDialog: React.FC<RendezVousDialogProps> = ({ isOpen, onClose, contact, onSave }) => {
  const [date, setDate] = useState(contact?.dateRDV || '');
  const [time, setTime] = useState(contact?.heureRDV || '');

  const handleSave = () => {
    onSave(date, time);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Programmer un Rendez-vous" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Contact: <strong>{contact?.prenom} {contact?.nom}</strong>
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" type="date" />
          <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="HH:mm" type="time" />
        </div>
        <div className="flex justify-end space-x-3 pt-4">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={handleSave}>Sauvegarder</Button>
        </div>
      </div>
    </Modal>
  );
};

interface QualificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (comment: string) => void;
  theme: Theme;
}

const QualificationDialog: React.FC<QualificationDialogProps> = ({ isOpen, onClose, onSave, theme }) => {
  const [statutMarital, setStatutMarital] = useState<string>('');
  const [situationPro, setSituationPro] = useState<string>('');
  const [revenus, setRevenus] = useState('');
  const [charges, setCharges] = useState('');
  const [resultat, setResultat] = useState('');
  const [commentaire, setCommentaire] = useState('');

  const statutMaritalOptions = [
    { value: '', label: 'Sélectionner...' },
    { value: 'reset', label: '❌ Réinitialiser' },
    ...Object.values(QualificationStatutMarital).map(s => ({value: s, label: s}))
  ];
  const situationProOptions = [
    { value: '', label: 'Sélectionner...' },
    { value: 'reset', label: '❌ Réinitialiser' },
    ...Object.values(QualificationSituationPro).map(s => ({value: s, label: s}))
  ];

  useEffect(() => {
    const rev = parseFloat(revenus) || 0;
    const chg = parseFloat(charges) || 0;
    let calculatedResult = 0;
    if (rev > 0) {
      calculatedResult = situationPro === QualificationSituationPro.ChefEntreprise ? chg / rev : chg / (rev * 0.77);
      setResultat(calculatedResult.toFixed(2));
    } else {
      setResultat('N/A');
    }
    
    // Générer le commentaire en excluant les valeurs non définies
    const commentParts: string[] = ['Qualification:'];
    
    if (statutMarital && statutMarital !== 'reset') {
      commentParts.push(`Statut marital: ${statutMarital}`);
    }
    
    if (situationPro && situationPro !== 'reset') {
      commentParts.push(`Situation pro.: ${situationPro}`);
    }
    
    if (rev > 0) {
      commentParts.push(`Revenus foyer: ${rev}€`);
    }
    
    if (chg > 0) {
      commentParts.push(`Charges foyer: ${chg}€`);
    }
    
    if (rev > 0 && chg > 0) {
      commentParts.push(`Résultat calculé: ${calculatedResult.toFixed(2)}`);
    }
    
    // Si aucune information n'a été saisie, afficher un message par défaut
    if (commentParts.length === 1) {
      setCommentaire('Qualification: Aucune information saisie.');
    } else {
      setCommentaire(commentParts.join(', ') + '.');
    }
  }, [revenus, charges, situationPro, statutMarital]);
  
  const handleSave = () => {
    onSave(commentaire);
    onClose();
  };

  const handleSelectChange = (field: 'statutMarital' | 'situationPro', value: string) => {
    if (value === 'reset') {
      if (field === 'statutMarital') {
        setStatutMarital('');
      } else {
        setSituationPro('');
      }
    } else {
      if (field === 'statutMarital') {
        setStatutMarital(value);
      } else {
        setSituationPro(value);
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Qualification du Contact</DialogTitle>
          <DialogDescription>
            Saisissez les informations pour qualifier le contact et générer un commentaire automatique.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Statut marital</Label>
              <Select
                options={statutMaritalOptions}
                value={statutMarital}
                onChange={(value) => handleSelectChange('statutMarital', value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Situation professionnelle</Label>
              <Select
                options={situationProOptions}
                value={situationPro}
                onChange={(value) => handleSelectChange('situationPro', value)}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Revenus du foyer (€)</Label>
              <ShadcnInput
                type="number"
                value={revenus}
                onChange={(e) => setRevenus(e.target.value)}
                placeholder="Ex: 5000"
                className="bg-input text-foreground border-slate-300 dark:border-slate-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Charges du foyer (€)</Label>
              <ShadcnInput
                type="number"
                value={charges}
                onChange={(e) => setCharges(e.target.value)}
                placeholder="Ex: 2000"
                className="bg-input text-foreground border-slate-300 dark:border-slate-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Résultat calculé</Label>
              <ShadcnInput
                value={resultat}
                readOnly
                className="bg-muted text-muted-foreground"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="commentaire" className="text-sm font-medium">
              Commentaire de qualification
            </Label>
            <Textarea
              id="commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={4}
              className="w-full resize-none bg-input text-foreground border-slate-300 dark:border-slate-600"
              placeholder="Commentaire automatique basé sur les informations saisies..."
            />
          </div>
        </div>
        
        <DialogFooter className="gap-2">
          <ShadcnButton variant="outline" onClick={onClose}>
            Annuler
          </ShadcnButton>
          <ShadcnButton onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Enregistrer Qualification
          </ShadcnButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface GenericInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: React.ReactNode;
  theme: Theme;
}

const GenericInfoDialogComponent: React.FC<GenericInfoDialogProps> = ({ isOpen, onClose, title, content, theme }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="space-y-4">
        {content}
        <div className="flex justify-end pt-4">
          <Button variant="primary" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </Modal>
  );
};

export { EmailDialog, RappelDialog, RendezVousDialog, QualificationDialog, GenericInfoDialogComponent as GenericInfoDialog };
