/**
 * The identifiers every Foundry document has, shown on CrawlSpace sheets: its UUID (unique in the world),
 * the compendium entry it came from, and the CrawlSpace database row it was imported from.
 */
export function documentIds(document: any) {
  const source = document.system?.source
  const crawlspace = source?.id ? `${source.database || 'game'}:${source.id}` : (document.flags?.crawlspace?.sourceId ?? '')
  return [
    { label: 'CRAWLSPACE.Ids.Uuid', hint: 'CRAWLSPACE.Ids.UuidHint', value: document.uuid },
    { label: 'CRAWLSPACE.Ids.SourceId', hint: 'CRAWLSPACE.Ids.SourceIdHint', value: document._stats?.compendiumSource ?? '' },
    { label: 'CRAWLSPACE.Ids.CrawlSpace', hint: 'CRAWLSPACE.Ids.CrawlSpaceHint', value: String(crawlspace ?? '') },
  ]
}
