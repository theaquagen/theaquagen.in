// src/pages/user/Profile.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { db, auth, storage } from "../../firebase";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
  collection, query, where, getDocs, writeBatch, limit as fsLimit, startAfter
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile, sendEmailVerification } from "firebase/auth";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { UserCircleIcon } from "@heroicons/react/24/solid";
import { Container } from "../../components/ui/Container";

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
const validateSlug = (s) => {
  const v = slugify(s);
  if (v.length < 3 || v.length > 30) return { ok: false, msg: "Slug must be 3–30 chars." };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(v)) return { ok: false, msg: "Only a–z, 0–9, hyphens; no leading/trailing hyphen." };
  if (/--/.test(v)) return { ok: false, msg: "No consecutive hyphens." };
  return { ok: true, value: v };
};
const toTitleCaseName = (str) =>
  String(str || "")
    .trim()
    .split(/\s+/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" ");

/** UI formatter for US phone: +1 (555) 123-4567 */
function formatUSPhone(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  const [, country, a, b, c] = digits.match(/^(1)?(\d{0,3})(\d{0,3})(\d{0,4})$/) || [];
  const cc = country === "1" ? "+1 " : "+1 ";
  let out = cc;
  if (a) out += `(${a}${a.length === 3 ? "" : ""})`.replace("()", "(").replace("(0", "(" + a);
  if (a?.length === 3 && b) out = `${cc}(${a}) ${b}`;
  if (a?.length === 3 && b?.length === 3 && c) out = `${cc}(${a}) ${b}-${c}`;
  return out.trim();
}
/** Always returns E.164 with +1 for storage; strips non-digits from input. */
function toE164US(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  const d10 = digits.replace(/^1/, ""); // drop leading 1 if present
  return d10 ? `+1${d10}` : "+1";
}
function last4Digits(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits.slice(-4);
}

/* ────────────────────────────────────────────────────────────── */

