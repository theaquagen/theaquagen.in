import { getFirestore } from "firebase/firestore";
import { appPublic } from "./appPublic";

export const dbPublic = getFirestore(appPublic);