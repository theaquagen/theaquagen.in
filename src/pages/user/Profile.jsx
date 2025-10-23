import { useEffect, useRef, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { db, auth, storage } from "../../firebase";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp,
  collection, query, where, getDocs, writeBatch, limit as fsLimit, startAfter, orderBy,
  onSnapshot, arrayUnion
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile, sendEmailVerification } from "firebase/auth";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { UserCircleIcon } from "@heroicons/react/24/solid";
import {
  ChevronLeftIcon, ChevronRightIcon, CalendarDaysIcon, XMarkIcon,
} from "@heroicons/react/20/solid";
import { Container } from "../../components/ui/Container";

/* ───────────── Helpers ───────────── */
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

function onlyDigits(s) { return String(s || "").replace(/\D+/g, ""); }
function last4Digits(value) { return onlyDigits(value).slice(-4); }

/** India-only phone UI: +91 98765 43210 */
function formatINPhoneUI(value) {
  const d = onlyDigits(value).replace(/^91/, "");
  const digits = d.slice(0, 10);
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
  return digits ? `+91${digits}` : "+91";
}

/* Calendar utils */
function fmtYmd(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseYmdLocal(ymd) {
  const [y, m, d] = (ymd || "").split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function weekdayMon0(date) { return (date.getDay() + 6) % 7; }
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function getMonthGrid(viewYear, viewMonth, selectedYmd) {
  const todayYmd = fmtYmd(new Date());
  const first = new Date(viewYear, viewMonth, 1);
  const offset = weekdayMon0(first);
  const start = addDays(first, -offset);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const ymd = fmtYmd(d);
    days.push({
      date: ymd,
      isToday: ymd === todayYmd,
      isSelected: selectedYmd ? ymd === selectedYmd : false,
      isCurrentMonth: d.getMonth() === viewMonth,
    });
  }
  return days;
}

/* Area computation */
function titleFromSlug(slug = "") {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function computeAreaFromRecent(recent = []) {
  if (!Array.isArray(recent) || recent.length === 0) return "";
  const suffixes = recent.map(s => String(s || "").split("_").pop() || "").filter(Boolean);
  if (suffixes.length === 0) return "";
  const counts = new Map();
  suffixes.forEach(s => counts.set(s, (counts.get(s) || 0) + 1));
  let max = 0; counts.forEach(v => { if (v > max) max = v; });
  const top = [...counts.entries()].filter(([, v]) => v === max).map(([k]) => k);
  const chosen = top.length === 1 ? top[0] : (suffixes[0] || top[0]);
  return titleFromSlug(chosen);
}

/* Name-aligned slug logic */
function nameTokens(str) {
  return slugify(str).split("-").filter(Boolean);
}
function isSlugNameAligned(slug, firstName, lastName) {
  const tokensSlug = slugify(slug).split("-").filter(Boolean);
  if (tokensSlug.length < 2) return false;

  const f = nameTokens(firstName);
  const l = nameTokens(lastName);
  if (f.length === 0 && l.length === 0) return false;

  function matchPrefix(seqA, seqB) {
    const seq = [...seqA, ...seqB];
    let i = 0, matched = 0;
    for (let k = 0; k < tokensSlug.length; k++) {
      if (i < seq.length && tokensSlug[k] === seq[i]) {
        matched++; i++;
      } else {
        break;
      }
    }
    return matched >= 2;
  }
  return matchPrefix(f, l) || matchPrefix(l, f);
}
function validateSlugBasic(s) {
  const v = slugify(s);
  if (v.length < 3 || v.length > 30) return { ok: false, msg: "Slug must be 3–30 chars." };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(v)) return { ok: false, msg: "Only a–z, 0–9, hyphens; no leading/trailing hyphen." };
  if (/--/.test(v)) return { ok: false, msg: "No consecutive hyphens." };
  return { ok: true, value: v };
}

const PAGE_SIZE = 12;

export default function Profile() {
  const { user } = useAuth();

  // Private profile
  const [pvt, setPvt] = useState({ firstName: "", lastName: "", dateOfBirth: "", phone: "" });
  const [nameChangeCount, setNameChangeCount] = useState(0); // limit 3
  const [nameHistory, setNameHistory] = useState([]); // display-only (optional)

  // India-only derived phone fields
  const phoneFormatted = useMemo(() => formatINPhoneUI(pvt.phone), [pvt.phone]);
  const phoneE164 = useMemo(() => toE164IN(pvt.phone), [pvt.phone]);

  // Public profile
  const [pub, setPub] = useState({ displayName: "", sellerSlug: "", avatar: "" });

  // Auto-computed Area (read-only)
  const [area, setArea] = useState("");

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
  const lastSavedPrivRef = useRef(null);

  /* Calendar state */
  const [isCalOpen, setIsCalOpen] = useState(false);
  const calRef = useRef(null);
  const anchorRef = useRef(null);

  const baseDob = pvt.dateOfBirth ? parseYmdLocal(pvt.dateOfBirth) : new Date();
  const [viewYear, setViewYear] = useState(baseDob.getFullYear());
  const [viewMonth, setViewMonth] = useState(baseDob.getMonth());

  const days = useMemo(() => getMonthGrid(viewYear, viewMonth, pvt.dateOfBirth), [viewYear, viewMonth, pvt.dateOfBirth]);
  const monthLabel = useMemo(() =>
    new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [viewYear, viewMonth]);

  /* NEW: lock flag after 3 name updates */
  const nameLocked = nameChangeCount >= 3;

  /* Initial load */
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
          phone: p.phone || "",
        });
        setNameChangeCount(p.nameChangeCount || 0);
        setNameHistory(Array.isArray(p.nameChangeHistory) ? p.nameChangeHistory : []);

        setArea(computeAreaFromRecent(p.recentLocations || []));

        const displayComputed =
          toTitleCaseName(`${fn} ${ln}`.trim()) ||
          toTitleCaseName(auth.currentUser?.displayName || "") ||
          toTitleCaseName((user.email || "Seller").split("@")[0]);

        setPub({
          displayName: displayComputed,
          sellerSlug: q.sellerSlug || "",
          avatar: q.avatar || auth.currentUser?.photoURL || "",
        });

        lastSavedPrivRef.current = {
          firstName: fn,
          lastName: ln,
          dateOfBirth: p.dateOfBirth || "",
          phone: p.phone || "",
        };

        if (!q.sellerSlug) {
          computeDesiredSlug().then((s) => setPub((prev) => ({ ...prev, sellerSlug: s }))).catch(() => {});
        }
      } finally {
        if (mounted) { didLoadRef.current = true; setLoading(false); }
      }
    })();
    return () => { mounted = false; };
  }, [user.uid, user.email]);

  /* LIVE Area via onSnapshot */
  useEffect(() => {
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const newArea = computeAreaFromRecent(data.recentLocations || []);
      setArea((prev) => (prev !== newArea ? newArea : prev));
    });
    return () => unsub();
  }, [user.uid]);

  /* Keep Display Name always First Last (title case) */
  useEffect(() => {
    if (!didLoadRef.current) return;
    const displayComputed = toTitleCaseName(`${pvt.firstName} ${pvt.lastName}`.trim());
    if (displayComputed && displayComputed !== pub.displayName) {
      setPub((prev) => ({ ...prev, displayName: displayComputed }));
    }
  }, [pvt.firstName, pvt.lastName]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Debounced private autosave */
  useEffect(() => {
    if (!didLoadRef.current) return;
    const prev = lastSavedPrivRef.current || {};
    const curr = { firstName: pvt.firstName, lastName: pvt.lastName, dateOfBirth: pvt.dateOfBirth, phone: pvt.phone };
    const unchanged = prev.firstName === curr.firstName && prev.lastName === curr.lastName &&
      prev.dateOfBirth === curr.dateOfBirth && prev.phone === curr.phone;
    if (unchanged) return;

    if (debTimer.current) clearTimeout(debTimer.current);
    debTimer.current = setTimeout(async () => { await savePrivate(true); }, 800);
    return () => { if (debTimer.current) clearTimeout(debTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvt.firstName, pvt.lastName, pvt.dateOfBirth, pvt.phone]);

  /* Username availability */
  const isSlugAvailableForMe = async (slug) => {
    const refDoc = await getDoc(doc(db, "usernames", slug));
    if (!refDoc.exists()) return true;
    return refDoc.data().uid === user.uid;
  };
  const baseNameSlug = () => {
    const f = slugify(pvt.firstName).replace(/-+/g, "-");
    const l = slugify(pvt.lastName).replace(/-+/g, "-");
    const base = `${f}${f && l ? "-" : ""}${l}` || slugify((user.email || "").split("@")[0]);
    return base;
  };
  const computeDesiredSlug = async () => {
    const baseFL = baseNameSlug();
    const baseLF = (() => {
      const f = slugify(pvt.firstName).replace(/-+/g, "-");
      const l = slugify(pvt.lastName).replace(/-+/g, "-");
      return l && f ? `${l}-${f}` : baseFL;
    })();
    const birth = ddmmFromDOB(pvt.dateOfBirth);
    const last4 = last4Digits(pvt.phone);

    const candidates = [
      baseFL, baseLF,
      birth ? `${baseFL}-${birth}` : null,
      birth ? `${baseLF}-${birth}` : null,
      birth && last4 ? `${baseFL}-${birth}${last4}` : null,
      birth && last4 ? `${baseLF}-${birth}${last4}` : null,
      last4 ? `${baseFL}-${last4}` : null,
      last4 ? `${baseLF}-${last4}` : null,
    ].filter(Boolean);

    for (const c of candidates) {
      const chk = validateSlugBasic(c);
      if (!chk.ok) continue;
      if (!isSlugNameAligned(chk.value, pvt.firstName, pvt.lastName)) continue;
      if (await isSlugAvailableForMe(chk.value)) return chk.value;
    }
    for (let i = 0; i < 10; i++) {
      const sfx = Math.floor(100 + Math.random() * 900);
      const v = `${baseFL}-${sfx}`;
      const chk = validateSlugBasic(v);
      if (chk.ok && isSlugNameAligned(chk.value, pvt.firstName, pvt.lastName) && await isSlugAvailableForMe(chk.value))
        return chk.value;
      const v2 = `${baseLF}-${sfx}`;
      const chk2 = validateSlugBasic(v2);
      if (chk2.ok && isSlugNameAligned(chk2.value, pvt.firstName, pvt.lastName) && await isSlugAvailableForMe(chk2.value))
        return chk2.value;
    }
    throw new Error("Could not create a unique username. Try different details.");
  };

  /* Save private (with name-change limit + history) */
  const savePrivate = async (isAuto = false) => {
    if (!isAuto) { setErr(""); setMsg(""); }
    // India phone check
    const d = onlyDigits(pvt.phone).replace(/^91/, "");
    if (d && d.length !== 10) { if (!isAuto) setErr("Enter a valid 10-digit Indian mobile number."); return; }

    const prev = lastSavedPrivRef.current || {};
    const isNameChanged = (pvt.firstName.trim() !== (prev.firstName || "").trim()) ||
                          (pvt.lastName.trim() !== (prev.lastName || "").trim());

    // Enforce max 3 name edits
    if (isNameChanged && nameChangeCount >= 3) {
      if (!isAuto) setErr("Name change limit reached (3). You cannot change first/last name anymore.");
      // revert UI to last saved names
      setPvt((cur) => ({ ...cur, firstName: prev.firstName || "", lastName: prev.lastName || "" }));
      return;
    }

    setSavingPriv((s) => (isAuto ? s : true));
    try {
      const displayComputed = toTitleCaseName(`${pvt.firstName} ${pvt.lastName}`.trim());

      const payload = {
        firstName: pvt.firstName.trim(),
        lastName: pvt.lastName.trim(),
        dateOfBirth: pvt.dateOfBirth,
        phone: phoneFormatted,
        phoneE164,
        phoneCountryCode: "+91",
        updatedAt: serverTimestamp(),
      };

      if (isNameChanged) {
        payload.nameChangeCount = (nameChangeCount || 0) + 1;
      }

      await setDoc(doc(db, "users", user.uid), payload, { merge: true });

      if (isNameChanged) {
        await setDoc(
          doc(db, "users", user.uid),
          {
            nameChangeHistory: arrayUnion({
              prevFirstName: (prev.firstName || "").trim(),
              prevLastName: (prev.lastName || "").trim(),
              newFirstName: pvt.firstName.trim(),
              newLastName: pvt.lastName.trim(),
              at: Timestamp.now(),
            }),
          },
          { merge: true }
        );
        setNameChangeCount((c) => (c || 0) + 1);
        setNameHistory((h) => [
          ...h,
          {
            prevFirstName: (prev.firstName || "").trim(),
            prevLastName: (prev.lastName || "").trim(),
            newFirstName: pvt.firstName.trim(),
            newLastName: pvt.lastName.trim(),
            at: new Date().toISOString(),
          },
        ]);
      }

      lastSavedPrivRef.current = {
        firstName: pvt.firstName,
        lastName: pvt.lastName,
        dateOfBirth: pvt.dateOfBirth,
        phone: pvt.phone,
      };

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

  /* Avatar upload */
  const uploadAvatar = async (pickedFile) => {
    const f = pickedFile || file; if (!f) return;
    setErr(""); setMsg(""); setBusyAvatar(true);
    try {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const origRef = ref(storage, `avatars/${user.uid}/original/avatar.${ext}`);
      await uploadBytes(origRef, f);
      const optRef = ref(storage, `avatars/${user.uid}/optimized/avatar.jpg`);
      await uploadBytes(optRef, f);
      const [, optURL] = await Promise.all([getDownloadURL(origRef), getDownloadURL(optRef)]);
      await updateProfile(auth.currentUser, { photoURL: optURL });
      await setDoc(doc(db, "profiles", user.uid), { avatar: optURL }, { merge: true });
      setPub((prev) => ({ ...prev, avatar: optURL }));
      setFile(null);
      setMsg("Avatar updated.");
    } catch (e) { console.error(e); setErr(e.message || "Avatar upload failed."); }
    finally { setBusyAvatar(false); }
  };
  const onChangeAvatarClick = () => { if (!busyAvatar) fileInputRef.current?.click(); };
  const onPickAvatar = async (e) => { const f = e.target.files?.[0]; if (!f) return; setFile(f); await uploadAvatar(f); };

  /* Propagate slug to items */
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

  /* Save public (slug rules enforced here) */
  const savePublic = async () => {
    setErr(""); setMsg(""); setSavingPub(true);
    try {
      const displayComputed =
        toTitleCaseName(`${pvt.firstName} ${pvt.lastName}`.trim()) ||
        toTitleCaseName(auth.currentUser?.displayName || "") ||
        toTitleCaseName((user.email || "Seller").split("@")[0]);

      let desired = (pub.sellerSlug || "").trim().toLowerCase();

      if (!desired) {
        desired = await computeDesiredSlug();
      } else {
        const chk = validateSlugBasic(desired);
        if (!chk.ok) throw new Error(chk.msg);
        if (!isSlugNameAligned(chk.value, pvt.firstName, pvt.lastName)) {
          throw new Error("Username must start with your name (e.g., first-last-… or last-first-…) and include at least 2 name parts.");
        }
        if (!(await isSlugAvailableForMe(chk.value))) {
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
          displayName: displayComputed,
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

  /* Items list (unchanged) */
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const lastDocRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingItems(true);
        const q = query(
          collection(db, "items"),
          where("ownerId", "==", user.uid),
          orderBy("createdAt", "desc"),
          fsLimit(PAGE_SIZE)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
        if (snap.size < PAGE_SIZE) setEndReached(true);
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoadingItems(false); }
    })();
    return () => { cancelled = true; };
  }, [user.uid]);

  const loadMore = async () => {
    if (endReached || loadingMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "items"),
        where("ownerId", "==", user.uid),
        orderBy("createdAt", "desc"),
        fsLimit(PAGE_SIZE),
        startAfter(lastDocRef.current)
      );
      const snap = await getDocs(q);
      setItems((prev) => [...prev, ...snap.docs.map((d) => ({ id: d.id, ...d.data() }))]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      if (snap.size < PAGE_SIZE) setEndReached(true);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  };

  /* Skeleton UI omitted for brevity in this reply (same as before) */
  const Skeleton = () => (
    <div className="space-y-8 animate-pulse">
      {/* ...same skeleton as before... */}
      <div className="h-6 w-28 bg-gray-200 rounded" />
    </div>
  );

  if (loading) return <Skeleton />;

  return (
    <Container>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold">Profile</div>
          <div className="text-xs text-gray-600">
            Name changes used: {nameChangeCount}/3
          </div>
        </div>

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

        {/* PERSONAL INFORMATION */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-900/10 pb-12 md:grid-cols-3">
          <div>
            <h2 className="text-base/7 font-semibold text-gray-900">Personal Information</h2>
            <p className="mt-1 text-sm/6 text-gray-600">
              Area updates from your recent locations. You can change your name up to 3 times.
            </p>
          </div>

          <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6 md:col-span-2">
            {/* Photo */}
            <div className="col-span-full">
              <label className="block text-sm/6 font-medium text-gray-900">Photo</label>
              <div className="mt-2 flex items-center gap-x-3">
                {pub.avatar ? (
                  <img src={pub.avatar} alt="Avatar" className="size-12 rounded-full object-cover" />
                ) : (
                  <UserCircleIcon aria-hidden="true" className="size-12 text-gray-300" />
                )}
                <button type="button" onClick={() => !busyAvatar && fileInputRef.current?.click()}
                  disabled={busyAvatar}
                  className={`rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs inset-ring inset-ring-gray-300 hover:bg-gray-50 ${busyAvatar ? "opacity-60 cursor-not-allowed" : ""}`}>
                  {busyAvatar ? "Uploading..." : "Change"}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
              </div>
            </div>

            {/* First / Last (now read-only when nameLocked) */}
            <div className="sm:col-span-3">
              <label className="block text-sm/6 font-medium text-gray-900">First name</label>
              <div className="mt-2">
                <input
                  type="text"
                  value={pvt.firstName}
                  onChange={(e)=>setPvt({...pvt, firstName: e.target.value})}
                  readOnly={nameLocked}
                  title={nameLocked ? "Name change limit reached" : undefined}
                  className={`block w-full rounded-md px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 sm:text-sm/6
                    ${nameLocked ? "bg-gray-50 outline-gray-200 cursor-not-allowed" : "bg-white outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"}`}
                />
                {nameLocked && (
                  <p className="mt-1 text-xs text-gray-500">You’ve reached the 3 changes limit. First name is locked.</p>
                )}
              </div>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-sm/6 font-medium text-gray-900">Last name</label>
              <div className="mt-2">
                <input
                  type="text"
                  value={pvt.lastName}
                  onChange={(e)=>setPvt({...pvt, lastName: e.target.value})}
                  readOnly={nameLocked}
                  title={nameLocked ? "Name change limit reached" : undefined}
                  className={`block w-full rounded-md px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 sm:text-sm/6
                    ${nameLocked ? "bg-gray-50 outline-gray-200 cursor-not-allowed" : "bg-white outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600"}`}
                />
                {nameLocked && (
                  <p className="mt-1 text-xs text-gray-500">You’ve reached the 3 changes limit. Last name is locked.</p>
                )}
              </div>
            </div>

            {/* Email (read-only) */}
            <div className="sm:col-span-4">
              <label className="block text-sm/6 font-medium text-gray-900">Email address</label>
              <div className="mt-2">
                <input type="email" value={user.email || ""} readOnly
                  className="block w-full rounded-md bg-gray-50 px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 sm:text-sm/6"/>
              </div>
            </div>

            {/* DOB */}
            <div className="sm:col-span-3 relative">
              <label className="block text-sm/6 font-medium text-gray-900">Date of birth</label>
              <div className="mt-2">
                <button type="button" onClick={() => setIsCalOpen((o)=>!o)} ref={anchorRef}
                  className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-base text-gray-900 outline-none focus:ring-2 focus:ring-indigo-600"
                  aria-haspopup="dialog" aria-expanded={isCalOpen}>
                  <span className={pvt.dateOfBirth ? "" : "text-gray-500"}>
                    {pvt.dateOfBirth
                      ? parseYmdLocal(pvt.dateOfBirth).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
                      : "Select date"}
                  </span>
                  <CalendarDaysIcon className="size-5 text-gray-400" aria-hidden="true" />
                </button>
              </div>

              {isCalOpen && (
                <div ref={calRef} role="dialog" aria-label="Choose date of birth"
                  className="absolute left-0 right-0 z-20 mt-2 w-full overflow-hidden rounded-2xl border bg-white shadow-xl">
                  <div className="p-4">
                    <div className="flex items-center">
                      <h3 className="flex-auto text-sm font-semibold text-gray-900">{monthLabel}</h3>
                      <button type="button" onClick={goPrevMonth} className="-my-1.5 p-1.5 text-gray-400 hover:text-gray-500">
                        <span className="sr-only">Previous month</span><ChevronLeftIcon className="size-5" />
                      </button>
                      <button type="button" onClick={goNextMonth} className="-my-1.5 -mr-1.5 ml-2 p-1.5 text-gray-400 hover:text-gray-500">
                        <span className="sr-only">Next month</span><ChevronRightIcon className="size-5" />
                      </button>
                      <button type="button" onClick={()=>setIsCalOpen(false)} className="-my-1.5 ml-2 p-1.5 text-gray-400 hover:text-gray-500">
                        <span className="sr-only">Close</span><XMarkIcon className="size-5" />
                      </button>
                    </div>

                    <div className="mt-6 grid grid-cols-7 text-center text-xs/6 text-gray-500">
                      <div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>
                    </div>
                    <div className="mt-2 grid grid-cols-7 text-sm">
                      {days.map((day) => (
                        <div key={day.date} className="py-2 not-first:border-t not-first:border-gray-200">
                          <button type="button"
                            onClick={() => { setPvt((prev)=>({ ...prev, dateOfBirth: day.date })); setIsCalOpen(false); }}
                            className="mx-auto flex size-8 items-center justify-center rounded-full hover:bg-gray-200">
                            <time dateTime={day.date}>{day.date.split("-").pop().replace(/^0/,"")}</time>
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-gray-600">
                      <span>
                        {pvt.dateOfBirth
                          ? `Selected: ${parseYmdLocal(pvt.dateOfBirth).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`
                          : "No date selected"}
                      </span>
                      <button type="button" onClick={() => {
                        const ymd = fmtYmd(new Date());
                        setPvt((prev)=>({ ...prev, dateOfBirth: ymd }));
                        const d = new Date(); setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
                      }} className="rounded px-2 py-1 hover:bg-gray-100">Today</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Area (auto) */}
            <div className="sm:col-span-3">
              <label className="block text-sm/6 font-medium text-gray-900">Area (auto)</label>
              <div className="mt-2">
                <input type="text" value={area || "—"} readOnly
                  className="block w-full rounded-md bg-gray-50 px-3 py-1.5 text-base text-gray-900 outline-1 outline-gray-300 sm:text-sm/6" />
                <p className="mt-1 text-xs text-gray-500">Based on your recent locations (majority region).</p>
              </div>
            </div>

            {/* Phone (India-only) */}
            <div className="sm:col-span-3">
              <label className="block text-sm/6 font-medium text-gray-900">Phone (India)</label>
              <div className="mt-2">
                <input type="tel" placeholder="+91 98765 43210"
                  value={phoneFormatted}
                  onChange={(e)=> setPvt((prev)=>({ ...prev, phone: e.target.value }))}
                  className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6" />
              </div>
            </div>

            {/* Save private */}
            <div className="col-span-full">
              <Button onClick={()=>savePrivate(false)} loading={savingPriv}>
                Save private details
              </Button>
            </div>
          </div>
        </div>

        {/* PUBLIC PROFILE */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-900/10 pb-12 md:grid-cols-3">
          <div>
            <h2 className="text-base/7 font-semibold text-gray-900">Public profile</h2>
            <p className="mt-1 text-sm/6 text-gray-600">
              Username must start with your name.
            </p>
          </div>

          <div className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6 md:col-span-2">
            <div className="sm:col-span-3">
              <label className="block text-sm/6 font-medium text-gray-900">Display name</label>
              <div className="mt-2">
                <input type="text" value={pub.displayName} readOnly
                  className="block w-full rounded-md bg-gray-50 px-3 py-1.5 text-base text-gray-900 outline-1 outline-gray-300 sm:text-sm/6" />
                <p className="mt-1 text-xs text-gray-500">Comes from your first &amp; last name.</p>
              </div>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-sm/6 font-medium text-gray-900">Username (slug)</label>
              <div className="mt-2">
                <input type="text" value={pub.sellerSlug}
                  onChange={(e)=>setPub({...pub, sellerSlug: e.target.value.toLowerCase()})}
                  placeholder="e.g. akash-ramasani-2705"
                  className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6" />
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

        {/* MARKETPLACE LISTINGS (unchanged) */}
        {/* ... keep your listings section here ... */}

        {err && <p className="text-sm text-rose-600">{err}</p>}
        {msg && <p className="text-sm text-green-700">{msg}</p>}
      </div>
    </Container>
  );
}

function ItemCard({ it }) {
  const thumb = it.images?.[0]?.optimizedURL || it.images?.[0]?.originalURL;
  return (
    <Link to={`/marketplace/${it.id}`} className="rounded-lg border bg-white overflow-hidden flex flex-col">
      {thumb ? (
        <img src={thumb} alt={it.title} className="h-40 w-full object-cover" />
      ) : (
        <div className="h-40 w-full grid place-items-center text-neutral-400">No image</div>
      )}
      <div className="p-3 space-y-1">
        <div className="font-medium line-clamp-1">{it.title}</div>
        <div className="text-sm text-neutral-600">
          ${Number(it.price).toFixed(2)} • {it.location} • {it.category || "Other"}
        </div>
      </div>
    </Link>
  );
}
