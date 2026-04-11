class GoalSystem {
  static resourceCategories = {
    wood: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'crimson_stem', 'warped_stem', 'oak_wood', 'birch_wood', 'spruce_wood', 'jungle_wood', 'acacia_wood', 'dark_oak_wood'],
    stone: ['cobblestone', 'stone', 'granite', 'diorite', 'andesite', 'deepslate', 'tuff', 'gravel'],
    coal: ['coal', 'coal_block', 'charcoal'],
    iron: ['iron_ore', 'raw_iron', 'iron_ingot', 'iron_block'],
    gold: ['gold_ore', 'raw_gold', 'gold_ingot', 'gold_block'],
    diamond: ['diamond_ore', 'diamond', 'diamond_block'],
    emerald: ['emerald_ore', 'emerald', 'emerald_block'],
    food: ['wheat', 'carrot', 'potato', 'beetroot', 'apple', 'bread', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'sweet_berries', 'honey'],
    dirt: ['dirt', 'grass_block', 'podzol', 'coarse_dirt', 'rooted_dirt'],
    sand: ['sand', 'red_sand'],
    water: ['water_bucket', 'ice', 'packed_ice', 'blue_ice'],
    flint: ['flint', 'gravel'],
    obsidian: ['obsidian', 'crying_obsidian'],
    leather: ['leather', 'rabbit_hide', 'phantom_membrane'],
    string: ['string', 'cobweb'],
    wool: ['white_wool', 'orange_wool', 'magenta_wool', 'light_blue_wool', 'yellow_wool', 'lime_wool', 'pink_wool', 'gray_wool', 'light_gray_wool', 'cyan_wool', 'purple_wool', 'blue_wool', 'brown_wool', 'green_wool', 'red_wool', 'black_wool']
  };

  static getResourceCategory(itemName) {
    for (const [category, items] of Object.entries(this.resourceCategories)) {
      if (items.includes(itemName)) {
        return category;
      }
    }
    return null;
  }

  static getAllItemsInCategory(category) {
    return this.resourceCategories[category] || [];
  }

  static countItemsByCategory(inventory) {
    const categoryCount = {};
    
    for (const item of inventory) {
      const category = this.getResourceCategory(item.name);
      if (category) {
        categoryCount[category] = (categoryCount[category] || 0) + item.count;
      }
    }
    
    return categoryCount;
  }

  static goals = {
    basic_survival: {
      id: 'basic_survival',
      name: '基础生存',
      description: '收集木材×64，石头×64，食物×10，建造3×3庇护所',
      difficulty: 'beginner',
      subTasks: [
        { id: 'gather_wood', name: '收集木材', targetCategory: 'wood', required: 64 },
        { id: 'gather_stone', name: '收集石头', targetCategory: 'stone', required: 64 },
        { id: 'gather_food', name: '收集食物', targetCategory: 'food', required: 10 },
        { id: 'build_shelter', name: '建造庇护所', type: 'build', dimensions: '3x3x3', optional: true }
      ],
      rewards: ['wooden_tools', 'basic_shelter']
    },
    
    iron_gear: {
      id: 'iron_gear',
      name: '铁装备',
      description: '制作全套铁装备（剑、镐、斧、铲、盔甲）',
      difficulty: 'beginner',
      subTasks: [
        { id: 'gather_iron', name: '收集铁矿石', targetCategory: 'iron', required: 24 },
        { id: 'gather_coal', name: '收集煤炭', targetCategory: 'coal', required: 24 },
        { id: 'build_furnace', name: '建造熔炉', type: 'build', block: 'furnace' },
        { id: 'smelt_iron', name: '熔炼铁锭', type: 'craft', target: 'iron_ingot', required: 24 },
        { id: 'craft_sword', name: '制作铁剑', type: 'craft', target: 'iron_sword' },
        { id: 'craft_pickaxe', name: '制作铁镐', type: 'craft', target: 'iron_pickaxe' },
        { id: 'craft_armor', name: '制作铁盔甲', type: 'craft', target: 'iron_chestplate' }
      ],
      rewards: ['full_iron_gear', 'mining_ability']
    },
    
    nether_portal: {
      id: 'nether_portal',
      name: '下界传送门',
      description: '建造下界传送门（10×9框架，14个黑曜石，打火石）',
      difficulty: 'intermediate',
      subTasks: [
        { id: 'get_flint', name: '获取打火石', target: 'flint', required: 1 },
        { id: 'get_obsidian', name: '获取黑曜石', target: 'obsidian', required: 14 },
        { id: 'build_portal', name: '建造传送门框架', type: 'build', dimensions: '10x9' },
        { id: 'activate_portal', name: '激活传送门', type: 'craft', target: 'flint_and_steel' }
      ],
      rewards: ['nether_access', 'dimension_travel']
    },
    
    auto_farm: {
      id: 'auto_farm',
      name: '自动农场',
      description: '建造小型自动农场（小麦/胡萝卜/土豆）',
      difficulty: 'intermediate',
      subTasks: [
        { id: 'craft_water_bucket', name: '制作水桶', target: 'water_bucket' },
        { id: 'build_irrigation', name: '建造灌溉系统', type: 'build', dimensions: '3x4' },
        { id: 'set_hopper', name: '设置漏斗收集', target: 'hopper' },
        { id: 'auto_harvest', name: '自动收割', type: 'craft', target: 'redstone' }
      ],
      rewards: ['sustainable_food', 'automatic_harvest']
    },
    
    diamond_gear: {
      id: 'diamond_gear',
      name: '钻石装备',
      description: '收集钻石制作全套钻石装备',
      difficulty: 'advanced',
      subTasks: [
        { id: 'find_diamond', name: '找到钻石矿', target: 'diamond_ore', required: 24 },
        { id: 'craft_diamond_sword', name: '制作钻石剑', type: 'craft', target: 'diamond_sword' },
        { id: 'craft_diamond_pickaxe', name: '制作钻石镐', type: 'craft', target: 'diamond_pickaxe' },
        { id: 'craft_diamond_armor', name: '制作钻石盔甲', type: 'craft', target: 'diamond_chestplate' }
      ],
      rewards: ['elite_gear', 'deep_miner']
    },
    
    auto_mining: {
      id: 'auto_mining',
      name: '自动化挖矿',
      description: '建造自动挖矿系统（TNT矿车+轨道）',
      difficulty: 'advanced',
      subTasks: [
        { id: 'craft_tnt', name: '制作TNT', required: 1 },
        { id: 'build_rail_system', name: '建造轨道系统', type: 'build', required: 'minecart' },
        { id: 'setup_tnt_minecart', name: '设置TNT矿车', type: 'craft', target: 'tnt_minecart' },
        { id: 'automate_collection', name: '自动收集系统', type: 'craft', target: 'hopper_minecart' }
      ],
      rewards: ['efficient_mining', 'safe_deep_mining']
    },
    
    enchanting: {
      id: 'enchanting',
      name: '附魔台',
      description: '制作附魔台附魔装备（48书架）',
      difficulty: 'advanced',
      subTasks: [
        { id: 'get_enchanted_book', name: '获得附魔书', type: 'craft', target: 'enchanted_book' },
        { id: 'build_bookshelves', name: '建造书架', required: 15, type: 'build' },
        { id: 'enchant_item', name: '附魔物品', type: 'craft', target: 'enchanting_table' },
        { id: 'enchant_gear', name: '附魔装备', target: 'enchanting', required: 48 }
      ],
      rewards: ['powerful_gear', 'enchanter_knowledge']
    },
    
    furnace_array: {
      id: 'furnace_array',
      name: '熔炉阵列',
      description: '建造8熔炉熔炼系统（自动烧炼）',
      difficulty: 'advanced',
      subTasks: [
        { id: 'craft_8_furnaces', name: '制作8个熔炉', required: 8, type: 'craft', target: 'furnace' },
        { id: 'build_hopper_system', name: '建造漏斗系统', type: 'craft', target: 'hopper' },
        { id: 'setup_auto_smelt', name: '设置自动烧炼', type: 'craft', target: 'hopper_minecart' },
        { id: 'fuel_system', name: '燃料系统', type: 'craft', target: 'bucket' }
      ],
      rewards: ['bulk_smelting', 'smelting_production']
    },
    
    end_portal: {
      id: 'end_portal',
      name: '末地传送门',
      description: '找到要塞激活传送门（12个末地之眼）',
      difficulty: 'expert',
      subTasks: [
        { id: 'find_slime', name: '找到史莱姆', target: 'slime', required: 12 },
        { id: 'craft_eyes', name: '制作末地之眼', required: 12, type: 'craft', target: 'eye_of_ender' },
        { id: 'find_temple', name: '找到末地要塞', type: 'explore' },
        { id: 'activate_portal', name: '激活传送门', required: 12, type: 'build', target: 'end_portal_frame' }
      ],
      rewards: ['end_access', 'dragon_fight']
    },
    
    redstone_auto: {
      id: 'redstone_auto',
      name: '红石自动化',
      description: '建造全自动物品系统（红石系统）',
      difficulty: 'expert',
      subTasks: [
        { id: 'craft_redstone_torch', name: '制作红石火把', required: 1, type: 'craft', target: 'redstone_torch' },
        { id: 'build_piston_system', name: '建造活塞系统', type: 'craft', target: 'piston' },
        { id: 'create_clock_circuit', name: '创建时钟电路', type: 'craft', target: 'repeater' },
        { id: 'auto_item_system', name: '自动物品系统', type: 'craft', target: 'dropper' }
      ],
      rewards: ['full_automation', 'redstone_engineer']
    }
  };

  static getGoal(goalId) {
    return this.goals[goalId] || this.goals.basic_survival;
  }

  static getAllGoals() {
    return Object.values(this.goals);
  }

  static createGoalState(goalId, botId) {
    const goal = this.getGoal(goalId);
    return {
      goalId,
      botId,
      progress: 0,
      startedAt: new Date().toISOString(),
      subTasks: goal.subTasks.map(task => ({
        ...task,
        completed: false,
        progress: 0
      })),
      materials: {}
    };
  }

  static calculateProgress(goalState, inventory) {
    const goal = this.getGoal(goalState.goalId);
    let completedTasks = 0;
    const totalNonOptional = goalState.subTasks.filter(t => !t.optional).length;
    const categoryCount = this.countItemsByCategory(inventory);
    
    for (const task of goalState.subTasks) {
      if (task.completed && !task.optional) {
        completedTasks++;
      } else if (task.targetCategory && !task.optional) {
        const count = categoryCount[task.targetCategory] || 0;
        task.progress = Math.min(1, count / task.required);
        if (task.progress >= 1) {
          task.completed = true;
          completedTasks++;
        }
      } else if (task.target && task.type !== 'build' && !task.optional) {
        const item = inventory.find(i => i.name === task.target);
        if (item && item.count >= task.required) {
          task.completed = true;
          completedTasks++;
        }
      }
    }
    
    const progress = totalNonOptional > 0 ? completedTasks / totalNonOptional : 0;
    return {
      progress,
      completedTasks,
      totalTasks: totalNonOptional,
      categoryCount
    };
  }

  static updateGoalProgress(goalState, inventory) {
    const inventoryItems = inventory || [];
    const categoryCount = this.countItemsByCategory(inventoryItems);
    const totalNonOptional = goalState.subTasks.filter(t => !t.optional).length;
    
    for (const task of goalState.subTasks) {
      if (task.completed) continue;
      
      if (task.targetCategory && !task.optional) {
        const count = categoryCount[task.targetCategory] || 0;
        task.progress = Math.min(1, count / task.required);
        if (task.progress >= 1) {
          task.completed = true;
        }
      } else if (task.target && task.type !== 'build' && !task.optional) {
        const item = inventoryItems.find(i => i.name === task.target);
        if (item && item.count >= task.required) {
          task.completed = true;
          task.progress = 1;
        } else {
          task.progress = item ? Math.min(1, item.count / task.required) : 0;
        }
      } else if (task.type === 'build') {
        task.progress = 0;
      }
    }
    
    const completedTasks = goalState.subTasks.filter(t => t.completed && !t.optional).length;
    goalState.progress = totalNonOptional > 0 ? completedTasks / totalNonOptional : 0;
    goalState.lastUpdated = Date.now();
    
    return goalState;
  }
}

module.exports = GoalSystem;
