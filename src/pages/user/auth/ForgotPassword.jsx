// src/pages/user/ForgotPassword.jsx
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../../firebase";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  
  const [msg, setMsg] = useState("");
  
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(""); setMsg("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg("Password reset email sent.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Forgot Password</h1>
      <form onSubmit={onSubmit} className="space-y-3 bg-white p-4 rounded-lg border">
        <div>
          <label className="text-sm">Email</label>
          <Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        </div>
        {msg && <p className="text-green-700 text-sm">{msg}</p>}
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <Button type="submit" className="w-full" loading={loading} loadingText="Sending reset email…">Send reset email</Button>
      </form>
    </div>
  );
}