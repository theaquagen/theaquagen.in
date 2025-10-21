import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAuth() {
    const { user, loading } = useAuth();
    const loc = useLocation();
    if (loading) return null;
    return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: loc }} />;
}
