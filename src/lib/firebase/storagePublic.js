import { getStorage } from "firebase/storage";
import { appPublic } from "./appPublic";

const bucket = `gs://${import.meta.env.VITE_FIREBASE_STORAGE_BUCKET}`;
export const storagePublic = getStorage(appPublic, bucket);

if (import.meta.env.DEV) {
    console.info("[storagePublic] bucket:", bucket);
}
