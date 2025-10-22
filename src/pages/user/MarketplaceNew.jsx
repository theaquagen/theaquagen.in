import { useMemo, useState, useEffect } from "react";
import { collection, doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db, auth } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import ImageUploader from "../../components/ImageUploader";
import { sendEmailVerification } from "firebase/auth";

/* ──────────────────────────────────────────────────────────────
   Minimal helpers (fallback only; signup should have created slug)
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
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");
const last4Digits = (s) => onlyDigits(s).slice(-4);

const CATEGORIES = ["Electronics","Fashion","Home","Vehicles","Sports","Books","Toys","Other"];

export default function MarketplaceNew() {
  const { user } = useAuth();
  const nav = useNavigate();

  const itemId = useMemo(() => doc(collection(db, "items")).id, []);
  const [form, setForm] = useState({
    title: "", price: "", location: "", category: "Other", description: "",
  });
  const [images, setImages] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Prefill location from private profile
  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      const district = snap.exists() ? (snap.data().district || "") : "";
      if (district && !form.location) setForm((f)=>({ ...f, location: district }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const resendVerification = async () => {
    setSendingEmail(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setErr("Verification email sent. Check your inbox.");
    } catch (e) {
      setErr(e.message || "Failed to send verification email.");
    } finally {
      setSendingEmail(false);
    }
  };

  // Read profile; if missing slug (legacy), try to create it here as a fallback
  const ensurePublicPresence = async () => {
    const profRef = doc(db, "profiles", user.uid);
    const profSnap = await getDoc(profRef);
    if (profSnap.exists() && profSnap.data()?.sellerSlug) {
      const p = profSnap.data();
      return {
        sellerSlug: p.sellerSlug,
        displayName: p.displayName || auth.currentUser?.displayName || auth.currentUser?.email || "Seller",
        avatar: p.avatar || auth.currentUser?.photoURL || "",
      };
    }

    // Fallback path: derive from private users doc (should be rare)
    const pvtSnap = await getDoc(doc(db, "users", user.uid));
    const pvt = pvtSnap.exists() ? pvtSnap.data() : {};
    const first = pvt.firstName || "";
    const last = pvt.lastName || "";
    const baseName = `${first} ${last}`.trim();
    const base = slugify(baseName || (auth.currentUser?.email || "").split("@")[0] || `user-${user.uid.slice(0,6)}`);
    const birth = ddmmFromDOB(pvt.dateOfBirth);
    const last4 = last4Digits(pvt.phone || pvt.phoneE164);

    // simple inline claim (no duplicates)
    const tryClaim = async (slug) => {
      const ref = doc(db, "usernames", slug);
      const snap = await getDoc(ref);
      if (snap.exists()) return null;
      await setDoc(ref, { uid: user.uid });
      return slug;
    };

    let claimed = await tryClaim(base);
    if (!claimed && birth) claimed = await tryClaim(`${base}-${birth}`);
    if (!claimed && birth && last4) claimed = await tryClaim(`${base}-${birth}${last4}`);
    if (!claimed && !birth && last4) claimed = await tryClaim(`${base}-${last4}`);
    for (let i = 0; !claimed && i < 10; i++) {
      const sfx = Math.floor(100 + Math.random() * 900);
      claimed = await tryClaim(`${base}-${sfx}`);
    }
    if (!claimed) throw new Error("Could not create a unique username. Try again.");

    const displayName =
      `${first} ${last}`.trim() ||
      auth.currentUser?.displayName ||
      auth.currentUser?.email ||
      "Seller";

    const avatar = auth.currentUser?.photoURL || "";

    await setDoc(profRef, {
      displayName,
      avatar,
      sellerSlug: claimed,
    }, { merge: true });

    return { sellerSlug: claimed, displayName, avatar };
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (!auth.currentUser.emailVerified) {
      setErr("Verify your email before posting. Check your inbox.");
      return;
    }
    if (images.length === 0) { setErr("Please upload at least 1 image before submitting."); return; }
    if (images.length > 5) { setErr("Max 5 images are allowed."); return; }

    setLoading(true);
    try {
      // should already exist from signup; fallback if legacy
      const { sellerSlug, displayName, avatar } = await ensurePublicPresence();

      const payload = {
        ownerId: user.uid,
        ownerSlug: sellerSlug,
        ownerName: displayName,
        ownerPhotoURL: avatar,
        title: form.title.trim(),
        price: Number.isFinite(Number(form.price)) ? Number(form.price) : 0,
        location: form.location.trim() || "Unknown",
        category: form.category || "Other",
        description: form.description.trim(),
        images,
        hasImages: images.length > 0,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, "items", itemId), payload);
      nav(`/marketplace/${itemId}`, { replace: true });
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to create item");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-semibold">New Item</h1>

      {!auth.currentUser.emailVerified && (
        <div className="rounded-lg border bg-amber-50 p-3 text-sm">
          Your email is not verified. You must verify before posting.
          <div className="mt-2">
            <Button size="sm" onClick={resendVerification} loading={sendingEmail}>
              Resend verification email
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4 bg-white p-4 rounded-lg border">
        <div>
          <label className="text-sm">Title</label>
          <Input name="title" value={form.title} onChange={onChange} required />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">Price</label>
            <Input type="number" name="price" value={form.price} onChange={onChange} required min="0" step="0.01" />
          </div>
          <div>
            <label className="text-sm">Location</label>
            <Input name="location" value={form.location} onChange={onChange} required placeholder="Your district" />
          </div>
          <div>
            <label className="text-sm">Category</label>
            <select
              name="category"
              value={form.category}
              onChange={onChange}
              className="w-full h-10 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={onChange}
            className="w-full h-28 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            required
          />
        </div>

        <div>
          <label className="text-sm">Images (upload before submit)</label>
          <ImageUploader userId={user.uid} itemId={itemId} onChange={setImages} />
        </div>

        {err && <p className="text-sm text-rose-600">{err}</p>}
        <div className="flex gap-2">
          <Button type="submit" loading={loading} loadingText="Publishing…">Publish</Button>
          <Button type="button" variant="outline" onClick={() => history.back()} disabled={loading}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
