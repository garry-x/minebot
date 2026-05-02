export enum GoalType {
  GATHER_WOOD = "gather_wood",
  GATHER_STONE = "gather_stone",
  CRAFT_TOOLS = "craft_tools",
  GATHER_IRON = "gather_iron",
  GATHER_DIAMOND = "gather_diamond",
  GATHER_BLAZE = "gather_blaze",
  GATHER_ENDER_PEARL = "gather_ender_pearl",
  CRAFT_ENDER_EYE = "craft_ender_eye",
  FIND_STRONGHOLD = "find_stronghold",
  ACTIVATE_PORTAL = "activate_portal",
  ENTER_END = "enter_end",
  DEFEAT_DRAGON = "defeat_dragon",
  SURVIVE = "survive",
  IDLE = "idle",
}

export interface Goal {
  type: GoalType;
  priority: number;
  prerequisites: GoalType[];
  skill: string;
  complete: boolean;
}
