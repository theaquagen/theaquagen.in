import { useUserRole } from "../hooks/useUserRole";
export default function RoleGate({ allow = [], children, fallback = null }) {
  const { role } = useUserRole();
  if (!allow.includes(role)) return fallback;
  return children;
}