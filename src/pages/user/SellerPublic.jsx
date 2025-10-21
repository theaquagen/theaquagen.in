// src/pages/user/SellerPublic.jsx
import { useEffect, useRef, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit, startAfter
} from "firebase/firestore";
import { db } from "../../firebase";
import Button from "../../components/ui/Button";

const PAGE_SIZE = 12;

export default function SellerPublic() {
  const { slug } = useParams();

  const [uid, setUid] = useState(null);
  const [profile, setProfile] = useState(null); // { displayName, avatar, sellerSlug }
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const lastDocRef = useRef(null);
  const [notFound, setNotFound] = useState(false);

  // Resolve slug -> uid + load public profile
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mapSnap = await getDoc(doc(db, "usernames", slug));
        if (!mapSnap.exists()) { setNotFound(true); return; }
        const ownerUid = mapSnap.data().uid;
        setUid(ownerUid);

        const profSnap = await getDoc(doc(db, "profiles", ownerUid));
        setProfile(profSnap.exists() ? profSnap.data() : { displayName: "Seller", avatar: "", sellerSlug: slug });

        // First page of items
        const q = query(
          collection(db, "items"),
          where("ownerId", "==", ownerUid),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE)
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        setItems(snap.docs.map((d)=>({ id: d.id, ...d.data() })));
        lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
        if (snap.size < PAGE_SIZE) setEndReached(true);
      } catch (e) {
        console.error(e);
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const loadMore = async () => {
    if (endReached || loadingMore || !uid) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "items"),
        where("ownerId", "==", uid),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE),
        startAfter(lastDocRef.current)
      );
      const snap = await getDocs(q);
      setItems((prev)=>[...prev, ...snap.docs.map((d)=>({ id: d.id, ...d.data() }))]);
      lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      if (snap.size < PAGE_SIZE) setEndReached(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <div className="text-xl font-semibold">Seller not found</div>
        <p className="text-sm text-neutral-600">The username <code>/{slug}</code> does not exist.</p>
        <Link to="/marketplace"><Button variant="outline">Back to marketplace</Button></Link>
      </div>
    );
  }

  if (loading) return <div className="text-sm text-neutral-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full overflow-hidden bg-neutral-100 border">
            {profile?.avatar ? (
              <img src={profile.avatar} alt={profile?.displayName || slug} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full grid place-items-center text-sm text-neutral-400">?</div>
            )}
          </div>
          <div>
            <div className="text-lg font-semibold">{profile?.displayName || "Seller"}</div>
            <div className="text-xs text-neutral-500">@{slug}</div>
          </div>
        </div>
        <Link to="/marketplace"><Button variant="outline">Back to marketplace</Button></Link>
      </div>

      {/* Listings */}
      <div className="space-y-3">
        <div className="text-sm text-neutral-500">Listings</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it)=> <ItemCard key={it.id} it={it} />)}
        </div>
        {items.length === 0 && <div className="text-sm text-neutral-500">No listings yet.</div>}
      </div>

      {/* Pagination */}
      <div className="flex justify-center">
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