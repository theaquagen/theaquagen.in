import { useState } from "react";
import { auth, db } from "../../../firebase";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import Button from "../../../components/ui/Button";
import { useNavigate, Link } from "react-router-dom";

import { Field, Input, Label } from "@headlessui/react";
import clsx from "clsx";
import { GradientBackground } from "../../../components/ui/Gradient";

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
  } catch {
    return "";
  }
}
const toTitleCaseName = (str) =>
  String(str || "")
    .trim()
    .split(/\s+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" ");
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");
const last4Digits = (s) => onlyDigits(s).slice(-4);
const validateSlug = (s) => {
  const v = slugify(s);
  if (v.length < 3 || v.length > 30)
    return { ok: false, msg: "Slug must be 3–30 chars." };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(v))
    return {
      ok: false,
      msg: "Only a–z, 0–9, hyphens; no leading/trailing hyphen.",
    };
  if (/--/.test(v)) return { ok: false, msg: "No consecutive hyphens." };
  return { ok: true, value: v };
};

export default function Signup() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    district: "",
    countryCode: "+91",
    phone: "",
    email: "",
    password: "",
  });

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const claimSlugForUser = async (
    uid,
    firstName,
    lastName,
    dob,
    phoneRaw,
    email
  ) => {
    const baseName = `${(firstName || "").trim()} ${(lastName || "").trim()}`.trim();
    const base = slugify(
      baseName || (email || "").split("@")[0] || `user-${uid.slice(0, 6)}`
    );
    const birth = ddmmFromDOB(dob);
    const last4 = last4Digits(phoneRaw);

    const tryClaim = async (slug) => {
      const chk = validateSlug(slug);
      if (!chk.ok) return null;
      const ref = doc(db, "usernames", chk.value);
      const snap = await getDoc(ref);
      if (snap.exists()) return null;
      await setDoc(ref, { uid });
      return chk.value;
    };

    let chosen = await tryClaim(base);
    if (!chosen && birth) chosen = await tryClaim(`${base}-${birth}`);
    if (!chosen && birth && last4)
      chosen = await tryClaim(`${base}-${birth}${last4}`);
    if (!chosen && !birth && last4) chosen = await tryClaim(`${base}-${last4}`);
    for (let i = 0; !chosen && i < 10; i++) {
      const sfx = Math.floor(100 + Math.random() * 900);
      chosen = await tryClaim(`${base}-${sfx}`);
    }
    if (!chosen)
      throw new Error("Could not create a unique username. Try again.");
    return chosen;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);

    sessionStorage.setItem("BLOCK_AUTH_REDIRECT", "1");

    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        form.email,
        form.password
      );
      const uid = cred.user.uid;

      const nationalDigits = onlyDigits(form.phone);
      const phoneE164 = `${form.countryCode}${nationalDigits}`;

      const displayName = toTitleCaseName(
        `${form.firstName} ${form.lastName}`.trim()
      );
      await setDoc(doc(db, "users", uid), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth,
        district: form.district.trim(),
        countryCode: form.countryCode,
        phone: form.phone.trim(),
        phoneE164,
        email: form.email.trim(),
        role: "user",
        createdAt: serverTimestamp(),
      });

      const sellerSlug = await claimSlugForUser(
        uid,
        form.firstName,
        form.lastName,
        form.dateOfBirth,
        form.phone,
        form.email
      );

      await setDoc(
        doc(db, "profiles", uid),
        {
          displayName,
          avatar: "",
          sellerSlug,
        },
        { merge: true }
      );

      await updateProfile(cred.user, { displayName });
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
    <main className="overflow-hidden bg-gray-50">
      <GradientBackground />
      <div className="isolate flex min-h-dvh items-center justify-center p-6 lg:p-8">
        {/* Wider layout */}
        <div className="w-full max-w-2xl rounded-xl bg-white shadow-md ring-1 ring-black/5">
          <form onSubmit={onSubmit} className="p-8 sm:p-10">
            <h1 className="text-base/6 font-medium">Create your account</h1>
            <p className="mt-1 text-sm/5 text-gray-600">
              Fill in your details below to get started.
            </p>

            {/* Name */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field className="space-y-2">
                <Label className="text-sm/5 font-medium">First name</Label>
                <Input
                  name="firstName"
                  value={form.firstName}
                  onChange={onChange}
                  required
                  className={clsx(
                    "block w-full rounded-lg shadow-sm ring-1 ring-black/10 border border-transparent",
                    "px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm/6",
                    "data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black"
                  )}
                />
              </Field>

              <Field className="space-y-2">
                <Label className="text-sm/5 font-medium">Last name</Label>
                <Input
                  name="lastName"
                  value={form.lastName}
                  onChange={onChange}
                  required
                  className={clsx(
                    "block w-full rounded-lg shadow-sm ring-1 ring-black/10 border border-transparent",
                    "px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm/6",
                    "data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black"
                  )}
                />
              </Field>
            </div>

            <Field className="mt-5 space-y-2">
              <Label className="text-sm/5 font-medium">Date of birth</Label>
              <Input
                type="date"
                name="dateOfBirth"
                value={form.dateOfBirth}
                onChange={onChange}
                required
                className="block w-full rounded-lg shadow-sm ring-1 ring-black/10 border border-transparent px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm/6 data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black"
              />
            </Field>

            <Field className="mt-5 space-y-2">
              <Label className="text-sm/5 font-medium">District</Label>
              <Input
                name="district"
                value={form.district}
                onChange={onChange}
                required
                className="block w-full rounded-lg shadow-sm ring-1 ring-black/10 border border-transparent px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm/6 data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black"
              />
            </Field>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <Field className="space-y-2">
                <Label className="text-sm/5 font-medium">Country code</Label>
                <select
                  name="countryCode"
                  value={form.countryCode}
                  onChange={onChange}
                  className="block w-full rounded-lg border border-transparent shadow-sm ring-1 ring-black/10 bg-white px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm/6 focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-black"
                >
                  <option value="+91">🇮🇳 India (+91)</option>
                  <option value="+1">🇺🇸 United States (+1)</option>
                  <option value="+44">🇬🇧 United Kingdom (+44)</option>
                  <option value="+61">🇦🇺 Australia (+61)</option>
                  <option value="+81">🇯🇵 Japan (+81)</option>
                  <option value="+971">🇦🇪 UAE (+971)</option>
                </select>
              </Field>

              <Field className="col-span-2 space-y-2">
                <Label className="text-sm/5 font-medium">Phone</Label>
                <Input
                  type="tel"
                  name="phone"
                  placeholder="9876543210"
                  value={form.phone}
                  onChange={onChange}
                  required
                  className="block w-full rounded-lg shadow-sm ring-1 ring-black/10 border border-transparent px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm/6 data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black"
                />
                <p className="text-xs text-gray-500">
                  Will be stored as E.164:{" "}
                  <code>{form.countryCode}{onlyDigits(form.phone)}</code>
                </p>
              </Field>
            </div>

            <Field className="mt-5 space-y-2">
              <Label className="text-sm/5 font-medium">Email</Label>
              <Input
                type="email"
                name="email"
                value={form.email}
                onChange={onChange}
                required
                className="block w-full rounded-lg shadow-sm ring-1 ring-black/10 border border-transparent px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm/6 data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black"
              />
            </Field>

            <Field className="mt-5 space-y-2">
              <Label className="text-sm/5 font-medium">Password</Label>
              <Input
                type="password"
                name="password"
                value={form.password}
                onChange={onChange}
                required
                className="block w-full rounded-lg shadow-sm ring-1 ring-black/10 border border-transparent px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm/6 data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black"
              />
            </Field>

            {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

            <div className="mt-6">
              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                loading={loading}
                loadingText="Creating account…"
              >
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </div>
          </form>

          {/* Footer link */}
          <div className="m-2 rounded-lg bg-gray-50 py-4 text-center text-sm/5 ring-1 ring-black/5">
            Already have an account?{" "}
            <Link to="/login" className="font-medium hover:text-gray-600">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
