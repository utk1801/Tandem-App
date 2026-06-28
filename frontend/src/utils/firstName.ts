/** Friendly first name from username or email local-part. */
export function firstNameFromUser(username?: string | null, email?: string | null): string {
  let raw = (username || email || "friend").split("@")[0];
  for (const sep of ["_", ".", "-", " "]) {
    if (raw.includes(sep)) {
      raw = raw.split(sep)[0];
      break;
    }
  }
  const name = raw.trim();
  if (!name) return "Friend";
  return name.length > 1 ? name[0].toUpperCase() + name.slice(1).toLowerCase() : name.toUpperCase();
}
