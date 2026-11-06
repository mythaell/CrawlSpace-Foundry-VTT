import type { EffectProperty } from './contentModels'

const words = (text: string) => text.split(/\s+/).filter(Boolean)
/** Each general word pool contains at least 100 distinct, single-word choices. */
export const nameWords = {
  adjectives: words(
    `Slippery Psychotic Disappointed Overpaid Constipated Unlicensed Screaming Moist Petty Litigious Hysterical Uninsured Flatulent Overcaffeinated Suspicious Delusional Vindictive Doomed Ferocious Embarrassed Glittering Shameless Deranged Incontinent Sassy Bankrupt Discount Furious Unwashed Improbable Flamboyant Grumpy Naked Murderous Inconvenient Rusty Cranky Snarky Crooked Greedy Sticky Smug Irate Irritable Obnoxious Audacious Bitter Reckless Frantic Wobbly Wonky Squishy Rancid Salty Toasty Soggy Crispy Prickly Twitchy Filthy Rowdy Sneaky Shifty Dodgy Spiteful Scrappy Unhinged Unruly Unstable Unhelpful Unwelcome Unwanted Unpaid Ungrateful Unrepentant Unreasonable Undignified Unimpressed Unprepared Unsupervised Questionable Dubious Doubtful Perverse Ridiculous Ludicrous Absurd Bizarre Peculiar Strange Odd Eccentric Chaotic Hazardous Volatile Explosive Menacing Sinister Vicious Brutal Savage Ruthless Relentless Gruesome Grotesque Hideous Monstrous Terrible Awful Miserable Wretched Pathetic Pitiful Pompous Pretentious Arrogant Haughty Insolent Brazen Boisterous Belligerent Cantankerous Crabby Grouchy Surly Sullen Morose Gloomy Cheerless Joyless Restless Sleepy Drowsy Bleary Groggy Dizzy Frazzled Exhausted`,
  ),
  creators: words(
    `Accountant Bopca Bugaboo Turkey Goblin Kobold Rayzer Sapper Influencer Necromancer Plumber Mechanic Dentist Landlord Janitor Boss Crawler Clown Warlock Perv Cultist Minion Princess Pigeon Wombat Intern Auditor Inspector Adjuster Banker Broker Bailiff Lawyer Judge Sheriff Warden Guard Soldier Captain Commander General Admiral Pirate Sailor Navigator Pilot Driver Racer Courier Messenger Postman Porter Hauler Loader Miner Digger Farmer Gardener Rancher Shepherd Fisher Hunter Trapper Tracker Poacher Butcher Baker Cook Chef Brewer Bartender Waiter Busboy Dishwasher Cleaner Sweeper Scavenger Salvager Tinkerer Smith Welder Carpenter Mason Roofer Painter Sculptor Potter Weaver Tailor Cobbler Tanner Jeweler Watchmaker Locksmith Engineer Technician Electrician Programmer Hacker Operator Analyst Clerk Secretary Manager Director Executive Consultant Salesman Marketer Advertiser Publicist Editor Writer Poet Bard Singer Drummer Dancer Actor Acrobat Juggler Magician Comedian Mime Wrestler Boxer Gladiator Mercenary Assassin Bandit Thief Burglar Smuggler Saboteur Alchemist Herbalist Apothecary Healer Medic Surgeon Nurse Librarian Scholar Professor Teacher Tutor Student Dropout Gambler Grifter Hustler Charlatan Fraudster Sycophant Troll Ogre Imp Gremlin Rat Raccoon Possum Ferret Stoat Badger Otter Goose Duck Chicken Lizard Toad Beetle Roach`,
  ),
  divine: words(
    `Divine Holy Sacred Blessed Sanctified Hallowed Consecrated Anointed Devout Reverent Worshipful Prayerful Pious Godly Heavenly Celestial Angelic Seraphic Cherubic Archangelic Saintly Prophetic Oracular Miraculous Transcendent Immortal Eternal Omnipotent Omniscient Omnipresent Pantheonic Theistic Deific Divineborn Godbound Godmarked Godsworn Godchosen Godfavored Godkissed Godtouched Godblessed Godwrought Godforged Godgifted Godlinked Godcalled Godsent Godkept Godguarded Godguided Godwatched Godward Godseal Godsign Godsigil Godrune Godlight Godflame Godspark Godvoice Godwhisper Godsong Godchant Godprayer Godvow Godpact Godoath Godtoken Godcharm Godrelic Godidol Godicon Godaltar Godshrine Godtemple Godchapel Godsanctum Godhaven Godrefuge Godmercy Godgrace Godhope Godtruth Godwill Godlaw Godjudgment Godwrath Godvengeance Godfury Godmight Godpower Godstrength Godshield Godarmor Godblade Godhammer Godspear Godarrow Godbow Godstaff Godwand Godcrown Godmantle Godcloak Godring Godheart Godsoul Godspirit Godbreath Godblood Godtear Godeye Godhand Godfinger Godfoot Godstep Godpath Godroad Godgate Goddoor Godkey Godtreasure Godtribute Godoffering Godtithe Godfavor Godfortune Godpromise Godanswer Godsilence Godmystery Godsecret`,
  ),
  verbs: words(
    `Bowel-twisting Loot-hoarding Face-melting Elbow-walking Boss-baiting Pant-stealing Pet-pampering Coin-swallowing Bone-rattling Skill-stealing Spell-slinging Floor-scraping Skull-cracking Kneecap-kicking Gut-punching Nose-breaking Toe-stubbing Rib-crushing Jaw-smashing Spine-snapping Heart-stopping Eye-poking Ear-boxing Hair-pulling Finger-biting Ankle-chewing Throat-grabbing Face-slapping Neck-wringing Skin-peeling Flesh-searing Blood-spilling Brain-scrambling Nerve-shredding Spleen-bursting Liver-bruising Kidney-kicking Lung-popping Soul-crushing Spirit-breaking Dream-shattering Hope-dashing Joy-stealing Smile-wiping Pride-swallowing Ego-deflating Dignity-robbing Shame-spreading Fear-feeding Panic-inducing Rage-stoking Trouble-brewing Chaos-sowing Havoc-wreaking Mayhem-making Disaster-courting Doom-bringing Death-dealing Life-draining Mana-sapping Energy-leeching Power-snatching Luck-robbing Fate-bending Rule-breaking Law-flouting Order-upending Authority-mocking Boss-taunting Guard-dodging Trap-springing Door-kicking Lock-picking Wall-climbing Roof-running Tunnel-crawling Mud-wallowing Dust-eating Gravel-chewing Rock-throwing Stone-skipping Fire-starting Flame-fanning Ice-cracking Frost-biting Thunder-stealing Lightning-catching Storm-chasing Rain-dancing Wind-riding Shadow-hugging Light-bending Noise-making Silence-breaking Secret-spilling Gossip-spreading Rumor-starting Lie-telling Truth-twisting Coin-counting Gold-grabbing Pocket-picking Purse-cutting Tax-dodging Debt-ducking Rent-skipping Bill-burning Receipt-shredding Form-filing Stamp-licking Paper-shuffling Desk-flipping Chair-smashing Table-turning Plate-spinning Cup-stacking Spoon-bending Fork-stabbing Biscuit-stealing Cake-smuggling Cheese-hoarding Sausage-swinging Noodle-whipping Gravy-guzzling Soup-slurping Bread-bashing Pickle-punching Onion-peeling Potato-pelting`,
  ),
  absurd: words(
    `Overtime Diarrhea Incompetence Suffering Embarrassment Paperwork Refunds Bureaucracy Bankruptcy Insolvency Foreclosure Eviction Audits Taxes Receipts Invoices Ledgers Spreadsheets Meetings Minutes Memos Emails Footnotes Appendices Disclaimers Waivers Loopholes Technicalities Formalities Complaints Grievances Lawsuits Litigation Arbitration Mediation Probation Parole Detention Suspension Demotion Termination Rejection Resignation Retirement Redundancy Downsizing Outsourcing Rebranding Synergy Metrics Quotas Deadlines Deliverables Milestones Benchmarks Budgets Forecasts Estimates Projections Depreciation Amortization Inflation Deflation Recession Austerity Subsidies Tariffs Sanctions Embargoes Shortages Surpluses Deficits Dividends Royalties Commissions Kickbacks Bribes Ransoms Extortion Blackmail Embezzlement Fraud Forgery Perjury Treason Sedition Sabotage Vandalism Larceny Burglary Robbery Pickpocketing Shoplifting Jaywalking Loitering Trespassing Littering Procrastination Laziness Indecision Regret Remorse Despair Dread Angst Ennui Boredom Monotony Tedium Drudgery Misery Discomfort Irritation Aggravation Frustration Exasperation Indignation Outrage Pettiness Spite Malice Jealousy Envy Greed Gluttony Vanity Hubris Arrogance Ignorance Oblivion Confusion Delusion Hallucination Paranoia Insomnia Hangovers Hiccups Sneezes Flatulence Constipation Heartburn Indigestion Nausea Queasiness Dizziness Clumsiness Awkwardness Sweat Stink Slime Muck Goo Gunk Crud Grime Mold Mildew Rust Dust Lint Crumbs Leftovers Biscuits Pickles Sausages Noodles Gravy`,
  ),
}

