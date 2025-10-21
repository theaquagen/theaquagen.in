// src/pages/user/Profile.jsx
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { db, auth, storage } from "../../firebase";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, query, where, getDocs, writeBatch, limit as fsLimit, startAfter
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { createOptimizedImage } from "../../utils/image";
import { slugify } from "../../utils/slug";

export default function Profile() {
  const { user, role } = useAuth();
  const [pub, setPub] = useState(null);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState(null);
  const [busyAvatar, setBusyAvatar] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [busySlug, setBusySlug] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const profSnap = await getDoc(doc(db, "profiles", user.uid));
      const prof = profSnap.exists() ? profSnap.data() : {};
      if (!mounted) return;
      setPub(prof);
      setDisplayName(prof.displayName || auth.currentUser?.displayName || "");
      setSlug(prof.sellerSlug || "");
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [user.uid]);

  const validateSlug = (s) => {
    const v = slugify(s);
    if (v.length < 3 || v.length > 30) return { ok:false, msg:"Slug must be 3–30 chars." };
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/.test(v)) return { ok:false, msg:"Only a–z, 0–9, hyphens; no leading/trailing hyphen." };
    if (/--/.test(v)) return { ok:false, msg:"No consecutive hyphens." };
    return { ok:true, value:v };
  };

  const propagateNewSlugToItems = async (newSlug) => {
    // Update all items.ownerId == me → ownerSlug = newSlug
    let cursor = null;
    while (true) {
      const q = query(
        collection(db, "items"),
        where("ownerId", "==", user.uid),
        fsLimit(400),
        ...(cursor ? [startAfter(cursor)] : [])
      );
      const snap = await getDocs(q);
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => {
        batch.update(doc(db, "items", d.id), { ownerSlug: newSlug });
      });
      await batch.commit();
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < 400) break;
    }
  };

  const savePublicProfile = async () => {
    setErr(""); setMsg(""); setBusySlug(true);
    try {
      const currentSlug = pub?.sellerSlug || "";
      const want = slug.trim();
      // validate desired slug
      const chk = validateSlug(want);
      if (!chk.ok) { setErr(chk.msg); return; }
      const newSlug = chk.value;

      if (newSlug !== currentSlug) {
        // check availability
        const newRef = doc(db, "usernames", newSlug);
        const newSnap = await getDoc(newRef);
        if (newSnap.exists() && newSnap.data().uid !== user.uid) {
          setErr("That username is taken."); return;
        }
        // claim new (idempotent if already mine)
        await setDoc(newRef, { uid: user.uid });

        // update public profile
        await setDoc(doc(db, "profiles", user.uid), {
          displayName: displayName.trim(),
          avatar: pub?.avatar || auth.currentUser?.photoURL || "",
          sellerSlug: newSlug,
        }, { merge: true });

        // update auth displayName (optional)
        if (displayName && auth.currentUser?.displayName !== displayName.trim()) {
          await updateProfile(auth.currentUser, { displayName: displayName.trim() });
        }

        // update all my items to new ownerSlug
        await propagateNewSlugToItems(newSlug);

        // release old slug (optional but recommended)
        if (currentSlug) {
          // delete old mapping only after items are updated
          await (await import("firebase/firestore")).deleteDoc(doc(db, "usernames", currentSlug))
            .catch(()=>{ /* ignore */ });
        }

        setPub({ ...(pub||{}), displayName: displayName.trim(), sellerSlug: newSlug });
        setSlug(newSlug);
        setMsg("Public profile saved and listings updated.");
      } else {
        // Only display name changed
        await setDoc(doc(db, "profiles", user.uid), {
          displayName: displayName.trim(),
        }, { merge: true });
        if (displayName && auth.currentUser?.displayName !== displayName.trim()) {
          await updateProfile(auth.currentUser, { displayName: displayName.trim() });
        }
        setPub({ ...(pub||{}), displayName: displayName.trim() });
        setMsg("Public profile saved.");
      }
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to save public profile.");
    } finally {
      setBusySlug(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!file) return;
    setErr(""); setMsg(""); setBusyAvatar(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const origRef = ref(storage, `avatars/${user.uid}/original/avatar.${ext}`);
      await uploadBytes(origRef, file);
      const optimizedBlob = await createOptimizedImage(file, 512, 0.8);
      const optRef = ref(storage, `avatars/${user.uid}/optimized/avatar.jpg`);
      await uploadBytes(optRef, optimizedBlob);
      const [, optURL] = await Promise.all([getDownloadURL(origRef), getDownloadURL(optRef)]);

      await updateProfile(auth.currentUser, { photoURL: optURL });
      await setDoc(doc(db, "profiles", user.uid), { avatar: optURL }, { merge: true });

      setPub((p)=>({ ...(p||{}), avatar: optURL }));
      setMsg("Avatar updated.");
      setFile(null);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Avatar update failed.");
    } finally {
      setBusyAvatar(false);
    }
  };

  if (loading) return null;
  const avatar = pub?.avatar || auth.currentUser?.photoURL || "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Profile</div>
        {pub?.sellerSlug && (
          <a className="text-sm underline" href={`/s/${pub.sellerSlug}`}>View public profile</a>
        )}
      </div>

      {/* Avatar & account */}
      <div className="rounded-lg bg-white p-4 border grid gap-3 md:grid-cols-2">
        <div className="text-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-14 w-14 rounded-full overflow-hidden border bg-neutral-100">
              {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-neutral-400 text-xs">No photo</div>}
            </div>
            <div className="flex-1">
              <label className="text-sm block mb-1">Change avatar</label>
              <Input type="file" accept="image/*" onChange={(e)=>setFile(e.target.files?.[0]||null)} />
            </div>
          </div>
          <Button onClick={handleAvatarUpload} loading={busyAvatar} disabled={!file} loadingText="Saving…">Save avatar</Button>
        </div>

        <div className="text-sm">
          <div><span className="font-medium">Email:</span> {user.email}</div>
          <div><span className="font-medium">Role:</span> {role}</div>
        </div>
      </div>

      {/* Public profile (editable slug) */}
      <div className="rounded-lg bg-white p-4 border space-y-3">
        <div className="text-sm text-neutral-500">Public profile</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm">Display name</label>
            <Input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} placeholder="e.g. Akash Ramasani" />
          </div>
          <div>
            <label className="text-sm">Username (slug)</label>
            <Input
              value={slug}
              onChange={(e)=>setSlug(e.target.value)}
              placeholder="e.g. akash-ramasani"
            />
            <p className="text-xs text-neutral-500 mt-1">Public URL: <code>/s/{slugify(slug) || "your-name"}</code></p>
          </div>
        </div>

        {err && <p className="text-sm text-rose-600">{err}</p>}
        {msg && <p className="text-sm text-green-700">{msg}</p>}

        <Button onClick={savePublicProfile} loading={busySlug}>Save public profile</Button>
      </div>
    </div>
  );
}