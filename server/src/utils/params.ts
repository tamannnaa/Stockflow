import { HttpError } from './httpError';

/** Parses a positive integer route param; 400 instead of letting NaN reach Prisma (which would 500). */
export function parseId(raw: string | undefined, name = 'id'): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw HttpError.badRequest(`Invalid ${name}`);
  return id;
}
