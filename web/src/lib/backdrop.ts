/**
 * Geometry and content of the wall of covers behind the sign-in screens. Pure functions, so the layout rules
 * can be checked without a browser. The CSS uses the same tile width formula (see `--tile-width` in app.css).
 */

const MIN_TILE_WIDTH = 104;
const MAX_TILE_WIDTH = 180;
const TILE_WIDTH_RATIO = 0.085; // of the viewport width
const TILE_ASPECT = 3 / 2; // covers are 2:3
export const TILE_GAP = 16;
const WALL_TILT_MARGIN_RATIO = 0.2; // a wall turned by 8 degrees needs this much more room, relative to the width
const WALL_HEIGHT_RATIO = 1.08;
const MIN_COLUMNS = 4;
const MIN_TILES = 6;
const SEAM_START_TILES = 7;

/** Letters shown on the placeholder tiles, which keep the wall alive when no cover is available. */
const PLACEHOLDER_LETTERS = [...'OTAKUDEX'];

export interface BackdropTile {
  /** Shown on the hatched placeholder, which is also what stays when the cover is late or missing. */
  letter: string;
  /** Address of the cover, or null while there is none. */
  src: string | null;
}

export interface WallGeometry {
  tileWidth: number;
  columns: number;
  tilesPerColumn: number;
}

export function tileWidthFor(viewportWidth: number): number {
  return Math.min(MAX_TILE_WIDTH, Math.max(MIN_TILE_WIDTH, Math.round(viewportWidth * TILE_WIDTH_RATIO)));
}

/**
 * How many columns and tiles cover the screen once the wall is tilted: enough columns to fill the width,
 * and enough tiles for one copy of a column to be at least as tall as the wall (the track shows two copies
 * and slides by one, so a shorter copy would leave a gap at the bottom).
 */
export function wallGeometryFor(viewportWidth: number, viewportHeight: number, imageCount: number): WallGeometry {
  const tileWidth = tileWidthFor(viewportWidth);
  const wallWidth = viewportWidth * (1 + WALL_TILT_MARGIN_RATIO);
  const columns = Math.max(MIN_COLUMNS, Math.ceil(wallWidth / (tileWidth + TILE_GAP)) + 1);
  const wallHeight = viewportHeight * WALL_HEIGHT_RATIO + viewportWidth * WALL_TILT_MARGIN_RATIO;
  const tileHeight = tileWidth * TILE_ASPECT;
  const needed = Math.ceil(wallHeight / (tileHeight + TILE_GAP)) + 1;
  return { tileWidth, columns, tilesPerColumn: avoidSeamRepeat(Math.max(MIN_TILES, needed), imageCount) };
}

/**
 * The loop goes from the last row of a column straight back to its first. Consecutive rows hold consecutive
 * covers, so with `n` covers those two rows (`tiles - 1` covers apart) show the same one whenever
 * `tiles - 1` is a multiple of `n`: add a row until it is not.
 */
function avoidSeamRepeat(tiles: number, imageCount: number): number {
  let result = Math.max(tiles, SEAM_START_TILES);
  while (imageCount > 1 && (result - 1) % imageCount === 0) result += 1;
  return result;
}

/**
 * The tiles of every column. Covers are spread so that no cover sits next to the same one, to its left or
 * below it (a column starts `step` covers further than its neighbour). Without covers every tile is a
 * placeholder, which is also what shows first while the covers load.
 */
export function buildColumns(images: readonly string[], columns: number, tilesPerColumn: number): BackdropTile[][] {
  const count = images.length;
  const step = count === 0 ? 0 : spreadStep(count, columns);
  return Array.from({ length: columns }, (_, column) =>
    Array.from({ length: tilesPerColumn }, (_, row): BackdropTile => {
      const letter = PLACEHOLDER_LETTERS[(column * 3 + row) % PLACEHOLDER_LETTERS.length] ?? 'O';
      return { letter, src: count === 0 ? null : (images[(column * step + row) % count] ?? null) };
    }),
  );
}

/** How far apart two neighbouring columns start: about an even share of the covers, never a multiple of their number. */
function spreadStep(imageCount: number, columns: number): number {
  const base = Math.max(1, Math.ceil(imageCount / columns));
  return imageCount > 1 && base % imageCount === 0 ? base + 1 : base;
}
