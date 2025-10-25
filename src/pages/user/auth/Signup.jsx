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
import { useToast } from "../../../components/Toast/ToastProvider"; // 👈 add toast hook

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
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" ");
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");
const last4Digits = (s) => onlyDigits(s).slice(-4);

function validateSlugBasic(s) {
  const v = slugify(s);
  if (v.length < 3 || v.length > 30) return { ok: false, msg: "Slug must be 3–30 chars." };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(v))
    return { ok: false, msg: "Only a–z, 0–9, hyphens; no leading/trailing hyphen." };
  if (/--/.test(v)) return { ok: false, msg: "No consecutive hyphens." };
  return { ok: true, value: v };
}

/** India-only phone helpers */
function formatINPhoneUI(value) {
  const d = onlyDigits(value);
  const d10 = d.replace(/^91/, "");
  const digits = d10.slice(0, 10);
  const a = digits.slice(0, 5);
  const b = digits.slice(5, 10);
  let out = "+91";
  if (a) out += " " + a;
  if (b) out += " " + b;
  return out.trim();
}
function toE164IN(value) {
  const d = onlyDigits(value).replace(/^91/, "");
  const digits = d.slice(-10);
  return digits.length === 10 ? `+91${digits}` : "+91";
}

/* ──────────────────────────────────────────────────────────────
   Name-aligned slug logic
   ────────────────────────────────────────────────────────────── */
function nameTokens(str) {
  // slugify then split into tokens
  return slugify(str).split("-").filter(Boolean);
}
/**
 * Require slug to START with an aligned prefix containing at least TWO tokens
 * from the user's first/last name, in either (first... then last...) OR (last... then first...) order.
 * Extra suffix after that prefix is allowed.
 */
function isSlugNameAligned(slug, firstName, lastName) {
  const tokensSlug = slugify(slug).split("-").filter(Boolean);
  if (tokensSlug.length < 2) return false;

  const f = nameTokens(firstName);
  const l = nameTokens(lastName);
  if (f.length === 0 && l.length === 0) return false;

  function matchPrefix(seqA, seqB) {
    const seq = [...seqA, ...seqB];
    let i = 0; // position in seq
    let matched = 0; // matched tokens count in prefix
    for (let k = 0; k < tokensSlug.length; k++) {
      if (i < seq.length && tokensSlug[k] === seq[i]) {
        matched++;
        i++;
        // continue; still matching aligned prefix
      } else {
        // as soon as we break alignment, stop counting; rest is suffix
        break;
      }
    }
    return matched >= 2; // need at least 2 aligned tokens
  }

  return matchPrefix(f, l) || matchPrefix(l, f);
}

