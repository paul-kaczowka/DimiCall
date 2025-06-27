import React from 'react';
import { motion } from 'framer-motion';
import { User, Shield, LogOut, Crown } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { useCustomAuth } from '../lib/auth-client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface UserProfileCardProps {
  className?: string;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({ className = '' }) => {
  const auth = useCustomAuth();
  
  if (!auth.isAuthenticated || !auth.user) {
    return null;
  }

  const hasSpecialAccess = auth.checkSpecialAccess();

  const handleSignOut = async () => {
    const result = await auth.signOut();
    if (result.success) {
      window.location.reload(); // Recharger la page après déconnexion
    }
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'Jamais';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${className}`}
      >
        <Card className="border-0 shadow-lg bg-gradient-to-br from-white/90 to-gray-50/90 dark:from-gray-800/90 dark:to-gray-900/90 backdrop-blur-md">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              {/* Informations utilisateur */}
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  {hasSpecialAccess && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center"
                    >
                      <Crown className="w-2.5 h-2.5 text-white" />
                    </motion.div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {auth.user.firstName} {auth.user.lastName}
                    </h3>
                    {hasSpecialAccess && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="secondary" className="text-xs bg-gradient-to-r from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700">
                            <Shield className="w-3 h-3 mr-1" />
                            VIP
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Accès privilégié à DimiTable</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Dernière connexion : {formatDate(auth.user.lastLogin)}
                  </p>
                </div>
              </div>

              {/* Bouton de déconnexion */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSignOut}
                    className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Se déconnecter</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Indicateur de statut */}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-gray-600 dark:text-gray-400">Connecté</span>
              </div>
              
              {hasSpecialAccess && (
                <div className="flex items-center space-x-1 text-xs text-yellow-600 dark:text-yellow-400">
                  <Shield className="w-3 h-3" />
                  <span>DimiTable débloqué</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </TooltipProvider>
  );
}; 