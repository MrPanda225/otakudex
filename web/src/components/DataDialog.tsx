import { useRef, useState } from 'preact/hooks';
import { api, errorMessage } from '../api.ts';
import { useI18n } from '../i18n/index.tsx';
import { useLibrary } from '../store.tsx';
import { useToast } from '../toast.tsx';
import { Icon } from './Icon.tsx';
import { Modal } from './Modal.tsx';

interface DataDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DataDialog({ isOpen, onClose }: DataDialogProps) {
  const { t } = useI18n();
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('data.title')}>
      <DataActions onDone={onClose} />
    </Modal>
  );
}

function DataActions({ onDone }: { onDone: () => void }) {
  const { t, lang } = useI18n();
  const { entries, reload } = useLibrary();
  const notify = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [isRestoring, setRestoring] = useState(false);
  const isLibraryEmpty = entries.length === 0;

  async function restore(file: File) {
    setRestoring(true);
    try {
      const content: unknown = JSON.parse(await file.text());
      const { entryCount } = await api.restore(content);
      await reload();
      notify(t('data.restored', { count: entryCount }));
      onDone();
    } catch (error) {
      const message = error instanceof SyntaxError ? t('data.invalidFile') : errorMessage(error);
      notify(message, { tone: 'error' });
    } finally {
      setRestoring(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <>
      <p>{t('data.intro')}</p>
      <div class="menu-list">
        <a class="btn" href="/api/export.json" download>
          <Icon name="download" />
          {t('data.exportJson')}
        </a>
        <a class="btn" href={`/api/export.csv?lang=${lang}`} download>
          <Icon name="download" />
          {t('data.exportCsv')}
        </a>
        <input
          ref={fileInput}
          id="restore-file"
          class="visually-hidden"
          type="file"
          accept="application/json,.json"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void restore(file);
          }}
        />
        <button
          type="button"
          class={`btn${isRestoring ? ' is-loading' : ''}`}
          disabled={!isLibraryEmpty || isRestoring}
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="upload" />
          {t('data.restore')}
        </button>
      </div>
      <p class="muted text-sm">
        {t(isLibraryEmpty ? 'data.restoreEmpty' : 'data.restoreBlocked')}
      </p>
    </>
  );
}
