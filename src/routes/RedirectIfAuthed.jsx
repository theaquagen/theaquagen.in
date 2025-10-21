// src/routes/RedirectIfAuthed.jsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RedirectIfAuthed({ adminOnly = false, target = "/" }) {
  const { user, role, loading } = useAuth();
  if (loading) return null;

  const blockRedirect =
    typeof window !== "undefined" && sessionStorage.getItem("BLOCK_AUTH_REDIRECT") === "1";

  if (!user || blockRedirect) return <Outlet />;

  if (adminOnly) {
    return role === "admin" ? <Navigate to={target} replace /> : <Outlet />;
  }
  return <Navigate to={target} replace />;
}