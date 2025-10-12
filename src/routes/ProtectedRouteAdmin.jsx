import { Navigate, Outlet } from "react-router-dom";
import { useAdminRole } from "../hooks/useAdminRole";

export default function ProtectedRouteAdmin({ requireRole = "admin", children }) {
  const { role, loading } = useAdminRole();

  if (loading) return null; // or a spinner
  if (!role) return <Navigate to="/admin/login" replace />;
  if (requireRole && role !== requireRole) return <Navigate to="/admin/login" replace />;

  return children ?? <Outlet />;
}
