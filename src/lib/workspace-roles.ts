import type { WorkspaceRole } from "@prisma/client";

export type WorkspacePermission =
  | "workspace.manage"
  | "events.manage"
  | "attendees.manage"
  | "checkin.perform"
  | "checkin.pair_device"
  | "billing.manage";

export type DashboardSection =
  | "overview"
  | "events"
  | "attendees"
  | "tickets"
  | "check-in"
  | "reports"
  | "files"
  | "billing"
  | "settings";

const permissionsByRole: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  OWNER: ["workspace.manage", "events.manage", "attendees.manage", "checkin.perform", "checkin.pair_device", "billing.manage"],
  ADMIN: ["workspace.manage", "events.manage", "attendees.manage", "checkin.perform", "checkin.pair_device"],
  MANAGER: ["events.manage", "attendees.manage", "checkin.perform"],
  CHECKIN: ["checkin.perform", "checkin.pair_device"],
  VIEWER: [],
};

export const workspaceRoleDetails: Record<WorkspaceRole, { label: string; description: string }> = {
  OWNER: {
    label: "Owner",
    description: "Full workspace access, including members, settings, events, attendees, files, check-in, and billing.",
  },
  ADMIN: {
    label: "Admin",
    description: "Manage members, settings, events, attendees, files, and check-in. Billing is owner-only.",
  },
  MANAGER: {
    label: "Manager",
    description: "Manage events, attendees, check-in, and event/shared files. Cannot manage members, workspace settings, or billing.",
  },
  CHECKIN: {
    label: "Check-in",
    description: "Use check-in tools and pair event-scoped phones. Other dashboard sections are restricted.",
  },
  VIEWER: {
    label: "Viewer",
    description: "Read-only access to workspace pages. Cannot create, edit, import, or check in.",
  },
};

export function workspaceRoleHasPermission(role: WorkspaceRole, permission: WorkspacePermission) {
  return permissionsByRole[role].includes(permission);
}

export function workspaceRoleCanManageFiles(role: WorkspaceRole) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
}

export function workspaceRoleCanAccessSection(role: WorkspaceRole, section: DashboardSection) {
  if (role === "CHECKIN") return section === "check-in";
  if (section === "check-in") return workspaceRoleHasPermission(role, "checkin.perform");
  if (section === "billing") return workspaceRoleHasPermission(role, "billing.manage");
  return true;
}

export function workspaceRoleHome(role: WorkspaceRole) {
  return role === "CHECKIN" ? "/dashboard/check-in" : "/dashboard";
}
