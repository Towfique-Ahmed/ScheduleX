import type { Role } from './store.ts';

export const ROLES: Role[] = ['viewer', 'contributor', 'editor', 'admin', 'owner'];
const rank = (r: Role) => ROLES.indexOf(r);

/** True when `role` is at least `min` in the hierarchy viewer < contributor < editor < admin < owner. */
export const atLeast = (role: Role, min: Role) => rank(role) >= rank(min);

/**
 * viewer       read only
 * contributor  create drafts, submit posts for approval
 * editor       schedule/publish directly, approve or reject, manage media and categories
 * admin        connect accounts, queue slots, manage members
 * owner        everything, including managing admins
 */
export const can = {
  draft: (r: Role) => atLeast(r, 'contributor'),
  publishDirectly: (r: Role) => atLeast(r, 'editor'),
  approve: (r: Role) => atLeast(r, 'editor'),
  manageCategories: (r: Role) => atLeast(r, 'editor'),
  deleteMedia: (r: Role) => atLeast(r, 'editor'),
  manageAccounts: (r: Role) => atLeast(r, 'admin'),
  manageSlots: (r: Role) => atLeast(r, 'admin'),
  manageMembers: (r: Role) => atLeast(r, 'admin'),
};

/** Admins can manage anyone below owner; only the owner can manage other admins or promote to admin. */
export const canAssign = (actor: Role, target: Role) => (actor === 'owner' ? target !== 'owner' : actor === 'admin' && rank(target) < rank('admin'));
