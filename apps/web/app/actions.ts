'use server';

import { z } from 'zod';
import { type ActionState } from '@/lib/actions-utils'; // Garder ActionState
import { contactSchema, Contact } from '@/lib/schemas/contact';
import { revalidatePath } from 'next/cache'; // Importer revalidatePath
import { parse as parseDateFns, differenceInSeconds } from 'date-fns';
import { fr } from 'date-fns/locale';

// Schéma pour la validation du numéro de téléphone et de l'ID du contact
const callActionSchema = z.object({
  phoneNumber: z.preprocess(
    (val) => (val === null ? undefined : val),
    z.string().optional()
  ), 
  contactId: z.string().min(1, { message: 'L\'ID du contact est requis.' }),
}).refine(data => {
  // Au moins contactId doit être présent
  return !!data.contactId;
}, {
  message: "L'ID du contact est obligatoire.",
  path: ['contactId']
});

// Schéma pour la validation du format d'exportation
const exportFormatSchema = z.enum(['csv', 'parquet']);

const hangUpActionSchema = z.object({
  contactId: z.string().min(1, { message: 'L\'ID du contact est requis.' }),
});

/**
 * Server Action pour initier un appel via ADB.
 * @param prevState L'état précédent (non utilisé ici mais requis par useActionState).
 * @param formData Les données du formulaire.
 * @returns Un objet indiquant le succès ou l'échec de l'opération.
 */
