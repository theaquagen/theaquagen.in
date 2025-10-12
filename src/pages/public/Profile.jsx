import { useAuth } from "../../hooks/useAuth";

export default function Profile() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <p className="p-4">Please log in to see your profile.</p>;

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">Profile</h1>
      <p><strong>Email:</strong> {user.email}</p>
      <p><strong>UID:</strong> {user.uid}</p>
    </div>
  );
}