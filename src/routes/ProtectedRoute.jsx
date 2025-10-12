import { Navigate, Outlet } from "react-router-dom";
import { useUserRole } from "../hooks/useUserRole";

export default function ProtectedRoute({ requireRole, children }) {
  const { role, loading } = useUserRole();

  if (loading) return null; // or spinner
  if (!role) return <Navigate to="/login" replace />;
  if (requireRole && role !== requireRole) return <Navigate to="/" replace />;

  return children ?? <Outlet />;
}