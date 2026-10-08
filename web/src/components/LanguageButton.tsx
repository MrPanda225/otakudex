import { useI18n } from '../i18n/index.tsx';
import { Icon } from './Icon.tsx';

/**
 * Switches between French and English. It shows the language it leads to ("EN" while the page is French) and
 * is named in that language, so someone who cannot read the current one still finds it.
 */
export function LanguageButton({ class: className = '' }: { class?: string }) {
  const { lang, setLang, t } = useI18n();
  const target = lang === 'fr' ? 'en' : 'fr';
  const label = t(target === 'en' ? 'lang.toEn' : 'lang.toFr');
  return (
    <button type="button" class={`lang-btn ${className}`.trim()} lang={target} aria-label={label} title={label} onClick={() => setLang(target)}>
      <Icon name="globe" />
      <span aria-hidden="true">{target.toUpperCase()}</span>
    </button>
  );
}
