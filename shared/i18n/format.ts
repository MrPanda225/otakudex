import type { Lang } from './lang.ts';

/** Values that fill the `{name}` holes of a message. */
export type MessageParams = Record<string, string | number>;

const pluralRules = new Map<Lang, Intl.PluralRules>();

/** "one" or "other": the two forms both languages need for the words of this application. */
export function pluralCategory(lang: Lang, count: number): 'one' | 'other' {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(lang);
    pluralRules.set(lang, rules);
  }
  return rules.select(count) === 'one' ? 'one' : 'other';
}

const numberFormats = new Map<Lang, Intl.NumberFormat>();

function formatValue(value: string | number, lang: Lang): string {
  if (typeof value === 'string') return value;
  let format = numberFormats.get(lang);
  if (!format) {
    format = new Intl.NumberFormat(lang);
    numberFormats.set(lang, format);
  }
  return format.format(value);
}

/**
 * Replaces each `{name}` with its value, numbers written the way `lang` writes them (5 000 / 5,000); a hole with
 * no value stays visible, which a test catches.
 */
export function fillMessage(template: string, params: MessageParams | undefined, lang: Lang): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (hole, name: string) => (name in params ? formatValue(params[name] as string | number, lang) : hole));
}

/** The holes a message has, in order of appearance: what two languages of one message must share. */
export function holesOf(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? ''))].sort();
}

/**
 * Finds the text of `key`. A message that varies with a number is written as `key.one` and `key.other`, and
 * found through `params.count`; a message without variants is found by its own name.
 */
export function lookupMessage(catalogue: Readonly<Record<string, string>>, key: string, lang: Lang, params?: MessageParams): string | undefined {
  const count = params?.count;
  if (typeof count === 'number') {
    const variant = catalogue[`${key}.${pluralCategory(lang, count)}`] ?? catalogue[`${key}.other`];
    if (variant !== undefined) return variant;
  }
  return catalogue[key];
}

/** The base name of a key: `library.x.one` and `library.x.other` are both `library.x`. */
export type BaseKey<K extends string> = K extends `${infer Base}.${'one' | 'other'}` ? Base : K;
