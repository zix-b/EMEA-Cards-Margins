// Opt-in live verification while the established portal remains the default.
window.ADMIN_BACKEND_URL = new URLSearchParams(location.search).get('auth') === 'cloudflare'
  ? 'https://emea-cards-admin.limzhixian6392.workers.dev' : '';
