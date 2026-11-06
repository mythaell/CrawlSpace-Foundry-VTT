export type ContentType =
  | 'background_childhood'
  | 'background_adolescence'
  | 'background_career'
  | 'background_hobby'
  | 'skill'
  | 'spell'
  | 'equipment_head'
  | 'equipment_torso'
  | 'equipment_arms'
  | 'equipment_hands'
  | 'equipment_legs'
  | 'equipment_feet'
  | 'equipment_accessory'
  | 'weapon'
  | 'consumable'
  | 'tattoo'
  | 'race'
  | 'class'
  | 'achievement'
  | 'loot_box'
  | 'mob'
  | 'npc'
  | 'quest'
  | 'trap'
  | 'neighborhood'
  | 'buff'
  | 'deity'
  | 'pet'
  | 'mount'
  | 'vehicle'
  | 'sponsor'
  | 'tunnel_show'
  | 'location'
  | 'content_pack'
  | 'reference_table'
  | 'other'

export type DatabaseContent = {
  id: number
  content_type: ContentType
  name: string
  data: Record<string, unknown>
  created_at?: string
  updated_at?: string
}
