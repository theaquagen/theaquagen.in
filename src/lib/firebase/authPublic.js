import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { appPublic } from "./appPublic";

export const authPublic = getAuth(appPublic);

export const onPublicAuth = (cb) => onAuthStateChanged(authPublic, cb);
export const publicSignInEmail = (email, password) => signInWithEmailAndPassword(authPublic, email, password);
export const publicSignUpEmail = (email, password) => createUserWithEmailAndPassword(authPublic, email, password);
export const publicLogout = () => signOut(authPublic);