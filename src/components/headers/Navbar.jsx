import { useEffect, useMemo, useRef, useState } from 'react'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { Bars2Icon, ArrowPathIcon, CheckIcon, MapPinIcon } from '@heroicons/react/24/solid'
import { AnimatePresence, motion } from 'framer-motion'
import { PlusGrid, PlusGridItem, PlusGridRow } from '../ui/PlusGrid'
import { useAuth } from '../../context/AuthContext'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { db } from '../../firebase'
import {
  doc, getDoc, setDoc, writeBatch, serverTimestamp, increment,
} from 'firebase/firestore'

/**
 * BEHAVIOR SUMMARY
 * - Auto-detect runs at most once per user session unless:
 *    • there is no cache, or
 *    • the cached OK reading is older than AUTO_DETECT_STALE_MS, or
 *    • user clicks the Refresh button manually.
 * - If the user denied/error, we cache that state and SUPPRESS auto-detect for SUPPRESS_DENIED_MS.
 * - All caches are namespaced per-user and cleared on logout or user change.
 */

const LOC_SESSION_KEY = 'app:location:session:v1'          // per-user namespace applied at runtime
const LOC_ANIM_KEY = 'app:location:animShown'
const GEO_CACHE_KEY = 'app:geocache:v2'

// Controls
const AUTO_DETECT_STALE_MS = 12 * 60 * 60 * 1000           // 12h — if OK cache older than this, re-detect on mount
const SUPPRESS_DENIED_MS = 6 * 60 * 60 * 1000              // 6h  — don't re-trigger browser prompt every refresh after denied/error
const REFRESH_COOLDOWN_MS = 1200                           // UI cooldown between manual refreshes

// Legacy constants (left for reference / future use)
const AUTO_CHECK_ON_FOCUS = false
const STALE_DEVICE_READING_MS = 30 * 60 * 1000
const DISTANCE_THRESHOLD_KM = 15

// Clears all location-related caches (call this on logout)
const clearLocationCaches = () => {
  try {
    sessionStorage.removeItem(LOC_SESSION_KEY)
    sessionStorage.removeItem(LOC_ANIM_KEY)
    sessionStorage.removeItem(GEO_CACHE_KEY)
    const keys = Object.keys(sessionStorage)
    for (const k of keys) {
      if (k.startsWith(`${LOC_SESSION_KEY}:`)) sessionStorage.removeItem(k)
    }
  } catch {}
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const toRad = d => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon)
  const lat1 = toRad(aLat), lat2 = toRad(bLat)
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

const slugify = (s) => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
const locId = (city, regionOrCountry) => `${slugify(city)}_${slugify(regionOrCountry)}`

