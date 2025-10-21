// src/pages/user/Signup.jsx
import { useState } from "react";
import { auth, db } from "../../../firebase";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { useNavigate } from "react-router-dom";

export default function Signup() {
  const [form, setForm] = useState({
    firstName: "", lastName: "", dateOfBirth: "",
    district: "", phone: "", email: "", password: ""
  });
  
  const [err, setErr] = useState("");
  
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);

    // Prevent route-guards from bouncing us away mid-write
    sessionStorage.setItem("BLOCK_AUTH_REDIRECT", "1");

    try {
      // 1) Auth
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid = cred.user.uid;

      // 2) Firestore (no avatar yet)
      await setDoc(doc(db, "users", uid), {
        firstName: form.firstName,
        lastName: form.lastName,
        dateOfBirth: form.dateOfBirth,
        district: form.district,
        phone: form.phone,
        email: form.email,
        role: "user",
        // avatar fields omitted (or set to null if you prefer):
        // avatarOriginalURL: null,
        // avatarOptimizedURL: null,
        createdAt: serverTimestamp(),
      });

      // 3) Auth profile (no photoURL yet)
      await updateProfile(cred.user, {
        displayName: `${form.firstName} ${form.lastName}`.trim(),
      });

      // 4) Redirect Home
      nav("/", { replace: true });
    } catch (e) {
      console.error("Signup error:", e);
      setErr(e.message || "Something went wrong.");
    } finally {
      sessionStorage.removeItem("BLOCK_AUTH_REDIRECT");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Signup</h1>
      <form onSubmit={onSubmit} className="space-y-3 bg-white p-4 rounded-lg border">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm">First Name</label>
            <Input name="firstName" value={form.firstName} onChange={onChange} required />
          </div>
          <div>
            <label className="text-sm">Last Name</label>
            <Input name="lastName" value={form.lastName} onChange={onChange} required />
          </div>
        </div>
        <div>
          <label className="text-sm">Date of Birth</label>
          <Input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={onChange} required />
        </div>
        <div>
          <label className="text-sm">District</label>
          <Input name="district" value={form.district} onChange={onChange} required />
        </div>
        <div>
          <label className="text-sm">Phone</label>
          <Input type="tel" name="phone" value={form.phone} onChange={onChange} required />
        </div>
        <div>
          <label className="text-sm">Email</label>
          <Input type="email" name="email" value={form.email} onChange={onChange} required />
        </div>
        <div>
          <label className="text-sm">Password</label>
          <Input type="password" name="password" value={form.password} onChange={onChange} required />
        </div>

        {err && <p className="text-red-600 text-sm">{err}</p>}
        <Button type="submit" className="w-full" disabled={loading} loading={loading} loadingText="Creating account…">
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </div>
  );
}