export async function callAction(prevState: ActionState<Contact | null>, formData: FormData): Promise<ActionState<Contact | null>> {
  const rawFormData = {
    phoneNumber: formData.get('phoneNumber'),
    contactId: formData.get('contactId'),
  };
  console.log('[Server Action callAction] Received rawFormData:', rawFormData);

  const validationResult = callActionSchema.safeParse(rawFormData);

  if (!validationResult.success) {
    console.error('[Server Action callAction] Validation failed:', validationResult.error.flatten().fieldErrors);
    return {
      success: false,
      message: 'Données d\'appel invalides.',
      errors: validationResult.error.flatten().fieldErrors,
      data: null,
    };
  }

  const { phoneNumber: providedPhoneNumber, contactId: validatedContactId } = validationResult.data;
  console.log('[Server Action callAction] Validation successful. Provided PhoneNumber:', providedPhoneNumber, 'Validated ContactID:', validatedContactId);
  
  let phoneNumberToCall = providedPhoneNumber as string | undefined;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  
  if (!phoneNumberToCall) {
    console.log(`[Server Action callAction] PhoneNumber not provided. Attempting to fetch from API for contact ID: ${validatedContactId}`);
    try {
      const contactResponse = await fetch(`${apiUrl}/contacts/${validatedContactId}`);
      if (!contactResponse.ok) {
        const errorText = await contactResponse.text();
        console.error(`[Server Action callAction] Failed to fetch contact. Status: ${contactResponse.status}, Response: ${errorText}`);
        return {
          success: false,
          message: `Impossible de récupérer les détails du contact (ID: ${validatedContactId})`,
          data: null,
        };
      }
      const contactData = await contactResponse.json();
      phoneNumberToCall = contactData.phoneNumber;
      console.log(`[Server Action callAction] Fetched contact data:`, contactData, `PhoneNumber to call: ${phoneNumberToCall}`);
      
      if (!phoneNumberToCall) {
        console.error(`[Server Action callAction] Contact (ID: ${validatedContactId}) has no phone number.`);
        return {
          success: false,
          message: `Ce contact (ID: ${validatedContactId}) n'a pas de numéro de téléphone enregistré.`,
          data: null,
        };
      }
    } catch (error) {
      console.error("[Server Action callAction] Error fetching contact:", error);
      return {
        success: false,
        message: "Erreur lors de la récupération des informations du contact.",
        data: null,
      };
    }
  }

  // Nettoyage final du numéro avant de l'envoyer à l'API
  if (phoneNumberToCall) {
    const originalNumberForLog = phoneNumberToCall;
    // Supprimer tout ce qui n'est pas un chiffre ou '+'
    phoneNumberToCall = phoneNumberToCall.replace(/[^0-9+]/g, '');
    // S'il ne commence pas par +, et qu'il a la bonne longueur pour un numéro français sans le 0 initial (9 chiffres),
    // ou un numéro français avec le 0 initial (10 chiffres), on peut tenter de le préfixer avec +33
    if (!phoneNumberToCall.startsWith('+')) {
        if (phoneNumberToCall.length === 10 && phoneNumberToCall.startsWith('0')) {
            phoneNumberToCall = `+33${phoneNumberToCall.substring(1)}`;
        }
        // Autres logiques de normalisation E.164 pourraient être ajoutées ici si nécessaire
    }
    console.log(`[Server Action callAction] Original phone number: '${originalNumberForLog}', Cleaned/Formatted for API: '${phoneNumberToCall}'`);
  }

  if (!phoneNumberToCall) { // Re-vérifier après nettoyage/formatage potentiel
    console.error(`[Server Action callAction] phoneNumberToCall is still null/empty after cleanup for contact ID: ${validatedContactId}`);
    return {
      success: false,
      message: `Numéro de téléphone invalide ou manquant pour le contact ${validatedContactId} après nettoyage.`,
      data: null,
    };
  }
  
  console.log(`[Server Action callAction] Attempting to call number: ${phoneNumberToCall} for contact ID: ${validatedContactId} via backend API.`);

  try {
    const apiCallResponse = await fetch(`${apiUrl}/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone_number: phoneNumberToCall }), // L'API /call attend juste phone_number
    });

    if (!apiCallResponse.ok) {
      let errorMessage = `Échec de l'appel vers ${phoneNumberToCall}.`;
      try {
        const errorData = await apiCallResponse.json();
        errorMessage = errorData.detail || `Erreur API (/call) (${apiCallResponse.status}): ${apiCallResponse.statusText}`;
      } catch {
        // LOG AJOUTÉ pour capturer le texte brut si la réponse n'est pas JSON
        const errorText = await apiCallResponse.text().catch(() => "Impossible de lire la réponse d'erreur.");
        console.error(`[Server Action callAction] API /call error response (not JSON): ${errorText}`);
        errorMessage = `Erreur API (/call) (${apiCallResponse.status}): ${apiCallResponse.statusText}. Réponse brute: ${errorText.substring(0, 100)}`;
      }
      console.error(`[Server Action] Erreur de l'API FastAPI lors de l'appel: ${errorMessage}`);
      return {
        success: false,
        message: errorMessage,
        data: null,
      };
    }

    const callResultData = await apiCallResponse.json();
    const callTimeISO = callResultData.call_time; // call_time est retourné par l'API /call en ISO UTC

    if (!callTimeISO || typeof callTimeISO !== 'string') {
        console.error("[Server Action callAction] call_time manquant ou invalide dans la réponse de l'API /call:", callResultData);
        return {
            success: false,
            message: "Réponse invalide de l'API d'appel (call_time manquant ou invalide).",
            data: null,
        };
    }
    
    console.log(`[Server Action] Appel API réussi. call_time: ${callTimeISO}. Mise à jour du contact avec date et heure de l'appel.`);

    const callTimeUTCDate = new Date(callTimeISO);
    const parisDateFormatter = new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: 'Europe/Paris'
    });
    const formattedDateAppel = parisDateFormatter.format(callTimeUTCDate); // DD/MM/YYYY

    const parisTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
      timeZone: 'Europe/Paris'
    });
    const formattedHeureAppel = parisTimeFormatter.format(callTimeUTCDate); // HH:MM:SS

    // Mise à jour directe du contact via fetch, au lieu d'appeler updateContactAction
    const updateData = {
        dateAppel: formattedDateAppel,
        heureAppel: formattedHeureAppel
    };

    try {
        const updateResponse = await fetch(`${apiUrl}/contacts/${validatedContactId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
        });

        if (!updateResponse.ok) {
            let updateErrorMessage = `Échec de la mise à jour du contact après l'appel.`;
            try {
                const errorUpdateData = await updateResponse.json();
                updateErrorMessage = errorUpdateData.detail || `Erreur API (PATCH /contacts) (${updateResponse.status}): ${updateResponse.statusText}`;
            } catch {
                const errorText = await updateResponse.text().catch(() => "Impossible de lire la réponse d'erreur de la MAJ contact.");
                console.error(`[Server Action updateContactAction] API /contacts/PATCH error response (not JSON): ${errorText}`);
                updateErrorMessage = `Erreur API (${updateResponse.status}): ${updateResponse.statusText}. La réponse n'est pas au format JSON. Réponse brute: ${errorText.substring(0,100)}`;
            }
            console.error(`[Server Action] Erreur de l'API FastAPI lors de la mise à jour du contact: ${updateErrorMessage}`);
            return {
                success: false,
                message: `Appel initié, mais échec de la mise à jour du contact: ${updateErrorMessage}`,
                data: null,
            };
        }
        const updatedContactData = await updateResponse.json();
        revalidatePath('/(contacts)');
        console.log("[Server Action] Contact mis à jour avec succès après l'appel (dans callAction).", updatedContactData);
        return {
            success: true,
            message: `Appel vers ${phoneNumberToCall} initié et contact mis à jour.`,
            data: updatedContactData,
        };

    } catch (updateError) {
        console.error("[Server Action] Erreur réseau ou autre lors de la mise à jour du contact (dans callAction):", updateError);
        let technicalUpdateErrorMessage = "Erreur technique lors de la mise à jour du contact après appel.";
        if (updateError instanceof Error) {
            technicalUpdateErrorMessage = updateError.message;
        }
        return {
            success: false,
            message: `Appel initié, mais erreur technique lors de la mise à jour: ${technicalUpdateErrorMessage}`,
            data: null,
        };
    }

  } catch (error) {
    console.error("[Server Action] Erreur réseau ou autre lors du processus d'appel et de mise à jour:", error);
    let technicalErrorMessage = "Erreur technique lors du processus d'appel.";
    if (error instanceof Error) {
        technicalErrorMessage = error.message;
    }
    return {
      success: false,
      message: `Erreur technique: ${technicalErrorMessage}`,
      data: null,
    };
  }
}

