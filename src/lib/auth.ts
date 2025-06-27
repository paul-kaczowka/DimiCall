import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import path from "path";

// Configuration des rôles et permissions
export const SPECIAL_PASSWORD = "DimiAccess2024"; // Mot de passe spécial pour débloquer DimiTable

// Configuration de la base de données locale
const dbPath = path.join(process.cwd(), "auth.db");
const db = new Database(dbPath);

export const auth = betterAuth({
  database: db,
  
  // Configuration d'authentification personnalisée (nom/prénom uniquement)
  emailAndPassword: {
    enabled: false // On désactive l'authentification par email
  },

  // Configuration de base
  secret: process.env.BETTER_AUTH_SECRET || "your-secret-key-change-in-production",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5173",
  
  // Configuration des sessions
  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 jours
    updateAge: 24 * 60 * 60, // 1 jour
  },

  // Configuration des utilisateurs
  user: {
    additionalFields: {
      firstName: {
        type: "string",
        required: true,
      },
      lastName: {
        type: "string", 
        required: true,
      },
      hasSpecialAccess: {
        type: "boolean",
        defaultValue: false,
      },
      lastLogin: {
        type: "date",
        required: false,
      }
    }
  },

  // Configuration des callbacks
  callbacks: {
    async signUp(user, context) {
      // Log de l'inscription
      console.log("Nouvel utilisateur inscrit:", user.firstName, user.lastName);
      return user;
    },
    
    async signIn(user, context) {
      // Mise à jour de la dernière connexion
      return {
        ...user,
        lastLogin: new Date()
      };
    }
  }
});

// Types d'authentification personnalisés
export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string;
  hasSpecialAccess: boolean;
  lastLogin?: Date;
};

// Fonction pour vérifier le mot de passe spécial
export const verifySpecialPassword = (password: string): boolean => {
  return password === SPECIAL_PASSWORD;
};

// Fonction pour accorder l'accès spécial
export const grantSpecialAccess = async (userId: string): Promise<boolean> => {
  try {
    // Ici on mettrait à jour la base de données pour accorder l'accès spécial
    // Pour le moment, on simule avec localStorage
    localStorage.setItem(`special_access_${userId}`, "true");
    return true;
  } catch (error) {
    console.error("Erreur lors de l'attribution de l'accès spécial:", error);
    return false;
  }
};

// Fonction pour vérifier l'accès spécial
export const hasSpecialAccess = (userId: string): boolean => {
  return localStorage.getItem(`special_access_${userId}`) === "true";
}; 