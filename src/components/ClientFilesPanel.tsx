import React, { useState, useRef, useEffect } from 'react';
import { Contact, ClientFile, Theme } from '../types';
import { IconFolder, IconDocument, IconFilePdf, IconFileDoc, IconFileXls, IconFileImg, IconFileOther, IconArrowDownTray, IconTrash, IconUpload } from '../constants';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { User, Phone, Mail, FileText, MessageCircle, Calendar, Clock, Timer, MapPin, Building2, Zap } from 'lucide-react';

interface ContactInfoCardProps {
  contact: Contact | null;
  theme: Theme;
  activeCallContactId: string | null;
  callStartTime: Date | null;
}

const ContactInfoCard: React.FC<ContactInfoCardProps> = ({ contact, theme, activeCallContactId, callStartTime }) => {
  const [currentCallDuration, setCurrentCallDuration] = useState('00:00');
  
  // 🔄 Timer pour l'appel en cours
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (contact && activeCallContactId === contact.id && callStartTime) {
      interval = setInterval(() => {
        const now = new Date();
        const durationMs = now.getTime() - callStartTime.getTime();
        const seconds = Math.floor((durationMs / 1000) % 60);
        const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
        const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        setCurrentCallDuration(durationStr);
      }, 1000);
    } else {
      setCurrentCallDuration('00:00');
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [contact, activeCallContactId, callStartTime]);
  
  if (!contact) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-slate-400" />
          </div>
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur opacity-50"></div>
        </div>
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">
          Aucun contact sélectionné
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[200px]">
          Sélectionnez un contact dans la table pour afficher ses informations et gérer ses fichiers
        </p>
      </div>
    );
  }

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { color: string; icon: React.ComponentType<any> }> = {
      'DO': { color: 'bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800', icon: Zap },
      'RO': { color: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-800', icon: Building2 },
      'À rappeler': { color: 'bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-800', icon: Clock },
      'Pas intéressé': { color: 'bg-red-500/10 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-800', icon: FileText },
      'Argumenté': { color: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-800', icon: MessageCircle },
      'Mauvais num': { color: 'bg-slate-500/10 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-800', icon: Phone },
      'Non défini': { color: 'bg-orange-500/10 text-orange-700 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-800', icon: FileText },
    };
    return configs[status] || configs['Non défini'];
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  const isRecentCall = (dateStr: string) => {
    if (!dateStr) return false;
    const callDate = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - callDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 7;
  };

  const statusConfig = getStatusConfig(contact.statut);
  const StatusIcon = statusConfig.icon;

  // Helper function pour afficher les valeurs avec fallback
  const displayValue = (value: string | null | undefined, fallback: string = 'N/A') => {
    return value && value.trim() !== '' ? value : fallback;
  };

  return (
    <div className="h-full">
      <ScrollArea className="h-full">
        <div className="p-4 bg-transparent dark:bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg">
          
          {/* Header compact avec avatar et nom */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold shadow-lg shadow-blue-500/25">
                {contact.prenom.charAt(0)}{contact.nom.charAt(0)}
              </div>
              <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 opacity-20 blur"></div>
            </div>
            
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                {contact.prenom} {contact.nom}
                {displayValue(contact.source) !== 'N/A' && (
                  <span className="text-slate-500 dark:text-slate-400 font-normal"> • {contact.source}</span>
                )}
              </h2>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {displayValue(contact.email)} | {displayValue(contact.telephone)}
              </div>
              {isRecentCall(contact.dateAppel) && (
                <div className="flex items-center gap-1 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-green-600 dark:text-green-400 font-medium text-xs">Récent</span>
                </div>
              )}
            </div>

            {/* Actions rapides */}
            <div className="flex gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                      <Phone className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Appeler</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                      <Mail className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Email</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Statut principal */}
          <div className="mb-4">
            <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium ${statusConfig.color}`}>
              <StatusIcon className="h-3 w-3" />
              {contact.statut}
            </div>
          </div>

          {/* Indicateur d'appel en cours */}
          {contact && activeCallContactId === contact.id && callStartTime && (
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium bg-green-500/10 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-800 animate-pulse">
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                  <Phone className="h-3 w-3" />
                </div>
                <span>Appel en cours</span>
                <div className="flex items-center gap-1 bg-green-100 dark:bg-green-900/50 px-1.5 py-0.5 rounded text-xs font-mono">
                  <Timer className="h-2.5 w-2.5" />
                  <span>{currentCallDuration}</span>
                </div>
              </div>
            </div>
          )}

          {/* Informations compactes en grille */}
          <div className="space-y-3">
            
            {/* Informations personnelles groupées */}
            <div className="bg-transparent dark:bg-transparent rounded-lg p-3 border">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Informations personnelles
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400 mb-1">Sexe</div>
                  <div className="font-medium">{displayValue(contact.sexe)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 mb-1">Qualité</div>
                  <div className="font-medium">{displayValue(contact.qualite)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 mb-1">Type</div>
                  <div className="font-medium">{displayValue(contact.type)}</div>
                </div>
              </div>
            </div>

            {/* Statuts groupés */}
            <div className="bg-transparent dark:bg-transparent rounded-lg p-3 border">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Statuts spécialisés
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400 mb-1">Statut appel</div>
                  <div className="font-medium">{displayValue(contact.statutAppel)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 mb-1">Statut RDV</div>
                  <div className="font-medium">{displayValue(contact.statutRDV)}</div>
                </div>
              </div>
            </div>

            {/* Commentaires groupés */}
            <div className="bg-transparent dark:bg-transparent rounded-lg p-3 border">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                Commentaires
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400 mb-1">Commentaire</div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {contact.commentaire && contact.commentaire.trim() !== '' ? contact.commentaire : 'N/A'}
                  </p>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400 mb-1">Commentaire RDV</div>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {displayValue(contact.commentaireRDV)}
                  </p>
                </div>
              </div>
            </div>

            {/* Dates et planification groupées */}
            <div className="bg-transparent dark:bg-transparent rounded-lg p-3 border">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Dates et planification
              </div>
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 mb-1">Date générale</div>
                    <div className="font-medium">
                      {contact.date && contact.date !== 'N/A' ? formatDate(contact.date) : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 mb-1">Ligne</div>
                    <div className="font-medium">#{contact.numeroLigne}</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 mb-1">Rappel</div>
                    <div className="font-medium">
                      {contact.dateRappel && contact.dateRappel !== 'N/A' ? formatDate(contact.dateRappel) : 'N/A'}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {displayValue(contact.heureRappel)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 mb-1">RDV</div>
                    <div className="font-medium">
                      {contact.dateRDV && contact.dateRDV !== 'N/A' ? formatDate(contact.dateRDV) : 'N/A'}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {displayValue(contact.heureRDV)}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 dark:text-slate-400 mb-1">Dernier appel</div>
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {contact.dateAppel && contact.dateAppel !== 'N/A' ? formatDate(contact.dateAppel) : 'N/A'}
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <span>{displayValue(contact.heureAppel)}</span>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Timer className="h-2.5 w-2.5" />
                        <span>{displayValue(contact.dureeAppel)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>


          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

interface ClientFileDropZoneProps {
  onFileDrop: (file: File) => void;
  theme: Theme;
  disabled?: boolean;
}

const ClientFileDropZone: React.FC<ClientFileDropZoneProps> = ({ onFileDrop, theme, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFileDrop(files[0]);
    }
  };

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileDrop(files[0]);
    }
  };

  return (
    <Card className={`transition-all duration-200 ${isDragOver ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-dashed'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/10'}`}>
      <CardContent 
        className="py-6"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.zip,.rar"
          disabled={disabled}
        />
        <div className="flex flex-col items-center text-center space-y-2">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center ${isDragOver ? 'bg-blue-100 dark:bg-blue-900' : 'bg-muted'} transition-colors`}>
            <IconUpload className={`h-6 w-6 ${isDragOver ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <p className="text-sm font-medium">
              {disabled ? 'Sélectionnez un contact pour ajouter des fichiers' : 'Glissez un fichier ici ou cliquez pour sélectionner'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, DOC, XLS, Images, Archives (max 10MB)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface FileListWidgetProps {
  files: ClientFile[];
  onDeleteFile: (fileId: string) => void;
  onDownloadFile: (fileId: string) => void;
  theme: Theme;
}

const FileListWidget: React.FC<FileListWidgetProps> = ({ files, onDeleteFile, onDownloadFile, theme }) => {
  const getFileIcon = (type: ClientFile['type']) => {
    switch (type) {
      case 'pdf': return <IconFilePdf className="h-4 w-4" />;
      case 'doc': return <IconFileDoc className="h-4 w-4" />;
      case 'xls': return <IconFileXls className="h-4 w-4" />;
      case 'img': return <IconFileImg className="h-4 w-4" />;
      default: return <IconFileOther className="h-4 w-4" />;
    }
  };

  const getFileTypeColor = (type: ClientFile['type']) => {
    switch (type) {
      case 'pdf': return 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
      case 'doc': return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
      case 'xls': return 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300';
      case 'img': return 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-950 dark:text-gray-300';
    }
  };

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <IconFolder className="h-8 w-8 text-muted-foreground opacity-50" />
        </div>
        <p className="text-sm text-muted-foreground mb-2">Aucun fichier associé</p>
        <p className="text-xs text-muted-foreground">Les fichiers ajoutés apparaîtront ici</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <Card key={file.id} className="transition-all duration-200 hover:shadow-md">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-md flex items-center justify-center ${getFileTypeColor(file.type)}`}>
                {getFileIcon(file.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{file.size}</span>
                  <span>•</span>
                  <span>{file.date}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => onDownloadFile(file.id)}
                      >
                        <IconArrowDownTray className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Télécharger</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => onDeleteFile(file.id)}
                      >
                        <IconTrash className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Supprimer</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

interface ClientFilesPanelProps {
  contact: Contact | null;
  theme: Theme;
  showNotification: (type: 'success' | 'error' | 'info', message: string, duration?: number) => void;
  activeCallContactId: string | null;
  callStartTime: Date | null;
}

export const ClientFilesPanel: React.FC<ClientFilesPanelProps> = ({ contact, theme, showNotification, activeCallContactId, callStartTime }) => {
  const [files, setFiles] = useState<ClientFile[]>([]);
  
  // 🔄 Effet pour détecter les changements du contact en temps réel
  useEffect(() => {
    if (contact) {
      console.log('📱 Contact mis à jour dans le panneau latéral:', {
        id: contact.id,
        nom: contact.nom,
        prenom: contact.prenom,
        commentaire: contact.commentaire,
        statut: contact.statut
      });
    }
  }, [contact]);

  const handleFileDrop = (file: File) => {
    if (!contact) {
      showNotification('error', 'Veuillez sélectionner un contact avant d\'ajouter des fichiers.');
      return;
    }

    const newFile: ClientFile = {
      id: Date.now().toString(),
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      date: new Date().toLocaleDateString('fr-FR'),
      type: getFileType(file.name),
    };

    setFiles(prev => [...prev, newFile]);
    showNotification('success', `Fichier "${file.name}" ajouté avec succès!`);
  };

  const getFileType = (fileName: string): ClientFile['type'] => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf': return 'pdf';
      case 'doc':
      case 'docx': return 'doc';
      case 'xls':
      case 'xlsx': return 'xls';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif': return 'img';
      default: return 'other';
    }
  };

  const handleDeleteFile = (fileId: string) => {
    setFiles(prev => prev.filter(file => file.id !== fileId));
    showNotification('info', 'Fichier supprimé.');
  };

  const handleDownloadFile = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (file) {
      showNotification('info', `Téléchargement de "${file.name}" démarré.`);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Section informations contact */}
      <div className="shrink-0 p-4 border-b">
        <ContactInfoCard contact={contact} theme={theme} activeCallContactId={activeCallContactId} callStartTime={callStartTime} />
      </div>

      {/* Zone de drop */}
      <div className="shrink-0 p-4 border-b">
        <ClientFileDropZone 
          onFileDrop={handleFileDrop} 
          theme={theme} 
          disabled={!contact}
        />
      </div>

      {/* Section fichiers */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Fichiers du contact</h3>
          <Badge variant="secondary" className="text-xs">
            {files.length} fichier{files.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <ScrollArea className="flex-1 p-4">
          <FileListWidget 
            files={files} 
            onDeleteFile={handleDeleteFile} 
            onDownloadFile={handleDownloadFile} 
            theme={theme} 
          />
        </ScrollArea>
      </div>

      {/* Note */}
      <div className="shrink-0 p-3 border-t bg-muted/30">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <span className="text-yellow-500">💡</span>
          <div>
            <span className="font-medium">Note:</span> Cette fonctionnalité est en mode démo. 
            Pour une utilisation en production, une intégration avec un service de stockage est nécessaire.
          </div>
        </div>
      </div>
    </div>
  );
};
