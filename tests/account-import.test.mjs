import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import {
  combatantToMob,
  convertScene,
  macroToFoundry,
  readImportFile,
  resolveImages,
  sceneGeometry,
  wallToFoundry,
} from '../src/import/account-import.ts'

const map = '11111111-1111-4111-8111-111111111111'
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const pngUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`

const manifest = (extra = {}) => ({
  format: 'crawlspace-account',
  version: 1,
  exportedAt: '2026-11-07T12:00:00.000Z',
  imagesIncluded: true,
  account: { displayName: 'Carl', email: 'carl@example.com', createdAt: null },
  images: [{ id: map, file: `images/${map}.png`, contentType: 'image/png', byteSize: 8, kind: 'map' }],
  characters: [],
  homebrew: [],
  macros: { macros: [], slots: [] },
  parties: [],
  ...extra,
})

test('an account export is read from its zip or its JSON; anything else is a character', () => {
  const zip = zipSync({ 'crawlspace-export.json': strToU8(JSON.stringify(manifest())), [`images/${map}.png`]: png })
  const fromZip = readImportFile(zip)
  assert.equal(fromZip.kind, 'account')
  assert.equal(fromZip.bundle.manifest.account.displayName, 'Carl')
  assert.deepEqual(fromZip.bundle.files.get(`images/${map}.png`), png)
  const fromJson = readImportFile(strToU8(JSON.stringify({ ...manifest(), imagesIncluded: false })))
  assert.equal(fromJson.kind, 'account')
  assert.equal(fromJson.bundle.files.size, 0)
  assert.equal(readImportFile(strToU8(JSON.stringify({ character: { name: 'Carl' } }))).kind, 'character')
  assert.throws(() => readImportFile(strToU8(JSON.stringify({ ...manifest(), version: 2 }))), /version 2/)
})

test('a party backup zip from the app imports as an account export with one party', () => {
  const backup = {
    format: 'crawlspace-party',
    version: 2,
    exportedAt: '2026-11-07T12:00:00.000Z',
    party: { name: 'Royal Court', portrait: null },
    characters: [{ id: 4, name: 'Donut', data: { portrait: pngUrl } }],
    scenes: [{ id: 's1', name: 'Floor 1', is_active: true, gm_only: false, data: { mapAssetId: map } }],
    objects: [{ id: 'o1', scene_id: 's1', kind: 'token', layer: 'objects', asset_id: null, data: { image: `/api/parties/3/assets/${map}/image` } }],
    encounter: null,
    rolls: [],
    assets: [{ id: map, kind: 'map', filename: 'cave.png', content_type: 'image/png', byte_size: 8 }],
    local: {},
  }
  const read = readImportFile(zipSync({ 'party.json': strToU8(JSON.stringify(backup)), [`assets/${map}`]: png }))
  assert.equal(read.kind, 'account')
  const { manifest: account, files } = read.bundle
  assert.equal(account.parties.length, 1)
  assert.equal(account.parties[0].party.name, 'Royal Court')
  assert.equal(account.parties[0].objects[0].data.image, `crawlspace-image:${map}`)
  const portrait = account.parties[0].characters[0].data.portrait
  assert.match(portrait, /^crawlspace-image:[0-9a-f]{32}$/)
  const inline = account.images.find((image) => `crawlspace-image:${image.id}` === portrait)
  assert.equal(inline.contentType, 'image/png')
  assert.deepEqual(files.get(inline.file), png)
  assert.deepEqual(files.get(account.images.find((image) => image.id === map).file), png)
})

test('image references resolve to uploaded paths, and missing images fall back', () => {
  const value = { img: `crawlspace-image:${map}`, html: `<img src="crawlspace-image:${map}"><img src="crawlspace-image:${'f'.repeat(64)}">`, keep: 'icons/x.svg' }
  const resolved = resolveImages(value, (id) => (id === map ? 'worlds/w/crawlspace/map.png' : null), 'icons/svg/mystery-man.svg')
  assert.deepEqual(resolved, {
    img: 'worlds/w/crawlspace/map.png',
    html: '<img src="worlds/w/crawlspace/map.png"><img src="icons/svg/mystery-man.svg">',
    keep: 'icons/x.svg',
  })
})

test('scene geometry turns surface percentages into map pixels, including the border and grid offset', () => {
  const plain = sceneGeometry({ configuration: { sceneWidthPixels: 1000, sceneHeightPixels: 500, gridCellSize: 100, canvasPadding: 0 } })
  assert.deepEqual(plain.point(50, 50), { x: 500, y: 250 })
  assert.equal(plain.size, 100)
  assert.equal(plain.width, 1000)
  const bordered = sceneGeometry({ configuration: { sceneWidthPixels: 1000, sceneHeightPixels: 500, gridCellSize: 100, canvasPadding: 0.1 } })
  // Border is max(10% of the map, two cells) = 200 px each side; surface is 1400 × 900.
  assert.deepEqual(bordered.point(50, 50), { x: 500, y: 250 })
  assert.deepEqual(bordered.point(0, 0), { x: -200, y: -200 })
  // Foundry needs cells of at least 50 px: a 25 px grid doubles everything.
  const small = sceneGeometry({ configuration: { sceneWidthPixels: 1000, sceneHeightPixels: 500, gridCellSize: 25, canvasPadding: 0 } })
  assert.equal(small.size, 50)
  assert.equal(small.width, 2000)
  assert.deepEqual(small.point(50, 50), { x: 1000, y: 500 })
  // Grid lines 10 px in: everything (the map too) moves 10 px so they meet Foundry's grid.
  const offset = sceneGeometry({ gridOffsetX: 1, configuration: { sceneWidthPixels: 1000, sceneHeightPixels: 500, gridCellSize: 100, canvasPadding: 0 } })
  assert.deepEqual(offset.point(50, 50), { x: 490, y: 250 })
  assert.deepEqual(offset.backgroundOffset, { x: -10, y: 0 })
  const shifted = convertScene({ id: 's', name: 'S', is_active: false, gm_only: false, data: { gridOffsetX: 1, configuration: { sceneWidthPixels: 1000, sceneHeightPixels: 500, gridCellSize: 100, canvasPadding: 0, backgroundOffsetX: 4 } } }, [], { image: () => null, crawler: () => null, mob: () => null })
  assert.equal(shifted.scene.shiftX, -6)
})

test('walls keep their kind, door state and what they block', () => {
  const point = (x, y) => ({ x: x * 10, y: y * 10 })
  const wall = (type, extra = {}) => wallToFoundry({ id: 'w', x1: 0, y1: 0, x2: 10, y2: 5, type, doorState: 'closed', ...extra }, point)
  assert.deepEqual(wall('normal'), { c: [0, 0, 100, 50], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 })
  assert.deepEqual(wall('door', { doorState: 'locked' }), { c: [0, 0, 100, 50], move: 20, sight: 20, light: 20, sound: 20, door: 1, ds: 2 })
  assert.equal(wall('secretDoor', { doorState: 'open' }).door, 2)
  assert.equal(wall('secretDoor', { doorState: 'open' }).ds, 1)
  assert.deepEqual(wall('ethereal'), { c: [0, 0, 100, 50], move: 0, sight: 20, light: 20, sound: 0, door: 0, ds: 0 })
  assert.deepEqual(wall('invisible'), { c: [0, 0, 100, 50], move: 20, sight: 0, light: 0, sound: 0, door: 0, ds: 0 })
  assert.equal(wall('terrain').sight, 10)
  assert.equal(wall('window').sight, 0)
  assert.equal(wall('window').move, 20)
})

test('a scene converts with its map, grid, walls, lights, tiles, drawings, notes and tokens', () => {
  const tile = '22222222-2222-4222-8222-222222222222'
  const scene = {
    id: 's1',
    name: 'Floor 1',
    is_active: true,
    gm_only: true,
    data: {
      mapAssetId: map,
      configuration: {
        sceneWidthPixels: 1000,
        sceneHeightPixels: 500,
        gridCellSize: 100,
        canvasPadding: 0,
        gridDistance: 5,
        gridUnits: 'ft',
        gridType: 'square',
        gridColor: '#112233',
        gridOpacity: 0.4,
        backgroundColor: '#101010',
        tokenVision: true,
        fogExploration: false,
        darkness: 0.5,
        globalIllumination: true,
        showInNavigation: false,
        navigationName: 'F1',
        initialView: { x: 50, y: 50, zoom: 1.5 },
      },
      walls: [{ id: 'w1', x1: 0, y1: 0, x2: 10, y2: 0, type: 'door', doorState: 'open' }],
      lights: [
        {
          id: 'l1',
          x: 10,
          y: 20,
          rotation: 0,
          lightAngle: 90,
          light: { enabled: true, brightFeet: 10, dimFeet: 20, color: '#ff8800', opacity: 0.5 },
          animation: { type: 'Torch', speed: 5, intensity: 5, reverse: false },
          advanced: { providesVision: true, coloration: 'Adaptive Luminance', luminosity: 0.5, attenuation: 0.5, saturation: 0, contrast: 0, shadows: 0 },
          constrainedByWalls: true,
          darknessMin: 0,
          darknessMax: 1,
        },
      ],
    },
  }
  const objects = [
    { id: 't1', scene_id: 's1', kind: 'drawing', layer: 'tiles', data: { textureAssetId: tile, x: 10, y: 10, width: 20, height: 20, rotation: 0, opacity: 0.5, hidden: false, locked: true, sort: 2 } },
    {
      id: 'd1',
      scene_id: 's1',
      kind: 'drawing',
      layer: 'drawings',
      data: { type: 'line', x: 10, y: 10, width: 10, height: 10, rotation: 0, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], strokeWidth: 4, strokeColor: '#ff0000', strokeOpacity: 1, fillType: 'none', fillColor: '#000000', fillOpacity: 0, text: '', fontSize: 24, textColor: '#ffffff', textOpacity: 1, hidden: false, locked: false },
    },
    { id: 'j1', scene_id: 's1', kind: 'drawing', layer: 'journals', data: { x: 50, y: 50, hidden: false, hoverText: 'Hi', entry: { id: 'e1', name: 'Clue', pages: [{ id: 'p', name: 'Page', html: '<p>Look</p>', text: 'Look' }] } } },
    { id: 'k1', scene_id: 's1', kind: 'token', layer: 'objects', data: { characterId: 4, label: 'Donut', x: 50, y: 50, width: 1, height: 1, image: null, visionRangeFeet: 30 } },
    {
      id: 'k2',
      scene_id: 's1',
      kind: 'token',
      layer: 'objects',
      data: { label: 'Goblin', x: 25, y: 50, width: 2, height: 2, disposition: 'Hostile NPCs', hidden: true, image: `crawlspace-image:${tile}`, combatant: { id: 'c', name: 'Goblin', evade: 12, kind: 'mob' } },
    },
  ]
  const result = convertScene(scene, objects, {
    image: (id) => (id === map ? 'up/map.png' : id === tile ? 'up/tile.png' : null),
    crawler: (id) => (id === 4 ? { actorId: 'actorDonut' } : null),
    mob: (token) => ({ actorId: `mob-${token.label}` }),
  })
  assert.equal(result.scene.name, 'Floor 1')
  assert.equal(result.scene.navigation, false)
  assert.equal(result.scene.navName, 'F1')
  assert.equal(result.scene.width, 1000)
  assert.equal(result.scene.height, 500)
  assert.equal(result.scene.levels[0].background.src, 'up/map.png')
  assert.equal(result.scene.levels[0].background.color, '#101010')
  assert.equal(result.scene.shiftX, 0)
  assert.deepEqual(result.scene.grid, { type: 1, size: 100, distance: 5, units: 'ft', color: '#112233', alpha: 0.4 })
  assert.equal(result.scene.tokenVision, true)
  assert.equal(result.scene.fog.exploration, false)
  assert.equal(result.scene.environment.darknessLevel, 0.5)
  assert.equal(result.scene.environment.globalLight.enabled, true)
  assert.deepEqual(result.scene.initial, { x: 500, y: 250, scale: 1.5 })
  assert.deepEqual(result.walls, [{ c: [0, 0, 100, 0], move: 20, sight: 20, light: 20, sound: 20, door: 1, ds: 1 }])
  assert.equal(result.lights[0].x, 100)
  assert.equal(result.lights[0].y, 100)
  assert.equal(result.lights[0].config.bright, 10)
  assert.equal(result.lights[0].config.dim, 20)
  assert.equal(result.lights[0].config.angle, 90)
  assert.equal(result.lights[0].config.animation.type, 'torch')
  assert.equal(result.lights[0].config.coloration, 1)
  assert.deepEqual(result.tiles, [{ texture: { src: 'up/tile.png' }, x: 100, y: 50, width: 200, height: 100, rotation: 0, alpha: 0.5, hidden: false, locked: true, sort: 2 }])
  assert.equal(result.drawings[0].x, 100)
  assert.deepEqual(result.drawings[0].shape.points, [0, 0, 100, 50])
  assert.equal(result.drawings[0].strokeColor, '#ff0000')
  assert.equal(result.notes[0].x, 500)
  assert.equal(result.notes[0].text, 'Hi')
  assert.equal(result.notes[0].journal.name, 'Clue')
  assert.equal(result.notes[0].journal.pages[0].text.content, '<p>Look</p>')
  const [donut, goblin] = result.tokens
  assert.equal(donut.actorId, 'actorDonut')
  assert.equal(donut.actorLink, true)
  assert.equal(donut.x, 450)
  assert.equal(donut.y, 200)
  assert.equal(donut.sight.enabled, true)
  assert.equal(donut.sight.range, 30)
  assert.equal(donut.disposition, 1)
  assert.equal(goblin.actorId, 'mob-Goblin')
  assert.equal(goblin.actorLink, false)
  assert.equal(goblin.x, 150)
  assert.equal(goblin.width, 2)
  assert.equal(goblin.hidden, true)
  assert.equal(goblin.disposition, -1)
  assert.equal(goblin.texture.src, 'up/tile.png')
})

test('a moved or rotated map becomes a tile so it keeps its place', () => {
  const result = convertScene(
    { id: 's', name: 'S', is_active: false, gm_only: false, data: { mapAssetId: map, mapTransform: { x: 10, y: 0, width: 50, height: 100, rotation: 15, opacity: 0.8 }, configuration: { sceneWidthPixels: 1000, sceneHeightPixels: 500, gridCellSize: 100, canvasPadding: 0 } } },
    [],
    { image: () => 'up/map.png', crawler: () => null, mob: () => null },
  )
  assert.equal(result.scene.levels[0].background.src, null)
  assert.deepEqual(result.tiles[0], { texture: { src: 'up/map.png' }, x: 100, y: 0, width: 500, height: 500, rotation: 15, alpha: 0.8, hidden: false, locked: true, sort: -1 })
})

test('a token-only mob becomes a mob actor; macros become Foundry macros', () => {
  const mob = combatantToMob({ name: 'Goblin', evade: 12, kind: 'mob', health: 9, flavor: 'Smelly', attacks: [{ name: 'Stab', difficulty: 10, damage: { formula: '1d6' } }] }, 'up/goblin.png')
  assert.equal(mob.type, 'mob')
  assert.equal(mob.name, 'Goblin')
  assert.equal(mob.img, 'up/goblin.png')
  assert.equal(mob.system.evade.published, '12')
  assert.equal(mob.system.attacks[0].name, 'Stab')
  assert.equal(mob.system.attacks[0].damage, '1d6')
  assert.equal(mob.system.description, '<p>Smelly</p>')
  assert.deepEqual(macroToFoundry({ id: 'm', name: 'Hit', formula: '1d20+3', text: 'Swing!', type: 'chat' }), { name: 'Hit', type: 'chat', command: 'Swing!\n/r 1d20+3' })
  const script = macroToFoundry({ id: 'm', name: 'Run', formula: '', text: 'crawl.doThing()', type: 'script' })
  assert.equal(script.type, 'script')
  assert.match(script.command, /^\/\* Imported from CrawlSpace/)
  assert.match(script.command, /\/\/ crawl\.doThing\(\)/)
})

import { portraitPath } from '../src/import/convert.ts'

test('a crawler portrait can be an imported world image, but not an app link or an unresolved reference', () => {
  assert.equal(portraitPath('worlds/w/crawlspace-import/a.png'), 'worlds/w/crawlspace-import/a.png')
  assert.equal(portraitPath('https://example.com/a.png'), 'https://example.com/a.png')
  assert.equal(portraitPath('/api/characters/4/portrait/abc'), 'icons/svg/mystery-man.svg')
  assert.equal(portraitPath('crawlspace-image:abc'), 'icons/svg/mystery-man.svg')
  assert.equal(portraitPath(''), 'icons/svg/mystery-man.svg')
})
