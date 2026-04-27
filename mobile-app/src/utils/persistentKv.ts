import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

let writeChain: Promise<void> = Promise.resolve();

function getFilePath(): string {
  const base = documentDirectory;
  if (!base) {
    throw new Error('persistentKv: documentDirectory unavailable');
  }
  return `${base}vibedrive_kv.json`;
}

async function readAll(): Promise<Record<string, string>> {
  try {
    const path = getFilePath();
    const info = await getInfoAsync(path);
    if (!info.exists) {
      return {};
    }
    const raw = await readAsStringAsync(path);
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'string') {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, string>): Promise<void> {
  await writeAsStringAsync(getFilePath(), JSON.stringify(data));
}

function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function kvGet(key: string): Promise<string | null> {
  const all = await readAll();
  const v = all[key];
  return v === undefined ? null : v;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await runSerialized(async () => {
    const all = await readAll();
    all[key] = value;
    await writeAll(all);
  });
}

export async function kvRemove(key: string): Promise<void> {
  await runSerialized(async () => {
    const all = await readAll();
    delete all[key];
    await writeAll(all);
  });
}