export default function Signup() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    phone: "",
    email: "",
    password: "",
  });

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const { showToast } = useToast(); // 👈 toast

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const claimSlugForUser = async (uid, firstName, lastName, dob, phoneRaw, email) => {
    // build aligned bases: first-last and last-first (can include multiple tokens)
    const f = nameTokens(firstName);
    const l = nameTokens(lastName);
    const primary = [...f, ...l].join("-") || slugify((email || "").split("@")[0] || `user-${uid.slice(0,6)}`);
    const alt = [...l, ...f].join("-");

    const birth = ddmmFromDOB(dob);
    const last4 = last4Digits(phoneRaw);

    const tryClaim = async (slug) => {
      const chk = validateSlugBasic(slug);
      if (!chk.ok) return null;
      if (!isSlugNameAligned(chk.value, firstName, lastName)) return null;

      const ref = doc(db, "usernames", chk.value);
      const snap = await getDoc(ref);
      if (snap.exists()) return null;
      await setDoc(ref, { uid });
      return chk.value;
    };

    const candidates = [
      primary, alt,
      birth ? `${primary}-${birth}` : null,
      birth ? `${alt}-${birth}` : null,
      birth && last4 ? `${primary}-${birth}${last4}` : null,
      birth && last4 ? `${alt}-${birth}${last4}` : null,
      last4 ? `${primary}-${last4}` : null,
      last4 ? `${alt}-${last4}` : null,
    ].filter(Boolean);

    for (const c of candidates) {
      const got = await tryClaim(c);
      if (got) return got;
    }

    // random fallback keeping aligned prefix
    for (let i = 0; i < 10; i++) {
      const sfx = Math.floor(100 + Math.random() * 900);
      const got = await tryClaim(`${primary}-${sfx}`) || await tryClaim(`${alt}-${sfx}`);
      if (got) return got;
    }
    throw new Error("Could not create a unique username. Try again.");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);

    // prevent auth redirect race
    sessionStorage.setItem("BLOCK_AUTH_REDIRECT", "1");

    try {
      // India-only phone validation
      const d = onlyDigits(form.phone).replace(/^91/, "");
      if (d.length !== 10) {
        const msg = "Enter a valid 10-digit Indian mobile number.";
        setErr(msg);
        showToast(msg, "error"); // 👈 validation toast
        setLoading(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const uid = cred.user.uid;

      const phoneE164 = toE164IN(form.phone);
      const displayName = toTitleCaseName(`${form.firstName} ${form.lastName}`.trim());

      await setDoc(doc(db, "users", uid), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth,
        phone: formatINPhoneUI(form.phone),
        phoneE164,
        phoneCountryCode: "+91",
        email: form.email.trim(),
        role: "user",
        createdAt: serverTimestamp(),
        recentLocations: [],
        nameChangeCount: 0,
        nameChangeHistory: [], // will record future changes
      });

      const sellerSlug = await claimSlugForUser(
        uid, form.firstName, form.lastName, form.dateOfBirth, form.phone, form.email
      );

      if (sellerSlug) {
        showToast(`Your username “${sellerSlug}” is reserved.`, "success"); // 👈 username toast
      }

      await setDoc(
        doc(db, "profiles", uid),
        { displayName, avatar: "", sellerSlug },
        { merge: true }
      );
      await updateProfile(cred.user, { displayName });

      showToast(`Account created! Welcome, ${displayName}.`, "success"); // 👈 success toast
      nav("/", { replace: true });
    } catch (e2) {
      console.error("Signup error:", e2);
      const msg = e2?.message || "Something went wrong.";
      setErr(msg);
      showToast(`Signup failed: ${msg}`, "error"); // 👈 error toast
    } finally {
      sessionStorage.removeItem("BLOCK_AUTH_REDIRECT");
      setLoading(false);
    }
  };

  return (
    <main className="overflow-hidden bg-gray-50">
      <GradientBackground />
      <div className="isolate flex min-h-dvh items-center justify-center p-6 lg:p-8">
        <div className="w-full max-w-2xl rounded-xl bg-white shadow-md ring-1 ring-black/5">
          <form onSubmit={onSubmit} className="p-8 sm:p-10">
            <h1 className="text-base/6 font-medium">Create your account</h1>
            <p className="mt-1 text-sm/5 text-gray-600">Fill in your details below to get started.</p>

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

            <div className="mt-5">
              <Field className="space-y-2">
                <Label className="text-sm/5 font-medium">Phone (India)</Label>
                <Input
                  type="tel"
                  name="phone"
                  placeholder="+91 98765 43210"
                  value={formatINPhoneUI(form.phone)}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                  className="block w-full rounded-lg shadow-sm ring-1 ring-black/10 border border-transparent px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-sm/6 data-focus:outline-2 data-focus:-outline-offset-1 data-focus:outline-black"
                />
                <p className="text-xs text-gray-500">
                  Stored as E.164: <code>{toE164IN(form.phone)}</code>
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

          <div className="m-2 rounded-lg bg-gray-50 py-4 text-center text-sm/5 ring-1 ring-black/5">
            Already have an account?{" "}
            <Link to="/login" className="font-medium hover:text-gray-600">Sign in</Link>
          </div>
        </div>
      </div>
    </main>
  );
}