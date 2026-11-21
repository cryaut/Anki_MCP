import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadAnkiApiKey(): Promise<string | undefined> {
  const configured = process.env.ANKI_CONNECT_API_KEY?.trim();
  if (configured) return configured;

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return undefined;
  try {
    const key = await readFile(join(localAppData, 'AnkiSatMcp', 'ankiconnect.key'), 'utf8');
    return key.trim() || undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error('The local AnkiConnect key could not be read.');
  }
}
