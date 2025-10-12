import { useEffect, useState } from "react";
import { useAdminAuth } from "./useAdminAuth";
import { inferRoleFromClaims } from "../utils/constants";

export function useAdminRole() {
  const { user, loading } = useAdminAuth();
  const [role, setRole] = useState(null);
  const [claimsLoading, setClaimsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function go() {
      if (!user) {
        if (mounted) {
          setRole(null);
          setClaimsLoading(false);
        }
        return;
      }
      try {
        const token = await user.getIdTokenResult(true);
        const r = inferRoleFromClaims(user, token?.claims || {});
        if (mounted) {
          setRole(r);
          setClaimsLoading(false);
        }
      } catch {
        if (mounted) {
          setRole(null);
          setClaimsLoading(false);
        }
      }
    }
    go();
    return () => { mounted = false; };
  }, [user]);

  return { role, loading: loading || claimsLoading };
}