import { AxiosError } from 'axios';

export interface ApiErrorBody {
  error?: string;
  message?: string;
  details?: unknown;
}

/** Extracts the server's `{ error, message }` envelope from an Axios error. */
export function apiError(err: unknown): ApiErrorBody & { status?: number } {
  const ax = err as AxiosError<ApiErrorBody>;
  return { ...(ax.response?.data ?? {}), status: ax.response?.status };
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  const ax = err as AxiosError<ApiErrorBody>;
  if (ax?.response?.data?.message) {
    const details = ax.response.data.details;
    // Surface the first field-level validation message when present.
    if (Array.isArray(details) && details[0]?.message) {
      return `${ax.response.data.message}: ${details[0].path ? details[0].path + ' — ' : ''}${details[0].message}`;
    }
    return ax.response.data.message;
  }
  if (ax?.code === 'ERR_NETWORK') return 'Cannot reach the server. Check your connection and that the API is running.';
  return fallback;
}