// Natural adjective/noun phrases, rather than glued-together invented words.
// Each ability family still offers 100 distinct epithets.
const family = (adjectives: string, nouns: string) =>
  words(adjectives).flatMap((adjective) => words(nouns).map((noun) => `${adjective} ${noun}`))
export const abilityWords = {
  speed: family(
    'Swift Fleet Quick Rapid Nimble Agile Hasty Brisk Speedy Tireless Unhindered Effortless Silent Sudden Blazing Reckless Endless Unfaltering Relentless Unstoppable',
    'Strides Pace Movement Footwork Escape',
  ),
  robust: family(
    'Stout Hardy Tough Rugged Robust Sturdy Steadfast Unyielding Unbreakable Iron Steel Stone Granite Oaken Enduring Resolute Unbending Tenacious Resilient Adamant',
    'Constitution Endurance Fortitude Resilience Vigor',
  ),
  strength: family(
    'Mighty Strong Powerful Potent Muscular Herculean Brawny Burly Crushing Forceful Titanic Colossal Primal Massive Thundering Pounding Hammering Smashing Wrecking Unrestrained',
    'Strength Might Force Power Grip',
  ),
  intellect: family(
    'Clever Cunning Brilliant Insightful Wise Shrewd Astute Lucid Keen Sharp Inventive Learned Scholarly Knowing Perceptive Discerning Rational Logical Calculating Tactical',
    'Mind Wit Thought Insight Reason',
  ),
  agility: family(
    'Deft Precise Graceful Balanced Dexterous Nimble Slippery Sleek Subtle Lithe Supple Acrobatic Elusive Dextrous Delicate Expert Steady Surefooted Fluid Elegant',
    'Finesse Balance Precision Reflexes Dexterity',
  ),
  charm: family(
    'Charming Suave Alluring Silver Golden Velvet Smooth Sweet Glib Persuasive Silvered Winning Beguiling Entrancing Enchanting Sly Wily Magnetic Radiant Captivating',
    'Speech Voice Charm Allure Persuasion',
  ),
  mana: family(
    'Arcane Mystic Magical Eldritch Occult Astral Runic Enchanted Boundless Deep Endless Overflowing Abundant Unspent Potent Concentrated Hidden Charged Stored Replenished',
    'Mana Energy Reserves Sorcery Power',
  ),
  defense: family(
    'Guarded Shielded Warded Armored Sheltered Reinforced Fortified Protected Impenetrable Unbroken Stalwart Unyielding Resilient Stout Unshaken Steadfast Solid Iron Steel Stone',
    'Protection Defense Warding Shelter Guard',
  ),
  healing: family(
    'Renewed Restored Recovered Revived Refreshed Replenished Rejuvenated Regenerated Vital Living Soothing Gentle Merciful Comforting Restorative Healing Mending Renewing Reassuring Enduring',
    'Renewal Recovery Restoration Vitality Life',
  ),
}
export type AbilityTheme = keyof typeof abilityWords
export const divinePhrases = family(
  'Divine Holy Sacred Blessed Sanctified Hallowed Consecrated Anointed Heavenly Celestial Angelic Saintly Prophetic Miraculous Eternal Revered Devout Immortal Prayerful Godly',
  'Favor Grace Covenant Judgment Providence',
)

