/**
 * The order of the Attacks, Actions and Interrupt Actions tables, saved as a list of row ids. Rows not in the
 * list (new ones, or ones the sheet adds itself) keep their own order after the saved ones.
 */
export function orderRows<T extends { id: string }>(rows: T[], order: string[] | undefined): T[] {
  const rank = new Map((order ?? []).map((id, index) => [id, index]))
  const big = rank.size
  return rows
    .map((row, index) => ({ row, key: rank.get(row.id) ?? big + index }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.row)
}

/** Move `id` to where `targetId` is (the target and the rows after it shift down, or up when moving down). */
export function moveInOrder(ids: string[], id: string, targetId: string): string[] {
  const from = ids.indexOf(id)
  const to = ids.indexOf(targetId)
  if (from < 0 || to < 0 || from === to) return [...ids]
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}
