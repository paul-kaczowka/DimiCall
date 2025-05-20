import { NextResponse } from 'next/server';

/**
 * Route API pour récupérer le statut d'un appel
 * Cette route fait simplement un proxy vers l'API FastAPI backend
 */
export async function GET() {
  try {
    // Utiliser l'API backend pour vérifier l'état de l'appel
    const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
    const response = await fetch(`${apiUrl}/call/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Si la réponse n'est pas OK, retourner l'erreur
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        detail: `Erreur lors de la vérification de l'état de l'appel: ${response.status} ${response.statusText}`
      }));
      
      return NextResponse.json(
        { 
          error: errorData.detail || "Erreur lors de la vérification de l'état de l'appel", 
          call_in_progress: false 
        }, 
        { status: response.status }
      );
    }

    // Renvoyer les données reçues de l'API FastAPI
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API Route] Erreur lors de la vérification du statut d\'appel:', error);
    // En cas d'erreur, supposer que l'appel n'est pas en cours
    return NextResponse.json(
      { 
        error: "Erreur lors de la vérification du statut d'appel", 
        call_in_progress: false 
      }, 
      { status: 500 }
    );
  }
} 