/**
 * Server Action pour exporter les contacts.
 * @param prevState L'état précédent.
 * @param formData Les données du formulaire.
 * @returns Un objet indiquant le succès ou l'échec.
 */
export async function exportContactsAction(prevState: ActionState<null>, formData: FormData): Promise<ActionState<null>> {
  const format = formData.get('format') as 'csv' | 'parquet';
  const validationResult = exportFormatSchema.safeParse(format);

  if (!validationResult.success) {
    return {
      success: false,
      message: 'Format d\'exportation invalide.',
      errors: validationResult.error.flatten().fieldErrors,
      data: null,
    };
  }

  console.log(`[Server Action] Exportation des contacts au format : ${validationResult.data}`);
  // TODO: Implémenter la logique d'appel à l'API backend (FastAPI) pour l'exportation.

  if (validationResult.data === 'csv') {
    return {
      success: true,
      message: 'Exportation CSV terminée (simulation).',
      data: null,
    };
  } else if (validationResult.data === 'parquet') {
    return {
      success: true,
      message: 'Exportation Parquet terminée (simulation).',
      data: null,
    };
  }

  return {
    success: false,
    message: 'Erreur inattendue lors de l\'exportation.',
    data: null,
  };
}

/**
 * Server Action pour importer les contacts.
 * @param prevState L'état précédent.
 * @param formData Les données du formulaire.
 * @returns Un objet indiquant le succès ou l'échec de l'importation.
 */
