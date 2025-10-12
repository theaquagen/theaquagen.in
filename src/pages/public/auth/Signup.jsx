// src/pages/public/auth/Signup.jsx
import { useState } from "react";
import Input from "../../../components/ui/Input";
import Button from "../../../components/ui/Button";
import FormField from "../../../components/ui/FormField";
import { publicSignUpEmail } from "../../../lib/firebase/authPublic";
import { useNavigate } from "react-router-dom";

import { dbPublic } from "../../../lib/firebase/dbPublic";
import { storagePublic } from "../../../lib/firebase/storagePublic";
import { serverTimestamp, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { resizeImageToBlob } from "../../../utils/image";

export default function Signup() {
  const nav = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    gender: "",
    place: "",
    phone: "",
    email: "",
    password: "",
    dob: "", // YYYY-MM-DD
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onChange = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const onPhoto = (e) => {
    const f = e.target.files?.[0] || null;
    setPhotoFile(f);
    setPreviewUrl(f ? URL.createObjectURL(f) : "");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      // 1) Create user in Auth
      const cred = await publicSignUpEmail(form.email, form.password);
      const user = cred.user;

      // Ensure token present for Firestore/Storage rules
      await user.getIdToken(true);

      // 2) Upload photos (best-effort; don't block profile write)
      let originalUrl = "";
      let avatarUrl = "";

      if (photoFile) {
        try {
          const ext = mimeToExt(photoFile.type) || "jpg";

          // Original
          const originalRef = ref(storagePublic, `profiles/users/${user.uid}/original.${ext}`);
          await uploadBytes(originalRef, photoFile, { contentType: photoFile.type });
          originalUrl = await getDownloadURL(originalRef);

          // Avatar (256x256 jpeg)
          const avatarBlob = await resizeImageToBlob(photoFile, 256, 256, "image/jpeg", 0.8);
          const avatarRef = ref(storagePublic, `profiles/users/${user.uid}/avatar.jpg`);
          await uploadBytes(avatarRef, avatarBlob, { contentType: "image/jpeg" });
          avatarUrl = await getDownloadURL(avatarRef);
        } catch (upErr) {
          console.warn("[Signup] Storage upload failed:", upErr?.code, upErr?.message);
        }
      }

      // 3) Save profile under /profiles/users (map keyed by uid)
      const usersDocRef = doc(dbPublic, "profiles", "users");
      const now = serverTimestamp();
      const profile = {
        uid: user.uid,
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender,
        place: form.place,
        phone: form.phone,
        email: form.email,
        photo: { originalUrl, avatarUrl },
        dob: form.dob,
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(usersDocRef, { [user.uid]: profile }, { merge: true });

      // 4) Done
      nav("/", { replace: true });
    } catch (e) {
      console.error("[Signup] FAILED:", e?.code, e?.message);
      setErr(e?.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create Account</h1>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="First Name">
            <Input value={form.firstName} onChange={onChange("firstName")} required />
          </FormField>
          <FormField label="Last Name">
            <Input value={form.lastName} onChange={onChange("lastName")} required />
          </FormField>

          <FormField label="Gender">
            <select
              className="border border-gray-300 rounded-md px-3 py-2 w-full"
              value={form.gender}
              onChange={onChange("gender")}
              required
            >
              <option value="" disabled>Choose…</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="nonbinary">Non-binary</option>
              <option value="prefer_not">Prefer not to say</option>
            </select>
          </FormField>

          <FormField label="Place">
            <Input value={form.place} onChange={onChange("place")} required />
          </FormField>

          <FormField label="Phone">
            <Input type="tel" value={form.phone} onChange={onChange("phone")} required />
          </FormField>

          <FormField label="Date of Birth">
            <Input type="date" value={form.dob} onChange={onChange("dob")} required />
          </FormField>
        </div>

        <FormField label="Email">
          <Input type="email" value={form.email} onChange={onChange("email")} required />
        </FormField>

        <FormField label="Password">
          <Input type="password" value={form.password} onChange={onChange("password")} required />
        </FormField>

        <div className="grid md:grid-cols-2 gap-4">
          <FormField label="Photo (original + avatar)">
            <Input type="file" accept="image/*" onChange={onPhoto} />
          </FormField>
          {previewUrl ? (
            <div className="flex items-end">
              <img
                src={previewUrl}
                alt="preview"
                className="w-24 h-24 rounded-full object-cover border"
              />
            </div>
          ) : null}
        </div>

        {err && <p className="text-red-600 text-sm">{err}</p>}

        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Sign Up"}
        </Button>
      </form>
    </div>
  );
}

function mimeToExt(mime) {
  if (!mime) return "";
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  return map[mime] || "";
}