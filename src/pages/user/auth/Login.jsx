import { useState } from "react";

import { signInWithEmailAndPassword } from "firebase/auth";

import { auth } from "../../../firebase";

import { useNavigate, useLocation, Link } from "react-router-dom";

import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";

export default function Login() {
    const [email, setEmail] = useState("");
    const [pw, setPw] = useState("");
    
    const [err, setErr] = useState("");
    
    const [loading, setLoading] = useState(false);
    
    const nav = useNavigate();
    const loc = useLocation();
    const from = loc.state?.from?.pathname || "/";

    const onSubmit = async (e) => {
        e.preventDefault();
        setErr("");
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, pw);
            nav("/", { replace: true }); // Spec: redirect Home after login
        } catch (e) {
            setErr(e.message);
        } finally {
+           setLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-md space-y-4">
            <h1 className="text-xl font-semibold">Login</h1>
            <form onSubmit={onSubmit} className="space-y-3 bg-white p-4 rounded-lg border">
                <div>
                    <label className="text-sm">Email</label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                    <label className="text-sm">Password</label>
                    <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
                </div>
                {err && <p className="text-red-600 text-sm">{err}</p>}
                <Button type="submit" className="w-full" loading={loading} loadingText="Signing in…">Sign in</Button>
                <div className="text-sm">
                    <Link to="/forgot-password" className="underline">Forgot password?</Link>
                </div>
            </form>
        </div>
    );
}
