import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/** Plain-language explanations for players who are new to WoW's vocabulary */
export const glossary = {
  "item level": "A number showing how powerful a piece of gear is. Higher is stronger, and your overall item level is the average of everything you wear",
  "base item level": "The item level before upgrades. Harder difficulties and upgrades raise the real number",
  "mythic+": "Timed five-player dungeons that get harder as the keystone level rises",
  "mythic+ rating": "A score from your best timed Mythic+ dungeon runs this season",
  enchant: "A permanent bonus added to a gear slot, usually crafted by enchanters or bought from the Auction House",
  gem: "A stone placed in a socket on your gear for extra stats",
  socket: "An empty slot on an item that holds a gem",
  transmog: "Changes how your gear looks without changing its stats",
  appearance: "A look you can apply with transmog once you've collected it",
  "legal max": "The highest item level gear can reach this season, when that rule is known",
  target: "A personal item-level goal you set for planning",
  "raid": "Large group content (10 to 30 players) with bosses that drop strong gear",
  "dungeon": "Five-player group content; Mythic+ versions give the best rewards",
  "pvp rating": "A score from rated player-versus-player matches",
  "great vault": "A weekly chest. Each row unlocks a reward choice as you clear raid bosses, Mythic+ dungeons, or delves, and you pick one item after the weekly reset",
  "weekly reset": "The moment each week when raid lockouts, the Great Vault, and weekly quests start over",
  "daily reset": "The moment each day when daily quests and world quests refresh",
  lockout: "Bosses you've already defeated this week. They can't drop loot for you again until the weekly reset",
  delve: "Short solo or small-group adventures with tiers of difficulty; higher tiers give better Great Vault rewards",
  "wow token": "An item bought with real money that can be sold for gold, or bought with gold to add game time or Battle.net balance",
  "talent string": "A code that copies a whole talent setup. In game, open Talents, choose Import, and paste it",
  "diminishing returns": "Past certain percentages, each extra point of a secondary stat is worth less. The brackets show how much of the next point you keep",
  "secondary stats": "Critical strike, haste, mastery, and versatility. Each boosts damage or healing in a different way",
  "mythic+ score": "Raider.IO's score from your best timed Mythic+ runs, used to rank players",
} as const;
export type GlossaryTerm = keyof typeof glossary;

export function Term({ term, children }: { term: GlossaryTerm; children?: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="term" tabIndex={0} />}>{children ?? term}</TooltipTrigger>
      <TooltipContent className="term-tip">{glossary[term]}</TooltipContent>
    </Tooltip>
  );
}
