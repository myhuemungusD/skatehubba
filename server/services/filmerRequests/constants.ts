/**
 * Filmer Request Service — Constants
 */

export const TRUST_LEVEL_REQUIRED = 1;
export const REQUESTS_PER_DAY_LIMIT = 10;
export const RESPONSES_PER_DAY_LIMIT = 50;
export const COUNTER_RETENTION_DAYS = 7;

export const formatDateKey = (date: Date): string => date.toISOString().slice(0, 10);
