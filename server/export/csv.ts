import type { EntryDto } from '../../shared/domain.ts';
import type { Lang } from '../../shared/i18n/lang.ts';
import { bucketLabel, statusLabel } from '../../shared/labels.ts';

const UTF8_BOM = '﻿'; // lets Excel open the file as UTF-8
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

const HEADERS: Record<Lang, readonly string[]> = {
  fr: ['Titre', 'Type', 'Statut', 'Épisodes vus', 'Épisodes total', 'Compartiment', 'Rang', 'Note sur 100', 'Tier', 'Début', 'Fin', 'Revisionnages', 'Genres', 'Note privée'],
  en: ['Title', 'Type', 'Status', 'Episodes watched', 'Episodes total', 'Bucket', 'Rank', 'Score out of 100', 'Tier', 'Start', 'End', 'Rewatches', 'Genres', 'Private note'],
};

type Cell = string | number | null;

/**
 * Escapes one CSV cell. Text starting with a spreadsheet formula character gets a leading quote,
 * so opening the file can never run a formula built from external data (CSV injection).
 */
export function escapeCsvCell(value: Cell): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_TRIGGERS.some((trigger) => text.startsWith(trigger))) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The library as a spreadsheet, headers and labels in `lang` (the data itself is not translated). */
export function entriesToCsv(entries: readonly EntryDto[], lang: Lang = 'fr'): string {
  const rows = entries.map((entry): Cell[] => [
    entry.media.title,
    entry.media.subtype,
    statusLabel(lang, entry.status),
    entry.progress,
    entry.media.episodeCount,
    entry.bucket ? bucketLabel(lang, entry.bucket) : null,
    entry.rankPosition,
    entry.score,
    entry.tier,
    entry.startedOn,
    entry.completedOn,
    entry.rewatchCount,
    entry.media.genres.join(' / '),
    entry.note,
  ]);
  const lines = [HEADERS[lang] as readonly Cell[], ...rows].map((row) => row.map(escapeCsvCell).join(','));
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}
