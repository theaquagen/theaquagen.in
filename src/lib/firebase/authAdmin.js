import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { appAdmin } from "./appAdmin";

export const authAdmin = getAuth(appAdmin);

export const onAdminAuth = (cb) => onAuthStateChanged(authAdmin, cb);
export const adminSignInEmail = (email, password) => signInWithEmailAndPassword(authAdmin, email, password);
export const adminLogout = () => signOut(authAdmin);
