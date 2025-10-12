import { useState } from "react";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import FormField from "../../../components/ui/FormField";
import { adminSignInEmail, adminLogout } from "../../../lib/firebase/authAdmin";
import { useNavigate } from "react-router-dom";
import { isAllowListedAdmin } from "../../../utils/constants";

export default function AdminLogin() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const cred = await adminSignInEmail(form.email, form.password);
      const uid = cred.user?.uid;

      // RBAC: allow-list fallback (you can also use custom claims in ProtectedRouteAdmin)
      if (!isAllowListedAdmin(uid)) {
        await adminLogout();
        setErr("Your account is not authorized for admin access.");
        return;
      }

      // ✅ Success: go to Admin Dashboard
      nav("/admin", { replace: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto bg-white p-6 shadow rounded-lg w-full">
      <h1 className="text-2xl font-bold mb-4 text-center">Admin Login</h1>
      <form className="space-y-3" onSubmit={onSubmit}>
        <FormField label="Admin Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </FormField>
        <FormField label="Password">
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
          />
        </FormField>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </Button>
      </form>
    </div>
  );
}