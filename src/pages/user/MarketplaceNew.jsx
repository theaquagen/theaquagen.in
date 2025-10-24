import { useMemo, useState, useEffect } from "react";
import { collection, doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db, auth, storage } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

import Button from "../../components/ui/Button";
import { sendEmailVerification } from "firebase/auth";

import { Container } from "../../components/ui/Container";
import PageHeading from "../../components/ui/PageHeading";
import { ChevronDownIcon, PhotoIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

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
  } catch {
    return "";
  }
}
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");
const last4Digits = (s) => onlyDigits(s).slice(-4);

const CATEGORIES = [
  "Electronics",
  "Fashion",
  "Home",
  "Vehicles",
  "Sports",
  "Books",
  "Toys",
  "Other",
];

export default function MarketplaceNew() {
  const { user } = useAuth();
  const nav = useNavigate();

  const itemId = useMemo(() => doc(collection(db, "items")).id, []);
  const [form, setForm] = useState({
    title: "",
    price: "",
    location: "",
    category: "Other",
    description: "",
  });

  // Uploaded images -> { url, path, name }
  const [uploaded, setUploaded] = useState([]);
  const [uploading, setUploading] = useState(false);

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const district = snap.exists() ? snap.data().district || "" : "";
        if (district && !form.location)
          setForm((f) => ({ ...f, location: district }));
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const resendVerification = async () => {
    setSendingEmail(true);
    setErr("");
    setMsg("");
    try {
      await sendEmailVerification(auth.currentUser);
      setMsg("Verification email sent. Check your inbox.");
    } catch (e) {
      setErr(e.message || "Failed to send verification email.");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleFileSelect = async (e) => {
    const selected = Array.from(e.target.files || []);
    const imagesOnly = selected.filter((f) => f.type.startsWith("image/"));
    if (imagesOnly.length === 0) return;

    setUploading(true);
    setErr("");
    try {
      const uploads = await Promise.all(
        imagesOnly.map(async (file, idx) => {
          const safeName = slugify(file.name) || `image-${Date.now()}-${idx}`;
          const path = `items/${user.uid}/${itemId}/${Date.now()}_${idx}_${safeName}`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          return { url, path, name: file.name };
        })
      );
      setUploaded((prev) => [...prev, ...uploads]);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Image upload failed.");
    } finally {
      setUploading(false);
      // reset the input so the same file can be selected again if needed
      e.target.value = "";
    }
  };

  const removeImage = async (idx) => {
    const img = uploaded[idx];
    setErr("");
    try {
      if (img?.path) {
        await deleteObject(ref(storage, img.path)).catch(() => {});
      }
    } finally {
      setUploaded((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!auth.currentUser.emailVerified) {
      setErr("Verify your email before posting.");
      return;
    }
    if (uploading) {
      setErr("Please wait for images to finish uploading.");
      return;
    }
    if (uploaded.length === 0) {
      setErr("Please upload at least one image.");
      return;
    }

    setLoading(true);
    try {
      const images = uploaded.map((u) => ({
        originalURL: u.url,
        optimizedURL: u.url,
      }));

      const payload = {
        ownerId: user.uid,
        ownerSlug: undefined, // optional: set if you derive it here
        ownerName: auth.currentUser?.displayName || auth.currentUser?.email || "Seller",
        ownerPhotoURL: auth.currentUser?.photoURL || "",
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
    <Container>
      <div className="space-y-8 mt-16">
        {/* Header */}
        <div className="flex items-center justify-between">
          <PageHeading title="New Marketplace Listing" />
        </div>

        {/* Email verification alert */}
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

        {/* LISTING DETAILS */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 border-b border-gray-900/10 pb-12 md:grid-cols-3">
          <div>
            <h2 className="text-base/7 font-semibold text-gray-900">Listing details</h2>
            <p className="mt-1 text-sm/6 text-gray-600">
              Add a clear title, fair price, accurate location, and category so buyers can find your item.
            </p>
          </div>

          <form onSubmit={onSubmit} className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6 md:col-span-2">
            {/* Title */}
            <div className="sm:col-span-6">
              <label className="block text-sm/6 font-medium text-gray-900">Title</label>
              <div className="mt-2">
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={onChange}
                  required
                  className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                />
              </div>
            </div>

            {/* Price */}
            <div className="sm:col-span-3">
              <label className="block text-sm/6 font-medium text-gray-900">Price</label>
              <div className="mt-2">
                <input
                  type="number"
                  name="price"
                  value={form.price}
                  onChange={onChange}
                  required
                  min="0"
                  step="0.01"
                  className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                />
              </div>
            </div>

            {/* Location */}
            <div className="sm:col-span-3">
              <label className="block text-sm/6 font-medium text-gray-900">Location</label>
              <div className="mt-2">
                <input
                  type="text"
                  name="location"
                  value={form.location}
                  onChange={onChange}
                  required
                  placeholder="Your district"
                  className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                />
              </div>
            </div>

            {/* Category (country-style select) */}
            <div className="sm:col-span-3">
              <label htmlFor="category" className="block text-sm/6 font-medium text-gray-900">
                Category
              </label>
              <div className="mt-2 grid grid-cols-1">
                <select
                  id="category"
                  name="category"
                  value={form.category}
                  onChange={onChange}
                  className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                />
              </div>
            </div>

            {/* Description */}
            <div className="sm:col-span-6">
              <label className="block text-sm/6 font-medium text-gray-900">Description</label>
              <div className="mt-2">
                <textarea
                  name="description"
                  value={form.description}
                  onChange={onChange}
                  required
                  className="block w-full h-28 rounded-md bg-white px-3 py-2 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
                />
              </div>
            </div>

            {/* Images (cover photo-style with auto-upload) */}
            <div className="col-span-full">
              <label htmlFor="file-upload" className="block text-sm/6 font-medium text-gray-900">
                Images
              </label>
              <div className="mt-2 flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10">
                <div className="text-center">
                  <PhotoIcon aria-hidden="true" className="mx-auto size-12 text-gray-300" />
                  <div className="mt-4 flex text-sm/6 text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-600 hover:text-indigo-500"
                    >
                      <span>{uploading ? "Uploading…" : "Upload images"}</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={handleFileSelect}
                        disabled={uploading}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs/5 text-gray-600">Any image format up to 10MB each</p>
                </div>
              </div>

              {/* Uploaded images preview grid (max 3 per row on desktop) */}
              {uploaded.length > 0 && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {uploaded.map((img, idx) => (
                    <div key={img.path} className="relative overflow-hidden rounded-2xl border">
                      <img
                        src={img.url}
                        alt={img.name || `Image ${idx + 1}`}
                        className="h-40 w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 inline-flex items-center justify-center rounded-full bg-white/80 hover:bg-white p-1 text-gray-700 shadow-sm"
                        title="Remove"
                      >
                        <XMarkIcon className="size-4" aria-hidden="true" />
                        <span className="sr-only">Remove image</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="col-span-full">
              {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
              {msg && <p className="text-sm text-green-700 mb-2">{msg}</p>}

              <div className="flex gap-2">
                <Button type="submit" loading={loading} disabled={uploading} loadingText="Publishing…">
                  Publish
                </Button>
                <Button type="button" variant="outline" onClick={() => history.back()} disabled={loading || uploading}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Container>
  );
}