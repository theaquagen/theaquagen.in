import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { getIsAdmin } from "../utils/constants";

export function useUserRole() {
  const { user, loading } = useAuth();
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    // Admin if their UID is in the allow-list; otherwise "user"
    setRole(getIsAdmin(user.uid) ? "admin" : "user");
  }, [user]);

  return { role, loading };
}