export async function importContactsAction(prevState: ActionState<{ count?: number; message?: string } | null>, formData: FormData): Promise<ActionState<{ count?: number; message?: string } | null>> {
  const file = formData.get('file') as File;

  if (!file || file.size === 0) {
    return { success: false, message: 'Aucun fichier sélectionné ou fichier vide.', data: null };
  }

  const allowedTypes = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
  if (!allowedTypes.includes(file.type)) {
    return {
      success: false,
      message: `Type de fichier non supporté: ${file.type}. Veuillez utiliser CSV ou XLSX.`,
      data: null,
    };
  }

  console.log(`[Server Action] Tentative d'import du fichier : ${file.name}, Type: ${file.type}, Taille: ${file.size} bytes`);

  try {
    const apiFormData = new FormData();
    apiFormData.append('file', file);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${apiUrl}/contacts/import`, {
      method: 'POST',
      body: apiFormData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Erreur inconnue lors de l'import API." }));
      console.error("[Server Action] Erreur de l'API FastAPI lors de l'import:", errorData.detail);
      return { success: false, message: `Erreur de l'API lors de l'import: ${errorData.detail || response.statusText}`, data: null };
    }

    const result = await response.json();
    console.log("[Server Action] Réponse de l'API FastAPI import:", result);
    return { success: true, message: result.message || `Fichier ${file.name} importé avec succès (via API).`, data: result };

  } catch (error) {
    console.error("[Server Action] Erreur lors de l'appel à l'API FastAPI pour l'import:", error);
    let errorMessage = "Erreur interne du serveur lors de la tentative d'import.";
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return { success: false, message: `Erreur technique lors de l'import: ${errorMessage}`, data: null };
  }
}

/**
 * Server Action pour créer un nouveau contact.
 * IMPORTANT: Pour être utilisée directement avec useActionState sans formData,
 * la fonction doit correspondre à la signature attendue ou être encapsulée.
 * Ici, nous supposons qu'elle sera appelée avec des données directes,
 * donc elle ne prend pas prevState et formData.
 * Si vous l'utilisez avec un formulaire et useActionState, vous devrez l'adapter
 * ou créer une action spécifique pour le formulaire.
 * @param data Les données du contact à créer.
 * @returns Un objet avec le résultat.
 */
