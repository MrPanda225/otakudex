import type { MessageParams } from '../../../shared/i18n/format.ts';
import type { MessageKey } from './catalogue.ts';
import type { Translate } from './translate.ts';

/**
 * Something to tell a person about what they typed. A message of the interface is kept as its key, so it
 * changes language with the screen; a message the server wrote is already in the language that was asked.
 */
export type Problem = { key: MessageKey; params?: MessageParams } | { text: string };

export function problemText(t: Translate, problem: Problem): string {
  return 'text' in problem ? problem.text : t(problem.key, problem.params);
}
