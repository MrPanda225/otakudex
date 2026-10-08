import type { Bucket, Status, Tier } from './domain.ts';
import type { Lang } from './i18n/lang.ts';

/** User-facing labels in each language, shared by the web client and the CSV export. */
const STATUS_LABELS: Record<Lang, Record<Status, string>> = {
  fr: { planned: 'À voir', watching: 'En cours', completed: 'Terminé', paused: 'En pause', dropped: 'Abandonné' },
  en: { planned: 'To watch', watching: 'Watching', completed: 'Completed', paused: 'On hold', dropped: 'Dropped' },
};

const BUCKET_LABELS: Record<Lang, Record<Bucket, string>> = {
  fr: { loved: 'Adoré', liked: 'Bien', meh: 'Bof' },
  en: { loved: 'Loved', liked: 'Liked', meh: 'Meh' },
};

const TIER_LABELS: Record<Lang, Record<Tier, string>> = {
  fr: { S: 'Légendaire', A: 'Épique', B: 'Rare', C: 'Commun', D: 'Oubliable' },
  en: { S: 'Legendary', A: 'Epic', B: 'Rare', C: 'Common', D: 'Forgettable' },
};

export function statusLabel(lang: Lang, status: Status): string {
  return STATUS_LABELS[lang][status];
}

export function bucketLabel(lang: Lang, bucket: Bucket): string {
  return BUCKET_LABELS[lang][bucket];
}

export function tierLabel(lang: Lang, tier: Tier): string {
  return TIER_LABELS[lang][tier];
}
