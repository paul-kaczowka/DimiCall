# 🔐 Guide d'Authentification DimiCall

## Vue d'ensemble

DimiCall intègre désormais un système d'authentification moderne utilisant **Better Auth** qui permet :

1. **Authentification par nom et prénom** (pas d'email requis)
2. **Accès privilégié optionnel** pour débloquer DimiTable
3. **Persistance des données** d'authentification
4. **Interface moderne et épurée**

## 🚀 Fonctionnalités

### Authentification de base
- Saisie du **prénom** et **nom** uniquement
- Création automatique de compte si premier accès
- Session persistante (30 jours)
- Interface avec animations fluides

### Accès privilégié
- Toggle pour activer le mode "accès privilégié"
- Champ mot de passe conditionnel
- Mot de passe spécial : `DimiAccess2024`
- Déblocage de l'onglet **DimiTable**

## 🎯 Comment utiliser

### Première connexion
1. Lancez l'application DimiCall
2. Le modal d'authentification s'ouvre automatiquement
3. Saisissez votre **prénom** et **nom**
4. Cliquez sur "Se connecter"

### Accès privilégié à DimiTable
1. Lors de la connexion, activez le toggle "Accès privilégié"
2. Saisissez le mot de passe : `DimiAccess2024`
3. L'onglet DimiTable devient accessible
4. Badge VIP affiché dans le profil utilisateur

### Interface utilisateur
- **Carte de profil** : Affiche les informations utilisateur et le statut VIP
- **Onglet conditionnel** : DimiTable n'est visible qu'avec l'accès privilégié
- **Notifications** : Messages d'information lors de l'authentification
- **Déconnexion** : Bouton dans la carte de profil

## 🔧 Architecture technique

### Composants créés
- `AuthModal.tsx` : Modal d'authentification principal
- `UserProfileCard.tsx` : Carte de profil utilisateur
- `auth.ts` : Configuration Better Auth
- `auth-client.ts` : Client d'authentification React

### Fonctionnalités techniques
- **Better Auth** : Système d'authentification moderne
- **SQLite local** : Base de données d'authentification
- **localStorage** : Persistance des sessions et accès spéciaux
- **TypeScript** : Types sécurisés pour l'authentification
- **Tailwind CSS** : Interface moderne et responsive

## 🎨 Interface utilisateur

### Modal d'authentification
- Design gradient moderne
- Animations avec Framer Motion
- Validation en temps réel
- Messages d'erreur contextuels
- Toggle animé pour l'accès privilégié

### Carte de profil
- Affichage du nom complet
- Badge VIP conditionnel
- Indicateur de connexion
- Bouton de déconnexion
- Tooltips informatifs

### Intégration DimiTable
- Onglet masqué sans accès privilégié
- Page de statut avec design cohérent
- Messages explicatifs pour l'utilisateur
- Redirection automatique si accès non autorisé

## 🔐 Sécurité

### Gestion des mots de passe
- Mot de passe spécial configuré dans `auth.ts`
- Validation côté client et persistance locale
- Pas de transmission réseau du mot de passe

### Sessions
- Durée de session : 30 jours
- Mise à jour automatique : 24 heures
- Déconnexion automatique lors de la fermeture

### Données stockées
- Informations utilisateur (prénom, nom)
- État de l'accès privilégié
- Dernière connexion
- Session active

## 🛠️ Configuration

### Variables d'environnement (optionnel)
```env
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:5173
```

### Personnalisation
- Modifier `SPECIAL_PASSWORD` dans `auth.ts`
- Personnaliser les styles dans les composants
- Ajuster la durée de session dans la configuration

## 📱 États de l'application

1. **Non authentifié** : Modal d'authentification affiché
2. **Authentifié basique** : Accès à DimiCall uniquement
3. **Authentifié privilégié** : Accès complet incluant DimiTable

## 🎉 Expérience utilisateur

- **Première utilisation** : Processus simple et intuitif
- **Utilisations suivantes** : Connexion automatique
- **Accès privilégié** : Expérience VIP avec badges et animations
- **Messages clairs** : Notifications contextuelles

---

*Système d'authentification intégré avec ❤️ par l'équipe DimiCall* 