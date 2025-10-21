// src/pages/user/Marketplace.jsx
import { useEffect, useRef, useState } from "react";
import {
  collection, getDoc, doc, getDocs, query, where, orderBy, limit, startAfter,
  onSnapshot
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";

const PAGE_SIZE = 12;
const CATEGORIES = ["All","Electronics","Fashion","Home","Vehicles","Sports","Books","Toys","Other"];

export default function Marketplace() {
  const { user } = useAuth();
  const [district, setDistrict] = useState("");
  const [locationFilter, setLocationFilter] = useState("all"); // "all" | "myDistrict"
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("newest"); // newest | priceAsc | priceDesc

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const lastDocRef = useRef(null);

  const [favIds, setFavIds] = useState(new Set());

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      setDistrict(snap.exists() ? snap.data().district || "" : "");
    })();
  }, [user.uid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users", user.uid, "favorites"), (qs) => {
      const s = new Set(); qs.forEach((d) => s.add(d.id)); setFavIds(s);
    });
    return () => unsub();
  }, [user.uid]);

  const buildQuery = (cursor) => {
    const constraints = [];
    if (locationFilter === "myDistrict" && district) constraints.push(where("location", "==", district));
    if (category && category !== "All") constraints.push(where("category", "==", category));
    if (sort === "priceAsc") constraints.push(orderBy("price", "asc"));
    else if (sort === "priceDesc") constraints.push(orderBy("price", "desc"));
    else constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(PAGE_SIZE));
    if (cursor) constraints.push(startAfter(cursor));
    return query(collection(db, "items"), ...constraints);
  };

  useEffect(() => {
    if (locationFilter === "myDistrict" && !district) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setEndReached(false);
      try {
        const q = buildQuery(null);
        const snap = await getDocs(q);
        if (cancelled) return;
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
        if (snap.size < PAGE_SIZE) setEndReached(true);
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, district, category, sort]);

  const loadMore = async () => {
    if (endReached || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = buildQuery(lastDocRef.current);
      const snap = await getDocs(q);
      setItems((prev) => [...prev, ...snap.docs.map((d) => ({ id: d.id, ...d.data() }))]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      if (snap.size < PAGE_SIZE) setEndReached(true);
    } catch (e) { console.error(e); }
    finally { setLoadingMore(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Marketplace</h1>
        <Link to="/marketplace/new"><Button>Sell an item</Button></Link>
      </div>

      {/* Filters */}
      <div className="rounded-lg border bg-white p-3 grid gap-3 md:grid-cols-5">
        <div>
          <label className="text-sm">Location</label>
          <select
            value={locationFilter}
            onChange={(e)=>setLocationFilter(e.target.value)}
            className="w-full h-10 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            <option value="all">All locations</option>
            <option value="myDistrict" disabled={!district}>
              My district{district ? ` (${district})` : ""}
            </option>
          </select>
        </div>

        <div>
          <label className="text-sm">Category</label>
          <select
            value={category}
            onChange={(e)=>setCategory(e.target.value)}
            className="w-full h-10 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm">Sort</label>
          <select
            value={sort}
            onChange={(e)=>setSort(e.target.value)}
            className="w-full h-10 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            <option value="newest">Newest</option>
            <option value="priceAsc">Price: Low → High</option>
            <option value="priceDesc">Price: High → Low</option>
          </select>
        </div>

        <div className="md:col-span-2 flex items-end">
          <Button
            variant="outline"
            onClick={()=>{ setLocationFilter("all"); setCategory("All"); setSort("newest"); }}
          >
            Reset filters
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-sm text-neutral-500">Loading…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <ItemCard key={it.id} it={it} isFav={favIds.has(it.id)} />
            ))}
          </div>
          {items.length === 0 && (
            <div className="text-sm text-neutral-500">No items match your filters.</div>
          )}
        </>
      )}

      {/* Pagination */}
      <div className="flex justify-center">
        {!endReached && (
          <Button onClick={loadMore} loading={loadingMore} loadingText="Loading…">
            Load more
          </Button>
        )}
        {endReached && items.length > 0 && (
          <div className="text-xs text-neutral-500">You’ve reached the end.</div>
        )}
      </div>
    </div>
  );
}

function ItemCard({ it, isFav }) {
  const thumb = it.images?.[0]?.optimizedURL || it.images?.[0]?.originalURL;
  const name = it.ownerName || "Unknown";
  const avatar = it.ownerPhotoURL || "";
  const slug = it.ownerSlug;

  return (
    <div className="rounded-lg border bg-white overflow-hidden flex flex-col">
      <Link to={`/marketplace/${it.id}`} className="block">
        {thumb ? (
          <img src={thumb} alt={it.title} className="h-40 w-full object-cover" />
        ) : (
          <div className="h-40 w-full grid place-items-center text-neutral-400">No image</div>
        )}
      </Link>

      <div className="p-3 space-y-2 flex-1">
        <Link to={`/marketplace/${it.id}`} className="font-medium hover:underline line-clamp-1">{it.title}</Link>
        <div className="text-sm text-neutral-600">
          ${Number(it.price).toFixed(2)} • {it.location} • {it.category || "Other"}
        </div>

        {/* Uploader → /s/:slug (clickable) */}
        {slug ? (
          <Link to={`/s/${slug}`} className="flex items-center gap-2 pt-1">
            <div className="h-6 w-6 rounded-full overflow-hidden bg-neutral-100 border">
              {avatar ? (
                <img src={avatar} alt={name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">?</div>
              )}
            </div>
            <div className="text-xs text-neutral-700">
              Listed by <span className="font-medium underline">{name}</span>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-2 pt-1">
            <div className="h-6 w-6 rounded-full overflow-hidden bg-neutral-100 border">
              {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">?</div>}
            </div>
            <div className="text-xs text-neutral-700">Listed by <span className="font-medium">{name}</span></div>
          </div>
        )}
      </div>

      <div className="p-3 pt-0">
        <FavButton itemId={it.id} isFav={isFav} />
      </div>
    </div>
  );
}

function FavButton({ itemId, isFav }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      const favRef = doc(db, "users", user.uid, "favorites", itemId);
      const exists = (await getDoc(favRef)).exists();
      if (exists) {
        await (await import("firebase/firestore")).deleteDoc(favRef);
      } else {
        const { serverTimestamp } = await import("firebase/firestore");
        await (await import("firebase/firestore")).setDoc(favRef, { createdAt: serverTimestamp() });
      }
    } finally { setBusy(false); }
  };
  return (
    <Button variant={isFav ? "secondary" : "outline"} size="sm" onClick={toggle} loading={busy}>
      {isFav ? "★ Favorited" : "☆ Favorite"}
    </Button>
  );
}