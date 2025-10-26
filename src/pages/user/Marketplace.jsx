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

/**
 * Choose the card design here.
 * Options: "classic" | "minimal" | "overlay" | "mediaLeft" | "compact"
 */
const CARD_VARIANT = "overlay"; // ← change this to preview different card UIs

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
          <h2 id="filter-heading" className="sr-only">Filters</h2>

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
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

/* -------------------------- Shared helpers -------------------------- */
function useItemBasics(it) {
  const thumb = it.images?.[0]?.optimizedURL || it.images?.[0]?.originalURL;
  const name = it.ownerName || "Unknown";
  const avatar = it.ownerPhotoURL || "";
  const slug = it.ownerSlug;
  const price = Number(it.price).toFixed(2);
  const category = it.category || "Other";
  const location = it.location || "Unknown location";
  return { thumb, name, avatar, slug, price, category, location };
}

/* ------------------------- Card Variant Router ------------------------- */
function ItemCard({ it, isFav }) {
  switch (CARD_VARIANT) {
    case "minimal":   return <CardMinimal it={it} isFav={isFav} />;
    case "overlay":   return <CardOverlay it={it} isFav={isFav} />;
    case "mediaLeft": return <CardMediaLeft it={it} isFav={isFav} />;
    case "compact":   return <CardCompact it={it} isFav={isFav} />;
    case "classic":
    default:          return <CardClassic it={it} isFav={isFav} />;
  }
}