function titleFromSlug(slug = '') {
  return String(slug || '')
    .split('-').filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
function computeAreaFromRecent(recent = []) {
  if (!Array.isArray(recent) || recent.length === 0) return ''
  const suffixes = recent.map(s => String(s || '').split('_').pop() || '').filter(Boolean)
  if (suffixes.length === 0) return ''
  const counts = new Map()
  suffixes.forEach(s => counts.set(s, (counts.get(s) || 0) + 1))
  let max = 0; counts.forEach(v => { if (v > max) max = v })
  const top = [...counts.entries()].filter(([, v]) => v === max).map(([k]) => k)
  const chosen = top.length === 1 ? top[0] : (suffixes[0] || top[0])
  return titleFromSlug(chosen)
}

async function saveLocationIfChanged(uid, { lat, lon, city, region, country, label }) {
  if (!uid) return
  const roc = region || country || ''
  const userRef = doc(db, 'users', uid)
  const profRef = doc(db, 'profiles', uid)
  const histRef = doc(db, 'users', uid, 'locations', locId(city || '', roc || ''))

  const snap = await getDoc(userRef)
  const prev = snap.exists() ? snap.data() : {}
  const prevLoc = prev.lastLocation
  const prevKey = prevLoc ? `${(prevLoc.city||'').toLowerCase()}|${(prevLoc.region||prevLoc.country||'').toLowerCase()}` : ''
  const newKey = `${(city||'').toLowerCase()}|${(roc||'').toLowerCase()}`

  const recent = Array.isArray(prev.recentLocations) ? prev.recentLocations : []
  const newSlug = locId(city || '', roc || '')
  const newRecent = [newSlug, ...recent.filter(x => x !== newSlug)].slice(0, 20)
  const computedArea = computeAreaFromRecent(newRecent)

  const batch = writeBatch(db)

  if (prevKey !== newKey) {
    batch.set(userRef, {
      lastLocation: {
        lat, lon, city: city || '', region: region || '', country: country || '',
        label: label || '', updatedAt: serverTimestamp()
      },
      recentLocations: newRecent,
      lastSeenAt: serverTimestamp(),
    }, { merge: true })

    const histSnap = await getDoc(histRef)
    if (histSnap.exists()) {
      batch.update(histRef, { count: increment(1), lastAt: serverTimestamp(), lat, lon })
    } else {
      batch.set(histRef, {
        city: city || '', region: region || '', country: country || '',
        lat, lon, firstAt: serverTimestamp(), lastAt: serverTimestamp(), count: 1,
      })
    }

    batch.set(profRef, {
      locationCity: city || '',
      locationRegionOrCountry: computedArea || (roc || ''),
      locationCountry: country || '',
    }, { merge: true })
  } else {
    batch.set(userRef, { lastSeenAt: serverTimestamp() }, { merge: true })
  }

  await batch.commit()
}

function useCurrentLocation() {
  const { user } = useAuth()
  const [state, setState] = useState({ status: 'idle', label: null, lastUpdated: null, refreshing: false, lat: null, lon: null })
  const cooldownUntil = useRef(0)
  const prevUid = useRef(null)

  // Per-user namespaced cache key to prevent cross-user bleed
  const cacheKey = user?.uid ? `${LOC_SESSION_KEY}:${user.uid}` : `${LOC_SESSION_KEY}:anon`

  const cacheSet = (payload) => {
    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ ...payload, fetchedAt: Date.now() }))
    } catch {}
  }
  const cacheGet = () => {
    try { return JSON.parse(sessionStorage.getItem(cacheKey) || 'null') } catch { return null }
  }
  const cacheRemove = () => { try { sessionStorage.removeItem(cacheKey) } catch {} }

  const geoCacheGet = (key) => { try { const map = JSON.parse(sessionStorage.getItem(GEO_CACHE_KEY) || '{}'); return map[key] || null } catch { return null } }
  const geoCacheSet = (key, obj) => { try { const map = JSON.parse(sessionStorage.getItem(GEO_CACHE_KEY) || '{}'); map[key] = obj; sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(map)) } catch {} }

  async function reverseGeocodeAndSet(lat, lon, { setAnimShown = false } = {}) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`
    const cached = geoCacheGet(key)
    if (cached) {
      const { label, city = '', region = '', country = '' } = cached
      cacheSet({ status: 'ok', label, lat, lon })
      if (setAnimShown) sessionStorage.setItem(LOC_ANIM_KEY, '1')
      setState({ status: 'ok', label, refreshing: false, lastUpdated: Date.now(), lat, lon })
      if (user) await saveLocationIfChanged(user.uid, { lat, lon, city, region, country, label })
      return
    }

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`, { headers: { Accept: 'application/json' } })
      const data = await res.json()
      const a = data?.address ?? {}
      const city = a.city || a.town || a.village || a.hamlet || a.suburb || ''
      const region = a.state || a.region || a.county || ''
      const country = a.country_code ? a.country_code.toUpperCase() : ''
      const label =
        [city, region || country].filter(Boolean).join(', ') ||
        data?.display_name || `${lat.toFixed(3)}, ${lon.toFixed(3)}`
      geoCacheSet(key, { label, city, region, country })
      cacheSet({ status: 'ok', label, lat, lon })
      if (setAnimShown) sessionStorage.setItem(LOC_ANIM_KEY, '1')
      setState({ status: 'ok', label, refreshing: false, lastUpdated: Date.now(), lat, lon })
      if (user) await saveLocationIfChanged(user.uid, { lat, lon, city, region, country, label })
    } catch {
      // Cache the error with timestamp to suppress repeated prompts for a while
      cacheSet({ status: 'error' })
      setState(s => ({ ...s, status: 'error', refreshing: false, lastUpdated: Date.now() }))
    }
  }

  const detectOnce = () => {
    if (!('geolocation' in navigator)) {
      cacheSet({ status: 'error' })
      setState({ status: 'error', label: null, refreshing: false, lastUpdated: Date.now(), lat: null, lon: null })
      return
    }
    setState({ status: 'loading', label: null, refreshing: false, lastUpdated: null, lat: null, lon: null })
    navigator.geolocation.getCurrentPosition(
      (pos) => { const { latitude, longitude } = pos.coords; reverseGeocodeAndSet(latitude, longitude, { setAnimShown: true }) },
      (err) => {
        const status = err.code === err.PERMISSION_DENIED ? 'denied' : 'error'
        // Cache denied/error so we DON'T auto-detect again on every page refresh for this user
        cacheSet({ status })
        setState(s => ({ ...s, status, refreshing: false, lastUpdated: Date.now() }))
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    )
  }

  const refresh = () => {
    const now = Date.now()
    if (now < cooldownUntil.current) return
    if (!('geolocation' in navigator)) {
      cacheSet({ status: 'error' })
      setState(s => ({ ...s, status: 'error', refreshing: false, lastUpdated: Date.now() }))
      return
    }
    setState(s => ({ ...s, refreshing: true }))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        reverseGeocodeAndSet(latitude, longitude)
        cooldownUntil.current = Date.now() + REFRESH_COOLDOWN_MS
      },
      () => {
        cacheSet({ status: 'error' })
        setState(s => ({ ...s, status: 'error', refreshing: false, lastUpdated: Date.now() }))
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
    )
  }

  // Reset when the logged-in user changes (prevents cross-user bleed)
  useEffect(() => {
    if (prevUid.current !== (user?.uid ?? null)) {
      prevUid.current = user?.uid ?? null
      try {
        const key = user?.uid ? `${LOC_SESSION_KEY}:${user.uid}` : `${LOC_SESSION_KEY}:anon`
        sessionStorage.removeItem(key)
        sessionStorage.removeItem(LOC_ANIM_KEY)
      } catch {}
      setState({ status: 'idle', label: null, lastUpdated: null, refreshing: false, lat: null, lon: null })
    }
  }, [user?.uid])

  // On mount or when user changes: decide whether to auto-detect
  useEffect(() => {
    const cached = cacheGet()
    const now = Date.now()

    // If we have a cached OK and it's fresh, use it and don't re-detect on refresh
    if (cached?.status === 'ok' && cached?.label && cached?.fetchedAt) {
      const age = now - cached.fetchedAt
      if (age < AUTO_DETECT_STALE_MS) {
        setState({
          status: 'ok',
          label: cached.label,
          refreshing: false,
          lastUpdated: cached.fetchedAt,
          lat: cached.lat ?? null,
          lon: cached.lon ?? null
        })
        return
      }
      // stale -> fall through to re-detect once
    }

    // If user previously denied or we errored recently, suppress auto-detect for a while
    if ((cached?.status === 'denied' || cached?.status === 'error') && cached?.fetchedAt) {
      const age = now - cached.fetchedAt
      if (age < SUPPRESS_DENIED_MS) {
        setState(s => ({
          ...s,
          status: cached.status,
          refreshing: false,
          lastUpdated: cached.fetchedAt
        }))
        return
      } else {
        // suppression expired -> clear and try again
        cacheRemove()
      }
    }

    // No usable cache -> detect once
    detectOnce()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  return { ...state, refresh }
}

function formatAgo(ts) {
  if (!ts) return ''
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 45) return '• Just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `• ${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `• ${h}h ago`
  const d = Math.floor(h / 24)
  return `• ${d}d ago`
}
function FreshDot({ when }) {
  if (!when) return null
  const age = Date.now() - when
  const fresh = 12 * 60 * 60 * 1000
  const stale = 3 * 24 * 60 * 60 * 1000
  const cls = age < fresh ? 'bg-emerald-500' : age < stale ? 'bg-amber-500' : 'bg-rose-500'
  const title = age < fresh ? 'Fresh' : age < stale ? 'Stale — consider refresh' : 'Expired — refresh recommended'
  return <span className={`inline-block h-2 w-2 rounded-full ${cls}`} title={title} />
}

