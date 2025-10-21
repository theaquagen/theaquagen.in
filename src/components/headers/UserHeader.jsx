import { Link, useLocation } from "react-router-dom";
import Button from "../ui/Button";
import { useAuth } from "../../context/AuthContext";

export default function UserHeader() {
    const { user, logout } = useAuth();
    const loc = useLocation();
    return (
        <header className="border-b bg-white">
            <div className="mx-auto max-w-5xl flex items-center justify-between p-4">
                <Link to="/" className="font-semibold">MyApp</Link>
                {!user ? (
                    <nav className="flex items-center gap-3">
                        <Link to="/login"><Button>Login</Button></Link>
                        <Link to="/signup"><Button variant="outline">Signup</Button></Link>
                    </nav>
                    ) : (
                    <nav className="flex items-center gap-3">
                        <Link to="/about" className="hover:underline">About</Link>
                        <Link to="/marketplace" className="hover:underline">Marketplace</Link>
                        {loc.pathname !== "/profile" && <Link to="/profile" className="hover:underline">Profile</Link>}
                        <Button onClick={logout}>Logout</Button>
                    </nav>
                )}
            </div>
        </header>
    );
}