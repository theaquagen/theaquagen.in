import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function GuestOnlyPublic({ redirectTo = "/", children }) {
  const { user, loading } = useAuth();
  if (loading) return null;            // wait for session restore
  if (user) return <Navigate to={redirectTo} replace />;
  return children ?? <Outlet />;
}