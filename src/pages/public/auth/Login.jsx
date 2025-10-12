import { useState } from "react";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import FormField from "../../../components/ui/FormField";
import { publicSignInEmail } from "../../../lib/firebase/authPublic";
import { useNavigate } from "react-router-dom";

export default function PublicLogin() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await publicSignInEmail(form.email, form.password);
      nav("/", { replace: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">Public Login</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <FormField label="Email">
          <Input type="email" value={form.email} onChange={e=>setForm(f=>({...f, email:e.target.value}))} required />
        </FormField>
        <FormField label="Password">
          <Input type="password" value={form.password} onChange={e=>setForm(f=>({...f, password:e.target.value}))} required />
        </FormField>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <Button type="submit" disabled={loading}>{loading ? "Logging in..." : "Login"}</Button>
      </form>
    </div>
  );
}
