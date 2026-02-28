/**
 * Curated Skate Trick Dictionary
 *
 * Powers trick name autocomplete. Organized by category for future
 * stats like "most challenged trick: kickflip".
 */

export const TRICK_DICTIONARY = [
  // Flatground — Flip tricks
  "Kickflip",
  "Heelflip",
  "Varial Kickflip",
  "Varial Heelflip",
  "Hardflip",
  "Inward Heelflip",
  "360 Flip (Tre Flip)",
  "360 Heelflip",
  "Laser Flip",
  "Nightmare Flip",
  "Double Kickflip",
  "Double Heelflip",
  "Nollie Kickflip",
  "Nollie Heelflip",
  "Nollie Tre Flip",
  "Nollie Hardflip",
  "Nollie Inward Heelflip",
  "Nollie Laser Flip",
  "Fakie Kickflip",
  "Fakie Heelflip",
  "Fakie Tre Flip",
  "Fakie Hardflip",
  "Switch Kickflip",
  "Switch Heelflip",
  "Switch Tre Flip",
  "Switch Hardflip",
  "Switch Inward Heelflip",

  // Flatground — Shove-its
  "Pop Shove-it",
  "Frontside Pop Shove-it",
  "360 Shove-it",
  "Frontside 360 Shove-it",
  "Nollie Pop Shove-it",
  "Nollie Frontside Shove-it",
  "Fakie Pop Shove-it",
  "Switch Pop Shove-it",

  // Flatground — Ollies & Spins
  "Ollie",
  "Nollie",
  "Fakie Ollie",
  "Switch Ollie",
  "Frontside 180",
  "Backside 180",
  "Frontside 360",
  "Backside 360",
  "Nollie Frontside 180",
  "Nollie Backside 180",
  "Fakie Frontside 180",
  "Fakie Backside 180",
  "Switch Frontside 180",
  "Switch Backside 180",
  "Frontside Bigspin",
  "Backside Bigspin",
  "Nollie Frontside Bigspin",
  "Nollie Backside Bigspin",

  // Grinds & Slides
  "50-50 Grind",
  "5-0 Grind",
  "Nosegrind",
  "Crooked Grind",
  "Smith Grind",
  "Feeble Grind",
  "Boardslide",
  "Lipslide",
  "Noseslide",
  "Tailslide",
  "Bluntslide",
  "Nosebluntslide",
  "Salad Grind",
  "Suski Grind",
  "Willy Grind",
  "Hurricane Grind",
  "Overcrook",

  // Manual tricks
  "Manual",
  "Nose Manual",
  "One Foot Manual",
  "Kickflip Manual",
  "Heelflip Manual",
  "Kickflip to Manual",
  "Tre Flip Manual",

  // Grab tricks
  "Melon Grab",
  "Indy Grab",
  "Stalefish",
  "Method Grab",
  "Benihana",
  "Airwalk",

  // Old school / tech
  "No Comply",
  "Boneless",
  "Caveman",
  "Strawberry Milkshake",
  "Casper Flip",
  "Hospital Flip",
  "Gazelle Flip",
  "Dolphin Flip",
  "Dragon Flip",
  "Impossible",
  "Nollie Impossible",
  "Primo Flip",
  "Late Flip",
  "Late Kickflip",
  "Late Heelflip",
  "Pressure Flip",
  "Shuv Underflip",
] as const;

export type TrickName = (typeof TRICK_DICTIONARY)[number];

/**
 * Search tricks by prefix match (case-insensitive).
 * Returns up to `limit` results.
 */
export function searchTricks(query: string, limit = 8): string[] {
  if (!query.trim()) return [];
  const lower = query.toLowerCase();
  return TRICK_DICTIONARY.filter((t) => t.toLowerCase().includes(lower)).slice(0, limit);
}
