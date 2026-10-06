import { cached, TTL } from '@/lib/cache';

const THUMB_WIDTH = 400;

async function resolveWikimediaCommons(filename) {
  const clean = filename.replace(/^File:/, '').replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=${THUMB_WIDTH}`;
}

async function resolveWikidata(qid) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${qid}&property=P18&format=json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'halfway/0.1' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const claims = data.claims?.P18;
  if (!claims?.length) return null;
  const file = claims[0].mainsnak?.datavalue?.value;
  if (!file) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${THUMB_WIDTH}`;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const wikimediaCommons = params.get('wikimedia');
  const wikidata = params.get('wikidata');
  const imageTag = params.get('image');

  if (imageTag) {
    if (imageTag.startsWith('http')) {
      return Response.json({ url: imageTag });
    }
  }

  if (wikimediaCommons) {
    try {
      const key = `photo:wmc:${wikimediaCommons}`;
      const url = await cached(key, TTL.PLACES, () => resolveWikimediaCommons(wikimediaCommons));
      return Response.json({ url });
    } catch {
      return Response.json({ url: null });
    }
  }

  if (wikidata) {
    try {
      const key = `photo:wd:${wikidata}`;
      const url = await cached(key, TTL.PLACES, () => resolveWikidata(wikidata));
      return Response.json({ url });
    } catch {
      return Response.json({ url: null });
    }
  }

  return Response.json({ url: null });
}
