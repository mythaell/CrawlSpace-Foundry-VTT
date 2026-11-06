import type { LootCategory, LootObject, LootTier } from './lootData'
import {
  eligibleConsumables,
  generateLootEntry,
  type LootContext,
  type LootEntry,
  type LootFocus,
} from './lootGenerator'
import { consumableFamily, consumableFamilyWeights, type ConsumableFamily } from './lootPotions'
import { consumableSpellKind } from './lootSpells'

type ItemTypeGroup = { category: LootCategory; type: LootObject['type']; slot: string; names: string }
/** The generator's item types. Each group rolls properties from its Table 38 category's tables. */
const itemTypeGroups = {
  Headwear: {
    category: 'Clothing',
    type: 'equipment',
    slot: 'Head',
    names:
      'Cap|Beanie|Beret|Fedora|Top Hat|Wide-Brimmed Hat|Cowboy Hat|Hood|Cowl|Headscarf|Turban|Bandana|Headband|Crown|Tiara|Circlet|Skullcap|Bonnet|Veil|Face Mask|Earmuffs|Helmet|Great Helm|Visor|Gas Mask',
  },
  Torso: {
    category: 'Clothing',
    type: 'equipment',
    slot: 'Torso',
    names:
      'T-Shirt|Collared Shirt|Blouse|Tunic|Undershirt|Sweater|Cardigan|Vest|Doublet|Jerkin|Gambeson|Robe|Dress|Corset|Bodice|Jacket|Coat|Cloak|Poncho|Tabard|Surcoat|Breastplate|Cuirass|Tactical Vest|Exosuit Chestplate',
  },
  Legs: {
    category: 'Clothing',
    type: 'equipment',
    slot: 'Legs',
    names:
      'Trousers|Jeans|Chinos|Slacks|Leggings|Tights|Shorts|Cargo Pants|Sweatpants|Joggers|Skirt|Kilt|Breeches|Culottes|Hakama|Chaps|Loincloth|Sarong|Wrap Skirt|Harem Pants|Overtrousers|Greaves|Cuisses|Tassets|Exosuit Leg Armor',
  },
  Arms: {
    category: 'Clothing',
    type: 'equipment',
    slot: 'Arms',
    names:
      'Arm Warmers|Detachable Sleeves|Arm Wraps|Armbands|Brassards|Vambraces|Bracers|Pauldrons|Spaulders|Rerebraces|Couters|Archery Armguards|Compression Sleeves|Armored Sleeves|Exosuit Arm Modules',
  },
  Feet: {
    category: 'Clothing',
    type: 'equipment',
    slot: 'Feet',
    names:
      'Boots|Ankle Boots|Knee-High Boots|Combat Boots|Riding Boots|Work Boots|Hiking Boots|Sandals|Slippers|Sneakers|Dress Shoes|Moccasins|Clogs|Sabatons|Powered Boots',
  },
  Hands: {
    category: 'Clothing',
    type: 'equipment',
    slot: 'Hands',
    names:
      "Cloth Gloves|Leather Gloves|Fingerless Gloves|Mittens|Gauntlets|Armored Gauntlets|Hand Wraps|Handguards|Padded Gloves|Tactical Gloves|Climbing Gloves|Alchemist's Gloves|Insulated Gloves|Clawed Gloves|Exosuit Gloves",
  },
  Accessories: {
    category: 'Accessory',
    type: 'equipment',
    slot: 'Accessory',
    names:
      'Ring|Necklace|Amulet|Pendant|Earrings|Nose Piercing|Bracelet|Anklet|Brooch|Cufflinks|Belt|Sash|Scarf|Necktie|Bow Tie|Eyeglasses|Goggles|Eyepatch|Wristwatch|Belt Pouch|Holster|Bandolier|Quiver|Backpack|Badge',
  },
  'Melee Weapons': {
    category: 'Mundane / Weapon',
    type: 'weapon',
    slot: 'melee',
    names:
      'Dagger|Stiletto|Kukri|Shortsword|Arming Sword|Longsword|Greatsword|Rapier|Saber|Scimitar|Katana|Battle Axe|Greataxe|Hatchet|Mace|Morningstar|Warhammer|Maul|Spear|Pike|Halberd|Glaive|Trident|Quarterstaff|Flail',
  },
  'Ranged Weapons': {
    category: 'Mundane / Weapon',
    type: 'weapon',
    slot: 'ranged',
    names:
      'Shortbow|Longbow|Recurve Bow|Compound Bow|Hand Crossbow|Heavy Crossbow|Repeating Crossbow|Sling|Blowgun|Matchlock Musket|Flintlock Pistol|Blunderbuss|Percussion Revolver|Lever-Action Rifle|Bolt-Action Rifle|Semi-Automatic Pistol|Pump-Action Shotgun|Submachine Gun|Assault Rifle|Sniper Rifle|Light Machine Gun|Laser Pistol|Laser Rifle|Plasma Rifle|Railgun',
  },
} satisfies Record<string, ItemTypeGroup>
type GearKind = keyof typeof itemTypeGroups
const gearKinds = Object.keys(itemTypeGroups) as GearKind[]
/** The Table 38 category whose property tables a gear kind rolls on. */
export const gearCategory = (kind: GearKind): LootCategory => itemTypeGroups[kind].category
/** The objects a gear kind offers, in list order. */
export const gearObjects = (kind: GearKind): LootObject[] => {
  const group: ItemTypeGroup = itemTypeGroups[kind]
  return group.names.split('|').map((name) => ({ name, type: group.type, slot: group.slot, tags: '' }))
}