const connectors = new Set(
  words(
    'of the a an with without for from by in on at to into onto under over through against between among within beyond upon after before around beside beneath behind near past across along during since until toward towards via as per',
  ),
)
export const nameWordCount = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter((word) => word && !connectors.has(word.toLowerCase())).length
export function limitLootName(name: string, limit = 5) {
  const result: string[] = []
  let count = 0
  for (const word of name.trim().split(/\s+/).filter(Boolean)) {
    if (!connectors.has(word.toLowerCase()) && ++count > limit) break
    result.push(word)
  }
  while (result.length && connectors.has(result[result.length - 1].toLowerCase())) result.pop()
  return result.join(' ')
}

export function effectNameThemes(effects: EffectProperty[]): AbilityTheme[] {
  const themes: AbilityTheme[] = []
  const add = (theme: AbilityTheme) => {
    if (!themes.includes(theme)) themes.push(theme)
  }
  for (const effect of effects) {
    if (effect.type === 'moveModifier' || effect.type === 'stepModifier') add('speed')
    else if (effect.type === 'statBonus' || effect.type === 'statBonusPercent')
      add(
        (
          { STR: 'strength', INT: 'intellect', CON: 'robust', DEX: 'agility', CHA: 'charm' } as Record<
            string,
            AbilityTheme
          >
        )[effect.target] ?? 'intellect',
      )
    else if (effect.type === 'manaBonus' || effect.type === 'spellRank') add('mana')
    else if (effect.type === 'healthBonus') add('robust')
    else if (effect.type === 'evadeModifier') add('agility')
    else if (effect.type === 'drModifier' || effect.type === 'damageResistance') add('defense')
  }
  return (['speed', 'robust', ...themes] as AbilityTheme[]).filter(
    (theme, i, all) => themes.includes(theme) && all.indexOf(theme) === i,
  )
}

export const abilityCreators: Record<AbilityTheme, string[]> = {
  speed: words('Courier Scout Runner Sprinter Messenger Navigator Ranger Acrobat'),
  robust: words('Veteran Survivor Guardian Warden Wrestler Sentinel Defender'),
  strength: words('Gladiator Soldier Blacksmith Brawler Giant Wrestler Butcher'),
  intellect: words('Scholar Sage Professor Tactician Inventor Alchemist Librarian'),
  agility: words('Acrobat Duelist Dancer Thief Juggler Archer Assassin'),
  charm: words('Bard Diplomat Orator Singer Actor Envoy Charlatan'),
  mana: words('Wizard Witch Warlock Mage Sorcerer Conjurer Enchanter'),
  defense: words('Guardian Sentinel Warden Defender Soldier Knight Armorer'),
  healing: words('Healer Medic Physician Apothecary Herbalist Surgeon'),
}
export function effectNameWords(effects: EffectProperty[]): string[][] {
  return effectNameThemes(effects).map((theme) => abilityWords[theme])
}
