import type { MessageKey } from '../../i18n/catalogue.ts';

/** The fields of the entry sheet that confirm a save next to themselves. */
export type SavedField = 'status' | 'progress' | 'startedOn' | 'completedOn' | 'rewatchCount' | 'note';

/** When each field was last saved (a changing number), or nothing yet. */
export type SavedStamps = Partial<Record<SavedField, number>>;

/** The message a screen reader hears once a save went through. */
export const SAVED_ANNOUNCEMENT = {
  status: 'saved.status',
  progress: 'saved.progress',
  startedOn: 'saved.startedOn',
  completedOn: 'saved.completedOn',
  rewatchCount: 'saved.rewatchCount',
  note: 'saved.note',
} as const satisfies Record<SavedField, MessageKey>;
