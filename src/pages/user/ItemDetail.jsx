// src/pages/user/ItemDetail.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import Button from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext";

export default function ItemDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [item, setItem] = useState(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "items", id));
      setItem(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    })();
  }, [id]);

  if (!item) return <div>Loading…</div>;

  const name = item.ownerName || "Unknown";
  const avatar = item.ownerPhotoURL || "";
  const slug = item.ownerSlug;

  const Uploader = () => (
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full overflow-hidden bg-neutral-100 border">
        {avatar ? (
          <img src={avatar} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full grid place-items-center text-xs text-neutral-400">?</div>
        )}
      </div>
      <div className="text-sm text-neutral-700">
        Listed by <span className="font-medium">{name}</span>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Uploader (clickable if slug exists) */}
      {slug ? (
        <Link to={`/s/${slug}`} className="inline-block"><Uploader /></Link>
      ) : (
        <Uploader />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {item.images?.map((im, i) => (
          <img key={i} src={im.optimizedURL || im.originalURL} alt={`image-${i}`} className="rounded-lg border h-56 w-full object-cover" />
        ))}
      </div>
      <h1 className="text-2xl font-semibold">{item.title}</h1>
      <div className="text-neutral-600">
        ${Number(item.price).toFixed(2)} • {item.location} • {item.category || "Other"}
      </div>
      <p className="text-neutral-800 whitespace-pre-wrap">{item.description}</p>

      <div>
        <FavButton itemId={item.id} />
      </div>

      {user?.uid === item.ownerId && (
        <p className="text-xs text-neutral-500">You are the owner of this item.</p>
      )}
    </div>
  );
}

function FavButton({ itemId }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    (async () => {
      const { doc, getDoc } = await import("firebase/firestore");
      const snap = await getDoc(doc(db, "users", user.uid, "favorites", itemId));
      setIsFav(snap.exists());
    })();
  }, [itemId, user.uid]);

  const toggle = async () => {
    setBusy(true);
    try {
      const { doc, getDoc, setDoc, deleteDoc, serverTimestamp } = await import("firebase/firestore");
      const favRef = doc(db, "users", user.uid, "favorites", itemId);
      const exists = (await getDoc(favRef)).exists();
      if (exists) { await deleteDoc(favRef); setIsFav(false); }
      else { await setDoc(favRef, { createdAt: serverTimestamp() }); setIsFav(true); }
    } finally { setBusy(false); }
  };

  return (
    <Button variant={isFav ? "secondary" : "outline"} onClick={toggle} loading={busy}>
      {isFav ? "★ Favorited" : "☆ Favorite"}
    </Button>
  );
}