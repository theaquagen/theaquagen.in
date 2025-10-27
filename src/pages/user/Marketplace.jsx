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
import { clsx } from "clsx";

const PAGE_SIZE = 12;
const CATEGORIES = ["Electronics","Fashion","Home","Vehicles","Sports","Books","Toys","Other"];

const SORT_OPTIONS = [
  { name: 'Newest', value: 'newest' },
  { name: 'Price: Low to High', value: 'priceAsc' },
  { name: 'Price: High to Low', value: 'priceDesc' },
];

function classNames(...classes) { return classes.filter(Boolean).join(' ') }

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

  const [selectedPrices, setSelectedPrices] = useState(new Set());
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [selectedColors, setSelectedColors] = useState(new Set());
  const [selectedSizes, setSelectedSizes] = useState(new Set());
  const [sort, setSort] = useState("newest");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const lastDocRef = useRef(null);
  const [favIds, setFavIds] = useState(new Set());

  useEffect(() => {
    (async () => { try { await getDoc(doc(db, "users", user.uid)); } catch {} })();
  }, [user.uid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users", user.uid, "favorites"), (qs) => {
      const s = new Set(); qs.forEach((d) => s.add(d.id)); setFavIds(s);
    });
    return () => unsub();
  }, [user.uid]);

  const buildQuery = (cursor) => {
    const constraints = [];
    const catArr = Array.from(selectedCategories);
    if (catArr.length > 0 && catArr.length <= 10) {
      constraints.push(where("category", "in", catArr));
    }
    if (sort === "priceAsc") constraints.push(orderBy("price", "asc"));
    else if (sort === "priceDesc") constraints.push(orderBy("price", "desc"));
    else constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(PAGE_SIZE));
    if (cursor) constraints.push(startAfter(cursor));
    return query(collection(db, "items"), ...constraints);
  };

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
  }, [sort, selectedCategories]);

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

  const priceInBuckets = (price, bucketsSet) => {
    if (!bucketsSet || bucketsSet.size === 0) return true;
    const p = Number(price) || 0;
    const matches = [];
    if (bucketsSet.has('0'))  matches.push(p >= 0 && p < 25);
    if (bucketsSet.has('25')) matches.push(p >= 25 && p < 50);
    if (bucketsSet.has('50')) matches.push(p >= 50 && p < 75);
    if (bucketsSet.has('75')) matches.push(p >= 75);
    return matches.some(Boolean);
  };

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const okPrice = priceInBuckets(it.price, selectedPrices);
      const okColor = selectedColors.size === 0 ? true : selectedColors.has((it.color || '').toLowerCase());
      const okSize  = selectedSizes.size === 0 ? true : selectedSizes.has((it.size  || '').toLowerCase());
      return okPrice && okColor && okSize;
    });
  }, [items, selectedPrices, selectedColors, selectedSizes]);

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

  return (
    <Container className="my-16">
      <div className="space-y-8">
        <PageHeading
          title="Marketplace"
          description="Browse items from your community. Use filters or sort to find your next great deal."
        />

        {/* Filters */}
        <Disclosure
          as="section"
          aria-labelledby="filter-heading"
          className="grid items-center border-t border-b border-gray-200"
        >
          <h2 id="filter-heading" className="sr-only">Filters</h2>

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

          <DisclosurePanel className="border-t border-gray-200 py-10">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 px-4 text-sm sm:px-6 md:gap-x-6 lg:px-8">
              <div className="grid auto-rows-min grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-6">
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

              <div className="grid auto-rows-min grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-6">
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

/**
 * Card: Image on top (aspect 3/2). The section BELOW the image uses your gradient
 * and LIGHTENS as it goes down (ends in white). No page background gradients.
 *
 * You can override per item with:
 *  - it.gradientClass  (Tailwind class string)
 *  - it.themeColor     (hex/rgb; used only if gradientClass is absent)
 */
function ItemCard({ it, isFav }) {
  const thumb = it.images?.[0]?.optimizedURL || it.images?.[0]?.originalURL;
  const title = it.title || "Untitled";
  const desc = it.description || "Cozy find with great value and quick pickup.";
  const price = Number(it.price || 0).toFixed(2);
  const category = it.category || "Other";

  // Option 1: Use your exact gradient classes (recommended). This version lightens to white.
  const defaultGradientClass =
    // starts with your palette and ends in white to lighten downward
    "bg-linear-115 from-[#fff1be] from-25% via-[#ee87cb] via-65% to-white sm:bg-linear-145";

  // Allow per-item override. If you pass a class, we use it; otherwise we use defaultGradientClass.
  const gradientClass = it.gradientClass || defaultGradientClass;

  return (
    <div className="overflow-hidden rounded-3xl shadow-xl ring-1 ring-black/5 bg-white">
      {/* Top image only */}
      <Link to={`/marketplace/${it.id}`} className="block">
        {thumb ? (
          <div className="relative w-full aspect-[3/2]">
            <img
              src={thumb}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="grid aspect-[3/2] w-full place-items-center bg-neutral-100 text-neutral-500">
            No image
          </div>
        )}
      </Link>

      {/* Bottom: your gradient (lightening downward) ONLY within the card */}
      <div className={clsx("relative p-6 sm:p-7 text-neutral-900", gradientClass)}>
        {/* Optional top softness so the seam under the image is pleasant */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-black/0 to-black/0" />
        <div className="relative">
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="mt-2 text-sm/6 text-neutral-800/90 line-clamp-2">{desc}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-white/85 px-3 py-1 text-xs ring-1 ring-black/5">
              {category}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/85 px-3 py-1 text-xs ring-1 ring-black/5">
              ${price}
            </span>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <FavButton itemId={it.id} isFav={isFav} />
            <Link to={`/marketplace/${it.id}`} className="flex-1">
              <div className="inline-flex w-full items-center justify-center rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800">
                Reserve now
              </div>
            </Link>
          </div>
        </div>
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
    <Button
      variant={isFav ? "secondary" : "outline"}
      size="sm"
      onClick={toggle}
      loading={busy}
      className={clsx(
        "!rounded-full",
        isFav ? "!bg-neutral-900 !text-white hover:!bg-neutral-800" : "!bg-white !text-neutral-900 hover:!bg-white/90",
        "backdrop-blur-sm ring-1 ring-black/5"
      )}
    >
      {isFav ? "★ Favorited" : "☆ Favorite"}
    </Button>
  );
}