function LocationChip() {
  const { status, label, lastUpdated, refresh, refreshing } = useCurrentLocation()
  const [justUpdated, setJustUpdated] = useState(false)
  const [, forceTick] = useState(0)
  const shouldAnimate = !prefersReducedMotion() && !sessionStorage.getItem(LOC_ANIM_KEY)

  useEffect(() => {
    if (!refreshing && status === 'ok') {
      setJustUpdated(true)
      const t = setTimeout(() => setJustUpdated(false), 1100)
      return () => clearTimeout(t)
    }
  }, [refreshing, status])

  useEffect(() => {
    const id = setInterval(() => forceTick(x => x + 1), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const text = useMemo(() => {
    switch (status) {
      case 'ok': return `${label}`
      case 'loading': return 'Detecting location…'
      case 'denied': return 'Location permission denied'
      case 'error': return 'Location unavailable'
      default: return null
    }
  }, [status, label])

  if (!text) return null

  const ChipInner = (
    <div className="flex items-center gap-2" aria-live="polite">
      {status === 'ok' && <MapPinIcon className="w-4 h-4 shrink-0" />}
      <span className="whitespace-nowrap">{text}</span>
      {status === 'ok' && (
        <span className="flex items-center gap-1 text-white/80 text-[11px]">
          <FreshDot when={lastUpdated} />
          <span>{formatAgo(lastUpdated)}</span>
        </span>
      )}
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        aria-busy={refreshing}
        title={refreshing ? 'Refreshing…' : 'Refresh location'}
        className="ml-0.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white/90 hover:bg-white/10 active:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {refreshing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : justUpdated ? <CheckIcon className="w-4 h-4" /> : <ArrowPathIcon className="w-4 h-4" />}
      </button>
    </div>
  )

  return shouldAnimate ? (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={text}
        initial={{ opacity: 0, y: -6, rotateX: -12 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        exit={{ opacity: 0, y: -6, rotateX: 8 }}
        transition={{ duration: 0.28, ease: 'easeInOut' }}
        title="Your approximate location"
      >
        {ChipInner}
      </motion.div>
    </AnimatePresence>
  ) : (
    <div title="Your approximate location">{ChipInner}</div>
  )
}

function DesktopNav({ links }) {
  return (
    <nav className="relative hidden lg:flex">
      {links.map(({ to, label, onClick, isButton }, i) => (
        <PlusGridItem key={`${label}-${i}`} className="relative flex">
          {isButton ? (
            <button type="button" onClick={onClick} className="flex items-center px-4 py-3 text-base font-medium text-gray-950 hover:bg-black/2.5">
              {label}
            </button>
          ) : (
            <Link to={to} className="flex items-center px-4 py-3 text-base font-medium text-gray-950 hover:bg-black/2.5">
              {label}
            </Link>
          )}
        </PlusGridItem>
      ))}
    </nav>
  )
}

function MobileNavButton() {
  return (
    <DisclosureButton className="flex size-12 items-center justify-center self-center rounded-lg hover:bg-black/5 lg:hidden" aria-label="Open main menu">
      <Bars2Icon className="size-6" />
    </DisclosureButton>
  )
}

function MobileNav({ links }) {
  const mobileItems = [{ type: 'chip', key: 'location-chip' }, ...links.map((l, i) => ({ type: 'link', key: `${l.label}-${i}`, ...l }))]

  return (
    <DisclosurePanel className="lg:hidden">
      <div className="px-1 pb-2"></div>
      <div className="flex flex-col gap-6 py-4">
        {mobileItems.map((item, index) => (
          <motion.div key={item.key} initial={{ opacity: 0, rotateX: -90 }} animate={{ opacity: 1, rotateX: 0 }} transition={{ duration: 0.15, ease: 'easeInOut', rotateX: { duration: 0.3, delay: index * 0.1 } }}>
            {item.type === 'chip' ? (
              <div className="inline-flex items-center gap-1 rounded-full bg-fuchsia-950/35 px-3 py-0.5 text-sm/6 font-medium text-white">
                <LocationChip />
              </div>
            ) : item.isButton ? (
              <button type="button" onClick={item.onClick} className="text-left text-base font-medium text-gray-950">{item.label}</button>
            ) : (
              <Link to={item.to} className="text-base font-medium text-gray-950">{item.label}</Link>
            )}
          </motion.div>
        ))}
      </div>
      <div className="absolute left-1/2 w-screen -translate-x-1/2">
        <div className="absolute inset-x-0 top-0 border-t border-black/5" />
        <div className="absolute inset-x-0 top-2 border-t border-black/5" />
      </div>
    </DisclosurePanel>
  )
}

export function Navbar() {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isAdminRoute = pathname.startsWith('/admin')

  const handleLogout = async () => {
    try {
      clearLocationCaches() // wipe location-related caches on logout
      await logout()
      navigate(isAdminRoute ? '/admin/login' : '/login')
    } catch {}
  }

  const userLinks = useMemo(() => {
    const base = [{ to: '/about', label: 'About' }, { to: '/marketplace', label: 'Marketplace' }]
    if (!user) return [...base, { to: '/login', label: 'Login' }]
    return [...base, { to: '/profile', label: 'Account' }, { label: 'Logout', onClick: handleLogout, isButton: true }]
  }, [user])

  const adminLinks = useMemo(() => {
    const base = [{ to: '/admin', label: 'Dashboard' }]
    if (user && role === 'admin') return [...base, { label: 'Logout', onClick: handleLogout, isButton: true }]
    return [...base, { to: '/admin/login', label: 'Login' }]
  }, [user, role])

  const links = isAdminRoute ? adminLinks : userLinks

  return (
    <Disclosure as="header" className="pt-12 sm:pt-16">
      <PlusGrid>
        <PlusGridRow className="relative flex justify-between">
          <div className="relative flex gap-6">
            <PlusGridItem className="py-3">
              <Link to={isAdminRoute ? '/admin' : '/'} title="Home">
                <h3 className="text-base font-semibold text-gray-900">The Aqua Gen.</h3>
              </Link>
            </PlusGridItem>
            <div className="relative hidden items-center gap-3 py-3 lg:flex">
              <div className="flex items-center gap-1 rounded-full bg-fuchsia-950/35 px-3 py-0.5 text-sm/6 font-medium text-white">
                <LocationChip />
              </div>
            </div>
          </div>
          <DesktopNav links={links} />
          <MobileNavButton />
        </PlusGridRow>
      </PlusGrid>
      <MobileNav links={links} />
    </Disclosure>
  )
}

export default Navbar