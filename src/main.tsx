import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Fonction pour masquer l'écran de chargement
const hideLoadingScreen = () => {
  const loadingScreen = document.getElementById('loading-screen')
  if (loadingScreen) {
    loadingScreen.classList.add('hidden')
    setTimeout(() => {
      if (loadingScreen && loadingScreen.parentNode) {
        loadingScreen.parentNode.removeChild(loadingScreen)
      }
    }, 300)
  }
}

// Wrapper pour l'App avec gestion de l'écran de chargement
const AppWithLoadingHandler = () => {
  React.useEffect(() => {
    // Masquer l'écran de chargement une fois que le composant est monté
    const timer = setTimeout(() => {
      hideLoadingScreen()
    }, 100)
    
    return () => clearTimeout(timer)
  }, [])

  return <App />
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppWithLoadingHandler />
  </React.StrictMode>
) 