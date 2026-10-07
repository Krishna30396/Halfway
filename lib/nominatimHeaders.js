// Nominatim's usage policy wants every request to identify the app. Its
// firewall blocks placeholder contacts like you@example.com outright (403), so
// identify by the site URL, plus a contact email when CONTACT_EMAIL is set.
export function nominatimHeaders() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://halfway-liard.vercel.app';
  const contact = process.env.CONTACT_EMAIL ? `; ${process.env.CONTACT_EMAIL}` : '';
  return { 'User-Agent': `Halfway/1.0 (+${site}${contact})`, Referer: `${site}/` };
}
