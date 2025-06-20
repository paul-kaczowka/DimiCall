import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Theme } from '../types';

interface TitleBarProps {
  theme: Theme;
  title?: string;
}

export const TitleBar: React.FC<TitleBarProps> = ({ theme, title = "DimiCall" }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

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

  // Si ce n'est pas Electron, ne pas afficher la barre de titre
  if (!isElectron) {
    return null;
  }

  const titleBarBg = theme === Theme.Dark 
    ? 'bg-gray-900 border-gray-700' 
    : 'bg-gray-50 border-gray-200';
  
  const textColor = theme === Theme.Dark 
    ? 'text-gray-400' 
    : 'text-gray-500';

  const buttonHoverBg = theme === Theme.Dark 
    ? 'hover:bg-white/10' 
    : 'hover:bg-black/10';

  return (
    <div 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-8 select-none"
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Logo et titre de l'application */}
      <div className="flex items-center space-x-2 px-3">
        <div className="w-4 h-4 bg-blue-500 rounded-sm flex-shrink-0"></div>
        <span className={cn("text-sm font-medium truncate", textColor)}>
          {title}
        </span>
      </div>

      {/* Contrôles de fenêtre */}
      <div 
        className="flex h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Bouton Minimiser */}
        <button
          onClick={handleMinimize}
          className={cn(
            "w-12 h-full flex items-center justify-center transition-colors",
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
            "w-12 h-full flex items-center justify-center transition-colors",
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
            "w-12 h-full flex items-center justify-center transition-colors hover:bg-red-500 hover:text-white",
            textColor
          )}
          title="Fermer"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}; 