/**
 * Crash reporting.
 *
 * The game ships to players we never hear from. Before this module, a throw
 * inside the frame loop killed the run and left nothing behind — the only
 * record was the player's memory of "it froze".
 *
 * Design constraints:
 *  - Must never throw itself. A broken reporter is worse than none.
 *  - Must work with no backend at all: records live in localStorage, which is
 *    enough for a player to send a support message that actually helps.
 *  - Optional remote: set VITE_ERROR_ENDPOINT and batches POST there. Unset it
 *    and nothing leaves the machine.
 *  - Deduplicated and capped, because a throw inside a rAF loop fires 60x/s.
 */

export type ErrorRecord = {
  id: string;
  at: number;
  message: string;
  stack: string;
  kind: 'error' | 'rejection' | 'manual';
  count: number;
  ctx: Record<string, unknown>;
};

const STORE_KEY = 'sd_errors_v1';
const MAX_RECORDS = 25;
const MAX_REMOTE = 10;

let sentRemote = 0;
let bootCtx: () => Record<string, unknown> = () => ({});

/** game.ts owns the run state; it hands us a snapshot getter at boot. */
export function setErrorContext(fn: () => Record<string, unknown>): void {
  bootCtx = fn;
}

function read(): ErrorRecord[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? (JSON.parse(raw) as ErrorRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: ErrorRecord[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-MAX_RECORDS)));
  } catch {
    /* quota or private mode — dropping the log is acceptable, crashing is not */
  }
}

function context(): Record<string, unknown> {
  let extra: Record<string, unknown> = {};
  try {
    extra = bootCtx() || {};
  } catch {
    extra = { ctxError: 'context getter threw' };
  }
  return {
    ...extra,
    url: location.href,
    viewport: `${innerWidth}x${innerHeight}`,
    dpr: window.devicePixelRatio,
    ua: navigator.userAgent,
    at: new Date().toISOString(),
  };
}

function fingerprint(message: string, stack: string, kind: string): string {
  // first stack frame past the reporter, so "same crash" means "same place"
  const frame = stack
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.includes('telemetry') && !l.startsWith('at ' + 'Error'));
  return `${kind}:${message}:${frame || ''}`.slice(0, 220);
}

export function reportError(err: unknown, kind: ErrorRecord['kind'] = 'manual'): ErrorRecord | null {
  try {
    const e = err as { message?: string; stack?: string } | null;
    const message = String((e && e.message) || err || 'unknown error').slice(0, 500);
    const stack = String((e && e.stack) || '').slice(0, 4000);
    const id = fingerprint(message, stack, kind);
    const list = read();
    const existing = list.find((r) => r.id === id);

    if (existing) {
      existing.count += 1;
      existing.at = Date.now();
      write(list);
      return existing;
    }

    const rec: ErrorRecord = { id, at: Date.now(), message, stack, kind, count: 1, ctx: context() };
    list.push(rec);
    write(list);
    void sendRemote(rec);
    return rec;
  } catch {
    return null;
  }
}

async function sendRemote(rec: ErrorRecord): Promise<void> {
  if (sentRemote >= MAX_REMOTE) return;
  const endpoint = (import.meta.env.VITE_ERROR_ENDPOINT as string | undefined) || '';
  if (!endpoint) return; /* no backend configured — stay local */
  sentRemote += 1;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: 'sastra-dungeon', ...rec }),
      keepalive: true,
    });
  } catch {
    /* offline, CORS, dead endpoint: the local record still stands */
  }
}

export function readErrors(): ErrorRecord[] {
  return read();
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

/** Boot: install global handlers once. Safe to import for side effects. */
function install(): void {
  window.addEventListener('error', (ev) => {
    // resource load failures (img/script) carry no error object; ignore them
    if (ev.error) reportError(ev.error, 'error');
    else if (ev.message) reportError({ message: ev.message, stack: '' }, 'error');
  });
  window.addEventListener('unhandledrejection', (ev) => {
    reportError(ev.reason, 'rejection');
  });
}

install();
