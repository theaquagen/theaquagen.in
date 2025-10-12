import { isSupported, getAnalytics } from "firebase/analytics";
import { app } from "./app";

// Only call in browser + production/https contexts.
export async function initAnalytics() {
  try {
    const supported = await isSupported();
    if (supported) return getAnalytics(app);
  } catch (_) {}
  return null;
}