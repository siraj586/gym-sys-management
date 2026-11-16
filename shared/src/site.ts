import { z } from 'zod';
import type { Plan } from './membership.js';

// Validation messages are translation keys, as in auth.ts.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.tooLong')
    .nullish()
    .transform((value) => (value ? value : null));

/** What the coach edits on the Settings page. */
export const settingsInputSchema = z.object({
  businessName: z.string().trim().min(1, 'validation.required').max(80, 'validation.tooLong'),
  coachName: optionalText(80),
  coachBio: optionalText(2000),
  address: optionalText(200),
  phone: optionalText(40),
  instagram: optionalText(80),
  openingHours: optionalText(200),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'validation.currency'),
  timezone: z
    .string()
    .trim()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'validation.timezone'),
});
export type SettingsFormInput = z.input<typeof settingsInputSchema>;
export type SettingsInput = z.output<typeof settingsInputSchema>;

export interface SiteContent {
  businessName: string;
  coachName: string | null;
  coachBio: string | null;
  address: string | null;
  phone: string | null;
  instagram: string | null;
  openingHours: string | null;
  currency: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  caption: string | null;
}

/** Everything the public home page shows, in one request. */
export interface PublicSite extends SiteContent {
  plans: Plan[];
  gallery: GalleryImage[];
}

export const galleryInputSchema = z.object({
  url: z
    .string()
    .trim()
    .url('validation.url')
    .refine((u) => u.startsWith('https://'), 'validation.url'),
  caption: optionalText(120),
});

export const contactInputSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(80, 'validation.tooLong'),
  contact: z.string().trim().min(3, 'validation.required').max(120, 'validation.tooLong'),
  message: z.string().trim().min(1, 'validation.required').max(2000, 'validation.tooLong'),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export interface ContactMessage extends ContactInput {
  id: string;
  isRead: boolean;
  createdAt: string;
}
