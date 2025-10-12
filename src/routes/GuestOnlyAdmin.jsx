import { Navigate, Outlet } from "react-router-dom";
import { useAdminRole } from "../hooks/useAdminRole";

export default function GuestOnlyAdmin({ redirectTo = "/admin", children }) {
  const { role, loading } = useAdminRole();
  if (loading) return null;            // wait for admin session/claims
  if (role === "admin") return <Navigate to={redirectTo} replace />;
  return children ?? <Outlet />;
}