import { z } from 'zod';

const zStringOptional = z.string().optional().nullable();

export const contactSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1, "Le prénom est requis."),
  lastName: z.string().min(1, "Le nom est requis."),
  email: z.string().email("L'adresse e-mail n'est pas valide.").optional().nullable(),
  phoneNumber: zStringOptional,
  status: zStringOptional,
  comment: zStringOptional,
  dateRappel: zStringOptional,
  heureRappel: zStringOptional,
  dateRendezVous: zStringOptional,
  heureRendezVous: zStringOptional,
  dateAppel: zStringOptional,
  heureAppel: zStringOptional,
  dureeAppel: zStringOptional,
  source: zStringOptional,
  avatarUrl: zStringOptional,
  societe: zStringOptional,
  role: zStringOptional,
  bookingDate: zStringOptional,
  bookingTime: zStringOptional,
  callStartTime: zStringOptional,
}).strict();

export const contactsSchema = z.array(contactSchema);

// Exporter le type Contact inféré
export type Contact = z.infer<typeof contactSchema>;

// Optionnellement, si vous avez aussi besoin du type pour un tableau de contacts directement
// export type Contacts = z.infer<typeof contactsSchema>; 