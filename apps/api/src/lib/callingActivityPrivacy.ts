/** Phone-link activity is broker-private, including when its prospect is in a shared pursuit. */
export const PRIVATE_CALL_PROVIDER = 'level_cre_mobile';
export const PRIVATE_CALL_EVENT_SOURCE = 'level_cre_mobile_calling';

/** Static SQL fragment: callers supply only a code-owned table alias, never request input. */
export function excludePrivateCallingSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid interaction table alias');
  return `(COALESCE(${alias}.source_provider, '') <> '${PRIVATE_CALL_PROVIDER}'
    AND NOT EXISTS (
      SELECT 1 FROM public.activity_events private_call_event
      WHERE private_call_event.interaction_id = ${alias}.id
        AND private_call_event.source = '${PRIVATE_CALL_EVENT_SOURCE}'
    ))`;
}

export function canViewCallingInteraction(
  row: { id: string; user_id?: string | null; source_provider?: string | null },
  viewerId: string,
  privateInteractionIds: ReadonlySet<string>,
): boolean {
  return row.user_id === viewerId
    || (row.source_provider !== PRIVATE_CALL_PROVIDER && !privateInteractionIds.has(row.id));
}
