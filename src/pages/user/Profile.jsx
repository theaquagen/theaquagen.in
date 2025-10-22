// src/pages/user/Profile.jsx
import { useEffect, useRef, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { db, auth, storage } from "../../firebase";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp,
  collection, query, where, getDocs, writeBatch, limit as fsLimit, startAfter, orderBy
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile, sendEmailVerification } from "firebase/auth";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { UserCircleIcon } from "@heroicons/react/24/solid";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { Container } from "../../components/ui/Container";

/* ──────────────────────────────────────────────────────────────
   Shared helpers
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

/* ──────────────────────────────────────────────────────────────
   Calendar helpers (ported from Testimonials page)
   ────────────────────────────────────────────────────────────── */
function fmtYmd(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}
/** Parse 'YYYY-MM-DD' as a LOCAL date (avoid UTC off-by-one) */
function parseYmdLocal(ymd) {
  const [y, m, d] = (ymd || "").split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function weekdayMon0(date) { return (date.getDay() + 6) % 7; } // Monday=0
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
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

/* ────────────────────────────────────────────────────────────── */

const PAGE_SIZE = 12;

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

  /* -------- Calendar state for DOB (ported UI) -------- */
  const [isCalOpen, setIsCalOpen] = useState(false);
  const calRef = useRef(null);
  const anchorRef = useRef(null);

  const baseDob = pvt.dateOfBirth ? parseYmdLocal(pvt.dateOfBirth) : new Date();
  const [viewYear, setViewYear] = useState(baseDob.getFullYear());
  const [viewMonth, setViewMonth] = useState(baseDob.getMonth());

  const days = useMemo(
    () => getMonthGrid(viewYear, viewMonth, pvt.dateOfBirth),
    [viewYear, viewMonth, pvt.dateOfBirth]
  );
  const monthLabel = useMemo(
    () =>
      new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [viewYear, viewMonth]
  );
  const openCalendar = () => {
    const d = pvt.dateOfBirth ? parseYmdLocal(pvt.dateOfBirth) : new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setIsCalOpen(true);
  };
  const closeCalendar = () => setIsCalOpen(false);
  const goPrevMonth = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const goNextMonth = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  useEffect(() => {
    if (isCalOpen && calRef.current) {
      calRef.current.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [isCalOpen]);
  useEffect(() => {
    if (!isCalOpen) return;
    const onDocClick = (e) => {
      if (
        calRef.current &&
        !calRef.current.contains(e.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target)
      ) {
        closeCalendar();
      }
    };
    const onKey = (e) => { if (e.key === "Escape") closeCalendar(); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isCalOpen]);

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
     Your marketplace listings (paginated)
     ────────────────────────────────────────────────────────────── */
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
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
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
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
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
        {/* Header (removed "View public profile" link) */}
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold">Profile</div>
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

            {/* Date of birth — Calendar popover (ported) */}
            <div className="sm:col-span-3 relative">
              <label className="block text-sm/6 font-medium text-gray-900">
                Date of birth
              </label>

              <div className="mt-2">
                <button
                  ref={anchorRef}
                  type="button"
                  onClick={() => (isCalOpen ? closeCalendar() : openCalendar())}
                  className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-base text-gray-900 outline-none focus:ring-2 focus:ring-indigo-600"
                  aria-haspopup="dialog"
                  aria-expanded={isCalOpen}
                >
                  <span className={pvt.dateOfBirth ? "" : "text-gray-500"}>
                    {pvt.dateOfBirth
                      ? parseYmdLocal(pvt.dateOfBirth).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "Select date"}
                  </span>
                  <CalendarDaysIcon className="size-5 text-gray-400" aria-hidden="true" />
                </button>
              </div>

              {isCalOpen && (
                <div
                  ref={calRef}
                  role="dialog"
                  aria-label="Choose date of birth"
                  className="absolute left-0 right-0 z-20 mt-2 w-full overflow-hidden rounded-2xl border bg-white shadow-xl"
                >
                  <div className="p-4">
                    <div className="flex items-center">
                      <h3 className="flex-auto text-sm font-semibold text-gray-900">
                        {monthLabel}
                      </h3>
                      <button
                        type="button"
                        onClick={goPrevMonth}
                        className="-my-1.5 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500"
                      >
                        <span className="sr-only">Previous month</span>
                        <ChevronLeftIcon aria-hidden="true" className="size-5" />
                      </button>
                      <button
                        type="button"
                        onClick={goNextMonth}
                        className="-my-1.5 -mr-1.5 ml-2 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500"
                      >
                        <span className="sr-only">Next month</span>
                        <ChevronRightIcon aria-hidden="true" className="size-5" />
                      </button>
                      <button
                        type="button"
                        onClick={closeCalendar}
                        className="ml-2 -my-1.5 flex flex-none items-center justify-center p-1.5 text-gray-400 hover:text-gray-500"
                      >
                        <span className="sr-only">Close</span>
                        <XMarkIcon aria-hidden="true" className="size-5" />
                      </button>
                    </div>

                    <div className="mt-6 grid grid-cols-7 text-center text-xs/6 text-gray-500">
                      <div>M</div>
                      <div>T</div>
                      <div>W</div>
                      <div>T</div>
                      <div>F</div>
                      <div>S</div>
                      <div>S</div>
                    </div>

                    <div className="mt-2 grid grid-cols-7 text-sm">
                      {days.map((day, dayIdx) => (
                        <div
                          key={day.date}
                          data-first-line={dayIdx <= 6 ? "" : undefined}
                          className="py-2 not-data-first-line:border-t not-data-first-line:border-gray-200"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setPvt((prev) => ({ ...prev, dateOfBirth: day.date }));
                              closeCalendar();
                            }}
                            data-is-today={day.isToday ? "" : undefined}
                            data-is-selected={day.isSelected ? "" : undefined}
                            data-is-current-month={day.isCurrentMonth ? "" : undefined}
                            className="mx-auto flex size-8 items-center justify-center rounded-full not-data-is-selected:not-data-is-today:not-data-is-current-month:text-gray-400 not-data-is-selected:hover:bg-gray-200 not-data-is-selected:not-data-is-today:data-is-current-month:text-gray-900 data-is-selected:font-semibold data-is-selected:text-white data-is-selected:not-data-is-today:bg-gray-900 data-is-today:font-semibold not-data-is-selected:data-is-today:text-indigo-600 data-is-selected:data-is-today:bg-indigo-600"
                          >
                            <time dateTime={day.date}>
                              {day.date.split("-").pop().replace(/^0/, "")}
                            </time>
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-gray-600">
                      <span>
                        {pvt.dateOfBirth
                          ? `Selected: ${parseYmdLocal(pvt.dateOfBirth).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}`
                          : "No date selected"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const ymd = fmtYmd(new Date());
                          setPvt((prev)=>({ ...prev, dateOfBirth: ymd }));
                          const d = new Date();
                          setViewYear(d.getFullYear());
                          setViewMonth(d.getMonth());
                        }}
                        className="rounded px-2 py-1 hover:bg-gray-100"
                      >
                        Today
                      </button>
                    </div>
                  </div>
                </div>
              )}
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

        {/* PUBLIC PROFILE (now with divider below to separate from listings) */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-900/10 pb-12 md:grid-cols-3">
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
                <p className="mt-1 text-xs text-gray-500">Display name comes from your first &amp; last name.</p>
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

        {/* MARKETPLACE LISTINGS — same two-column style */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-3">
          <div>
            <h2 className="text-base/7 font-semibold text-gray-900">Your marketplace listings</h2>
            <p className="mt-1 text-sm/6 text-gray-600">All items you’ve posted in the marketplace.</p>
          </div>

          <div className="md:col-span-2">
            {loadingItems ? (
              <div className="text-sm text-neutral-500">Loading…</div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((it) => <ItemCard key={it.id} it={it} />)}
                </div>

                {items.length === 0 && (
                  <div className="text-sm text-neutral-500">You haven’t posted any items yet.</div>
                )}

                <div className="mt-4 flex justify-center">
                  {!endReached && items.length > 0 && (
                    <Button onClick={loadMore} loading={loadingMore} loadingText="Loading…">
                      Load more
                    </Button>
                  )}
                  {endReached && items.length > 0 && (
                    <div className="text-xs text-neutral-500">You’ve reached the end.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
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
