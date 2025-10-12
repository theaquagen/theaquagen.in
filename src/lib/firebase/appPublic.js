import { initializeApp, getApps, getApp } from "firebase/app";
import { firebaseConfig } from "./config";

// Default app for PUBLIC session
export const appPublic = getApps().find(a => a.name === "[DEFAULT]")
  ? getApp()
  : initializeApp(firebaseConfig);