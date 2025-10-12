import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { publicLogout } from "../../lib/firebase/authPublic";

export default function HeaderPublic() {
  const { user, loading } = useAuth();

  const handleLogout = async () => {
    try {
      await publicLogout();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <header className="border-b bg-white">
      <div className="container mx-auto p-4 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg">The Aqua Gen</Link>

        {loading ? (
          <nav className="flex gap-4 items-center">
            <Link to="/about" className="hover:text-blue-600">About</Link>
            <span className="h-5 w-16 rounded bg-gray-200 animate-pulse" />
            <span className="h-5 w-20 rounded bg-gray-200 animate-pulse" />
          </nav>
        ) : !user ? (
          <nav className="flex gap-4">
            <Link to="/about" className="hover:text-blue-600">About</Link>
            <Link to="/login" className="hover:text-blue-600">Login</Link>
            <Link to="/signup" className="font-semibold hover:text-blue-600">Sign Up</Link>
          </nav>
        ) : (
          <nav className="flex gap-4 items-center">
            <Link to="/about" className="hover:text-blue-600">About</Link>
            <Link to="/profile" className="hover:text-blue-600">Profile</Link>
            <button onClick={handleLogout} className="text-red-600 hover:underline">Logout</button>
          </nav>
        )}
      </div>
    </header>
  );
}