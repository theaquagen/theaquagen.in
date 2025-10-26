import { useMemo, useState, useEffect } from "react";
import {
  collection, doc, setDoc, serverTimestamp, getDoc,
  getDocs, query, orderBy, limit as fsLimit
} from "firebase/firestore";
import { db, auth, storage } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

import Button from "../../components/ui/Button";
import { sendEmailVerification } from "firebase/auth";

import { Container } from "../../components/ui/Container";
import PageHeading from "../../components/ui/PageHeading";
import {
  ChevronDownIcon,
  PhotoIcon,
  XMarkIcon,
  CheckCircleIcon,
} from "@heroicons/react/20/solid";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useToast } from "../../components/Toast/ToastProvider";

/* ───────────── Helpers ───────────── */
function slugify(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

// "new-delhi" -> "New Delhi"
function titleFromSlug(slug = "") {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function computeCityFromRecent(recent = []) {
  if (!Array.isArray(recent) || recent.length === 0) return "";
  const cities = recent
    .map((s) => String(s || "").split("_").pop() || "")
    .filter(Boolean);
  if (cities.length === 0) return "";
  const counts = new Map();
  for (const c of cities) counts.set(c, (counts.get(c) || 0) + 1);
  let max = 0;
  counts.forEach((v) => { if (v > max) max = v; });
  const top = [...counts.entries()].filter(([, v]) => v === max).map(([k]) => k);
  const chosen = top.length === 1 ? top[0] : (cities[0] || top[0]);
  return titleFromSlug(chosen);
}

// Indian number formatting (no currency sign)
function formatINRNumberString(value) {
  const [intPart, decPartRaw] = String(value).split(".");
  const x = intPart.replace(/\D/g, "");
  if (!x) return decPartRaw ? `0.${decPartRaw.slice(0, 2)}` : "";
  const last3 = x.slice(-3);
  const other = x.slice(0, -3);
  const grouped = other ? other.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  const dec = (decPartRaw || "").replace(/\D/g, "").slice(0, 2);
  return dec ? `${grouped}.${dec}` : grouped;
}

function sanitizePriceInput(raw) {
  let s = String(raw || "").replace(/,/g, "");
  s = s.replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  const [i, d] = s.split(".");
  const dec = typeof d === "string" ? d.slice(0, 2) : undefined;
  return dec !== undefined ? `${i}.${dec}` : i;
}

/* Title-case at word boundaries (preserves spaces while typing) */
function toTitleCaseSmart(s) {
  const lower = String(s || "").toLowerCase();
  return lower.replace(/\b([a-z])/g, (_, c) => c.toUpperCase());
}

const CATEGORIES = ["Electronics", "Fashion", "Home", "Vehicles", "Sports", "Books", "Toys", "Other"];
const MIN_IMAGES = 1;
const MAX_IMAGES = 6;
const MAX_IMG_MB = 10;
const TITLE_MIN = 5;
const TITLE_MAX = 100;

export default function MarketplaceNew() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { showToast } = useToast();

  const itemId = useMemo(() => doc(collection(db, "items")).id, []);
  const [form, setForm] = useState({
    title: "",
    price: "",
    city: "",
    category: "Other",
    description: "",
  });

  const [errors, setErrors] = useState({
    title: "",
    price: "",
    city: "",
    images: "",
  });

  const [uploaded, setUploaded] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  /** Prefill CITY */
  useEffect(() => {
    (async () => {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.exists() ? (userSnap.data() || {}) : {};

        let fromLocations = "";
        try {
          const locQ = query(
            collection(db, "users", user.uid, "locations"),
            orderBy("count", "desc"),
            fsLimit(1)
          );
          const locSnap = await getDocs(locQ);
          if (!locSnap.empty) {
            const top = locSnap.docs[0].data() || {};
            fromLocations = typeof top.city === "string" ? top.city : "";
          }
        } catch {}

        const fromRecent = computeCityFromRecent(userData.recentLocations || []);
        const prefill =
          fromLocations ||
          (typeof userData.city === "string" && userData.city) ||
          fromRecent ||
          (typeof userData.area === "string" && userData.area) ||
          (typeof userData.district === "string" && userData.district) ||
          "";

        if (prefill && !form.city) setForm((f) => ({ ...f, city: prefill }));
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  /* ───────────── Inline validation ───────────── */
  useEffect(() => {
    const t = form.title.trim();
    if (!t || t.length < TITLE_MIN || t.length > TITLE_MAX) {
      setErrors((e) => ({ ...e, title: "Use a clear, short title (5–100 chars)." }));
    } else setErrors((e) => ({ ...e, title: "" }));
  }, [form.title]);

  useEffect(() => {
    const numeric = Number(form.price.replace(/,/g, ""));
    if (!form.price || Number.isNaN(numeric) || numeric <= 0) {
      setErrors((e) => ({ ...e, price: "Add your price (Indian format like 1,23,456.78)." }));
    } else setErrors((e) => ({ ...e, price: "" }));
  }, [form.price]);

  useEffect(() => {
    if (!form.city.trim()) setErrors((e) => ({ ...e, city: "Enter the pickup city." }));
    else setErrors((e) => ({ ...e, city: "" }));
  }, [form.city]);

  useEffect(() => {
    if (uploaded.length < MIN_IMAGES) setErrors((e) => ({ ...e, images: `0/${MAX_IMAGES} uploaded • up to ${MAX_IMG_MB}MB each • Add at least 1 photo.` }));
    else if (uploaded.length > MAX_IMAGES) setErrors((e) => ({ ...e, images: `${uploaded.length}/${MAX_IMAGES} uploaded • up to ${MAX_IMG_MB}MB each • Max ${MAX_IMAGES} photos.` }));
    else setErrors((e) => ({ ...e, images: `${uploaded.length}/${MAX_IMAGES} uploaded • up to ${MAX_IMG_MB}MB each` }));
  }, [uploaded.length]);

  /* Title: capitalize every word while typing */
  const onTitleChange = (e) => {
    const raw = e.target.value;
    setForm((f) => ({ ...f, title: toTitleCaseSmart(raw) }));
  };

  /* Description: NO formatting — just store what user types */
  const onDescriptionChange = (e) => {
    setForm((f) => ({ ...f, description: e.target.value }));
  };

  /* Price */
  const onPriceChange = (e) => {
    const sanitized = sanitizePriceInput(e.target.value);
    const formatted = formatINRNumberString(sanitized);
    setForm((f) => ({ ...f, price: formatted }));
  };

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const resendVerification = async () => {
    setSendingEmail(true);
    try {
      await sendEmailVerification(auth.currentUser);
      showToast("Verification email sent. Check your inbox.", "info");
    } catch (e) {
      showToast(e.message || "Failed to send verification email.", "error");
    } finally {
      setSendingEmail(false);
    }
  };

  // Upload to: marketplace/{uid}/{itemId}/original/{fileName}
  const handleFileSelect = async (e) => {
    const selected = Array.from(e.target.files || []);
    const imagesOnly = selected.filter((f) => f.type.startsWith("image/"));
    if (imagesOnly.length === 0) return;

    if (uploaded.length + imagesOnly.length > MAX_IMAGES) {
      showToast(`You can upload up to ${MAX_IMAGES} images.`, "error");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const uploads = await Promise.all(
        imagesOnly.map(async (file, idx) => {
          if (file.size > MAX_IMG_MB * 1024 * 1024) {
            throw new Error(`"${file.name}" exceeds ${MAX_IMG_MB}MB.`);
          }
          const base = slugify(file.name.replace(/\.(heic|heif)$/i, ".heic")) || `image-${Date.now()}-${idx}`;
          const path = `marketplace/${user.uid}/${itemId}/original/${Date.now()}_${idx}_${base}`;
          const storageRef = ref(storage, path);
          await uploadBytes(storageRef, file, { contentType: file.type || "image/*" });
          const url = await getDownloadURL(storageRef);
          return { url, path, name: file.name, size: file.size };
        })
      );
      setUploaded((prev) => [...prev, ...uploads]);
      showToast(`Uploaded ${uploads.length} image${uploads.length > 1 ? "s" : ""}.`, "success");
    } catch (e) {
      console.error(e);
      showToast(e.message || "Image upload failed.", "error");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeImage = async (idx) => {
    const img = uploaded[idx];
    try {
      if (img?.path) await deleteObject(ref(storage, img.path)).catch(() => {});
      setUploaded((prev) => prev.filter((_, i) => i !== idx));
      showToast("Removed image.", "info");
    } catch {
      setUploaded((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const canPublish =
    !errors.title &&
    !errors.price &&
    !errors.city &&
    form.title.trim().length >= TITLE_MIN &&
    form.city.trim() &&
    form.price &&
    uploaded.length >= MIN_IMAGES &&
    uploaded.length <= MAX_IMAGES &&
    auth.currentUser?.emailVerified;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!auth.currentUser.emailVerified) {
      showToast("Verify your email before posting.", "error");
      return;
    }
    if (!canPublish) {
      showToast("Please fix the messages below before publishing.", "error");
      return;
    }

    setLoading(true);
    try {
      const images = uploaded.map((u) => ({ originalURL: u.url, optimizedURL: u.url }));
      const priceNumber = Number(String(form.price).replace(/,/g, "")) || 0;

      const payload = {
        ownerId: user.uid,
        ownerName: auth.currentUser?.displayName || auth.currentUser?.email || "Seller",
        ownerPhotoURL: auth.currentUser?.photoURL || "",
        title: toTitleCaseSmart(form.title.trim()),
        price: priceNumber,
        city: form.city.trim(),
        category: form.category || "Other",
        description: form.description, // ← no formatting
        images,
        hasImages: images.length > 0,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, "items", itemId), payload);
      showToast("Listing published!", "success");
      nav(`/marketplace/${itemId}`, { replace: true });
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to create item.", "error");
    } finally {
      setLoading(false);
    }
  };

  /* Indigo focus styles for all fields */
  const inputClass = [
    "block w-full rounded-lg border border-transparent shadow-sm ring-1 ring-gray-300",
    "px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-base/6 sm:text-sm/6",
    "focus:ring-2 focus:ring-indigo-600 focus:outline-none"
  ].join(" ");

  const selectClass = [
    "col-start-1 row-start-1 w-full appearance-none rounded-lg bg-white",
    "py-[calc(--spacing(1.5)-1px)] pr-8 pl-[calc(--spacing(2)-1px)] text-base text-gray-900",
    "border border-transparent shadow-sm ring-1 ring-gray-300",
    "focus:ring-2 focus:ring-indigo-600 focus:outline-none sm:text-sm/6"
  ].join(" ");

  const textareaClass = [
    "block w-full rounded-lg border border-transparent shadow-sm ring-1 ring-gray-300",
    "px-[calc(--spacing(2)-1px)] py-[calc(--spacing(1.5)-1px)] text-base/6 sm:text-sm/6",
    "min-h-40 resize-y",
    "focus:ring-2 focus:ring-indigo-600 focus:outline-none"
  ].join(" ");

  const cardRing = "shadow-md ring-1 ring-gray-200";

  return (
    <Container className="my-16">
      <div className="space-y-8">
        <PageHeading
          title="New Marketplace Listing"
          description="Create a listing with photos, price, city, and category so buyers can find it faster. You must verify your email before posting."
        />

        {!auth.currentUser.emailVerified && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm ring-1 ring-amber-200 border border-transparent">
            Your email is not verified. You must verify before posting.
            <div className="mt-2">
              <Button size="sm" onClick={resendVerification} loading={sendingEmail}>
                Resend verification email
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 pb-12 md:grid-cols-3">
          <div>
            <h2 className="text-base/7 font-semibold text-gray-900">Listing details</h2>

            <div className={`mt-3 rounded-xl bg-white p-4 ${cardRing}`}>
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="size-5 text-green-600" />
                <p className="text-sm/6 font-medium text-gray-900">Good listing basics</p>
              </div>
              <ul className="mt-3 space-y-2 text-sm/6 text-gray-700" role="list">
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 text-green-600 shrink-0" />
                  <span>Use a clear title.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 text-green-600 shrink-0" />
                  <span>Add a fair price.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 text-green-600 shrink-0" />
                  <span>Include <strong>1–6</strong> photos (up to <strong>{MAX_IMG_MB}MB</strong> each).</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircleIcon className="mt-0.5 size-4 text-green-600 shrink-0" />
                  <span>Set the city where buyers can pick up.</span>
                </li>
              </ul>
            </div>
          </div>

          <form onSubmit={onSubmit} className="grid max-w-2xl grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-6 md:col-span-2">
            {/* Title */}
            <div className="sm:col-span-6">
              <label className="text-sm/5 font-medium">Title</label>
              <div className="mt-2">
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={onTitleChange}
                  className={inputClass}
                  placeholder="e.g., iPhone 13 128GB Blue"
                />
              </div>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-gray-600">{errors.title || "Keep it short and clear (5–100 characters)."}</p>
                <p className="text-[11px] text-gray-400">{form.title.trim().length}/{TITLE_MAX}</p>
              </div>
            </div>

            {/* Price */}
            <div className="sm:col-span-3">
              <label className="text-sm/5 font-medium">Price</label>
              <div className="mt-2 relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-700">₹</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name="price"
                  value={form.price}
                  onChange={onPriceChange}
                  placeholder="0"
                  className={`${inputClass} pl-8`}
                />
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {errors.price || "Add your price (Indian format like 1,23,456.78)."}
              </p>
            </div>

            {/* City */}
            <div className="sm:col-span-3">
              <label className="text-sm/5 font-medium">City</label>
              <div className="mt-2">
                <input
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={onChange}
                  placeholder="e.g., Mountain House"
                  className={inputClass}
                />
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {errors.city || "Enter the pickup city."}
              </p>
            </div>

            {/* Category */}
            <div className="sm:col-span-3">
              <label htmlFor="category" className="text-sm/5 font-medium">Category</label>
              <div className="mt-2 grid grid-cols-1">
                <select
                  id="category"
                  name="category"
                  value={form.category}
                  onChange={onChange}
                  className={selectClass}
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
              <p className="mt-1 text-xs text-gray-600">Choose the closest match.</p>
            </div>

            {/* Description (NO formatting) */}
            <div className="sm:col-span-6">
              <label className="text-sm/5 font-medium">Description</label>
              <div className="mt-2">
                <textarea
                  name="description"
                  value={form.description}
                  onChange={onDescriptionChange}
                  className={textareaClass}
                  placeholder={`Add details like condition, brand, what's included, and pickup timings.`}
                />
              </div>
              <p className="mt-1 text-xs text-gray-600">
                Write freely — no automatic formatting will be applied.
              </p>
            </div>

            {/* Images */}
            <div className="col-span-full">
              <label htmlFor="file-upload" className="text-sm/5 font-medium">Images</label>

              <div className="mt-2 flex justify-center rounded-xl bg-white px-6 py-10 border border-dotted border-gray-300 ring-1 ring-gray-200">
                <div className="text-center">
                  <PhotoIcon aria-hidden="true" className="mx-auto size-12 text-gray-300" />
                  <div className="mt-4 flex flex-col items-center text-sm/6 text-gray-700">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-600 hover:text-indigo-500"
                    >
                      <span>Upload images</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={handleFileSelect}
                        disabled={uploading || uploaded.length >= MAX_IMAGES}
                      />
                    </label>
                    <span className="mt-1 text-xs text-gray-500">
                      {uploaded.length === 0 ? "No file chosen" : `${uploaded.length} file${uploaded.length > 1 ? "s" : ""} selected`}
                    </span>
                    <span className="mt-1 text-xs text-gray-500">or drag and drop</span>
                  </div>

                  <div className="mt-3 text-xs text-gray-700">
                    {errors.images || `${uploaded.length}/${MAX_IMAGES} uploaded • up to ${MAX_IMG_MB}MB each`}
                  </div>
                </div>
              </div>

              {uploaded.length > 0 && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {uploaded.map((img, idx) => (
                    <div
                      key={img.path}
                      className="relative overflow-hidden rounded-lg border border-transparent shadow-sm ring-1 ring-gray-200 bg-white"
                    >
                      <img src={img.url} alt={img.name || `Image ${idx + 1}`} className="h-40 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 inline-flex items-center justify-center rounded-full bg-white/90 hover:bg-white p-1 text-gray-700 shadow-sm ring-1 ring-gray-300"
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
              <div className="flex items-center gap-2">
                <Button type="submit" loading={loading} disabled={!canPublish || uploading} loadingText="Publishing…">
                  Publish
                </Button>
                <Button type="button" variant="outline" onClick={() => history.back()} disabled={loading || uploading}>
                  Cancel
                </Button>
                {!auth.currentUser.emailVerified && (
                  <span className="text-xs text-gray-600">Verify email to enable publishing.</span>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </Container>
  );
}
