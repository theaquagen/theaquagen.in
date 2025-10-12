import { createContext, useContext, useEffect, useState } from "react";
import { onPublicAuth, authPublic } from "../lib/firebase/authPublic";

const AuthCtx = createContext({ user: null, loading: true, auth: null });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authPublic.currentUser);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = onPublicAuth((u) => {
      setUser(u || null);
      setInitializing(false);
    });
    return () => unsub();
  }, []);

  const value = { user, loading: initializing, auth: authPublic };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuthCtx() {
  return useContext(AuthCtx);
}