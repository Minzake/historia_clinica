export function passwordSetupRequested(pathname: string, hash: string) {
  // Supabase can fall back to Site URL (/) if the requested redirect is not allowlisted.
  const type = new URLSearchParams(hash.replace(/^#/, '')).get('type')
  return pathname === '/recuperar' || type === 'recovery' || type === 'invite'
}