export async function createContactAction(
  data: Omit<Contact, 'id'> // On s'attend à des données de contact sans ID pour la création
): Promise<ActionState<Contact | null>> {
  const validationResult = contactSchema.omit({ id: true }).safeParse(data);

  if (!validationResult.success) {
    console.error("[Server Action] Erreur de validation pour createContactAction:", validationResult.error.flatten());
    return {
      success: false,
      errors: validationResult.error.flatten().fieldErrors,
      message: "Données du contact invalides.",
      data: null,
    };
  }

  const newContactData = validationResult.data;
  console.log("[Server Action] Création du contact avec données:", newContactData);

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    
    const response = await fetch(`${apiUrl}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newContactData), // Envoyer les données validées sans ID
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Erreur inconnue lors de la création API." }));
      console.error("[Server Action] Erreur de l'API FastAPI lors de la création:", errorData.detail);
      return { 
        success: false, 
        message: `Erreur API: ${errorData.detail || response.statusText}`,
        data: null,
      };
    }

    const createdContact: Contact = await response.json();
    console.log("[Server Action] Contact créé avec succès via API:", createdContact);
    return { success: true, data: createdContact, message: "Contact créé avec succès." };

  } catch (error) {
    console.error("[Server Action] Erreur lors de l'appel à l'API FastAPI pour la création:", error);
    let errorMessage = "Erreur interne du serveur lors de la tentative de création.";
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return { success: false, message: `Erreur technique: ${errorMessage}`, data: null };
  }
}

/**
 * Server Action pour mettre à jour un contact existant.
 * Voir la note pour createContactAction concernant la signature.
 * @param prevState L'état précédent.
 * @param formData Les données du formulaire.
 * @returns Un objet avec le résultat.
 */
export async function updateContactAction(
  prevState: ActionState<Contact | null>,
  formData: FormData
): Promise<ActionState<Contact | null>> {
  const contactId = formData.get('contactId') as string;
  const dataToUpdate: Partial<Omit<Contact, 'id'>> = {};

  // Extraire les champs du contact à partir de formData
  // et les ajouter à dataToUpdate, en excluant 'contactId'
  // et en s'assurant que les types sont corrects si nécessaire.
  // Par exemple, pour les champs optionnels, vérifier s'ils sont présents.

  // Exemple d'extraction (à adapter en fonction des champs possibles dans formData)
  if (formData.has('firstName')) dataToUpdate.firstName = formData.get('firstName') as string;
  if (formData.has('lastName')) dataToUpdate.lastName = formData.get('lastName') as string;
  if (formData.has('email')) dataToUpdate.email = formData.get('email') as string || null;
  if (formData.has('phoneNumber')) dataToUpdate.phoneNumber = formData.get('phoneNumber') as string || null;
  if (formData.has('status')) dataToUpdate.status = formData.get('status') as string || null;
  if (formData.has('comment')) dataToUpdate.comment = formData.get('comment') as string || null;
  if (formData.has('societe')) dataToUpdate.societe = formData.get('societe') as string || null;
  if (formData.has('role')) dataToUpdate.role = formData.get('role') as string || null;
  if (formData.has('dateAppel')) dataToUpdate.dateAppel = formData.get('dateAppel') as string || null;
  if (formData.has('heureAppel')) dataToUpdate.heureAppel = formData.get('heureAppel') as string || null;
  if (formData.has('dateRappel')) dataToUpdate.dateRappel = formData.get('dateRappel') as string || null;
  if (formData.has('heureRappel')) dataToUpdate.heureRappel = formData.get('heureRappel') as string || null;
  // Nouveaux champs pour le rendez-vous Cal.com
  if (formData.has('bookingDate')) dataToUpdate.bookingDate = formData.get('bookingDate') as string || null;
  if (formData.has('bookingTime')) dataToUpdate.bookingTime = formData.get('bookingTime') as string || null;
  // Note: avatarUrl n'est pas géré ici car c'est un File, nécessite une logique différente (upload)

  if (!contactId) {
    console.error("[Server Action] updateContactAction: contactId est manquant dans FormData.");
    return {
      success: false,
      message: "ID du contact manquant pour la mise à jour.",
      errors: { contactId: ["ID du contact est requis."] },
      data: null,
    };
  }

  if (Object.keys(dataToUpdate).length === 0) {
    console.warn("[Server Action] updateContactAction: Aucune donnée à mettre à jour pour le contact ID:", contactId);
    // On pourrait retourner un succès avec un message indiquant qu'aucune modification n'a été faite
    // ou chercher le contact existant et le retourner.
    // Pour l'instant, on retourne un message spécifique.
    // Il est préférable de récupérer le contact actuel et de le renvoyer pour éviter toute désynchronisation côté client.
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/contacts/${contactId}`);
      if (!response.ok) {
        return { success: false, message: `Contact ID ${contactId} non trouvé.`, data: null };
      }
      const existingContact = await response.json();
      return { 
        success: true, 
        message: "Aucune donnée fournie pour la mise à jour. Statut actuel du contact retourné.", 
        data: existingContact 
      };
    } catch (fetchError) {
      console.error(`[Server Action] Erreur en récupérant le contact ${contactId} existant:`, fetchError);
      return { success: false, message: "Erreur en récupérant les données actuelles du contact.", data: null };
    }
  }
  
  console.log(`[Server Action] Tentative de mise à jour du contact ID: ${contactId} avec les données:`, dataToUpdate);

  // Validation partielle avec Zod si nécessaire (les champs sont optionnels pour la mise à jour)
  // const partialContactSchemaForUpdate = contactSchema.partial().omit({ id: true }); // id n'est pas dans dataToUpdate
  // const validationResult = partialContactSchemaForUpdate.safeParse(dataToUpdate);

  // if (!validationResult.success) {
  //   console.error("[Server Action] Erreurs de validation Zod pour la mise à jour:", validationResult.error.flatten().fieldErrors);
  //   return {
  //     success: false,
  //     message: "Données de mise à jour invalides.",
  //     errors: validationResult.error.flatten().fieldErrors,
  //     data: null,
  //   };
  // }

  // const validatedData = validationResult.data; // Utiliser validatedData si la validation Zod est active
  const validatedData = dataToUpdate; // Utiliser directement si pas de validation Zod pour les partiels

  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${apiUrl}/contacts/${contactId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedData),
    });

    if (!response.ok) {
      let errorMessage = `Échec de la mise à jour du contact ID: ${contactId}.`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || `Erreur API (${response.status}): ${response.statusText}`;
      } catch {
        // La réponse n'est pas du JSON ou une autre erreur s'est produite
        errorMessage = `Erreur API (${response.status}): ${response.statusText}. La réponse n'est pas au format JSON.`;
      }
      console.error(`[Server Action] Erreur de l'API FastAPI lors de la mise à jour du contact: ${errorMessage}`);
      return {
        success: false,
        message: errorMessage,
        data: null,
      };
    }

    const updatedContact = await response.json();
    console.log("[Server Action] Contact mis à jour avec succès via l'API FastAPI:", updatedContact);
    
    revalidatePath('/(contacts)'); // Invalider le cache pour la page des contacts
    // revalidatePath('/'); // Décommenter si vous avez une page d'accueil qui affiche aussi des contacts

    return {
      success: true,
      message: `Contact ${updatedContact.firstName || contactId} mis à jour avec succès.`,
      data: updatedContact,
    };

  } catch (error) {
    console.error("[Server Action] Erreur réseau ou autre lors de la mise à jour du contact:", error);
    let technicalErrorMessage = "Erreur technique lors de la mise à jour du contact.";
    if (error instanceof Error) {
        technicalErrorMessage = error.message;
    }
    return {
      success: false,
      message: `Erreur technique: ${technicalErrorMessage}`,
      data: null,
    };
  }
}

