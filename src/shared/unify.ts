// Pure helpers for merging per-account results into unified views.
import type { CalEvent, MailSummary, Unified } from './types';

export async function gather<T>(
  accountIds: string[],
  load: (accountId: string) => Promise<T[]>
): Promise<Unified<T>> {
  const settled = await Promise.allSettled(accountIds.map((id) => load(id)));
  const items: T[] = [];
  const errors: Unified<T>['errors'] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value);
    else errors.push({ accountId: accountIds[i], message: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });
  return { items, errors };
}

export function sortMailNewestFirst(items: MailSummary[]): MailSummary[] {
  return [...items].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function sortEvents(items: CalEvent[]): CalEvent[] {
  return [...items].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title));
}

/** Stable key for a message across accounts (ids are only unique per account+folder). */
export const mailKey = (m: Pick<MailSummary, 'accountId' | 'folder' | 'id'>) => `${m.accountId}|${m.folder}|${m.id}`;
