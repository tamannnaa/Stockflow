import { z } from 'zod';

/** Empty strings from forms mean "no value". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();

// Indian GST identification number: 2-digit state code + PAN (10) + entity + 'Z' + checksum.
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Full customer payload — used for POST and PUT. PUT replaces the record, so an
 * omitted optional field is cleared (set to null).
 */
export const customerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  companyName: optionalText(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .refine((v) => v == null || z.string().email().safeParse(v).success, 'Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .refine((v) => v == null || /^[+\d][\d\s()-]{5,}$/.test(v), 'Enter a valid phone number'),
  address: optionalText(300),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .refine((v) => v == null || GSTIN_RE.test(v), 'GSTIN must be 15 characters, e.g. 27AAPFU0939F1ZV'),
});

export const listCustomersQuery = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  sort: z.enum(['name', 'createdAt', 'orders', 'totalSpent', 'lastOrderAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuery>;
