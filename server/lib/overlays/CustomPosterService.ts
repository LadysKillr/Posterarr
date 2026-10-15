import logger from '@server/logger';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Affiches personnalisées — your own base posters, for titles TMDB can't
 * provide (fan edits with no TMDB id, a season without artwork…) or that you
 * simply want to replace. They take priority over every poster source, and the
 * overlays are drawn on them like on any other poster.
 *
 *   config/custom-posters/<Library>/<Title as in Plex>/poster.jpg
 *   config/custom-posters/<Library>/<Title as in Plex>/Saison 01.jpg   (or "Season 01", "S01")
 *
 * jpg, jpeg, png or webp. Replacing or removing a file is picked up on the next
 * overlay run. Folders are created automatically for the titles Posterarr
 * can't find a poster for, so you only have to drop the image in.
 */
const ROOT = path.join(process.cwd(), 'config', 'custom-posters');
const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

const README = `Affiches personnalisées
=======================

Déposez ici vos propres affiches : elles remplacent celles de TMDB / Plex et
les calques (langue, IMDb…) sont posés dessus.

  <Bibliothèque>/<Titre exact dans Plex>/poster.jpg        l'affiche du titre
  <Bibliothèque>/<Titre exact dans Plex>/Saison 01.jpg     une saison (ou "Season 01", "S01")

Formats : jpg, jpeg, png, webp. Un fichier ajouté, remplacé ou supprimé est pris
en compte au prochain passage des calques (chaque nuit, ou « Appliquer » dans
Posterarr). Les dossiers des titres sans affiche disponible sont créés
automatiquement.
`;

/** Folder/file-name safe version of a library or title name. */
export function safeName(name: string): string {
  return (
    String(name || '')
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .trim() || '_'
  );
}

export function customFolder(libraryName: string, title: string): string {
  return path.join(ROOT, safeName(libraryName), safeName(title));
}

/** Base names accepted for a title (no season) or a given season. */
export function candidateNames(seasonNumber?: number): string[] {
  if (seasonNumber === undefined) return ['poster'];
  const n = String(seasonNumber).padStart(2, '0');
  return [
    `Saison ${n}`,
    `Season ${n}`,
    `S${n}`,
    `Saison ${seasonNumber}`,
    `Season ${seasonNumber}`,
  ];
}

export interface CustomPoster {
  path: string;
  mtime: number;
}

/** The custom poster for a title (or one of its seasons), if one was dropped in. */
export async function findCustomPoster(
  libraryName: string,
  title: string,
  seasonNumber?: number
): Promise<CustomPoster | null> {
  const folder = customFolder(libraryName, title);
  let entries: string[];
  try {
    entries = await fs.readdir(folder);
  } catch {
    return null;
  }
  const byLower = new Map(entries.map((e) => [e.toLowerCase(), e]));
  for (const base of candidateNames(seasonNumber)) {
    for (const ext of EXTENSIONS) {
      const found = byLower.get(`${base}.${ext}`.toLowerCase());
      if (!found) continue;
      const file = path.join(folder, found);
      try {
        const st = await fs.stat(file);
        if (st.isFile() && st.size > 0)
          return { path: file, mtime: Math.floor(st.mtimeMs) };
      } catch {
        // vanished meanwhile
      }
    }
  }
  return null;
}

/** Whether a title has a custom folder (with or without images yet). */
export async function hasCustomFolder(
  libraryName: string,
  title: string
): Promise<boolean> {
  try {
    return (await fs.stat(customFolder(libraryName, title))).isDirectory();
  } catch {
    return false;
  }
}

/** Create the folder of a title Posterarr has no poster for, so the user just drops one in. */
export async function ensureCustomFolder(
  libraryName: string,
  title: string
): Promise<void> {
  try {
    await fs.mkdir(customFolder(libraryName, title), { recursive: true });
    await fs
      .writeFile(path.join(ROOT, 'LISEZ-MOI.txt'), README, { flag: 'wx' })
      .catch(() => undefined);
  } catch (error) {
    logger.warn('Could not create custom poster folder', {
      label: 'CustomPosters',
      libraryName,
      title,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
