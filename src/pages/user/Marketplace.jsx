// src/pages/user/Marketplace.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, getDoc, doc, getDocs, query, where, orderBy, limit, startAfter,
  onSnapshot
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import { Container } from "../../components/ui/Container";

// Headless UI
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems
} from '@headlessui/react';
import { ChevronDownIcon, FunnelIcon } from '@heroicons/react/20/solid';

import PageHeading from "../../components/ui/PageHeading";

const PAGE_SIZE = 12;
const CATEGORIES = ["Electronics","Fashion","Home","Vehicles","Sports","Books","Toys","Other"]; // omit "All" because this UI is multi-select

const SORT_OPTIONS = [
  { name: 'Newest', value: 'newest' },
  { name: 'Price: Low to High', value: 'priceAsc' },
  { name: 'Price: High to Low', value: 'priceDesc' },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

// ---- Filter UI data (matches your snippet style) ----
const PRICE_BUCKETS = [
  { value: '0', label: '$0 - $25' },
  { value: '25', label: '$25 - $50' },
  { value: '50', label: '$50 - $75' },
  { value: '75', label: '$75+' },
];

const buildCategoryOptions = () =>
  CATEGORIES.map((c) => ({ value: c, label: c }));

export default function Marketplace() {
  const { user } = useAuth();

  // Filters state (multi-select like your UI)
  const [selectedPrices, setSelectedPrices] = useState(new Set()); // '0' | '25' | '50' | '75'
  const [selectedCategories, setSelectedCategories] = useState(new Set()); // values from CATEGORIES
  // (Optional placeholders for future: color/size UI kept but not wired to query)
  const [selectedColors, setSelectedColors] = useState(new Set());
  const [selectedSizes, setSelectedSizes] = useState(new Set());

  // Sort
  const [sort, setSort] = useState("newest");

  // Data state
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const lastDocRef = useRef(null);
  const [favIds, setFavIds] = useState(new Set());

  // Load user's profile (kept for favorites path only)
  useEffect(() => {
    // No district/location UI in this version; only favorites uses user.uid
    // Still safe to check user doc if you want other metadata later:
    (async () => {
      try { await getDoc(doc(db, "users", user.uid)); } catch {}
    })();
  }, [user.uid]);

  // Live favorites
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users", user.uid, "favorites"), (qs) => {
      const s = new Set(); qs.forEach((d) => s.add(d.id)); setFavIds(s);
    });
    return () => unsub();
  }, [user.uid]);

  // ----- Query builder (server-side filters: categories + sort, pagination) -----
  const buildQuery = (cursor) => {
    const constraints = [];
    // Category filter via "in" when 1-10 selected; otherwise no category constraint
    const catArr = Array.from(selectedCategories);
    if (catArr.length > 0 && catArr.length <= 10) {
      constraints.push(where("category", "in", catArr));
    }
    // Sorting
    if (sort === "priceAsc") constraints.push(orderBy("price", "asc"));
    else if (sort === "priceDesc") constraints.push(orderBy("price", "desc"));
    else constraints.push(orderBy("createdAt", "desc"));

    constraints.push(limit(PAGE_SIZE));
    if (cursor) constraints.push(startAfter(cursor));
    return query(collection(db, "items"), ...constraints);
  };

  // ----- Fetch on filter/sort change (server-side piece only) -----
  useEffect(() => {
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
  }, [sort, selectedCategories]); // price/color/size are client-side filters

  // Pagination (continues the same server-side constraints)
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

  // ----- Client-side filters (Price, and placeholders for color/size) -----
  const priceInBuckets = (price, bucketsSet) => {
    if (!bucketsSet || bucketsSet.size === 0) return true;
    const p = Number(price) || 0;
    // bucket '0' => [0,25), '25' => [25,50), '50' => [50,75), '75' => [75, +inf)
    const matches = [];
    if (bucketsSet.has('0'))  matches.push(p >= 0 && p < 25);
    if (bucketsSet.has('25')) matches.push(p >= 25 && p < 50);
    if (bucketsSet.has('50')) matches.push(p >= 50 && p < 75);
    if (bucketsSet.has('75')) matches.push(p >= 75);
    return matches.some(Boolean);
  };

  const filteredItems = useMemo(() => {
    // Price filter only (color/size placeholders included for future)
    return items.filter((it) => {
      const okPrice = priceInBuckets(it.price, selectedPrices);
      // If you later add fields like it.color / it.size, apply here:
      const okColor = selectedColors.size === 0 ? true : selectedColors.has((it.color || '').toLowerCase());
      const okSize  = selectedSizes.size === 0 ? true : selectedSizes.has((it.size  || '').toLowerCase());
      return okPrice && okColor && okSize;
    });
  }, [items, selectedPrices, selectedColors, selectedSizes]);

  // ----- UI handlers -----
  const toggleInSet = (set, value) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const clearAll = () => {
    setSelectedPrices(new Set());
    setSelectedCategories(new Set());
    setSelectedColors(new Set());
    setSelectedSizes(new Set());
    setSort("newest");
  };

  const activeFilterCount =
    (selectedPrices.size ? 1 : 0) +
    (selectedCategories.size ? 1 : 0) +
    (selectedColors.size ? 1 : 0) +
    (selectedSizes.size ? 1 : 0);

  // ---- Render ----
  return (
    <Container className="my-16">
      <div className="space-y-8">
        <PageHeading
            title="Marketplace"
            description="Browse items from your community. Use filters or sort to find your next great deal."
          />

        {/* Filters (Disclosure bar + panel) */}
        <Disclosure
          as="section"
          aria-labelledby="filter-heading"
          className="grid items-center border-t border-b border-gray-200"
        >
          <h2 id="filter-heading" className="sr-only">
            Filters
          </h2>

          {/* Left: filter toggle + count, Clear all */}
          <div className="relative col-start-1 row-start-1 py-4">
            <div className="mx-auto flex max-w-7xl divide-x divide-gray-200 px-4 text-sm sm:px-6 lg:px-8">
              <div className="pr-6">
                <DisclosureButton className="group flex items-center font-medium text-gray-700">
                  <FunnelIcon aria-hidden="true" className="mr-2 size-5 flex-none text-gray-400 group-hover:text-gray-500" />
                  {activeFilterCount || 0} Filter{activeFilterCount === 1 ? '' : 's'}
                </DisclosureButton>
              </div>
              <div className="pl-6">
                <button type="button" onClick={clearAll} className="text-gray-500 hover:text-gray-700">
                  Clear all
                </button>
              </div>
            </div>
          </div>

          {/* Filter content */}
          <DisclosurePanel className="border-t border-gray-200 py-10">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 px-4 text-sm sm:px-6 md:gap-x-6 lg:px-8">
              {/* Left column */}
              <div className="grid auto-rows-min grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-6">
                {/* Price */}
                <fieldset>
                  <legend className="block font-medium">Price</legend>
                  <div className="space-y-6 pt-6 sm:space-y-4 sm:pt-4">
                    {PRICE_BUCKETS.map((option, optionIdx) => (
                      <div key={option.value} className="flex gap-3">
                        <input
                          id={`price-${optionIdx}`}
                          name="price[]"
                          type="checkbox"
                          className="size-4"
                          checked={selectedPrices.has(option.value)}
                          onChange={() => setSelectedPrices(prev => toggleInSet(prev, option.value))}
                        />
                        <label htmlFor={`price-${optionIdx}`} className="text-base text-gray-600 sm:text-sm">
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>

                {/* (Optional) Color – UI only for now */}
                <fieldset>
                  <legend className="block font-medium">Color</legend>
                  <div className="space-y-6 pt-6 sm:space-y-4 sm:pt-4">
                    {["white","beige","blue","brown","green","purple"].map((c, idx) => (
                      <div key={c} className="flex gap-3">
                        <input
                          id={`color-${idx}`}
                          name="color[]"
                          type="checkbox"
                          className="size-4"
                          checked={selectedColors.has(c)}
                          onChange={() => setSelectedColors(prev => toggleInSet(prev, c))}
                        />
                        <label htmlFor={`color-${idx}`} className="text-base text-gray-600 sm:text-sm">
                          {c[0].toUpperCase() + c.slice(1)}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              </div>

              {/* Right column */}
              <div className="grid auto-rows-min grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-6">
                {/* (Optional) Size – UI only for now */}
                <fieldset>
                  <legend className="block font-medium">Size</legend>
                  <div className="space-y-6 pt-6 sm:space-y-4 sm:pt-4">
                    {["xs","s","m","l","xl","2xl"].map((s, idx) => (
                      <div key={s} className="flex gap-3">
                        <input
                          id={`size-${idx}`}
                          name="size[]"
                          type="checkbox"
                          className="size-4"
                          checked={selectedSizes.has(s)}
                          onChange={() => setSelectedSizes(prev => toggleInSet(prev, s))}
                        />
                        <label htmlFor={`size-${idx}`} className="text-base text-gray-600 sm:text-sm">
                          {s.toUpperCase()}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>

                {/* Category (wired to Firestore via "in") */}
                <fieldset>
                  <legend className="block font-medium">Category</legend>
                  <div className="space-y-6 pt-6 sm:space-y-4 sm:pt-4">
                    {buildCategoryOptions().map((option, optionIdx) => (
                      <div key={option.value} className="flex gap-3">
                        <input
                          id={`category-${optionIdx}`}
                          name="category[]"
                          type="checkbox"
                          className="size-4"
                          checked={selectedCategories.has(option.value)}
                          onChange={() => setSelectedCategories(prev => toggleInSet(prev, option.value))}
                        />
                        <label htmlFor={`category-${optionIdx}`} className="text-base text-gray-600 sm:text-sm">
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              </div>
            </div>
          </DisclosurePanel>

          {/* Right: Sort menu */}
          <div className="col-start-1 row-start-1 py-4">
            <div className="mx-auto flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
              <Menu as="div" className="relative inline-block">
                <div className="flex">
                  <MenuButton className="group inline-flex justify-center text-sm font-medium text-gray-700 hover:text-gray-900">
                    Sort
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="-mr-1 ml-1 size-5 shrink-0 text-gray-400 group-hover:text-gray-500"
                    />
                  </MenuButton>
                </div>

                <MenuItems
                  transition
                  className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-2xl ring-1 ring-black/5 transition focus:outline-hidden data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                >
                  <div className="py-1">
                    {SORT_OPTIONS.map((o) => (
                      <MenuItem key={o.value}>
                        <button
                          onClick={() => setSort(o.value)}
                          className={classNames(
                            sort === o.value ? 'font-medium text-gray-900' : 'text-gray-500',
                            'block w-full text-left px-4 py-2 text-sm data-focus:bg-gray-100 data-focus:outline-hidden'
                          )}
                        >
                          {o.name}
                        </button>
                      </MenuItem>
                    ))}
                  </div>
                </MenuItems>
              </Menu>
            </div>
          </div>
        </Disclosure>

        {/* Content */}
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-24">
          <section aria-labelledby="products-heading" className="pt-6">
            <h2 id="products-heading" className="sr-only">Products</h2>

            <div className="flex items-center justify-between gap-3 pb-4">
              <div className="text-sm text-neutral-600">
                Showing <span className="font-medium">{filteredItems.length}</span>{' '}
                item{filteredItems.length === 1 ? '' : 's'}
                {selectedCategories.size > 0 ? ` in ${Array.from(selectedCategories).join(', ')}` : ''}
                {filteredItems.length === 0 && " — try different filters"}
              </div>
              <div className="flex items-center gap-3">
                <button className="text-xs text-gray-500 hover:underline" type="button" onClick={clearAll}>
                  Reset all
                </button>
                <Link to="/marketplace/new"><Button>Sell an item</Button></Link>
              </div>
            </div>

            {loading ? (
              <div className="text-sm text-neutral-500">Loading…</div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredItems.map((it) => (
                    <ItemCard key={it.id} it={it} isFav={favIds.has(it.id)} />
                  ))}
                </div>
                {filteredItems.length === 0 && (
                  <div className="text-sm text-neutral-500 pt-6">No items match your filters.</div>
                )}
              </>
            )}

            {/* Pagination (loads more server items; client filters still apply after append) */}
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
