// src/pages/user/Favorites.jsx
import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../context/AuthContext";
import { Link } from "react-router-dom";

export default function Favorites() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    (async () => {
      const favSnap = await getDocs(query(collection(db, "users", user.uid, "favorites"), orderBy("createdAt", "desc")));
      const ids = favSnap.docs.map((d) => d.id);
      if (ids.length === 0) return setItems([]);

      const chunks = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
      const results = [];
      for (const chunk of chunks) {
        const qs = await getDocs(query(collection(db, "items"), where("__name__", "in", chunk)));
        qs.forEach((d) => results.push({ id: d.id, ...d.data() }));
      }
      setItems(results);
    })();
  }, [user.uid]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">My Favorites</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => {
          const thumb = it.images?.[0]?.optimizedURL || it.images?.[0]?.originalURL;
          const name = it.ownerName || "Unknown";
          const avatar = it.ownerPhotoURL || "";
          const slug = it.ownerSlug;

          return (
            <div key={it.id} className="rounded-lg border bg-white overflow-hidden">
              <Link to={`/marketplace/${it.id}`} className="block">
                {thumb ? (
                  <img src={thumb} className="h-40 w-full object-cover" />
                ) : (
                  <div className="h-40 w-full grid place-items-center text-neutral-400">No image</div>
                )}
              </Link>
              <div className="p-3 space-y-2">
                <Link to={`/marketplace/${it.id}`} className="font-medium line-clamp-1 hover:underline">{it.title}</Link>
                <div className="text-sm text-neutral-600">
                  ${Number(it.price).toFixed(2)} • {it.location} • {it.category || "Other"}
                </div>

                {slug ? (
                  <Link to={`/s/${slug}`} className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full overflow-hidden bg-neutral-100 border">
                      {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">?</div>}
                    </div>
                    <div className="text-xs text-neutral-700">
                      Listed by <span className="font-medium underline">{name}</span>
                    </div>
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full overflow-hidden bg-neutral-100 border">
                      {avatar ? <img src={avatar} alt={name} className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-[10px] text-neutral-400">?</div>}
                    </div>
                    <div className="text-xs text-neutral-700">
                      Listed by <span className="font-medium">{name}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {items.length === 0 && <p className="text-sm text-neutral-500">You haven’t favorited any items yet.</p>}
    </div>
  );
}