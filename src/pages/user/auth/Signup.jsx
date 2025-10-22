import { useState } from "react";
import { auth, db } from "../../../firebase";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import { useNavigate } from "react-router-dom";

/* ──────────────────────────────────────────────────────────────
   Helpers (match Profile.jsx behavior)
   ────────────────────────────────────────────────────────────── */
function slugify(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}
function ddmmFromDOB(dob) {
  try {
    let d;
    if (!dob) return "";
    if (typeof dob === "string") {
      const m = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      d = m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`) : new Date(dob);
    } else if (typeof dob?.toDate === "function") d = dob.toDate();
    else if (dob instanceof Date) d = dob;
    else if (typeof dob === "number") d = new Date(dob);
    if (!d || isNaN(d.getTime())) return "";
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}${mm}`;
  } catch { return ""; }
}
const toTitleCaseName = (str) =>
  String(str || "")
    .trim()
    .split(/\s+/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" ");
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");
const last4Digits = (s) => onlyDigits(s).slice(-4);
const validateSlug = (s) => {
  const v = slugify(s);
  if (v.length < 3 || v.length > 30) return { ok: false, msg: "Slug must be 3–30 chars." };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(v)) return { ok: false, msg: "Only a–z, 0–9, hyphens; no leading/trailing hyphen." };
  if (/--/.test(v)) return { ok: false, msg: "No consecutive hyphens." };
  return { ok: true, value: v };
};

export default function Signup() {
  const [form, setForm] = useState({
    firstName: "", lastName: "", dateOfBirth: "",
    district: "",
    countryCode: "+91",   // explicit country code (default India)
    phone: "",
    email: "", password: ""
  });
  
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Claim a slug in /usernames and return the final value using the recipe:
  // 1) first-last
  // 2) first-last-<ddmm>
  // 3) first-last-<ddmm><last4>
  // Fallback: first-last-<random3>
  const claimSlugForUser = async (uid, firstName, lastName, dob, phoneRaw, email) => {
    const baseName = `${(firstName || "").trim()} ${(lastName || "").trim()}`.trim();
    const base = slugify(baseName || (email || "").split("@")[0] || `user-${uid.slice(0,6)}`);
    const birth = ddmmFromDOB(dob);
    const last4 = last4Digits(phoneRaw);

    const tryClaim = async (slug) => {
      const chk = validateSlug(slug);
      if (!chk.ok) return null;
      const ref = doc(db, "usernames", chk.value);
      const snap = await getDoc(ref);
      if (snap.exists()) return null; // taken by someone
      await setDoc(ref, { uid });     // claim
      return chk.value;
    };

    // 1) base
    let chosen = await tryClaim(base);
    // 2) base-ddmm
    if (!chosen && birth) chosen = await tryClaim(`${base}-${birth}`);
    // 3) base-ddmm<last4>  (no hyphen before last4)
    if (!chosen && birth && last4) chosen = await tryClaim(`${base}-${birth}${last4}`);
    // If no DOB, try base-<last4>
    if (!chosen && !birth && last4) chosen = await tryClaim(`${base}-${last4}`);
    // final fallback: random 3-digit
    for (let i = 0; !chosen && i < 10; i++) {
      const sfx = Math.floor(100 + Math.random() * 900);
      chosen = await tryClaim(`${base}-${sfx}`);
    }
    if (!chosen) throw new Error("Could not create a unique username. Try again.");
    return chosen;
  };

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

      // 2) Normalize phone
      const nationalDigits = onlyDigits(form.phone);
      const phoneE164 = `${form.countryCode}${nationalDigits}`;

      // 3) Firestore private user (store pretty & canonical)
      const displayName = toTitleCaseName(`${form.firstName} ${form.lastName}`.trim());
      await setDoc(doc(db, "users", uid), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth,
        district: form.district.trim(),
        countryCode: form.countryCode,
        phone: form.phone.trim(),           // as typed
        phoneE164,                          // canonical
        phoneCountryCode: form.countryCode, // e.g. +91
        email: form.email.trim(),
        role: "user",
        createdAt: serverTimestamp(),
      });

      // 4) Claim slug & create public profile now (so marketplace doesn't need to)
      const sellerSlug = await claimSlugForUser(
        uid,
        form.firstName,
        form.lastName,
        form.dateOfBirth,
        form.phone,
        form.email
      );

      await setDoc(doc(db, "profiles", uid), {
        displayName,       // Title Case First Last
        avatar: "",        // no photo yet
        sellerSlug,        // claimed above
      }, { merge: true });

      // 5) Auth profile (title-cased)
      await updateProfile(cred.user, { displayName });

      // 6) Redirect Home
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

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-sm">Country Code</label>
            <select
              name="countryCode"
              value={form.countryCode}
              onChange={onChange}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="+91">🇮🇳 India (+91)</option>
              <option value="+1">🇺🇸 United States (+1)</option>
              <option value="+44">🇬🇧 United Kingdom (+44)</option>
              <option value="+61">🇦🇺 Australia (+61)</option>
              <option value="+81">🇯🇵 Japan (+81)</option>
              <option value="+971">🇦🇪 UAE (+971)</option>
              <option value="+49">🇩🇪 Germany (+49)</option>
              <option value="+33">🇫🇷 France (+33)</option>
              <option value="+86">🇨🇳 China (+86)</option>
              <option value="+94">🇱🇰 Sri Lanka (+94)</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="text-sm">Phone</label>
            <Input
              type="tel"
              name="phone"
              placeholder="9876543210"
              value={form.phone}
              onChange={onChange}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Will be stored as E.164: <code>{form.countryCode}{onlyDigits(form.phone)}</code>
            </p>
          </div>
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
