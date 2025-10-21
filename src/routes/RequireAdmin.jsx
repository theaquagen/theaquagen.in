import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAdmin() {
    const { user, role, loading } = useAuth();
    if (loading) return null;
    return user && role === "admin" ? <Outlet /> : <Navigate to="/admin/login" replace />;
}