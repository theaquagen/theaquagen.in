import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { app } from "./app";

export const auth = getAuth(app);

export const onAuth = (cb) => onAuthStateChanged(auth, cb);
export const signInEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signUpEmail = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);