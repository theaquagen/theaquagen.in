// src/pages/public/Profile.jsx
import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { dbPublic } from "../../lib/firebase/dbPublic";
import { doc, getDoc } from "firebase/firestore";

export default function Profile() {
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function go() {
      if (!user) return setProfile(null);
      const usersDoc = await getDoc(doc(dbPublic, "profiles", "users"));
      const data = usersDoc.exists() ? usersDoc.data() : null;
      if (mounted) setProfile(data?.[user.uid] || null);
    }
    if (!loading) go();
    return () => { mounted = false; };
  }, [user, loading]);

  if (loading) return null;
  if (!user) return <p className="p-4">Please log in to see your profile.</p>;
  if (!profile) return <p className="p-4">No profile found.</p>;

  return (
    <div className="max-w-md mx-auto p-4 space-y-3">
      <div className="flex items-center gap-4">
        {profile.photo?.avatarUrl && (
          <img src={profile.photo.avatarUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold">
            {profile.firstName} {profile.lastName}
          </h1>
          <p className="text-gray-600">{profile.email}</p>
        </div>
      </div>
      <div className="text-sm text-gray-700">
        <p><strong>Gender:</strong> {profile.gender}</p>
        <p><strong>Place:</strong> {profile.place}</p>
        <p><strong>Phone:</strong> {profile.phone}</p>
        <p><strong>Date of Birth:</strong> {profile.dob}</p>
      </div>
    </div>
  );
}