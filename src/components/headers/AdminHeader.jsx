import { Link } from "react-router-dom";
import Button from "../ui/Button";
import { useAuth } from "../../context/AuthContext";

export default function AdminHeader() {
    const { user, role, logout } = useAuth();
    const isAdmin = user && role === "admin";
    return (
        <header className="border-b bg-white">
            <div className="mx-auto max-w-5xl flex items-center justify-between p-4">
                <Link to="/admin" className="font-semibold">Admin</Link>
                <nav className="flex items-center gap-3">
                    <Link to="/admin/dashboard" className="hover:underline">Dashboard</Link>
                    {!isAdmin ? (
                        <Link to="/admin/login"><Button>Login</Button></Link>
                    ) : (
                        <Button onClick={logout}>Logout</Button>
                    )}
                </nav>
            </div>
        </header>
    );
}