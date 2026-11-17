import type { Role } from '../types';

/** Mirrors the server's authorize() rules so the UI only offers allowed actions. */
export const canManageInventory = (role?: Role) => role === 'ADMIN' || role === 'MANAGER';
export const canChangeOrderStatus = canManageInventory;
export const canViewAudit = canManageInventory;
export const isAdmin = (role?: Role) => role === 'ADMIN';
