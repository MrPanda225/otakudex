import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api.ts';
import { useI18n } from '../i18n/index.tsx';
import { buildColumns, wallGeometryFor } from '../lib/backdrop.ts';
import { useMediaQuery } from '../lib/hooks.ts';

const RESIZE_DELAY_MS = 150;

// The covers are asked for once per page load: moving between the sign-in screens must not ask again.
let pendingImages: Promise<string[]> | null = null;

function loadBackdropImages(): Promise<string[]> {
  pendingImages ??= api
    .backdrop()
    .then((answer) => answer.images)
    .catch(() => {
      pendingImages = null; // try again the next time the backdrop is shown
      return [];
    });
  return pendingImages;
}

/** True when the person asked their browser to spare data: the covers are then left out, the placeholders stay. */
function wantsToSaveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

function useCovers(isEnabled: boolean): string[] {
  const [covers, setCovers] = useState<string[]>([]);
  useEffect(() => {
    if (!isEnabled || wantsToSaveData()) return;
    let isStale = false;
    void loadBackdropImages().then((images) => {
      if (!isStale) setCovers(images);
    });
    return () => {
      isStale = true;
    };
  }, [isEnabled]);
  return covers;
}

function readViewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** The size of the window, updated a moment after the last resize rather than on every pixel of it. */
function useViewport() {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setViewport(readViewport()), RESIZE_DELAY_MS);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return viewport;
}

interface BackdropState {
  hasCovers: boolean;
}

const BackdropContext = createContext<BackdropState | null>(null);

/**
 * A slow wall of covers behind the sign-in screens. Purely decorative: hidden from assistive technology,
 * never focusable, never clickable. The covers come from the anime that are popular right now (never from a
 * library, the screen is public); until they arrive, or without them, hatched placeholder tiles carry the look.
 * Only `transform` and `opacity` move. It keeps moving (the owner's choice, docs/06 section 5.4: no pause button),
 * except when the system asks for less motion, which is always honoured.
 *
 * It wraps the screens so that going from one to the next does not restart the wall; with `isEnabled` false
 * (loading, or inside the application) it draws nothing and asks for nothing.
 */
export function BackdropProvider({ isEnabled, children }: { isEnabled: boolean; children: ComponentChildren }) {
  const covers = useCovers(isEnabled);
  const viewport = useViewport();
  const canMove = !useMediaQuery('(prefers-reduced-motion: reduce)');

  const { tileWidth, columns, tilesPerColumn } = wallGeometryFor(viewport.width, viewport.height, covers.length);
  const wall = useMemo(() => buildColumns(covers, columns, tilesPerColumn), [covers, columns, tilesPerColumn]);

  const state = useMemo<BackdropState>(() => ({ hasCovers: covers.length > 0 }), [covers.length]);

  return (
    <BackdropContext.Provider value={isEnabled ? state : null}>
      {isEnabled ? (
        <div class="backdrop" aria-hidden="true" data-motion={canMove} style={{ '--tile-width': `${tileWidth}px` }}>
          <div class="backdrop-wall">
            {wall.map((tiles, column) => (
              <div key={column} class="backdrop-column">
                <div class="backdrop-track">
                  {/* The column is shown twice, and slides by one copy: the loop has no seam. */}
                  {[...tiles, ...tiles].map((tile, row) => (
                    <div key={row} class="backdrop-tile">
                      <span class="backdrop-letter">{tile.letter}</span>
                      {tile.src ? (
                        <img
                          src={tile.src}
                          alt=""
                          width={110}
                          height={156}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          {...({ fetchpriority: 'low' } as object)}
                          onLoad={(event) => event.currentTarget.classList.add('is-loaded')}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {children}
    </BackdropContext.Provider>
  );
}

/**
 * The credit for the covers, under the sign-in card. Part of the page flow (not pinned to a corner), so it never
 * covers the form on a small screen. Shown only when real covers are.
 */
export function BackdropCredit() {
  const state = useContext(BackdropContext);
  const { t } = useI18n();
  if (state === null || !state.hasCovers) return null;
  return (
    <div class="backdrop-controls">
      <p class="backdrop-credit">{t('backdrop.credit')}</p>
    </div>
  );
}