/** Item kinds the Homebrew generator offers: the gear types above, then consumables. */
export const lootItemKinds = [...gearKinds, 'Potion', 'Skill Potion', 'Scroll', 'Tome', 'Other Consumable'] as const
export type LootItemKind = (typeof lootItemKinds)[number]
export type LootItemRequest = {
  tier: LootTier
  kind: LootItemKind
  /** Empty for a random subtype. Gear: an item of that type; Potion: a family; Scroll/Tome: a Spell;
   * Skill Potion: the intended Skill; Other Consumable: a database consumable key. */
  subtype: string
}
export const potionSubtypes: { value: ConsumableFamily; label: string }[] = [
  { value: 'healing', label: 'Healing' },
  { value: 'mana', label: 'Mana' },
  { value: 'remedy', label: 'Antidote / Injury' },
]
export const isGearKind = (kind: LootItemKind): kind is GearKind => kind in itemTypeGroups

/** One item generated with the same rules as a loot box slot of that tier. It has no box
 * theme, so nothing biases its object, properties or consumable. */
export function generateLootItem(request: LootItemRequest, context: LootContext, rng = Math.random): LootEntry {
  const entry = rollLootItem(request, context, rng)
  const notes = entry.item.notes.replace(`${request.tier} Custom Box.`, `Generated ${request.tier} item.`)
  return { ...entry, item: { ...entry.item, notes } }
}
function rollLootItem(request: LootItemRequest, context: LootContext, rng: () => number): LootEntry {
  const { tier, kind, subtype } = request
  // Custom carries no theme words, so every choice is unweighted.
  const type = 'Custom' as const
  const base = {
    tier,
    type,
    mode: 'Random' as const,
    items: 1,
    consumables: 1,
    potions: 1,
    choices: [],
  }
  if (isGearKind(kind)) {
    const objects = gearObjects(kind)
    if (subtype && !objects.some((object) => object.name === subtype))
      throw new Error(`Choose an item from the ${kind} list.`)
    const focus: LootFocus = { category: itemTypeGroups[kind].category, object: subtype || undefined, objects }
    return generateLootEntry({ ...base, focus }, context, 'item', 0, rng)
  }
  if (kind === 'Skill Potion') {
    if (tier === 'Bronze') throw new Error('Skill potions start in Silver boxes.')
    return generateLootEntry({ ...base, focus: { target: subtype || undefined } }, context, 'potion', 0, rng)
  }
  if (kind === 'Other Consumable' && subtype)
    return generateLootEntry({ ...base, mode: 'Choose', consumableChoices: [subtype] }, context, 'consumable', 0, rng)
  const consumable: LootFocus['consumable'] =
    kind === 'Potion'
      ? (subtype as ConsumableFamily) || undefined
      : kind === 'Scroll'
        ? 'scroll'
        : kind === 'Tome'
          ? 'tome'
          : 'other'
  if (kind === 'Potion' && subtype && !potionSubtypes.some((entry) => entry.value === subtype))
    throw new Error('Choose a potion family.')
  const focus: LootFocus = {
    consumable,
    target: kind === 'Scroll' || kind === 'Tome' ? subtype || undefined : undefined,
  }
  // A random potion uses the box family weights among potion families this tier can hold.
  if (kind === 'Potion' && !subtype) {
    const pool = eligibleConsumables(context, tier).filter((content) => !consumableSpellKind(content))
    const families = potionSubtypes
      .map((entry) => entry.value)
      .filter((family) => pool.some((content) => consumableFamily(content) === family))
    if (!families.length) throw new Error('No database potion is allowed for this tier.')
    let roll = rng() * families.reduce((sum, family) => sum + consumableFamilyWeights[family], 0)
    const family = families.find((entry) => (roll -= consumableFamilyWeights[entry]) < 0) ?? families[0]
    return generateLootEntry({ ...base, focus: { consumable: family } }, context, 'consumable', 0, rng)
  }
  return generateLootEntry({ ...base, focus }, context, 'consumable', 0, rng)
}