/**
 * Server Action pour supprimer un contact.
 * @param contactId L'ID du contact à supprimer.
 * @returns Un objet indiquant le succès ou l'échec.
 */
// export async function deleteContactAction(
//   // prevState: ActionState, // Si utilisé avec useActionState et un formulaire simple avec juste un ID
//   payload: { contactId: string } // Ou juste contactId: string si appelée directement sans useActionState
// ): Promise<ActionState> {
//   const { contactId } = payload;

//   if (!contactId) {
//     return {
//       success: false,
//       message: "ID du contact manquant pour la suppression.",
//     };
//   }

//   console.log(`[Server Action] Suppression du contact ID: ${contactId}`);

//   try {
//     const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
//     const response = await fetch(`${apiUrl}/contacts/${contactId}`, {
//       method: 'DELETE',
//     });

//     if (response.status === 204) { // Succès sans contenu
//       return { success: true, message: `Contact ${contactId} supprimé avec succès.` };
//     }

//     if (!response.ok) {
//       const errorData = await response.json().catch(() => ({ detail: "Erreur inconnue lors de la suppression API." }));
//       console.error("[Server Action] Erreur de l'API FastAPI lors de la suppression:", errorData.detail);
//       return { success: false, message: `Erreur de l'API lors de la suppression: ${errorData.detail || response.statusText}` };
//     }
    
//     // Normalement, une suppression réussie avec 204 ne renverra pas de JSON.
//     // S'il y a une réponse JSON pour un statut OK autre que 204, c'est inattendu ici.
//     // Mais on la logue au cas où.
//     const result = await response.json().catch(() => null);
//     console.log("[Server Action] Réponse inattendue de l'API FastAPI pour delete (devrait être 204):", result);
//     return { success: true, message: `Contact ${contactId} traité pour suppression (réponse inattendue).` };

//   } catch (error) {
//     console.error("[Server Action] Erreur lors de l'appel à l'API FastAPI pour la suppression:", error);
//     let errorMessage = "Erreur interne du serveur lors de la tentative de suppression.";
//     if (error instanceof Error) {
//         errorMessage = error.message;
//     }
//     return { success: false, message: `Erreur technique: ${errorMessage}` };
//   }
// }

