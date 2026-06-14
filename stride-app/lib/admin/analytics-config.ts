// Client-safe period config (no prisma import) — safe to import from 'use client' components.
export const PERIOD_VALUES = [7, 30, 90] as const;
export type Period = (typeof PERIOD_VALUES)[number];
export const DEFAULT_PERIOD: Period = 30;
