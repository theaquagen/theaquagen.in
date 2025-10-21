// src/utils/slug.js
export function slugify(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

export function ddmmFromDOB(dob) {
  // dob can be "YYYY-MM-DD", timestamp (ms), Firestore Timestamp, or Date
  try {
    let d;
    if (!dob) return "";
    if (typeof dob === "string") {
      const parts = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (parts) d = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00Z`);
      else d = new Date(dob);
    } else if (typeof dob.toDate === "function") {
      d = dob.toDate();
    } else if (dob instanceof Date) {
      d = dob;
    } else if (typeof dob === "number") {
      d = new Date(dob);
    }
    if (!d || isNaN(d.getTime())) return "";
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${dd}${mm}`;
  } catch { return ""; }
}