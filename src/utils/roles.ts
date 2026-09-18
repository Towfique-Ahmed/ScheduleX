import { Role } from '../types';

const ORDER: Role[] = ['viewer', 'contributor', 'editor', 'admin', 'owner'];
const atLeast = (r: Role, min: Role) => ORDER.indexOf(r) >= ORDER.indexOf(min);

/** Mirrors server/roles.ts. The server enforces these; the UI uses them to hide what you can't do. */
export const perms = (role: Role) => ({
  draft: atLeast(role, 'contributor'),
  publishDirectly: atLeast(role, 'editor'),
  approve: atLeast(role, 'editor'),
  manageCategories: atLeast(role, 'editor'),
  deleteMedia: atLeast(role, 'editor'),
  manageAccounts: atLeast(role, 'admin'),
  manageSlots: atLeast(role, 'admin'),
  manageMembers: atLeast(role, 'admin'),
});

export const ROLE_LABELS: Record<Role, { label: string; help: string }> = {
  owner: { label: 'Owner', help: 'Full control, including admins' },
  admin: { label: 'Admin', help: 'Connect accounts, queue times, manage team' },
  editor: { label: 'Editor', help: 'Publish, schedule, approve posts' },
  contributor: { label: 'Contributor', help: 'Write drafts and submit for approval' },
  viewer: { label: 'Viewer', help: 'Read-only' },
};

/** Roles the actor may hand out (owners can't be created through invites). */
export const assignableRoles = (actor: Role): Role[] =>
  actor === 'owner' ? ['editor', 'contributor', 'viewer', 'admin'] : actor === 'admin' ? ['editor', 'contributor', 'viewer'] : [];
