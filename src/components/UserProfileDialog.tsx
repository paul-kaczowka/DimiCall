import React, { useState, useRef } from 'react';
import { User, LogOut, Camera, Key, Save, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { useCustomAuth } from '../lib/auth-client';

interface UserProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  userStatus?: 'online' | 'offline' | 'away';
}

export const UserProfileDialog: React.FC<UserProfileDialogProps> = ({
  isOpen,
  onClose,
  userName = "Dimitri",
  userStatus = 'online'
}) => {
  const auth = useCustomAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [firstName, setFirstName] = useState(auth.user?.firstName || '');
  const [lastName, setLastName] = useState(auth.user?.lastName || '');
  const [password, setPassword] = useState('');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const hasSpecialAccess = auth.checkSpecialAccess();

  React.useEffect(() => {
    if (isOpen && auth.user) {
      setFirstName(auth.user.firstName);
      setLastName(auth.user.lastName);
      setPassword('');
      setError('');
      setSuccessMessage('');
      
      // Charger l'image de profil depuis localStorage
      const savedImage = localStorage.getItem(`profile_image_${auth.user.id}`);
      if (savedImage) {
        setProfileImage(savedImage);
      }
    }
  }, [isOpen, auth.user]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        setProfileImage(imageUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Le prénom et le nom sont requis');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Sauvegarder les informations de profil
      if (auth.user) {
        const updatedUser = {
          ...auth.user,
          firstName: firstName.trim(),
          lastName: lastName.trim()
        };
        
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        
        // Sauvegarder l'image de profil
        if (profileImage) {
          localStorage.setItem(`profile_image_${auth.user.id}`, profileImage);
        }
        
        // Gérer le mot de passe DimiTable si fourni
        if (password.trim()) {
          const accessGranted = auth.grantSpecialAccess(password);
          if (!accessGranted) {
            setError('Mot de passe incorrect pour l\'accès DimiTable');
            setIsLoading(false);
            return;
          }
        }
        
        setSuccessMessage('Profil mis à jour avec succès');
        
        // Rafraîchir les données d'authentification
        await auth.refetch();
        
        setTimeout(() => {
          setSuccessMessage('');
          onClose();
        }, 1500);
      }
    } catch (error) {
      setError('Erreur lors de la sauvegarde du profil');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    const result = await auth.signOut();
    if (result.success) {
      onClose();
      window.location.reload();
    }
  };

  const getStatusColor = () => {
    switch (userStatus) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-green-500';
    }
  };

  if (!auth.user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <User className="w-5 h-5" />
            Profil utilisateur
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Photo de profil */}
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {profileImage ? (
                  <img 
                    src={profileImage} 
                    alt="Photo de profil" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background ${getStatusColor()}`} />
              
              <Button
                variant="ghost"
                size="sm"
                className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-background border shadow-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-3 h-3" />
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
            
            {hasSpecialAccess && (
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                Accès DimiTable
              </Badge>
            )}
          </div>

          <Separator />

          {/* Informations personnelles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Informations personnelles</CardTitle>
              <CardDescription>Modifiez vos informations de profil</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-sm">Prénom</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Prénom"
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-sm">Nom</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Nom"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Accès DimiTable */}
          {!hasSpecialAccess && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Accès DimiTable
                </CardTitle>
                <CardDescription>Saisissez le mot de passe pour débloquer DimiTable</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe DimiTable"
                    disabled={isLoading}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Messages */}
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="p-3 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 rounded-md">
              {successMessage}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button 
              onClick={handleSaveProfile} 
              disabled={isLoading}
              className="flex-1"
            >
              <Save className="w-4 h-4 mr-2" />
              {isLoading ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleSignOut}
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}; 