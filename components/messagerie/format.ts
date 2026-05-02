// Helpers de formatage pour la messagerie

export function fmtTimeShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) {
    const days = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
    return days[d.getDay()];
  }
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  if (d.getFullYear() !== now.getFullYear()) {
    return `${day}/${month}/${String(d.getFullYear()).slice(2)}`;
  }
  return `${day}/${month}`;
}

export function fmtTimeFull(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} · ${hh}:${mm}`;
}

export function displayName(profile: {
  username: string | null;
  full_name: string | null;
  id: string;
}): string {
  return profile.full_name || profile.username || `Membre ${profile.id.slice(0, 6)}`;
}

export function initials(profile: {
  username: string | null;
  full_name: string | null;
}): string {
  const name = profile.full_name || profile.username || "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function avatarColor(id: string): string {
  const colors = [
    "#1d4ed8", "#7c3aed", "#be185d", "#059669",
    "#b45309", "#0d9488", "#dc2626", "#0369a1",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}
