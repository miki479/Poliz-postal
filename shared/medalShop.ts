import type { Award, AwardSport } from './records.ts';

export interface MedalOffer {
  id: string;
  title: string;
  awardCode: string;
  sport: AwardSport;
  url: string;
}
/** Public merchant links only. Empty/malformed configuration never advertises a purchase. */
export function medalCatalog(raw: unknown): MedalOffer[] {
  let rows: unknown;
  try { rows = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
  if (!Array.isArray(rows)) return [];
  const ids = new Set<string>();
  const offers: MedalOffer[] = [];
  for (const item of rows.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(row.id) || ids.has(row.id)) continue;
    if (typeof row.title !== 'string' || !row.title.trim() || row.title.length > 100) continue;
    if (typeof row.awardCode !== 'string' || !/^[a-z0-9_]{1,80}$/.test(row.awardCode)) continue;
    if (!['running','walking','trail','strength'].includes(String(row.sport))) continue;
    if (typeof row.url !== 'string' || row.url.length > 2000) continue;
    try {
      const url = new URL(row.url);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || url.hostname === 'localhost' || url.hostname.endsWith('.local') || /^[\d.]+$/.test(url.hostname)) continue;
      ids.add(row.id);
      offers.push({id:row.id,title:row.title.trim(),awardCode:row.awardCode,sport:row.sport as AwardSport,url:url.href});
    } catch { /* Invalid merchant link: leave its promotion hidden. */ }
  }
  return offers;
}
export function physicalMedalOffer(awards: Award[], catalog: MedalOffer[]): {award:Award;offer:MedalOffer}|null {
  for (const award of awards) {
    const offer = catalog.find(row=>row.awardCode===award.code&&row.sport===award.sport);
    if (offer) return {award,offer};
  }
  return null;
}
