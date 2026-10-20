// Initials avatars (Users screen, project members). Colours are tokens (--avatar-1..7) that keep
// white initials at >= 4.5:1 in both themes.
const AVATAR_TOKENS = 7;

export function avatarColor(key = '') {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
  return `var(--avatar-${(Math.abs(hash) % AVATAR_TOKENS) + 1})`;
}

export function initials(name = '', email = '', fallback = 'U') {
  const clean = name.trim();
  if (clean) {
    const parts = clean.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return fallback;
}
