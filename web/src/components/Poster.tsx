import { useState } from 'preact/hooks';
import { monogram, posterSrc } from '../lib/format.ts';

interface PosterProps {
  url: string | null;
  title: string;
}

/** The cover through the same-origin proxy, or a monogram when there is none (or it fails to load). */
export function Poster({ url, title }: PosterProps) {
  const [hasFailed, setFailed] = useState(false);
  const source = posterSrc(url);

  if (source === null || hasFailed) {
    return (
      // The letters are drawn by the CSS: a letter in the page text would join the visible label of a cover button (NFR-62).
      <div class="poster-fallback" aria-hidden="true" data-letters={monogram(title)} />
    );
  }
  // The title is always printed next to the cover, so the image itself is decorative.
  return <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
