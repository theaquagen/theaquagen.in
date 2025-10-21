// src/pages/admin/AdminLogin.jsx
import { useState } from "react";
import { auth, db } from "../../../firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { useNavigate } from "react-router-dom";

export default function AdminLogin() {
    const [email, setEmail] = useState("");
    const [pw, setPw] = useState("");
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);
    
    const nav = useNavigate();

    const onSubmit = async (e) => {
        e.preventDefault();
        setErr("");
        setLoading(true);
        try {
            const cred = await signInWithEmailAndPassword(auth, email, pw);
            const snap = await getDoc(doc(db, "users", cred.user.uid));
            if (!snap.exists() || snap.data().role !== "admin") {
                await signOut(auth);
                throw new Error("This account is not an admin.");
            }
            nav("/admin/dashboard", { replace: true });
        } catch (e) {
            setErr(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-md space-y-4">
            <h1 className="text-xl font-semibold">Admin Login</h1>
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
                <Button type="submit" className="w-full" loading={loading} loadingText="Logging in…">Login</Button>
            </form>
        </div>
    );
}
