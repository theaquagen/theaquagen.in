import { initializeApp, getApps, getApp } from "firebase/app";
import { firebaseConfig } from "./config";

// Separate named app for ADMIN session (independent auth persistence)
export const appAdmin = getApps().find(a => a.name === "ADMIN")
  ? getApp("ADMIN")
  : initializeApp(firebaseConfig, "ADMIN");