/* ------------------------------ Variant 1: Classic (previous premium) ------------------------------ */
function CardClassic({ it, isFav }) {
  const { thumb, name, avatar, slug, price, category, location } = useItemBasics(it);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <Link to={`/marketplace/${it.id}`} className="block">
        <div className="relative w-full aspect-[4/3] overflow-hidden bg-neutral-50">
          {thumb ? (
            <img
              src={thumb}
              alt={it.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full grid place-items-center text-neutral-400 text-sm">No image</div>
          )}
          <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-gray-900 shadow-sm backdrop-blur">
            ${price}
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <Link to={`/marketplace/${it.id}`} className="block">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-gray-900 hover:underline">
            {it.title}
          </h3>
        </Link>

        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
          {category && <span className="rounded-full border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700">{category}</span>}
          <span className="text-neutral-500">•</span>
          <span className="truncate">{location}</span>
        </div>

        <div className="mt-auto flex items-center justify-between pt-1">
          {slug ? (
            <Link to={`/s/${slug}`} className="flex items-center gap-2">
              <Avatar src={avatar} alt={name} />
              <div className="text-sm text-neutral-700">
                <span className="text-neutral-500">by</span>{" "}
                <span className="font-medium underline decoration-neutral-300 underline-offset-2">{name}</span>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Avatar src={avatar} alt={name} />
              <div className="text-sm text-neutral-700"><span className="text-neutral-500">by</span> <span className="font-medium">{name}</span></div>
            </div>
          )}
          <FavButton itemId={it.id} isFav={isFav} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Variant 2: Minimal (very clean, flat) ------------------------------ */
function CardMinimal({ it, isFav }) {
  const { thumb, name, avatar, slug, price, category, location } = useItemBasics(it);
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-gray-200 transition hover:ring-gray-300">
      <Link to={`/marketplace/${it.id}`} className="block">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-neutral-50">
          {thumb ? (
            <img src={thumb} alt={it.title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full w-full place-items-center text-neutral-400 text-sm">No image</div>
          )}
        </div>
      </Link>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link to={`/marketplace/${it.id}`} className="flex-1">
            <h3 className="line-clamp-2 text-base font-semibold text-gray-900">
              {it.title}
            </h3>
          </Link>
          <div className="shrink-0 rounded-md bg-gray-50 px-2 py-1 text-sm font-semibold text-gray-900">
            ${price}
          </div>
        </div>

        <div className="text-sm text-neutral-600">{location}</div>

        <div className="mt-2 flex items-center justify-between border-t pt-3">
          {slug ? (
            <Link to={`/s/${slug}`} className="flex items-center gap-2">
              <Avatar src={avatar} alt={name} size="7" />
              <span className="text-sm text-neutral-700">{name}</span>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Avatar src={avatar} alt={name} size="7" />
              <span className="text-sm text-neutral-700">{name}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="rounded-full border px-2 py-0.5 text-xs text-gray-700">{category}</span>
            <FavButton itemId={it.id} isFav={isFav} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Variant 3: Overlay (text on image) ------------------------------ */
function CardOverlay({ it, isFav }) {
  const { thumb, name, avatar, slug, price, category, location } = useItemBasics(it);
  return (
    <div className="group relative overflow-hidden rounded-2xl">
      <Link to={`/marketplace/${it.id}`} className="block">
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {thumb ? (
            <img
              src={thumb}
              alt={it.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-neutral-50 text-neutral-400 text-sm">No image</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          <div className="absolute left-4 right-4 bottom-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-white drop-shadow-md text-lg font-semibold">{it.title}</h3>
                <div className="mt-1 flex items-center gap-2 text-sm text-white/90">
                  <span className="rounded-full bg-white/20 px-2 py-0.5 backdrop-blur">{category}</span>
                  <span>•</span>
                  <span className="truncate">{location}</span>
                </div>
              </div>
              <div className="rounded-lg bg-white/90 px-3 py-1.5 text-base font-bold text-gray-900 shadow backdrop-blur">
                ${price}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              {slug ? (
                <Link to={`/s/${slug}`} className="flex items-center gap-2 text-white/95">
                  <Avatar src={avatar} alt={name} />
                  <span className="text-sm">{name}</span>
                </Link>
              ) : (
                <div className="flex items-center gap-2 text-white/95">
                  <Avatar src={avatar} alt={name} />
                  <span className="text-sm">{name}</span>
                </div>
              )}
              <FavButton itemId={it.id} isFav={isFav} light />
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

/* ------------------------------ Variant 4: Media Left (horizontal on sm+) ------------------------------ */
function CardMediaLeft({ it, isFav }) {
  const { thumb, name, avatar, slug, price, category, location } = useItemBasics(it);
  return (
    <div className="group grid grid-cols-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md sm:grid-cols-5">
      <Link to={`/marketplace/${it.id}`} className="sm:col-span-2">
        <div className="relative h-48 w-full overflow-hidden bg-neutral-50 sm:h-full">
          {thumb ? (
            <img src={thumb} alt={it.title} className="h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.03]" loading="lazy" />
          ) : (
            <div className="grid h-full w-full place-items-center text-neutral-400 text-sm">No image</div>
          )}
          <div className="absolute left-3 top-3 rounded-md bg-white/90 px-2.5 py-1 text-sm font-semibold text-gray-900 shadow-sm">${price}</div>
        </div>
      </Link>

      <div className="flex flex-col gap-3 p-4 sm:col-span-3">
        <Link to={`/marketplace/${it.id}`}><h3 className="line-clamp-2 text-base font-semibold text-gray-900 hover:underline">{it.title}</h3></Link>
        <p className="text-sm text-neutral-600">{location}</p>
        <div className="mt-auto flex items-center justify-between">
          {slug ? (
            <Link to={`/s/${slug}`} className="flex items-center gap-2">
              <Avatar src={avatar} alt={name} />
              <div>
                <div className="text-sm font-medium text-neutral-800">{name}</div>
                <div className="text-xs text-neutral-500">{category}</div>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Avatar src={avatar} alt={name} />
              <div>
                <div className="text-sm font-medium text-neutral-800">{name}</div>
                <div className="text-xs text-neutral-500">{category}</div>
              </div>
            </div>
          )}
          <FavButton itemId={it.id} isFav={isFav} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Variant 5: Compact (tight, list-friendly) ------------------------------ */
function CardCompact({ it, isFav }) {
  const { thumb, name, avatar, slug, price, category, location } = useItemBasics(it);
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow">
      <Link to={`/marketplace/${it.id}`}>
        <div className="relative aspect-[3/2] w-full bg-neutral-50">
          {thumb ? (
            <img src={thumb} alt={it.title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="grid h-full w-full place-items-center text-neutral-400 text-sm">No image</div>
          )}
        </div>
      </Link>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/marketplace/${it.id}`} className="min-w-0">
            <h3 className="line-clamp-1 text-sm font-semibold text-gray-900">{it.title}</h3>
          </Link>
          <span className="shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-900 bg-white">${price}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <span className="rounded-full bg-gray-100 px-2 py-0.5">{category}</span>
          <span className="text-neutral-400">•</span>
          <span className="truncate">{location}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          {slug ? (
            <Link to={`/s/${slug}`} className="flex items-center gap-2">
              <Avatar src={avatar} alt={name} size="6" />
              <span className="text-xs text-neutral-700">{name}</span>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Avatar src={avatar} alt={name} size="6" />
              <span className="text-xs text-neutral-700">{name}</span>
            </div>
          )}
          <FavButton itemId={it.id} isFav={isFav} small />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Shared UI bits ------------------------------ */
function Avatar({ src, alt, size = "8" }) {
  const sz = { "6": "h-6 w-6", "7": "h-7 w-7", "8": "h-8 w-8" }[size] || "h-8 w-8";
  return (
    <div className={`${sz} overflow-hidden rounded-full border bg-neutral-100`}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[10px] text-neutral-400">?</div>
      )}
    </div>
  );
}

function FavButton({ itemId, isFav, small = false, light = false }) {
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
    } finally {
      setBusy(false);
    }
  };

  const base = [
    "inline-flex items-center rounded-full border font-medium transition",
    busy ? "opacity-60" : "",
  ].join(" ");

  const sizing = small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  const theme = light
    ? (isFav
        ? "border-yellow-200 bg-white/90 text-yellow-700 hover:bg-white"
        : "border-white/70 bg-white/80 text-gray-800 hover:bg-white")
    : (isFav
        ? "border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50");

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
      className={`${base} ${sizing} ${theme}`}
    >
      <span className="mr-1">{isFav ? "★" : "☆"}</span>
      {isFav ? "Favorited" : "Favorite"}
    </button>
  );
}