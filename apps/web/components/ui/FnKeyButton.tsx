'use client';

import React, { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { StatusMapping, FunctionKeyStatusMappingGuide } from '@/components/ui/FunctionKeyStatusMappingGuide';

interface FnKeyButtonProps {
  mappings: StatusMapping[];
  onToggleFnMode?: () => void;
  className?: string;
}

export function FnKeyButton({ 
  mappings,
  onToggleFnMode,
  className
}: FnKeyButtonProps) {
  const [isActive, setIsActive] = useState(false);
  
  const handleClick = () => {
    setIsActive(!isActive);
    onToggleFnMode?.();
  };
  
  return (
    <div className="flex items-center">
      <div className="h-12 w-px bg-border mx-2 self-center"></div>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={handleClick}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'lg' }),
                "flex-1 sm:flex-initial flex-col h-auto p-2 min-w-[70px]",
                isActive ? "bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 text-white hover:text-white hover:from-blue-600 hover:via-purple-600 hover:to-indigo-600" : "",
                className
              )}
              aria-label="Mode touches fonctions"
            >
              <div className="flex flex-col items-center justify-center h-full">
                <Keyboard className="h-5 w-5 mb-1" />
                <span className="text-xs">Touches Fn</span>
              </div>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" className="max-w-md p-0">
            {isActive ? (
              <div className="p-2">
                <h3 className="text-xs font-medium pb-1">Mode touches Fn activé</h3>
                <p className="text-xs">Utilisez les touches F2-F10 pour changer rapidement le statut d&apos;un contact.</p>
                <FunctionKeyStatusMappingGuide mappings={mappings} className="mt-2" />
              </div>
            ) : (
              <p className="p-2 text-xs">Activer le mode touches fonction</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

FnKeyButton.displayName = 'FnKeyButton'; 