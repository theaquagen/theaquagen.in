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
import { Container } from "../../components/ui/Container";

// Headless UI + Icons
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { ChevronDownIcon, FunnelIcon, MinusIcon, PlusIcon, Squares2X2Icon } from '@heroicons/react/20/solid'

const PAGE_SIZE = 12;
const CATEGORIES = ["All","Electronics","Fashion","Home","Vehicles","Sports","Books","Toys","Other"];

// Sort options mapped to your state values
const SORT_OPTIONS = [
  { name: 'Newest', value: 'newest' },
  { name: 'Price: Low to High', value: 'priceAsc' },
  { name: 'Price: High to Low', value: 'priceDesc' },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

export default function Marketplace() {
  const { user } = useAuth();

  // Query state
  const [district, setDistrict] = useState("");
  const [locationFilter, setLocationFilter] = useState("all"); // "all" | "myDistrict"
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("newest"); // newest | priceAsc | priceDesc

  // UI state
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Data state
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const lastDocRef = useRef(null);
  const [favIds, setFavIds] = useState(new Set());

  // Load user's district
  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      setDistrict(snap.exists() ? snap.data().district || "" : "");
    })();
  }, [user.uid]);

  // Live favorites
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users", user.uid, "favorites"), (qs) => {
      const s = new Set(); qs.forEach((d) => s.add(d.id)); setFavIds(s);
    });
    return () => unsub();
  }, [user.uid]);

  // Build Firestore query
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

  // Fetch on filter/sort change
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

  // Pagination
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

  // Helper: reset
  const resetAll = () => {
    setLocationFilter("all");
    setCategory("All");
    setSort("newest");
  };

  return (
    <Container>
      <div>
        {/* Mobile Filters Dialog */}
        <Dialog open={mobileFiltersOpen} onClose={setMobileFiltersOpen} className="relative z-40 lg:hidden">
          <DialogBackdrop
            transition
            className="fixed inset-0 bg-black/25 transition-opacity duration-300 ease-linear data-closed:opacity-0"
          />
          <div className="fixed inset-0 z-40 flex">
            <DialogPanel
              transition
              className="relative ml-auto flex size-full max-w-xs transform flex-col overflow-y-auto bg-white pt-4 pb-6 shadow-xl transition duration-300 ease-in-out data-closed:translate-x-full"
            >
              <div className="flex items-center justify-between px-4">
                <h2 className="text-lg font-medium text-gray-900">Filters</h2>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="relative -mr-2 flex size-10 items-center justify-center rounded-md bg-white p-2 text-gray-400 hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                >
                  <span className="absolute -inset-0.5" />
                  <span className="sr-only">Close menu</span>
                  <XMarkIcon aria-hidden="true" className="size-6" />
                </button>
              </div>

              {/* Filters */}
              <form
                className="mt-4 border-t border-gray-200"
                onSubmit={(e)=>{e.preventDefault(); setMobileFiltersOpen(false);}}
              >
                {/* Categories quick list */}
                <h3 className="sr-only">Categories</h3>
                <ul role="list" className="px-2 py-3 font-medium text-gray-900">
                  {CATEGORIES.map((c) => (
                    <li key={c}>
                      <button
                        type="button"
                        onClick={() => setCategory(c)}
                        className={classNames(
                          "block w-full text-left px-2 py-3 rounded-md",
                          c === category ? "bg-gray-100" : ""
                        )}
                      >
                        {c}
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Location */}
                <Disclosure as="div" className="border-t border-gray-200 px-4 py-6">
                  <h3 className="-mx-2 -my-3 flow-root">
                    <DisclosureButton className="group flex w-full items-center justify-between bg-white px-2 py-3 text-gray-400 hover:text-gray-500">
                      <span className="font-medium text-gray-900">Location</span>
                      <span className="ml-6 flex items-center">
                        <PlusIcon aria-hidden="true" className="size-5 group-data-open:hidden" />
                        <MinusIcon aria-hidden="true" className="size-5 group-not-data-open:hidden" />
                      </span>
                    </DisclosureButton>
                  </h3>
                  <DisclosurePanel className="pt-6">
                    <div className="space-y-4">
                      {[
                        { value: "all", label: "All locations" },
                        { value: "myDistrict", label: district ? `My district (${district})` : "My district (not set)" , disabled: !district}
                      ].map((opt) => (
                        <label key={opt.value} className="flex items-center gap-3 text-gray-600">
                          <input
                            type="radio"
                            name="mobile-location"
                            className="size-4"
                            value={opt.value}
                            disabled={opt.disabled}
                            checked={locationFilter === opt.value}
                            onChange={(e)=>setLocationFilter(e.target.value)}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </DisclosurePanel>
                </Disclosure>

                {/* Sort */}
                <Disclosure as="div" className="border-t border-gray-200 px-4 py-6">
                  <h3 className="-mx-2 -my-3 flow-root">
                    <DisclosureButton className="group flex w-full items-center justify-between bg-white px-2 py-3 text-gray-400 hover:text-gray-500">
                      <span className="font-medium text-gray-900">Sort</span>
                      <span className="ml-6 flex items-center">
                        <PlusIcon aria-hidden="true" className="size-5 group-data-open:hidden" />
                        <MinusIcon aria-hidden="true" className="size-5 group-not-data-open:hidden" />
                      </span>
                    </DisclosureButton>
                  </h3>
                  <DisclosurePanel className="pt-6">
                    <div className="space-y-4">
                      {SORT_OPTIONS.map((o) => (
                        <label key={o.value} className="flex items-center gap-3 text-gray-600">
                          <input
                            type="radio"
                            name="mobile-sort"
                            className="size-4"
                            value={o.value}
                            checked={sort === o.value}
                            onChange={(e)=>setSort(e.target.value)}
                          />
                          {o.name}
                        </label>
                      ))}
                    </div>
                  </DisclosurePanel>
                </Disclosure>

                <div className="px-4 pt-6">
                  <Button type="submit" className="w-full">Apply filters</Button>
                </div>
                <div className="px-4 pt-3">
                  <Button type="button" variant="outline" className="w-full" onClick={() => { resetAll(); }}>
                    Reset filters
                  </Button>
                </div>
              </form>
            </DialogPanel>
          </div>
        </Dialog>

        {/* Page Header */}
        <main>
          <div className="flex items-baseline justify-between border-b border-gray-200 pt-24 pb-6">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">Marketplace</h1>

            <div className="flex items-center">
              {/* Sort Menu */}
              <Menu as="div" className="relative inline-block text-left">
                <MenuButton className="group inline-flex justify-center text-sm font-medium text-gray-700 hover:text-gray-900">
                  Sort
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="-mr-1 ml-1 size-5 shrink-0 text-gray-400 group-hover:text-gray-500"
                  />
                </MenuButton>

                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-2xl ring-1 ring-black/5 transition focus:outline-hidden data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                >
                  <div className="py-1">
                    {SORT_OPTIONS.map((option) => (
                      <MenuItem key={option.value}>
                        <button
                          onClick={() => setSort(option.value)}
                          className={classNames(
                            sort === option.value ? 'font-medium text-gray-900' : 'text-gray-600',
                            'block w-full text-left px-4 py-2 text-sm data-focus:bg-gray-100 data-focus:outline-hidden',
                          )}
                        >
                          {option.name}
                        </button>
                      </MenuItem>
                    ))}
                  </div>
                </MenuItems>
              </Menu>

              {/* Grid icon (non-functional placeholder from your UI) */}
              <button type="button" className="-m-2 ml-5 p-2 text-gray-400 hover:text-gray-500 sm:ml-7">
                <span className="sr-only">View grid</span>
                <Squares2X2Icon aria-hidden="true" className="size-5" />
              </button>

              {/* Mobile Filters trigger */}
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="-m-2 ml-4 p-2 text-gray-400 hover:text-gray-500 sm:ml-6 lg:hidden"
              >
                <span className="sr-only">Filters</span>
                <FunnelIcon aria-hidden="true" className="size-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <section aria-labelledby="products-heading" className="pt-6 pb-24">
            <h2 id="products-heading" className="sr-only">
              Products
            </h2>

            <div className="grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-4">
              {/* Sidebar Filters (Desktop) */}
              <form className="hidden lg:block">
                {/* Categories */}
                <h3 className="sr-only">Categories</h3>
                <ul role="list" className="space-y-4 border-b border-gray-200 pb-6 text-sm font-medium text-gray-900">
                  {CATEGORIES.map((c) => (
                    <li key={c}>
                      <button
                        type="button"
                        onClick={() => setCategory(c)}
                        className={classNames(
                          "hover:underline",
                          c === category ? "text-gray-900" : "text-gray-700"
                        )}
                      >
                        {c}
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Location */}
                <Disclosure as="div" className="border-b border-gray-200 py-6">
                  <h3 className="-my-3 flow-root">
                    <DisclosureButton className="group flex w-full items-center justify-between bg-white py-3 text-sm text-gray-400 hover:text-gray-500">
                      <span className="font-medium text-gray-900">Location</span>
                      <span className="ml-6 flex items-center">
                        <PlusIcon aria-hidden="true" className="size-5 group-data-open:hidden" />
                        <MinusIcon aria-hidden="true" className="size-5 group-not-data-open:hidden" />
                      </span>
                    </DisclosureButton>
                  </h3>
                  <DisclosurePanel className="pt-6">
                    <div className="space-y-4">
                      {[
                        { value: "all", label: "All locations" },
                        { value: "myDistrict", label: district ? `My district (${district})` : "My district (not set)", disabled: !district }
                      ].map((opt, idx) => (
                        <div key={opt.value} className="flex gap-3">
                          <input
                            id={`filter-location-${idx}`}
                            type="radio"
                            name="desktop-location"
                            className="size-4"
                            value={opt.value}
                            disabled={opt.disabled}
                            checked={locationFilter === opt.value}
                            onChange={(e)=>setLocationFilter(e.target.value)}
                          />
                          <label htmlFor={`filter-location-${idx}`} className="text-sm text-gray-600">
                            {opt.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </DisclosurePanel>
                </Disclosure>

                {/* Sort (for convenience in sidebar too) */}
                <Disclosure as="div" className="border-b border-gray-200 py-6">
                  <h3 className="-my-3 flow-root">
                    <DisclosureButton className="group flex w-full items-center justify-between bg-white py-3 text-sm text-gray-400 hover:text-gray-500">
                      <span className="font-medium text-gray-900">Sort</span>
                      <span className="ml-6 flex items-center">
                        <PlusIcon aria-hidden="true" className="size-5 group-data-open:hidden" />
                        <MinusIcon aria-hidden="true" className="size-5 group-not-data-open:hidden" />
                      </span>
                    </DisclosureButton>
                  </h3>
                  <DisclosurePanel className="pt-6">
                    <div className="space-y-4">
                      {SORT_OPTIONS.map((o, idx) => (
                        <div key={o.value} className="flex gap-3">
                          <input
                            id={`filter-sort-${idx}`}
                            type="radio"
                            name="desktop-sort"
                            className="size-4"
                            value={o.value}
                            checked={sort === o.value}
                            onChange={(e)=>setSort(e.target.value)}
                          />
                          <label htmlFor={`filter-sort-${idx}`} className="text-sm text-gray-600">
                            {o.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </DisclosurePanel>
                </Disclosure>

                <div className="pt-6">
                  <Button
                    variant="outline"
                    onClick={(e)=>{ e.preventDefault(); resetAll(); }}
                  >
                    Reset filters
                  </Button>
                </div>
              </form>

              {/* Product grid */}
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between gap-3 pb-4">
                  <div className="text-sm text-neutral-600">
                    Showing <span className="font-medium">{items.length}</span>{' '}
                    item{items.length === 1 ? '' : 's'}
                    {category !== "All" ? ` in ${category}` : '' }
                    {locationFilter === "myDistrict" && district ? ` near ${district}` : ''}
                    {items.length === 0 && " — try different filters"}
                  </div>
                  <Link to="/marketplace/new"><Button>Sell an item</Button></Link>
                </div>

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
                      <div className="text-sm text-neutral-500 pt-6">No items match your filters.</div>
                    )}
                  </>
                )}

                {/* Pagination */}
                <div className="flex justify-center pt-8">
                  {!endReached && items.length > 0 && (
                    <Button onClick={loadMore} loading={loadingMore} loadingText="Loading…">
                      Load more
                    </Button>
                  )}
                  {endReached && items.length > 0 && (
                    <div className="text-xs text-neutral-500">You’ve reached the end.</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </Container>
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