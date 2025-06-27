import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize, Settings, ChevronDown, User, Smartphone, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Theme } from '../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserProfileDialog } from './UserProfileDialog';
import { useCustomAuth } from '../lib/auth-client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface CustomMenuBarProps {
  theme: Theme;
  activeTab?: 'dimicall' | 'dimitable';
  onTabChange?: (tab: 'dimicall' | 'dimitable') => void;
  showDimiTable?: boolean;
  onSettingsClick?: () => void;
  userName?: string;
  userStatus?: 'online' | 'offline' | 'away';
  adbConnectionState?: any;
  adbConnecting?: boolean;
  activeCallContactId?: string | null;
  onAdbClick?: (e: React.MouseEvent) => void;
}

export const CustomMenuBar: React.FC<CustomMenuBarProps> = ({ 
  theme, 
  activeTab = 'dimicall',
  onTabChange,
  showDimiTable = true,
  onSettingsClick,
  userName = "Dimitri Morel",
  userStatus = 'online',
  adbConnectionState,
  adbConnecting = false,
  activeCallContactId,
  onAdbClick
}) => {
  const auth = useCustomAuth();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

  useEffect(() => {
    // Vérifier si nous sommes dans Electron
    const checkElectron = async () => {
      if (typeof window !== 'undefined' && window.electronAPI) {
        setIsElectron(true);
        const maxState = await window.electronAPI.isMaximized();
        setIsMaximized(maxState);
      }
    };
    
    checkElectron();

    // Écouter les événements de redimensionnement pour mettre à jour l'état maximisé
    const handleResize = async () => {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const maxState = await window.electronAPI.isMaximized();
        setIsMaximized(maxState);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleMinimize = async () => {
    if (window.electronAPI) {
      await window.electronAPI.minimizeApp();
    }
  };

  const handleMaximize = async () => {
    if (window.electronAPI) {
      await window.electronAPI.maximizeApp();
      const maxState = await window.electronAPI.isMaximized();
      setIsMaximized(maxState);
    }
  };

  const handleClose = async () => {
    if (window.electronAPI) {
      await window.electronAPI.closeApp();
    }
  };

  const handleTabClick = (tab: 'dimicall' | 'dimitable') => {
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Si ce n'est pas Electron, ne pas afficher la barre de titre
  if (!isElectron) {
    return null;
  }

  // Utiliser les mêmes couleurs que l'application
  const menuBarBg = theme === Theme.Dark 
    ? 'bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]' 
    : 'bg-[hsl(var(--background))] border-b border-[hsl(var(--border))]';
  
  const textColor = theme === Theme.Dark 
    ? 'text-[hsl(var(--foreground))]' 
    : 'text-[hsl(var(--foreground))]';

  const buttonHoverBg = theme === Theme.Dark 
    ? 'hover:bg-[hsl(var(--muted))]' 
    : 'hover:bg-[hsl(var(--muted))]';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const getCurrentTabLabel = () => {
    switch (activeTab) {
      case 'dimicall': return 'DimiCall';
      case 'dimitable': return 'DimiTable';
      default: return 'DimiCall';
    }
  };

  // Fonction pour générer une image de profil optimisée (SVG inline léger)
  const generateProfileImage = (name: string) => {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const colors = [
      '#3B82F6', '#8B5CF6', '#EF4444', '#10B981', '#F59E0B', 
      '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
    ];
    const colorIndex = name.length % colors.length;
    const bgColor = colors[colorIndex];
    
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="10" fill="${bgColor}"/>
        <text x="10" y="14" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="8" font-weight="600">
          ${initials}
        </text>
      </svg>
    `)}`;
  };

  return (
    <div 
      className={cn(
        "fixed top-0 left-0 right-0 z-10 flex items-center h-8 select-none pointer-events-none",
        menuBarBg
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Logo et dropdown de navigation */}
      <div 
        className="flex items-center h-full pointer-events-auto"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Dropdown DimiCRM */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center px-3 py-1 gap-1 hover:bg-[hsl(var(--muted))] rounded-sm transition-colors focus:outline-none">
              <span className={cn("text-sm font-semibold", textColor)}>DimiCRM</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[120px]">
            <DropdownMenuItem 
              onClick={() => handleTabClick('dimicall')}
              className={cn(
                "cursor-pointer",
                activeTab === 'dimicall' && "bg-[hsl(var(--accent))]"
              )}
            >
              DimiCall
              {activeTab === 'dimicall' && (
                <div className="ml-auto w-2 h-2 bg-[hsl(var(--primary))] rounded-full" />
              )}
            </DropdownMenuItem>
            {showDimiTable && (
              <DropdownMenuItem 
                onClick={() => handleTabClick('dimitable')}
                className={cn(
                  "cursor-pointer",
                  activeTab === 'dimitable' && "bg-[hsl(var(--accent))]"
                )}
              >
                DimiTable
                {activeTab === 'dimitable' && (
                  <div className="ml-auto w-2 h-2 bg-[hsl(var(--primary))] rounded-full" />
                )}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>


      </div>

      {/* Espace flexible pour permettre le drag */}
      <div className="flex-1" />

      {/* Badge ADB et Badge utilisateur */}
      <div 
        className="flex items-center gap-2 pointer-events-auto mr-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Badge ADB compact */}
        {adbConnectionState && onAdbClick && (
          <Badge 
            variant={adbConnectionState.isConnected ? 'default' : 'outline'} 
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 cursor-pointer transition-all duration-200 hover:scale-105 text-xs h-6",
              adbConnectionState.isConnected && "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20",
              !adbConnectionState.isConnected && adbConnectionState.error && "bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20",
              !adbConnectionState.isConnected && !adbConnectionState.error && "bg-gray-500/10 text-gray-600 border-gray-500/20 hover:bg-gray-500/20",
              adbConnecting && "animate-pulse",
              activeCallContactId && "ring-1 ring-blue-500/50"
            )}
            onClick={onAdbClick}
            title={`ADB ${adbConnectionState.isConnected ? 'Connecté' : 'Déconnecté'} - Clic pour ${adbConnectionState.isConnected ? 'déconnecter' : 'connecter'}`}
          >
            {adbConnecting ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : adbConnectionState.isConnected ? (
              <Smartphone className="w-2.5 h-2.5" />
            ) : (
              <WifiOff className="w-2.5 h-2.5" />
            )}
            <span className="font-medium">
              {adbConnecting ? 'ADB...' : 
               adbConnectionState.isConnected ? 'ADB' : 
               adbConnectionState.error ? 'Err' : 'Off'}
            </span>
          </Badge>
        )}

        {/* Badge utilisateur */}
        <button 
          onClick={() => setIsProfileDialogOpen(true)}
          className="flex items-center gap-2 px-2 py-1 bg-[hsl(var(--muted))] rounded-md hover:bg-[hsl(var(--muted))]/80 transition-colors focus:outline-none"
        >
          <div className="relative">
            <Avatar className="w-5 h-5">
              <AvatarImage 
                src={generateProfileImage(auth.user?.firstName || userName)} 
                alt={auth.user?.firstName || userName}
                className="object-cover"
              />
              <AvatarFallback className="text-xs bg-[hsl(var(--muted-foreground))] text-[hsl(var(--background))]">
                {(auth.user?.firstName || userName).slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[hsl(var(--background))]",
              getStatusColor(userStatus)
            )} />
          </div>
          <span className="text-xs font-medium text-[hsl(var(--foreground))] max-w-[80px] truncate">
            {auth.user?.firstName || userName.split(' ')[0]}
          </span>
        </button>
      </div>

      {/* Bouton Settings */}
      {onSettingsClick && (
        <div 
          className="flex items-center pointer-events-auto mr-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={onSettingsClick}
            className={cn(
              "p-2 rounded transition-all duration-200 focus:outline-none",
              buttonHoverBg,
              textColor
            )}
            title="Réglages"
          >
            <Settings size={14} />
          </button>
        </div>
      )}

      {/* Contrôles de fenêtre */}
      <div 
        className="flex h-full pointer-events-auto"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Bouton Minimiser */}
        <button
          onClick={handleMinimize}
          className={cn(
            "w-12 h-full flex items-center justify-center transition-all duration-200 focus:outline-none",
            "rounded-none",
            buttonHoverBg,
            textColor
          )}
          title="Minimiser"
        >
          <Minus size={12} strokeWidth={2} />
        </button>

        {/* Bouton Maximiser/Restaurer */}
        <button
          onClick={handleMaximize}
          className={cn(
            "w-12 h-full flex items-center justify-center transition-all duration-200 focus:outline-none",
            "rounded-none",
            buttonHoverBg,
            textColor
          )}
          title={isMaximized ? "Restaurer" : "Maximiser"}
        >
          {isMaximized ? (
            <Square size={10} strokeWidth={2} />
          ) : (
            <Maximize size={10} strokeWidth={2} />
          )}
        </button>

        {/* Bouton Fermer */}
        <button
          onClick={handleClose}
          className={cn(
            "w-12 h-full flex items-center justify-center transition-all duration-200 focus:outline-none",
            "rounded-none hover:bg-red-500 hover:text-white",
            textColor
          )}
          title="Fermer"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>

      {/* Dialog de profil utilisateur */}
      <UserProfileDialog
        isOpen={isProfileDialogOpen}
        onClose={() => setIsProfileDialogOpen(false)}
        userName={auth.user?.firstName || userName}
        userStatus={userStatus}
      />
    </div>
  );
};

// Composant de compatibilité pour maintenir l'ancien nom
export const TitleBar = CustomMenuBar; 