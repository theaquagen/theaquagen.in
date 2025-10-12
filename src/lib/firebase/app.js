import { initializeApp, getApps, getApp } from "firebase/app";
import { firebaseConfig } from "./config";

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);