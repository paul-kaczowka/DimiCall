import React from "react";
import { createAuthClient } from "better-auth/react";
import type { AuthUser } from "./auth";

export const authClient = createAuthClient({
  baseURL: "http://localhost:5173",
  fetchOptions: {
    credentials: "omit" // Éviter les problèmes CORS avec les credentials
  }
});

// Hook personnalisé pour l'authentification avec nom/prénom (mode local)
export const useCustomAuth = () => {
  // Mode local : on n'utilise plus les sessions serveur
  const [localSession, setLocalSession] = React.useState<any>(null);
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  
  // Initialiser la session locale au démarrage
  React.useEffect(() => {
    const user = getCurrentUser();
    const session = localStorage.getItem("auth_session");
    if (user && session === "true") {
      setLocalSession({ user });
    }
  }, []);
  
  const refetch = async () => {
    const user = getCurrentUser();
    const session = localStorage.getItem("auth_session");
    if (user && session === "true") {
      setLocalSession({ user });
    } else {
      setLocalSession(null);
    }
  };
  
  // Fonction d'inscription personnalisée (nom/prénom uniquement)
  const signUp = async (firstName: string, lastName: string) => {
    try {
      // Pour le moment, on simule l'inscription avec localStorage
      const userId = crypto.randomUUID();
      const user: AuthUser = {
        id: userId,
        firstName,
        lastName,
        hasSpecialAccess: false,
        lastLogin: new Date()
      };
      
      localStorage.setItem("auth_user", JSON.stringify(user));
      localStorage.setItem("auth_session", "true");
      
      // Déclencher un refresh de la session
      await refetch();
      
      return { success: true, user };
    } catch (error) {
      console.error("Erreur lors de l'inscription:", error);
      return { success: false, error: "Erreur lors de l'inscription" };
    }
  };

  // Fonction de connexion personnalisée
  const signIn = async (firstName: string, lastName: string) => {
    try {
      // Vérifier si l'utilisateur existe déjà
      const existingUser = localStorage.getItem("auth_user");
      if (existingUser) {
        const user = JSON.parse(existingUser) as AuthUser;
        if (user.firstName === firstName && user.lastName === lastName) {
          // Mettre à jour la dernière connexion
          user.lastLogin = new Date();
          localStorage.setItem("auth_user", JSON.stringify(user));
          localStorage.setItem("auth_session", "true");
          
          await refetch();
          return { success: true, user };
        }
      }
      
      // Si l'utilisateur n'existe pas, le créer
      return await signUp(firstName, lastName);
    } catch (error) {
      console.error("Erreur lors de la connexion:", error);
      return { success: false, error: "Erreur lors de la connexion" };
    }
  };

  // Fonction de déconnexion
  const signOut = async () => {
    try {
      localStorage.removeItem("auth_user");
      localStorage.removeItem("auth_session");
      
      // Supprimer tous les accès spéciaux
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith("special_access_")) {
          localStorage.removeItem(key);
        }
      });
      
      await refetch();
      return { success: true };
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
      return { success: false, error: "Erreur lors de la déconnexion" };
    }
  };

  // Vérifier l'accès spécial
  const checkSpecialAccess = (): boolean => {
    const user = getCurrentUser();
    if (!user) return false;
    return localStorage.getItem(`special_access_${user.id}`) === "true";
  };

  // Accorder l'accès spécial
  const grantSpecialAccess = (password: string): boolean => {
    const user = getCurrentUser();
    if (!user) return false;
    
    if (password === "DimiAccess2024") {
      localStorage.setItem(`special_access_${user.id}`, "true");
      return true;
    }
    return false;
  };

  // Obtenir l'utilisateur actuel
  const getCurrentUser = (): AuthUser | null => {
    try {
      const userStr = localStorage.getItem("auth_user");
      const sessionStr = localStorage.getItem("auth_session");
      
      if (!userStr || !sessionStr) return null;
      
      return JSON.parse(userStr) as AuthUser;
    } catch (error) {
      console.error("Erreur lors de la récupération de l'utilisateur:", error);
      return null;
    }
  };

  // Vérifier si l'utilisateur est connecté
  const isAuthenticated = (): boolean => {
    return localStorage.getItem("auth_session") === "true" && getCurrentUser() !== null;
  };

  return {
    user: getCurrentUser(),
    isAuthenticated: isAuthenticated(),
    isPending,
    error,
    signUp,
    signIn,
    signOut,
    refetch,
    checkSpecialAccess,
    grantSpecialAccess
  };
};

export type CustomAuthHook = ReturnType<typeof useCustomAuth>; 