export async function clearAllDataAction(): Promise<ActionState<null>> {
  try {
    const response = await fetch('http://localhost:8000/contacts/all', {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Erreur inconnue lors du nettoyage des données côté serveur.' }));
      console.error("[clearAllDataAction] Erreur API:", response.status, errorData);
      return {
        success: false,
        message: typeof errorData.detail === 'string' ? errorData.detail : 'Erreur lors du nettoyage des données serveur.',
        data: null,
      };
    }

    return {
      success: true,
      message: 'Toutes les données ont été réinitialisées avec succès.',
      data: null,
    };
  } catch (error) {
    console.error("[clearAllDataAction] Erreur inattendue:", error);
    const errorMessage = error instanceof Error ? error.message : 'Une erreur de communication est survenue.';
    return {
      success: false,
      message: errorMessage,
      data: null,
    };
  }
}

export async function hangUpCallAction(prevState: ActionState<Contact | null>, formData: FormData): Promise<ActionState<Contact | null>> {
  const rawFormData = {
    contactId: formData.get('contactId'),
  };
  const validationResult = hangUpActionSchema.safeParse(rawFormData);

  if (!validationResult.success) {
    return {
      success: false,
      message: 'Données pour raccrocher invalides.',
      errors: validationResult.error.flatten().fieldErrors,
      data: null,
    };
  }

  const { contactId } = validationResult.data;
  console.log(`[Server Action] Tentative de raccrocher l'appel pour contact ID: ${contactId}`);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  try {
    const fetchContactResponse = await fetch(`${apiUrl}/contacts/${contactId}`);
    if (!fetchContactResponse.ok) {
      const errorData = await fetchContactResponse.json().catch(() => ({ detail: fetchContactResponse.statusText }));
      const errorText = await fetchContactResponse.text().catch(() => "Impossible de lire la réponse d'erreur du fetch contact.");
      const errorMessage = errorData.detail || `Impossible de récupérer le contact ${contactId}.`;
      console.error(`[Server Action hangUpCallAction] Erreur fetch contact ${contactId}: ${errorMessage}. Réponse brute: ${errorText}`);
      return { success: false, message: `Impossible de récupérer le contact ${contactId} (${fetchContactResponse.status}) pour calculer la durée.`, data: null };
    }
    const contactData: Contact = await fetchContactResponse.json();

    let dureeAppelFormatted = "N/A";
    if (contactData.dateAppel && contactData.heureAppel) {
      try {
        const datePart = parseDateFns(contactData.dateAppel, 'dd/MM/yyyy', new Date(), { locale: fr });
        const timeParts = contactData.heureAppel.split(':');
        // Vérifier que timeParts a bien 3 éléments (HH, MM, SS) ou au moins 2 (HH, MM)
        if (timeParts.length >= 2) {
            datePart.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), parseInt(timeParts[2] || '0', 10));
            
            const callStartTime = datePart; 
            const callEndTime = new Date(); 

            const diffSeconds = differenceInSeconds(callEndTime, callStartTime);

            if (diffSeconds < 0) {
                 console.warn(`[Server Action] Différence de temps négative (${diffSeconds}s) pour contact ${contactId}. Date/Heure début: ${contactData.dateAppel} ${contactData.heureAppel}. Cela peut arriver si l'heure du serveur est en avance ou s'il y a eu un ajustement d'horloge.`);
                 dureeAppelFormatted = "00:00:00"; // Ou "Erreur durée" si vous préférez signaler l'erreur
            } else {
                const hours = Math.floor(diffSeconds / 3600);
                const minutes = Math.floor((diffSeconds % 3600) / 60);
                const seconds = diffSeconds % 60;
                dureeAppelFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        } else {
            console.warn(`[Server Action] Format heureAppel (${contactData.heureAppel}) invalide pour contact ${contactId}. Durée non calculée.`);
            dureeAppelFormatted = "00:00:00"; // Ou "Format invalide"
        }
      } catch (e) {
        console.error("[Server Action] Erreur lors du calcul de la durée de l'appel:", e);
        dureeAppelFormatted = "Erreur calcul";
      }
    } else {
        console.warn(`[Server Action] dateAppel ou heureAppel manquant pour contact ${contactId}. Durée non calculée.`);
        dureeAppelFormatted = "N/A"; // Explicitement marquer qu'aucune durée n'est calculable
    }
    
    console.log(`[Server Action] Commande ADB pour raccrocher l'appel (contact ID: ${contactId}) - Appel de l'API`);
    // Appel à l'API pour raccrocher
    const hangUpApiUrl = `${apiUrl}/adb/hangup`;
    const hangUpResponse = await fetch(hangUpApiUrl, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId }) // Assurez-vous que votre API attend contact_id
    });

    if (!hangUpResponse.ok) {
      const errorHangUpData = await hangUpResponse.json().catch(() => ({ detail: hangUpResponse.statusText }));
      const hangUpErrorText = await hangUpResponse.text().catch(() => "Impossible de lire la réponse d'erreur du hangup.");
      const hangUpErrorMessage = errorHangUpData.detail || `Échec de la commande de raccrochage pour ${contactId}.`;
      console.error(`[Server Action hangUpCallAction] Erreur API raccrochage ${contactId}: ${hangUpErrorMessage}. Réponse brute: ${hangUpErrorText}`);
      // Le message d'erreur sera propagé au client via la valeur de retour de l'action.
      // Le useEffect dans page.tsx s'occupera d'afficher le toast.
      // toast.error(`Erreur lors de la tentative de raccrochage via ADB: ${hangUpErrorMessage}`); // SUPPRIMÉ
      // On peut choisir de retourner un échec partiel ici si la mise à jour de la durée est importante
      // ou si l'échec du raccrochage ADB doit bloquer la mise à jour de la durée.
      // Pour l'instant, on considère que l'action a globalement échoué si hangUpResponse n'est pas ok.
      return {
        success: false,
        message: `Échec de la commande ADB pour raccrocher: ${hangUpErrorMessage}`,
        data: null, 
      };
    } else {
      const hangUpResult = await hangUpResponse.json().catch(() => ({ message: "Raccrochage ADB réussi, réponse non JSON."}))
      console.log(`[Server Action] Résultat API raccrochage: `, hangUpResult);
      // toast.success(hangUpResult.message || "Commande de raccrochage ADB envoyée."); // SUPPRIMÉ - Géré par le client via le retour de l'action
      // Le message de succès sera dans hangUpResult.message, et sera utilisé par le client.
    }

    const updateData = { dureeAppel: dureeAppelFormatted };
    const updateResponse = await fetch(`${apiUrl}/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });

    if (!updateResponse.ok) {
      const errorUpdateData = await updateResponse.json().catch(() => ({ detail: updateResponse.statusText }));
      const updateErrorText = await updateResponse.text().catch(() => "Impossible de lire la réponse d'erreur de la MAJ contact.");
      const updateErrorMessage = errorUpdateData.detail || `Échec de la mise à jour de la durée pour ${contactId}.`;
      console.error(`[Server Action hangUpCallAction] Erreur màj contact (durée) ${contactId}: ${updateErrorMessage}. Réponse brute: ${updateErrorText}`);
      return { success: false, message: `Appel raccroché (simulé), mais échec de la mise à jour de la durée pour ${contactId} (${updateResponse.status}).`, data: null };
    }
    const updatedContactData = await updateResponse.json();

    revalidatePath('/(contacts)');
    return {
      success: true,
      message: `Appel raccroché pour le contact ${contactId}. Durée: ${dureeAppelFormatted}.`,
      data: updatedContactData,
    };

  } catch (error) {
    console.error("[Server Action] Erreur globale dans hangUpCallAction:", error);
    let message = "Erreur technique lors du raccrochage.";
    if (error instanceof Error) message = error.message;
    return { success: false, message, data: null };
  }
}