export default function Profile() {
  const { user } = useAuth();

  // Private profile (what user edits in Personal Information)
  const [pvt, setPvt] = useState({
    firstName: "", lastName: "", dateOfBirth: "", district: "", phone: ""
  });
  // Derived phone fields for storage
  const phoneFormatted = useMemo(() => formatUSPhone(pvt.phone), [pvt.phone]);
  const phoneE164 = useMemo(() => toE164US(pvt.phone), [pvt.phone]);

  // Public profile
  const [pub, setPub] = useState({ displayName: "", sellerSlug: "", avatar: "" });

  // UI state
  const [loading, setLoading] = useState(true);
  const [savingPriv, setSavingPriv] = useState(false);
  const [savingPub, setSavingPub] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Avatar state
  const [file, setFile] = useState(null);
  const [busyAvatar, setBusyAvatar] = useState(false);
  const fileInputRef = useRef(null);

  // Autosave control
  const debTimer = useRef(null);
  const didLoadRef = useRef(false);
  const lastSavedPrivRef = useRef(null); // holds last saved snapshot to avoid redundant writes

  /* ──────────────────────────────────────────────────────────────
     Username availability check
     ────────────────────────────────────────────────────────────── */
  const isSlugAvailableForMe = async (slug) => {
    const refDoc = await getDoc(doc(db, "usernames", slug));
    if (!refDoc.exists()) return true;
    return refDoc.data().uid === user.uid;
  };

  // base slug: "first-last" lowercase with hyphens
  const baseNameSlug = () => {
    const base = `${(pvt.firstName || "").trim()} ${(pvt.lastName || "").trim()}`.trim();
    const hyphenated = base.replace(/\s+/g, "-");
    return slugify(hyphenated || (user.email || "").split("@")[0]);
  };

  // Build slug per your order:
  // 1) base
  // 2) base-ddmm
  // 3) base-ddmm<last4>
  // Fallback: base-<random3>
  const computeDesiredSlug = async () => {
    const base = baseNameSlug();
    const birth = ddmmFromDOB(pvt.dateOfBirth);
    const last4 = last4Digits(pvt.phone);

    if (validateSlug(base).ok && await isSlugAvailableForMe(base)) return base;

    if (birth) {
      const s2 = `${base}-${birth}`;
      if (validateSlug(s2).ok && await isSlugAvailableForMe(s2)) return s2;
    }

    if (birth && last4) {
      const s3 = `${base}-${birth}${last4}`;
      if (validateSlug(s3).ok && await isSlugAvailableForMe(s3)) return s3;
    }

    if (!birth && last4) {
      const sAlt = `${base}-${last4}`;
      if (validateSlug(sAlt).ok && await isSlugAvailableForMe(sAlt)) return sAlt;
    }

    for (let i = 0; i < 10; i++) {
      const sfx = Math.floor(100 + Math.random() * 900);
      const s4 = `${base}-${sfx}`;
      if (validateSlug(s4).ok && await isSlugAvailableForMe(s4)) return s4;
    }
    throw new Error("Could not create a unique username. Try different details.");
  };

  /* ──────────────────────────────────────────────────────────────
     Load profile data
     ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [pvtSnap, pubSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          getDoc(doc(db, "profiles", user.uid)),
        ]);
        const p = pvtSnap.exists() ? pvtSnap.data() : {};
        const q = pubSnap.exists() ? pubSnap.data() : {};

        if (!mounted) return;

        const fn = p.firstName || "";
        const ln = p.lastName || "";
        setPvt({
          firstName: fn,
          lastName: ln,
          dateOfBirth: p.dateOfBirth || "",
          district: p.district || "",
          phone: p.phone || "", // keep raw—will show formatted via derived value
        });

        const displayComputed =
          toTitleCaseName(`${fn} ${ln}`.trim()) ||
          toTitleCaseName(auth.currentUser?.displayName || "") ||
          toTitleCaseName((user.email || "Seller").split("@")[0]);

        setPub({
          displayName: displayComputed,
          sellerSlug: q.sellerSlug || "",
          avatar: q.avatar || auth.currentUser?.photoURL || "",
        });

        // capture initial snapshot for autosave diffing
        lastSavedPrivRef.current = {
          firstName: fn,
          lastName: ln,
          dateOfBirth: p.dateOfBirth || "",
          district: p.district || "",
          phone: p.phone || "",
        };

        // If no slug, pre-generate (non-blocking)
        if (!q.sellerSlug) {
          computeDesiredSlug().then((s) => {
            if (!mounted) return;
            setPub((prev) => ({ ...prev, sellerSlug: s }));
          }).catch(() => {});
        }
      } finally {
        if (mounted) {
          didLoadRef.current = true;
          setLoading(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [user.uid, user.email]);

  /* Keep Display Name always First Last (title case) */
  useEffect(() => {
    if (!didLoadRef.current) return;
    const displayComputed = toTitleCaseName(`${pvt.firstName} ${pvt.lastName}`.trim());
    if (displayComputed && displayComputed !== pub.displayName) {
      setPub((prev) => ({ ...prev, displayName: displayComputed }));
    }
  }, [pvt.firstName, pvt.lastName]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ──────────────────────────────────────────────────────────────
     PRIVATE AUTOSAVE (800ms debounce)
     ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!didLoadRef.current) return;
    // compare with last saved snapshot; if unchanged, skip
    const prev = lastSavedPrivRef.current || {};
    const curr = {
      firstName: pvt.firstName,
      lastName: pvt.lastName,
      dateOfBirth: pvt.dateOfBirth,
      district: pvt.district,
      phone: pvt.phone,
    };
    const unchanged =
      prev.firstName === curr.firstName &&
      prev.lastName === curr.lastName &&
      prev.dateOfBirth === curr.dateOfBirth &&
      prev.district === curr.district &&
      prev.phone === curr.phone;

    if (unchanged) return;

    if (debTimer.current) clearTimeout(debTimer.current);
    debTimer.current = setTimeout(async () => {
      await savePrivate(true); // silent autosave
    }, 800);

    return () => {
      if (debTimer.current) clearTimeout(debTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvt.firstName, pvt.lastName, pvt.dateOfBirth, pvt.district, pvt.phone]);

  /* ──────────────────────────────────────────────────────────────
     Save private details (manual and autosave)
     ────────────────────────────────────────────────────────────── */
  const savePrivate = async (isAuto = false) => {
    if (!isAuto) { setErr(""); setMsg(""); }
    setSavingPriv((s) => (isAuto ? s : true)); // don't show spinner for autosave

    try {
      const displayComputed = toTitleCaseName(`${pvt.firstName} ${pvt.lastName}`.trim());
      await setDoc(
        doc(db, "users", user.uid),
        {
          firstName: pvt.firstName.trim(),
          lastName: pvt.lastName.trim(),
          dateOfBirth: pvt.dateOfBirth,
          district: pvt.district.trim(),
          // store both formatted (for convenience) and E.164 (canonical)
          phone: phoneFormatted,
          phoneE164,
          phoneCountryCode: "+1",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Update local "last saved" snapshot so further changes diff properly
      lastSavedPrivRef.current = {
        firstName: pvt.firstName,
        lastName: pvt.lastName,
        dateOfBirth: pvt.dateOfBirth,
        district: pvt.district,
        phone: pvt.phone,
      };

      // Keep Auth displayName synced
      if (displayComputed && auth.currentUser?.displayName !== displayComputed) {
        await updateProfile(auth.currentUser, { displayName: displayComputed });
      }

      if (!isAuto) setMsg("Saved your private details.");
    } catch (e) {
      console.error(e);
      if (!isAuto) setErr(e.message || "Failed saving private details.");
    } finally {
      if (!isAuto) setSavingPriv(false);
    }
  };

  /* ──────────────────────────────────────────────────────────────
     Avatar upload
     ────────────────────────────────────────────────────────────── */
  const uploadAvatar = async (pickedFile) => {
    const f = pickedFile || file;
    if (!f) return;
    setErr(""); setMsg(""); setBusyAvatar(true);
    try {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const origRef = ref(storage, `avatars/${user.uid}/original/avatar.${ext}`);
      await uploadBytes(origRef, f);

      // If you add an optimizer, swap this behavior; for now re-use original
      const optRef = ref(storage, `avatars/${user.uid}/optimized/avatar.jpg`);
      await uploadBytes(optRef, f);

      const [, optURL] = await Promise.all([getDownloadURL(origRef), getDownloadURL(optRef)]);
      await updateProfile(auth.currentUser, { photoURL: optURL });
      await setDoc(doc(db, "profiles", user.uid), { avatar: optURL }, { merge: true });

      setPub((prev) => ({ ...prev, avatar: optURL }));
      setFile(null);
      setMsg("Avatar updated.");
    } catch (e) {
      console.error(e);
      setErr(e.message || "Avatar upload failed.");
    } finally {
      setBusyAvatar(false);
    }
  };
  const onChangeAvatarClick = () => { if (!busyAvatar) fileInputRef.current?.click(); };
  const onPickAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    await uploadAvatar(f); // auto upload on pick
  };

  /* ──────────────────────────────────────────────────────────────
     Slug propagation + public save
     ────────────────────────────────────────────────────────────── */
  const propagateNewSlugToItems = async (newSlug) => {
    let cursor = null;
    while (true) {
      const q = query(
        collection(db, "items"),
        where("ownerId", "==", user.uid),
        fsLimit(400),
        ...(cursor ? [startAfter(cursor)] : [])
      );
      const snap = await getDocs(q);
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(doc(db, "items", d.id), { ownerSlug: newSlug }));
      await batch.commit();
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < 400) break;
    }
  };

  const savePublic = async () => {
    setErr(""); setMsg(""); setSavingPub(true);
    try {
      const displayComputed =
        toTitleCaseName(`${pvt.firstName} ${pvt.lastName}`.trim()) ||
        toTitleCaseName(auth.currentUser?.displayName || "") ||
        toTitleCaseName((user.email || "Seller").split("@")[0]);

      let desired = (pub.sellerSlug || "").trim();
      if (!desired) {
        desired = await computeDesiredSlug();
      } else {
        const chk = validateSlug(desired);
        if (!chk.ok || !(await isSlugAvailableForMe(chk.value))) {
          desired = await computeDesiredSlug();
        } else {
          desired = chk.value;
        }
      }

      const profRef = doc(db, "profiles", user.uid);
      const oldSlug = (await getDoc(profRef)).data()?.sellerSlug || "";

      if (desired !== oldSlug) {
        const newRef = doc(db, "usernames", desired);
        const newSnap = await getDoc(newRef);
        if (newSnap.exists() && newSnap.data().uid !== user.uid) {
          const alt = await computeDesiredSlug();
          if (alt !== desired) desired = alt;
          else throw new Error("That username is taken.");
        }
        await setDoc(doc(db, "usernames", desired), { uid: user.uid });

        await setDoc(profRef, {
          displayName: displayComputed, // enforced, readOnly in UI
          avatar: pub.avatar || auth.currentUser?.photoURL || "",
          sellerSlug: desired,
        }, { merge: true });

        if (displayComputed && auth.currentUser?.displayName !== displayComputed) {
          await updateProfile(auth.currentUser, { displayName: displayComputed });
        }

        await propagateNewSlugToItems(desired);

        if (oldSlug) { await deleteDoc(doc(db, "usernames", oldSlug)).catch(() => {}); }

        setPub((prev) => ({ ...prev, displayName: displayComputed, sellerSlug: desired }));
        setMsg("Public profile saved and listings updated.");
      } else {
        await setDoc(profRef, { displayName: displayComputed }, { merge: true });
        if (displayComputed && auth.currentUser?.displayName !== displayComputed) {
          await updateProfile(auth.currentUser, { displayName: displayComputed });
        }
        setPub((prev) => ({ ...prev, displayName: displayComputed }));
        setMsg("Public profile saved.");
      }
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed saving public profile.");
    } finally {
      setSavingPub(false);
    }
  };

  /* ──────────────────────────────────────────────────────────────
     Skeleton (mirrors the exact layout)
     ────────────────────────────────────────────────────────────── */
  const Skeleton = () => (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-28 bg-gray-200 rounded" />
        <div className="h-4 w-24 bg-gray-200 rounded" />
      </div>

      <div className="rounded-lg border-b border-gray-900/10 pb-12 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-3">
        <div className="space-y-2">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-200 rounded" />
        </div>
        <div className="grid max-w-2xl md:col-span-2 grid-cols-1 sm:grid-cols-6 gap-x-6 gap-y-8">
          {/* Photo */}
          <div className="col-span-full flex items-center gap-x-3">
            <div className="size-12 rounded-full bg-gray-200" />
            <div className="h-8 w-20 bg-gray-200 rounded-md" />
          </div>
          {/* First / Last */}
          <div className="sm:col-span-3">
            <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
          <div className="sm:col-span-3">
            <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
          {/* Email */}
          <div className="sm:col-span-4">
            <div className="h-4 w-28 bg-gray-200 rounded mb-2" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
          {/* DOB */}
          <div className="sm:col-span-3">
            <div className="h-4 w-28 bg-gray-200 rounded mb-2" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
          {/* District */}
          <div className="sm:col-span-3">
            <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
          {/* Phone */}
          <div className="sm:col-span-3">
            <div className="h-4 w-16 bg-gray-200 rounded mb-2" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
          {/* Save button */}
          <div className="col-span-full">
            <div className="h-9 w-40 bg-gray-200 rounded" />
          </div>
        </div>
      </div>

      {/* Public Profile */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-3">
        <div className="space-y-2">
          <div className="h-5 w-36 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-200 rounded" />
        </div>
        <div className="grid max-w-2xl md:col-span-2 grid-cols-1 sm:grid-cols-6 gap-x-6 gap-y-6">
          <div className="sm:col-span-3">
            <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
          <div className="sm:col-span-3">
            <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
          <div className="col-span-full">
            <div className="h-9 w-44 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) return <Skeleton />;

  return (
    <Container>
    <div className="space-y-8">
      {/* Header / quick link */}
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Profile</div>
        {pub.sellerSlug && (
          <a className="text-sm underline" href={`/s/${pub.sellerSlug}`}>View public profile</a>
        )}
      </div>

      {/* Email verification notice */}
      {!auth.currentUser.emailVerified && (
        <div className="rounded-lg border bg-amber-50 p-3 text-sm">
          Your email is not verified. Some actions (like posting) are blocked.
          <div className="mt-2">
            <Button size="sm" onClick={() => sendEmailVerification(auth.currentUser)}>
              Resend verification email
            </Button>
          </div>
        </div>
      )}

      {/* PERSONAL INFORMATION (avatar at top) */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-900/10 pb-12 md:grid-cols-3">
        <div>
          <h2 className="text-base/7 font-semibold text-gray-900">Personal Information</h2>
          <p className="mt-1 text-sm/6 text-gray-600">Use a permanent address where you can receive mail.</p>
        </div>

        <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
          {/* Photo */}
          <div className="col-span-full">
            <label htmlFor="photo" className="block text-sm/6 font-medium text-gray-900">
              Photo
            </label>
            <div className="mt-2 flex items-center gap-x-3">
              {pub.avatar ? (
                <img src={pub.avatar} alt="Avatar" className="size-12 rounded-full object-cover" />
              ) : (
                <UserCircleIcon aria-hidden="true" className="size-12 text-gray-300" />
              )}
              <button
                type="button"
                onClick={onChangeAvatarClick}
                disabled={busyAvatar}
                className={`rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring inset-ring-gray-300 hover:bg-gray-50 ${busyAvatar ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {busyAvatar ? "Uploading..." : "Change"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickAvatar}
              />
            </div>
          </div>

          {/* First / Last name */}
          <div className="sm:col-span-3">
            <label htmlFor="first-name" className="block text-sm/6 font-medium text-gray-900">
              First name
            </label>
            <div className="mt-2">
              <input
                id="first-name"
                name="first-name"
                type="text"
                autoComplete="given-name"
                value={pvt.firstName}
                onChange={(e)=>setPvt({...pvt, firstName: e.target.value})}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
            </div>
          </div>
          <div className="sm:col-span-3">
            <label htmlFor="last-name" className="block text-sm/6 font-medium text-gray-900">
              Last name
            </label>
            <div className="mt-2">
              <input
                id="last-name"
                name="last-name"
                type="text"
                autoComplete="family-name"
                value={pvt.lastName}
                onChange={(e)=>setPvt({...pvt, lastName: e.target.value})}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
            </div>
          </div>

          {/* Email (read only) */}
          <div className="sm:col-span-4">
            <label htmlFor="email" className="block text-sm/6 font-medium text-gray-900">
              Email address
            </label>
            <div className="mt-2">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={user.email || ""}
                readOnly
                className="block w-full rounded-md bg-gray-50 px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
            </div>
          </div>

          {/* Date of birth */}
          <div className="sm:col-span-3">
            <label htmlFor="dob" className="block text-sm/6 font-medium text-gray-900">
              Date of birth
            </label>
            <div className="mt-2">
              <input
                id="dob"
                name="dob"
                type="date"
                value={pvt.dateOfBirth}
                onChange={(e)=>setPvt({...pvt, dateOfBirth: e.target.value})}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
            </div>
          </div>

          {/* District */}
          <div className="sm:col-span-3">
            <label htmlFor="district" className="block text-sm/6 font-medium text-gray-900">
              District
            </label>
            <div className="mt-2">
              <input
                id="district"
                name="district"
                type="text"
                autoComplete="address-level2"
                placeholder="Your district"
                value={pvt.district}
                onChange={(e)=>setPvt({...pvt, district: e.target.value})}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
            </div>
          </div>

          {/* Phone (formatted UI) */}
          <div className="sm:col-span-3">
            <label htmlFor="phone" className="block text-sm/6 font-medium text-gray-900">
              Phone
            </label>
            <div className="mt-2">
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phoneFormatted}
                onChange={(e)=>{
                  // accept raw typing; store as "raw" in pvt.phone (digits-only or mixed)
                  // The input shows formatted version from derived state
                  const raw = e.target.value;
                  setPvt((prev)=>({ ...prev, phone: raw }));
                }}
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
              <p className="text-xs text-neutral-500 mt-1">Stored as E.164: {phoneE164}</p>
            </div>
          </div>

          {/* Save private details (manual fallback) */}
          <div className="col-span-full">
            <Button onClick={()=>savePrivate(false)} loading={savingPriv}>
              Save private details
            </Button>
          </div>
        </div>
      </div>

      {/* PUBLIC PROFILE */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-3">
        <div>
          <h2 className="text-base/7 font-semibold text-gray-900">Public profile</h2>
          <p className="mt-1 text-sm/6 text-gray-600">Control how your profile appears to others.</p>
        </div>

        <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6 md:col-span-2">
          {/* Display name is computed and readOnly */}
          <div className="sm:col-span-3">
            <label className="block text-sm/6 font-medium text-gray-900">Display name</label>
            <div className="mt-2">
              <input
                type="text"
                value={pub.displayName}
                readOnly
                className="block w-full rounded-md bg-gray-50 px-3 py-1.5 text-base text-gray-900 outline-1 outline-gray-300 sm:text-sm/6"
              />
              <p className="mt-1 text-xs text-gray-500">Display name comes from your first & last name.</p>
            </div>
          </div>

          {/* Username (slug) — auto-generated; user can edit */}
          <div className="sm:col-span-3">
            <label className="block text-sm/6 font-medium text-gray-900">Username (slug)</label>
            <div className="mt-2">
              <input
                type="text"
                value={pub.sellerSlug}
                onChange={(e)=>setPub({...pub, sellerSlug: e.target.value.toLowerCase()})}
                placeholder="e.g. akash-ramasani"
                className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Public URL: <code>/s/{slugify(pub.sellerSlug) || "your-name"}</code>
              </p>
            </div>
          </div>

          <div className="col-span-full">
            <Button onClick={savePublic} loading={savingPub}>
              Save public profile
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {msg && <p className="text-sm text-green-700">{msg}</p>}
    </div>
    </Container>
  );
}