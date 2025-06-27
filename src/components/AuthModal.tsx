import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Lock, Eye, EyeOff, LogIn, Sparkles, Shield } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { useCustomAuth } from '../lib/auth-client';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (hasSpecialAccess: boolean) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthenticated }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [enablePasswordMode, setEnablePasswordMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const auth = useCustomAuth();

  // Réinitialiser les champs seulement lors de l'ouverture du modal
  const [hasBeenReset, setHasBeenReset] = useState(false);
  
  useEffect(() => {
    if (isOpen && !hasBeenReset) {
      setFirstName('');
      setLastName('');
      setPassword('');
      setError('');
      setShowSuccess(false);
      setEnablePasswordMode(false);
      setHasBeenReset(true);
    } else if (!isOpen) {
      setHasBeenReset(false);
    }
  }, [isOpen, hasBeenReset]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim()) {
      setError('Veuillez saisir votre nom et prénom');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Authentification avec nom/prénom
      const result = await auth.signIn(firstName.trim(), lastName.trim());
      
             if (result.success) {
         let hasSpecialAccess = false;
         
         // Vérifier le mot de passe spécial si activé
         if (enablePasswordMode && password) {
           hasSpecialAccess = auth.grantSpecialAccess(password);
           if (!hasSpecialAccess) {
             setError('Mot de passe incorrect pour l\'accès privilégié');
             setIsLoading(false);
             return;
           }
         }

         // Animation de succès
         setShowSuccess(true);
         
         setTimeout(() => {
           onAuthenticated(hasSpecialAccess);
           onClose();
         }, 1500);
       } else {
         setError('error' in result ? result.error : 'Erreur lors de l\'authentification');
       }
    } catch (error) {
      console.error('Erreur d\'authentification:', error);
      setError('Une erreur inattendue s\'est produite');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="w-full max-w-md mx-4"
        >
          <Card className="border-0 shadow-2xl bg-gradient-to-br from-white/95 to-gray-50/95 dark:from-gray-900/95 dark:to-gray-800/95 backdrop-blur-xl">
            <CardHeader className="text-center pb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4"
              >
                <User className="w-8 h-8 text-white" />
              </motion.div>
              
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                Bienvenue sur DimiCall
              </CardTitle>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Authentifiez-vous pour accéder à l'application
              </p>
            </CardHeader>

            <CardContent className="space-y-6">
              {showSuccess && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center justify-center py-8"
                >
                  <div className="text-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-2"
                    >
                      <Sparkles className="w-6 h-6 text-white" />
                    </motion.div>
                    <p className="text-green-600 dark:text-green-400 font-medium">
                      Authentification réussie !
                    </p>
                  </div>
                </motion.div>
              )}

              {!showSuccess && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Champs nom et prénom */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-sm font-medium">
                        Prénom
                      </Label>
                      <div className="relative">
                                              <Input
                        id="firstName"
                        type="text"
                        placeholder="Votre prénom"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="pr-10 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                        disabled={isLoading}
                      />
                        <User className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-sm font-medium">
                        Nom
                      </Label>
                      <div className="relative">
                                              <Input
                        id="lastName"
                        type="text"
                        placeholder="Votre nom"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="pr-10 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400 transition-colors"
                        disabled={isLoading}
                      />
                        <User className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </div>

                  {/* Toggle pour activer le mode mot de passe */}
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-700"
                  >
                    <div className="flex items-center space-x-3">
                      <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      <div>
                        <Label htmlFor="passwordToggle" className="text-sm font-medium">
                          Accès privilégié
                        </Label>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Débloquer l'accès à DimiTable
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="passwordToggle"
                      checked={enablePasswordMode}
                      onCheckedChange={setEnablePasswordMode}
                      disabled={isLoading}
                    />
                  </motion.div>

                  {/* Champ mot de passe (conditionnel) */}
                  <AnimatePresence>
                    {enablePasswordMode && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-2"
                      >
                        <Label htmlFor="password" className="text-sm font-medium">
                          Mot de passe privilégié
                        </Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Saisissez le mot de passe"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pr-20 border-purple-200 dark:border-purple-700 focus:border-purple-500 dark:focus:border-purple-400 transition-colors"
                            disabled={isLoading}
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="p-0 h-auto w-auto"
                              onClick={() => setShowPassword(!showPassword)}
                              disabled={isLoading}
                            >
                              {showPassword ? (
                                <EyeOff className="w-4 h-4 text-gray-400" />
                              ) : (
                                <Eye className="w-4 h-4 text-gray-400" />
                              )}
                            </Button>
                            <Lock className="w-4 h-4 text-purple-400" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Message d'erreur */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                    >
                      <p className="text-sm text-red-600 dark:text-red-400 text-center">
                        {error}
                      </p>
                    </motion.div>
                  )}

                  {/* Bouton de connexion */}
                  <Button
                    type="submit"
                    disabled={isLoading || !firstName.trim() || !lastName.trim()}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    {isLoading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                      />
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 mr-2" />
                        Se connecter
                      </>
                    )}
                  </Button>
                </form>
              )}

              {/* Information sur l'accès privilégié */}
              {!showSuccess && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                    L'accès privilégié débloque des fonctionnalités avancées.<br />
                    Vos données sont stockées localement de façon sécurisée.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}; 