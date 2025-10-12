import { Link } from "react-router-dom";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { useAdminRole } from "../../hooks/useAdminRole";
import { adminLogout } from "../../lib/firebase/authAdmin";

export default function HeaderAdmin() {
  const { user, loading } = useAdminAuth();
  const { role } = useAdminRole(); // "admin" | "user" | null

  const handleLogout = async () => {
    try {
      await adminLogout();
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  return (
    <header className="border-b bg-gray-100">
      <div className="container mx-auto p-4 flex items-center justify-between">
        <Link to="/admin" className="font-bold">Admin • The Aqua Gen</Link>

        {loading ? (
          <nav className="flex gap-4 items-center">
            <span className="h-5 w-16 rounded bg-gray-200 animate-pulse" />
            <span className="h-5 w-20 rounded bg-gray-200 animate-pulse" />
          </nav>
        ) : user && role === "admin" ? (
          <nav className="flex gap-4 items-center">
            <Link to="/admin/users">Users</Link>
            <button onClick={handleLogout} className="underline">Logout</button>
          </nav>
        ) : (
          <nav className="flex gap-4 items-center">
            <Link to="/admin/login" className="underline">Admin Login</Link>
          </nav>
        )}
      </div>
    </header>
  );
}