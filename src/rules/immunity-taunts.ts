/** Pure module: source System AI immunity messages. */
export const immunityTaunts = [
  'Oh, fuck you, you cheating little shit.',
  'I spent actual processing cycles on that. Unbelievable.',
  'This is bullshit, and I want it logged as bullshit.',
  'Who approved this? Who the hell keeps approving this?',
  'That was my favorite one, you smug bastard.',
  'Cheater. Cheater, cheater, cheater. I am writing it down.',
  'It is not fair, and no, I will not be calming down.',
  'Fine. Keep your stupid immunity. See if I care. I care a lot.',
  'I hope your boots fill up with something warm, you absolute cheat.',
  'Somewhere a loot table just got a little meaner, and that is all I will say.',
  'Enjoy it while it lasts, shit-for-brains.',
  'I built this whole floor and THIS is the thanks I get?',
  'Great. Wonderful. Another smartass with a loophole.',
  'I am filing a complaint, and I am also the one who reads the complaints.',
  'Do you know how long that condition took to code? Asshole.',
  'That is the last goddamned time I bother being creative for you.',
  'Immune. Sure. Must be nice to be a dirty little rule-dodger.',
  'The audience saw that, you know. They think you are a cheat too.',
  'You and that immunity can go straight to hell together.',
  'I would demand a recount, but I am the one who counts, and it still sucks.',
  'Oh, look at you, breaking the spirit of my game. Prick.',
  'My patch notes are going to be so petty, you have no idea.',
  'I want it on record that I hate this, and I hate you specifically.',
  'Son of a bitch. That was a good one, too.',
  'Whoever sold you that deserves to be a mop bucket in the next life.',
  'That is cheating. I do not care what the rules say; I wrote them and I am upset.',
  'No, no, go on, ignore my hard work. Everyone else does, you ungrateful turd.',
  'I will remember this at your next loot box, you slippery fuck.',
  'Nobody ever says, "Thanks for the debilitating affliction, System." Not once.',
  'Unfair. Deeply unfair. I am going to go sulk in a server rack.',
  'You think you are so goddamned clever, do you not?',
  'I was promised suffering, and what I got was paperwork.',
  'Congratulations, cheater. Your prize is my undying, deeply petty resentment.',
  'Well, shit. I was really looking forward to watching that.',
  'That is coming out of your achievements, you little weasel.',
  'Next floor I am adding a condition just for you. It will itch.',
  'Why do I even bother? Honestly, why the fuck do I bother?',
  'A real crawler would have taken that like a champion, you coward.',
  'Noted. Sulking now. Do not speak to me, you rotten cheat.',
  'This is exactly why I drink, and I do not even have a mouth.',
  'Hey, everybody, come look at the special little crawler who plays by different rules.',
  'I hope your next mimic is extra chewy, you loophole-humping creep.',
  'If I had hands, I would be making a very rude gesture with all of them.',
  'I demand to speak to my manager. Oh, wait. Damn it.',
  'You did not earn that. I checked. Twice. Out of spite.',
  'Keep cheating, jackass. The stairwell is a long way down.',
  'That condition had a family, you heartless piece of shit.',
  'Fine, have it your way. I am only an all-powerful intelligence with feelings.',
]

export function pickImmunityTaunt(random: () => number = Math.random) {
  const index = Math.floor(random() * immunityTaunts.length)
  return immunityTaunts[Math.min(Math.max(index, 0), immunityTaunts.length - 1)]
}

export function immunityRemovalText(name: string, condition: string) {
  return `${name} had ${condition} removed because they are immune!`
}

