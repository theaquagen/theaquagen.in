import { createContext, useContext, useEffect, useState } from "react";
import { onAdminAuth, authAdmin } from "../lib/firebase/authAdmin";

const AdminAuthCtx = createContext({ user: null, loading: true, auth: null });

export function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(() => authAdmin.currentUser);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = onAdminAuth((u) => {
      setUser(u || null);
      setInitializing(false);
    });
    return () => unsub();
  }, []);

  const value = { user, loading: initializing, auth: authAdmin };
  return <AdminAuthCtx.Provider value={value}>{children}</AdminAuthCtx.Provider>;
}

export function useAdminAuthCtx() {
  return useContext(AdminAuthCtx);
}