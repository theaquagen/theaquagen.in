// Allow-list fallback (you can add more UIDs later)
export const ALLOWED_ADMIN_UIDS = new Set([
  "MJpNvHSxxnfpceCfu0pefAXsg352",
  "ENx4zLUxIrRadtFIXiEdRJB6aFn2",
]);

export function isAllowListedAdmin(uid) {
  return Boolean(uid && ALLOWED_ADMIN_UIDS.has(uid));
}

// Interpret RBAC from custom claims first; fallback to allow-list
export function inferRoleFromClaims(user, claims) {
  // If you set custom claims like { role: "admin" }
  const claimRole = claims?.role;
  if (claimRole) return claimRole;
  return isAllowListedAdmin(user?.uid) ? "admin" : "user";
}

export const APP_NAME = "The Aqua Gen";