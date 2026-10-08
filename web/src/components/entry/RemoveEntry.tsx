import { useI18n } from '../../i18n/index.tsx';
import { InlineConfirm } from '../InlineConfirm.tsx';

interface RemoveEntryProps {
  title: string;
  onRemove: () => void;
}

/** The only destructive action of the sheet: apart from the others, and it asks first, with the safe answer focused. */
export function RemoveEntry({ title, onRemove }: RemoveEntryProps) {
  const { t } = useI18n();
  return (
    <InlineConfirm
      triggerLabel={t('remove.trigger')}
      triggerIcon="trash"
      triggerClass="btn btn--quiet btn--danger-text"
      message={t('remove.message', { title })}
      confirmLabel={t('remove.confirm')}
      cancelLabel={t('remove.keep')}
      onConfirm={onRemove}
    />
  );
}
