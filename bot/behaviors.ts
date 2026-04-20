import type { Bot } from 'mineflayer'
import { Vec3 } from 'vec3'
import logger from './logger'
import type AutonomousEngine from './autonomous-engine'

interface BlockValueMap { [blockName: string]: number }

function getBlockValue(blockName: string): number {
  const values: BlockValueMap = {
    diamond_ore: 1.0,
    emerald_ore: 1.0,
    gold_ore: 0.8,
    iron_ore: 0.6,
    coal_ore: 0.4,
    lapis_ore: 0.5,
    redstone_ore: 0.4,
    copper_ore: 0.3,
    diamond_block: 1.0,
    iron_block: 0.7,
    gold_block: 0.8,
    emerald_block: 1.0,
    chest: 0.5,
    furnace: 0.4,
    crafting_table: 0.3,
    cobblestone: 0.1,
    stone: 0.1,
    dirt: 0.05,
    grass_block: 0.05,
    oak_log: 0.15,
    coal_block: 0.4
  }
  return values[blockName] || 0.2
}

function isBlockSafe(blockName: string): boolean {
  const safeBlocks: string[] = [
    'dirt', 'grass_block', 'stone', 'cobblestone', 'oak_log', 'coal_ore',
    'iron_ore', 'gold_ore', 'diamond_ore', 'emerald_ore', 'chest',
    'furnace', 'crafting_table'
  ]
  const dangerousBlocks: string[] = ['lava', 'water', 'cactus', 'fire', 'bedrock']

  if (dangerousBlocks.some(b => blockName.includes(b))) return false
  return safeBlocks.some(b => blockName.includes(b)) || true
}

interface WaitForConditionOptions {
  timeout?: number
  retryInterval?: number
}

interface CollectNearbyItemsOptions {
  maxDistance?: number
}

interface RetryOperationOptions {
  maxRetries?: number
  baseDelay?: number
}

interface FindBlocksOptions {
  maxDistance?: number
}

interface BuildStructureOptions {
  width: number
  length: number
  height: number
  blockType: string
  offsetX?: number
  offsetY?: number
  offsetZ?: number
}

interface CraftItemOptions {
  count?: number
}

interface BuildHouseOptions {
  style?: string
  material?: string
}

interface AttackEntityOptions {
  targetEntity: any
  followRange?: number
}

interface FindNearestHostileOptions {
  radius?: number
  minEngageDistance?: number
}

interface CombatOptions {
  aggressive?: boolean
  retreatHealth?: number
}

interface CombatResult {
  action: string
  target?: string
  reason?: string
}

interface AutoBuildOptions {
  blockType?: string
  width?: number
  length?: number
  height?: number
}

interface GatherResourcesOptions {
  targetBlocks: string[]
  radius?: number
}

interface FlyToOptions {
  x: number
  y: number
  z: number
  speed?: number
}

interface LookAtOptions {
  x: number
  y: number
  z: number
}

interface AutomaticBehaviorOptions {
  mode?: string
  initialGoal?: string
  gatherRadius?: number
  targetBlockType?: string
  structureType?: string
  structureSize?: {
    width: number
    length: number
    height: number
  }
}

interface ExploreOptions {
  radius?: number
  timeout?: number
}

interface BotWrapper {
  currentMode?: string
  goalState?: any
  autonomousEngine?: any
  autonomousRunning?: boolean
  botId?: string
  enableLLM?: boolean
}

interface Pathfinder {
  moveTo(target: Vec3 | { x: number; y: number; z: number }, options?: {
    range?: number
    timeout?: number
    useJump?: boolean
  }): Promise<void>
}

interface Behaviors {
  buildStructure(options: BuildStructureOptions): Promise<boolean>
  craftItem(targetItem: string, count?: number): Promise<boolean>
  buildHouse(options?: BuildHouseOptions): Promise<boolean>
  attackEntity(options: AttackEntityOptions): Promise<boolean>
  findNearestHostile(radius?: number, minEngageDistance?: number): any
  getMobStrategy(mobName: string): any
  combatMode(options?: CombatOptions): Promise<CombatResult>
  autoBuild(options?: AutoBuildOptions): Promise<boolean>
  gatherResources(options: GatherResourcesOptions): Promise<boolean>
  flyTo(options: FlyToOptions): Promise<boolean>
  lookAt(position: { x: number; y: number; z: number }): void
  jump(): void
  sprint(state?: boolean): void
  automaticBehavior(options?: AutomaticBehaviorOptions): Promise<boolean>
  findSafeRetreat(): Promise<boolean>
  explore(options?: ExploreOptions): Promise<boolean>
}

function behaviors(bot: Bot, pathfinder: Pathfinder): Behaviors {
  const waitForCondition = async (
    conditionFn: () => boolean,
    timeout: number = parseInt(process.env.WAIT_FOR_CONDITION_TIMEOUT || '10000'),
    retryInterval: number = parseInt(process.env.WAIT_RETRY_INTERVAL || '500')
  ): Promise<boolean> => {
    const startTime = Date.now()
    while (Date.now() - startTime < timeout) {
      if (conditionFn()) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, retryInterval))
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`)
  }

  const collectNearbyItems = async (botInstance: Bot, maxDistance: number = 3): Promise<void> => {
    const startTime = Date.now()
    const collectTimeout = 5000

    while (Date.now() - startTime < collectTimeout) {
      const items = Object.values(botInstance.entities || {}).filter(e =>
        e && e.name === 'Item' &&
        e.position && botInstance.entity.position.distanceTo(e.position) <= maxDistance
      )

      if (items.length === 0) break

      for (const item of items) {
        try {
          await botInstance.lookAt(item.position)
          await botInstance.moveAt(item.position)
          await new Promise(r => setTimeout(r, 100))
        } catch (e) {
          // Ignore errors
        }
      }

      await new Promise(r => setTimeout(r, 200))
    }
  }

  const retryOperation = async (
    operationFn: () => Promise<void>,
    maxRetries: number = parseInt(process.env.MAX_OPERATION_RETRIES || '3'),
    baseDelay: number = parseInt(process.env.BASE_RETRY_DELAY || '1000')
  ): Promise<void> => {
    let lastError: Error | undefined
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operationFn()
      } catch (error: any) {
        lastError = error
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt)
          logger.debug(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    throw lastError
  }

  const findBlocks = (
    blockNames: string[],
    maxDistance: number = parseInt(process.env.MAX_BLOCK_FIND_DISTANCE || '32')
  ): Vec3[] => {
    const positions: Vec3[] = []
    const pos = bot.entity.position
    const scanRadius = Math.min(maxDistance, 16)

    const startX = Math.floor(pos.x - scanRadius)
    const endX = Math.floor(pos.x + scanRadius)
    const startY = Math.max(0, Math.floor(pos.y - scanRadius))
    const endY = Math.min(256, Math.floor(pos.y + scanRadius))
    const startZ = Math.floor(pos.z - scanRadius)
    const endZ = Math.floor(pos.z + scanRadius)

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        for (let z = startZ; z <= endZ; z++) {
          try {
            const block = bot.blockAt(new Vec3(x, y, z))
            if (block && block.name && blockNames.includes(block.name)) {
              const alreadyFound = positions.some(p =>
                p.x === block.position.x && p.y === block.position.y && p.z === block.position.z
              )
              if (!alreadyFound) {
                positions.push(block.position)
              }
            }
          } catch (e) {
            // Ignore blockAt errors for out-of-bounds blocks
          }
        }
      }
    }

    positions.sort((a, b) => {
      const distA = pos.distanceTo(a)
      const distB = pos.distanceTo(b)
      return distA - distB
    })

    return positions
  }

    const getWrapper = (): BotWrapper | null => {
      const w = (bot as any).__wrapper || null;
      if (w) {
        w.enableLLM = true;
        w.autonomousRunning = true;
      }
      return w;
    }

  const originalAutomaticBehavior = async function(this: Behaviors, options: AutomaticBehaviorOptions = {}): Promise<boolean> {
    console.log('[Behaviors] originalAutomaticBehavior called with mode:', options.mode);
    const {
      mode = 'survival',
      targetBlockType = 'oak_log',
      structureType = 'house',
      structureSize = { width: 5, length: 5, height: 3 },
      gatherRadius = 30
    } = options

    const wrapper = getWrapper()
    if (wrapper) {
      wrapper.currentMode = mode
      logger.debug(`[Behaviors] Setting currentMode to: ${mode}`)
    }

    logger.debug(`Starting automatic behavior in ${mode} mode`)

    try {
      switch (mode) {
        case 'building':
          logger.debug('Auto-gathering materials for building...')
          await this.gatherResources({
            targetBlocks: ['oak_log', 'cobblestone'],
            radius: gatherRadius
          })

          logger.debug('Auto-building structure...')
          await this.buildStructure({
            width: structureSize.width,
            length: structureSize.length,
            height: structureSize.height,
            blockType: targetBlockType
          })
          break

        case 'gathering':
          logger.debug(`Auto-gathering ${targetBlockType}...`)
          await this.gatherResources({
            targetBlocks: [targetBlockType],
            radius: gatherRadius
          })
          break

        case 'survival':
        default:
          logger.debug('Auto-gathering survival resources...')

          const pos = bot.entity.position
          if (pos.y > 70) {
            logger.debug(`Bot is at height ${pos.y}, descending to ground...`)
            const groundY = 63
            try {
              await pathfinder.moveTo(new Vec3(pos.x, groundY, pos.z), {
                timeout: 15000,
                useJump: false
              })
            } catch (e) { /* ignore */ }
          }

          let maxCycles = 10
          let currentCycle = 0

          while (currentCycle < maxCycles) {
            currentCycle++

            if (!bot.isAlive) {
              logger.debug('Bot is dead, stopping')
              break
            }

            if (bot.health < 10) {
              logger.debug('Low health, seeking shelter')
              break
            }

            logger.debug(`Survival cycle ${currentCycle}/${maxCycles}, health: ${bot.health}`)

            const gathered = await this.gatherResources({
              targetBlocks: ['coal_ore', 'oak_log', 'dirt', 'cobblestone', 'iron_ore'],
              radius: gatherRadius
            })

            if (gathered) {
              logger.debug(`Successfully gathered resources in cycle ${currentCycle}`)
              break
            }

            logger.debug(`No resources found, exploring...`)
            const currentPos = bot.entity.position

            const exploreX = currentPos.x + (Math.random() - 0.5) * 20
            const exploreZ = currentPos.z + (Math.random() - 0.5) * 20

            try {
              await pathfinder.moveTo(new Vec3(exploreX, currentPos.y, exploreZ), {
                timeout: 20000,
                useJump: true
              })
              logger.debug(`Explored to: ${bot.entity.position.x.toFixed(1)}, ${bot.entity.position.z.toFixed(1)}`)
            } catch (moveError: any) {
              logger.debug(`Explore move failed: ${moveError.message}, trying different direction...`)

              const randomX = currentPos.x + (Math.random() - 0.5) * 30
              const randomZ = currentPos.z + (Math.random() - 0.5) * 30
              try {
                await pathfinder.moveTo(new Vec3(randomX, currentPos.y, randomZ), {
                  timeout: 15000,
                  useJump: true
                })
              } catch (retryError: any) {
                logger.debug(`Retry explore also failed: ${retryError.message}`)
              }
            }

            await new Promise(r => setTimeout(r, 500))
          }

          if (currentCycle >= maxCycles) {
            logger.debug('Reached max exploration cycles')
          }

          logger.debug('Automatic behavior completed')
          return true
      }

      logger.debug('Automatic behavior completed')
      return true
    } catch (error: any) {
      logger.error('Error in automatic behavior:', error)
      throw new Error(`Automatic behavior failed: ${error.message}`)
    }
  }

  return {
    buildStructure: async function(options: BuildStructureOptions): Promise<boolean> {
      const { width, length, height, blockType, offsetX = 0, offsetY = 0, offsetZ = 0 } = options

      logger.debug(`Building structure: ${width}x${length}x${height} with ${blockType}`)
      logger.debug(`At offset: ${offsetX}, ${offsetY}, ${offsetZ}`)

      try {
        const isCreativeMode = bot.gameMode === 1 || bot.gameMode === 'creative'

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            for (let z = 0; z < length; z++) {
              const isEdge = (x === 0 || x === width - 1 || z === 0 || z === length - 1 || y === 0 || y === height - 1)
              if (!isEdge && width > 2 && length > 2 && height > 2) {
                continue
              }

              const blockPos = {
                x: Math.floor(bot.entity.position.x) + offsetX + x,
                y: Math.floor(bot.entity.position.y) + offsetY + y,
                z: Math.floor(bot.entity.position.z) + offsetZ + z
              }

              if (!isCreativeMode) {
                await retryOperation(async () => {
                  await waitForCondition(() => {
                    const item = bot.inventory.items().find(i => i.name === blockType && i.count > 0)
                    return item !== undefined
                  }, 15000)
                })

                const item = bot.inventory.items().find(i => i.name === blockType && i.count > 0)
                await bot.equip(item, 'hand')
              } else {
                try {
                  let item = bot.inventory.items().find(i => i.name === blockType && i.count > 0)
                  if (!item) {
                    logger.debug(`In creative mode, attempting to use block: ${blockType}`)
                  }
                  if (item) {
                    await bot.equip(item, 'hand')
                  }
                } catch (equipError: any) {
                  logger.warn(`Could not equip block in creative mode: ${equipError.message}`)
                }
              }

              await retryOperation(async () => {
                await bot.placeBlock(bot.blockAt(blockPos as any), new Vec3(0, 1, 0))
              })

              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        }

        logger.debug('Structure building completed')
        return true
      } catch (error: any) {
        logger.error('Error building structure:', error)
        throw new Error(`Building failed: ${error.message}`)
      }
    },


    craftItem: async function(targetItem: string, count: number = 1): Promise<boolean> {
      const recipes: { [key: string]: any } = {
        wooden_pickaxe: { type: 'wooden_pickaxe', count: 1, materials: { oak_planks: 3, stick: 2 } },
        stone_pickaxe: { type: 'stone_pickaxe', count: 1, materials: { cobblestone: 3, stick: 2 } },
        iron_pickaxe: { type: 'iron_pickaxe', count: 1, materials: { iron_ingot: 3, stick: 2 } },
        diamond_pickaxe: { type: 'diamond_pickaxe', count: 1, materials: { diamond: 3, stick: 2 } },
        wooden_sword: { type: 'wooden_sword', count: 1, materials: { oak_planks: 2, stick: 1 } },
        stone_sword: { type: 'stone_sword', count: 1, materials: { cobblestone: 2, stick: 1 } },
        iron_sword: { type: 'iron_sword', count: 1, materials: { iron_ingot: 2, stick: 1 } },
        diamond_sword: { type: 'diamond_sword', count: 1, materials: { diamond: 2, stick: 1 } },
        wooden_axe: { type: 'wooden_axe', count: 1, materials: { oak_planks: 3, stick: 2 } },
        stone_axe: { type: 'stone_axe', count: 1, materials: { cobblestone: 3, stick: 2 } },
        iron_axe: { type: 'iron_axe', count: 1, materials: { iron_ingot: 3, stick: 2 } },
        diamond_axe: { type: 'diamond_axe', count: 1, materials: { diamond: 3, stick: 2 } },
        wooden_shovel: { type: 'wooden_shovel', count: 1, materials: { oak_planks: 1, stick: 2 } },
        stone_shovel: { type: 'stone_shovel', count: 1, materials: { cobblestone: 1, stick: 2 } },
        iron_shovel: { type: 'iron_shovel', count: 1, materials: { iron_ingot: 1, stick: 2 } },
        diamond_shovel: { type: 'diamond_shovel', count: 1, materials: { diamond: 1, stick: 2 } },
        bow: { type: 'bow', count: 1, materials: { stick: 3, string: 3 } },
        arrow: { type: 'arrow', count: 4, materials: { stick: 1, cobblestone: 1, feather: 1 } },
        shield: { type: 'shield', count: 1, materials: { oak_planks: 6, iron_ingot: 1 } },
        chest: { type: 'chest', count: 1, materials: { oak_planks: 8 } },
        crafting_table: { type: 'crafting_table', count: 1, materials: { oak_planks: 4 } },
        furnace: { type: 'furnace', count: 1, materials: { cobblestone: 8 } },
        torch: { type: 'torch', count: 4, materials: { stick: 1, coal: 1 } },
        bucket: { type: 'bucket', count: 1, materials: { iron_ingot: 3 } },
        water_bucket: { type: 'water_bucket', count: 1, materials: { bucket: 1 } },
        iron_helmet: { type: 'iron_helmet', count: 1, materials: { iron_ingot: 5 } },
        iron_chestplate: { type: 'iron_chestplate', count: 1, materials: { iron_ingot: 8 } },
        iron_leggings: { type: 'iron_leggings', count: 1, materials: { iron_ingot: 7 } },
        iron_boots: { type: 'iron_boots', count: 1, materials: { iron_ingot: 4 } },
        diamond_helmet: { type: 'diamond_helmet', count: 1, materials: { diamond: 5 } },
        diamond_chestplate: { type: 'diamond_chestplate', count: 1, materials: { diamond: 8 } },
        diamond_leggings: { type: 'diamond_leggings', count: 1, materials: { diamond: 7 } },
        diamond_boots: { type: 'diamond_boots', count: 1, materials: { diamond: 4 } },
        oak_planks: { type: 'oak_planks', count: 4, materials: { oak_log: 1 } },
        stick: { type: 'stick', count: 4, materials: { oak_planks: 2 } }
      }

      const recipe = recipes[targetItem]
      if (!recipe) {
        logger.debug(`Unknown recipe: ${targetItem}`)
        return false
      }

      const craftingTables = bot.findBlocks({
        point: bot.entity.position,
        matching: 'crafting_table',
        maxDistance: 5,
        count: 1
      })
      const craftingTableNearby = craftingTables.length > 0 ? bot.blockAt(craftingTables[0]) : null

      if (!craftingTableNearby) {
        logger.debug('[Craft] Need crafting table, placing one...')
        await this.buildStructure({
          width: 1, length: 1, height: 1,
          blockType: 'crafting_table',
          offsetX: 1, offsetY: 0, offsetZ: 0
        })
      }

      await new Promise(r => setTimeout(r, 500))

      try {
        const recipeObj = bot.recipesFor(targetItem)
        if (recipeObj && recipeObj.length > 0) {
          await bot.craft(recipeObj[0], count)
          logger.debug(`[Craft] Crafted ${count}x ${targetItem}`)
          return true
        }
      } catch (craftError: any) {
        logger.debug(`[Craft] Failed to craft ${targetItem}: ${craftError.message}`)
      }

      return false
    },

    buildHouse: async function(options: BuildHouseOptions = {}): Promise<boolean> {
      const { style = 'basic', material = 'cobblestone' } = options

      const materials: { [key: string]: any } = {
        basic: { width: 5, length: 5, height: 3, door: true, windows: true },
        small: { width: 3, length: 3, height: 2, door: true, windows: false },
        large: { width: 7, length: 7, height: 4, door: true, windows: true },
        tower: { width: 3, length: 3, height: 10, door: true, windows: false }
      }

      const house = materials[style] || materials.basic

      logger.debug(`[House] Building ${style} house: ${house.width}x${house.length}x${house.height}`)

      const inventoryBlocks = bot.inventory.items().filter(i => i.name === material).reduce((sum, i) => sum + i.count, 0)
      const neededBlocks = house.width * house.length * house.height

      if (inventoryBlocks < neededBlocks) {
        logger.debug(`[House] Need ${neededBlocks} ${material}, have ${inventoryBlocks}, gathering...`)
        await this.gatherResources({ targetBlocks: [material], radius: 32 })
      }

      await this.buildStructure({
        width: house.width,
        length: house.length,
        height: house.height,
        blockType: material,
        offsetX: 3, offsetY: 0, offsetZ: 0
      })

      if (house.door) {
        const doorPos = {
          x: Math.floor(bot.entity.position.x) + 3 + Math.floor(house.width / 2),
          y: Math.floor(bot.entity.position.y) + 1,
          z: Math.floor(bot.entity.position.z)
        }
        try {
          const doorBlock = bot.blockAt(doorPos as any)
          if (doorBlock && doorBlock.name !== 'air') {
            await bot.dig(doorBlock, true)
          }
        } catch { /* ignore */ }
      }

      logger.debug(`[House] House building completed!`)
      return true
    },

    attackEntity: async function(options: AttackEntityOptions): Promise<boolean> {
      const { targetEntity, followRange = 10 } = options

      if (!targetEntity) {
        return false
      }

      try {
        const targetPos = targetEntity.position
        const distance = bot.entity.position.distanceTo(targetPos)

        if (distance > followRange) {
          await pathfinder.moveTo(targetPos, { timeout: 10000, range: 2 })
        }

        if (distance <= 3) {
          bot.attack(targetEntity)
          logger.debug(`Attacked entity: ${targetEntity.name}`)
          return true
        }

        return false
      } catch (error: any) {
        logger.debug(`Attack failed: ${error.message}`)
        return false
      }
    },

    findNearestHostile: function(radius: number = 16, minEngageDistance: number = 4): any {
      const hostileMobs = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'piglin', 'hoglin', 'zombified_piglin', 'drowned', 'witch', 'ravager', 'vex', 'pillager']

      let nearestHostile = null
      let nearestDist = Infinity

      for (const entity of Object.values(bot.entities)) {
        if (!entity.position || !entity.type) continue
        if (entity.type !== 'hostile' && entity.type !== 'mob') continue
        if (!entity.name) continue

        const isHostile = hostileMobs.includes(entity.name) ||
                         entity.name.includes('zombie') ||
                         entity.name.includes('skeleton') ||
                         entity.name.includes('creeper') ||
                         entity.name.includes('spider')

        if (!isHostile) continue

        const dist = bot.entity.position.distanceTo(entity.position)
        if (dist < nearestDist && dist <= radius && dist >= minEngageDistance) {
          nearestDist = dist
          nearestHostile = entity
        }
      }

      return nearestHostile
    },

    getMobStrategy: function(mobName: string): any {
      const strategies: { [key: string]: any } = {
        creeper: { type: 'explosive', danger: 'high', retreatDist: 8, attackRange: 3, action: 'keep_distance' },
        skeleton: { type: 'ranged', danger: 'high', retreatDist: 5, attackRange: 4, action: 'close_distance' },
        zombie: { type: 'melee', danger: 'medium', retreatDist: 3, attackRange: 3, action: 'aggressive' },
        spider: { type: 'melee', danger: 'medium', retreatDist: 3, attackRange: 3, action: 'aggressive' },
        enderman: { type: 'teleport', danger: 'high', retreatDist: 6, attackRange: 4, action: 'cautious' },
        piglin: { type: 'melee', danger: 'medium', retreatDist: 3, attackRange: 3, action: 'aggressive' },
        hoglin: { type: 'charge', danger: 'high', retreatDist: 8, attackRange: 4, action: 'keep_distance' },
        zombified_piglin: { type: 'melee', danger: 'medium', retreatDist: 3, attackRange: 3, action: 'aggressive' },
        drowned: { type: 'ranged', danger: 'medium', retreatDist: 5, attackRange: 4, action: 'close_distance' },
        witch: { type: 'ranged', danger: 'high', retreatDist: 8, attackRange: 4, action: 'close_distance' },
        ravager: { type: 'charge', danger: 'high', retreatDist: 10, attackRange: 5, action: 'keep_distance' },
        vex: { type: 'phase', danger: 'high', retreatDist: 6, attackRange: 3, action: 'cautious' },
        pillager: { type: 'ranged', danger: 'medium', retreatDist: 6, attackRange: 4, action: 'close_distance' },
        blaze: { type: 'ranged', danger: 'high', retreatDist: 8, attackRange: 5, action: 'keep_distance' },
        ghast: { type: 'flying', danger: 'high', retreatDist: 10, attackRange: 5, action: 'keep_distance' },
        magmacube: { type: 'area', danger: 'medium', retreatDist: 4, attackRange: 3, action: 'keep_distance' },
        shulker: { type: 'ranged', danger: 'high', retreatDist: 6, attackRange: 4, action: 'cautious' }
      }
      return strategies[mobName] || { type: 'melee', danger: 'low', retreatDist: 3, attackRange: 3, action: 'aggressive' }
    },

    combatMode: async function(options: CombatOptions = {}): Promise<CombatResult> {
      const { aggressive = true, retreatHealth = 6 } = options
      const health = bot.health || 20

      if (health <= retreatHealth && retreatHealth > 0) {
        const fleePos = new Vec3(
          bot.entity.position.x + 15,
          bot.entity.position.y,
          bot.entity.position.z + 15
        )
        try {
          await pathfinder.moveTo(fleePos, { timeout: 8000, range: 2 })
          logger.debug('[Combat] Low health, retreating')
        } catch { /* ignore */ }
        return { action: 'retreat', reason: 'low health' }
      }

      const target = this.findNearestHostile(20)
      if (target) {
        const strategy = this.getMobStrategy(target.name)
        const dist = bot.entity.position.distanceTo(target.position)

        logger.debug(`[Combat] ${target.name} (strategy: ${strategy.action}, dist: ${dist.toFixed(1)})`)

        if (target.name === 'creeper' && dist < strategy.retreatDist) {
          const dx = bot.entity.position.x - target.position.x
          const dz = bot.entity.position.z - target.position.z
          const len = Math.sqrt(dx * dx + dz * dz) || 1
          const fleePos = new Vec3(
            bot.entity.position.x + (dx / len) * 12,
            bot.entity.position.y,
            bot.entity.position.z + (dz / len) * 12
          )
          try {
            await pathfinder.moveTo(fleePos, { timeout: 5000, range: 2 })
            logger.debug('[Combat] Creeper detected! Fleeing...')
          } catch { /* ignore */ }
          return { action: 'flee', target: 'creeper' }
        }

        if (strategy.action === 'keep_distance') {
          if (dist > strategy.retreatDist) {
            return { action: 'idle', target: target.name, reason: 'maintain_distance' }
          } else if (dist < strategy.attackRange) {
            await this.attackEntity({ targetEntity: target, followRange: strategy.retreatDist })
            return { action: 'attack', target: target.name }
          } else {
            const dx = target.position.x - bot.entity.position.x
            const dy = target.position.y - bot.entity.position.y
            const dz = target.position.z - bot.entity.position.z
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
            const approachPos = new Vec3(
              (dx / len) * (strategy.retreatDist - 1),
              (dy / len) * (strategy.retreatDist - 1),
              (dz / len) * (strategy.retreatDist - 1)
            )
            const targetPos = bot.entity.position.plus(approachPos)
            try {
              await pathfinder.moveTo(targetPos, { timeout: 5000, range: 2 })
            } catch { /* ignore */ }
            return { action: 'positioning', target: target.name }
          }
        } else if (strategy.action === 'close_distance') {
          if (dist > strategy.attackRange) {
            await pathfinder.moveTo(target.position, { timeout: 5000, range: strategy.attackRange })
          }
          await this.attackEntity({ targetEntity: target, followRange: strategy.attackRange })
          return { action: 'attack', target: target.name }
        } else {
          const attacked = await this.attackEntity({ targetEntity: target, followRange: 3 })
          return { action: attacked ? 'attacking' : 'approaching', target: target.name }
        }
      }

      return { action: 'idle', reason: 'no targets' }
    },

    autoBuild: async function(options: AutoBuildOptions = {}): Promise<boolean> {
      const { blockType = 'cobblestone', width = 3, length = 3, height = 3 } = options

      const neededBlocks = width * length * height
      const inventoryBlocks = bot.inventory.items().filter(i => i.name === blockType).reduce((sum, i) => sum + i.count, 0)

      if (inventoryBlocks < neededBlocks) {
        logger.debug(`Need ${neededBlocks} ${blockType}, have ${inventoryBlocks}, gathering...`)
        await this.gatherResources({ targetBlocks: [blockType], radius: 32 })
      }

      return this.buildStructure({ width, length, height, blockType })
    },

    gatherResources: async function(options: GatherResourcesOptions): Promise<boolean> {
      const { targetBlocks, radius = 20 } = options

      logger.debug(`Gathering resources: ${JSON.stringify(targetBlocks)} within radius ${radius}`)

      try {
        let currentRadius = radius
        let blockPositions = findBlocks(targetBlocks, currentRadius)

        while (blockPositions.length < 5 && currentRadius < 64) {
          currentRadius = Math.min(currentRadius * 2, 64)
          blockPositions = findBlocks(targetBlocks, currentRadius)
        }

        if (blockPositions.length === 0) {
          const angle = Math.random() * Math.PI * 2
          const explorePos = new Vec3(
            bot.entity.position.x + Math.cos(angle) * 20,
            bot.entity.position.y,
            bot.entity.position.z + Math.sin(angle) * 20
          )
          try {
            await pathfinder.moveTo(explorePos, { timeout: 15000, range: 2 })
          } catch { /* ignore */ }
          blockPositions = findBlocks(targetBlocks, 32)
        }

        if (blockPositions.length === 0) {
          return false
        }

        logger.debug(`Found ${blockPositions.length} blocks to gather (radius: ${currentRadius})`)

        let optimalStrategy = { action: 'linear', order: blockPositions }

        const botPos = bot.entity.position
        optimalStrategy.order = [...blockPositions].sort((a, b) => {
          const distA = Math.sqrt(Math.pow(a.x - botPos.x, 2) + Math.pow(a.z - botPos.z, 2))
          const distB = Math.sqrt(Math.pow(b.x - botPos.x, 2) + Math.pow(b.z - botPos.z, 2))
          return distA - distB
        })

        let successCount = 0
        let failCount = 0
        const maxFailures = 10
        const gatherStartTime = Date.now()

        const positionsToVisit = optimalStrategy.order || blockPositions

        for (const posItem of positionsToVisit) {
          const position = (posItem as any).position || posItem

          if (!position || position.x === undefined || position.y === undefined || position.z === undefined) {
            logger.debug(`[Behaviors] Skipping invalid position: ${JSON.stringify(posItem)}`)
            failCount++
            continue
          }

          if (failCount >= maxFailures) {
            logger.debug(`[Behaviors] Stopping resource gathering after ${failCount} consecutive failures`)
            break
          }

          logger.debug(`Moving to block at ${position.x}, ${position.y}, ${position.z}`)

          let reachedBlock = false
          try {
            await pathfinder.moveTo(position, { timeout: 25000, range: 4 })
            reachedBlock = true
          } catch (moveError: any) {
            const errorMsg = moveError.message || ''
            if (errorMsg.includes('goal was changed') || errorMsg.includes('goal') || errorMsg.includes('Path was stopped')) {
              logger.debug(`[Behaviors] Path changed during movement, continuing to next block`)
              continue
            }
            const dist = bot.entity.position.distanceTo(new Vec3(position.x, position.y, position.z))
            if (dist < 5) {
              logger.debug(`Close enough (dist=${dist.toFixed(1)})`)
              reachedBlock = true
            } else {
              logger.debug(`Cannot reach block: ${moveError.message}, dist=${dist.toFixed(1)}`)
              failCount++
              continue
            }
          }

          if (!reachedBlock) {
            failCount++
            continue
          }

          const block = bot.blockAt(position)
          if (!block || !block.name) {
            logger.debug('Block not found at position')
            failCount++
            continue
          }

          if (!bot.canDigBlock(block)) {
            logger.debug(`No optimal tool for ${block.name}, attempting anyway`)
          }

          try {
            await retryOperation(async () => {
              await bot.dig(block, true)

              await waitForCondition(() =>
                !bot.blockAt(position) || bot.blockAt(position).name === 'air', 10000)

              await collectNearbyItems(bot, 4)

              const items = bot.inventory.items()
              if (items.length > 0) {
                logger.debug(`Inventory now has ${items.length} items`)
              }
            })

            logger.debug(`Collected ${block.name}`)
            successCount++
            failCount = 0
          } catch (digError: any) {
            const errorMsg = digError.message || ''
            if (errorMsg.includes('Digging aborted') || errorMsg.includes('goal')) {
              logger.debug(`[Behaviors] Digging interrupted, continuing to next block`)
              continue
            }
            logger.debug(`[Behaviors] Failed to dig block: ${digError.message}`)
            failCount++
          }

          await new Promise(resolve => setTimeout(resolve, 500))
        }

        const successRate = successCount / (successCount + failCount) || 0
        logger.debug(`[Behaviors] Resource gathering completed. Success: ${successCount}, Failures: ${failCount}, Success Rate: ${successRate.toFixed(2)}`)

        logger.debug('Resource gathering completed')
        return true
      } catch (error: any) {
        logger.error('Error gathering resources:', error)
        throw new Error(`Gathering failed: ${error.message}`)
      }
    },

    flyTo: async function(options: FlyToOptions): Promise<boolean> {
      const { x, y, z, speed = 1 } = options

      logger.debug(`Flying to: ${x}, ${y}, ${z} at speed ${speed}`)

      try {
        const canFly = bot.creative ||
          (bot.inventory.armor && (bot.inventory.armor as any).chest &&
           (bot.inventory.armor as any).chest.name === 'elytra')

        if (!canFly) {
          logger.debug('Cannot fly: not in creative mode and no elytra')
          await pathfinder.moveTo({ x, y, z })
          return true
        }

        const originalSpeed = bot.settings ? bot.settings.physics.speed : undefined
        if (bot.settings) {
          bot.settings.physics.speed *= speed
        }

        await retryOperation(async () => {
          await pathfinder.moveTo({ x, y, z })
        })

        if (bot.settings && originalSpeed !== undefined) {
          bot.settings.physics.speed = originalSpeed
        }

        logger.debug('Flying completed')
        return true
      } catch (error: any) {
        logger.error('Error flying:', error)
        throw new Error(`Flying failed: ${error.message}`)
      }
    },

    lookAt: function(position: { x: number; y: number; z: number }): void {
      if (typeof position === 'object' && position.x !== undefined) {
        bot.lookAt(position)
      } else {
        logger.warn('Invalid position for lookAt:', position)
      }
    },

    jump: function(): void {
      bot.setControlState('jump', true)
      setTimeout(() => bot.setControlState('jump', false), 100)
    },

    sprint: function(state: boolean = true): void {
      bot.setControlState('sprint', state)
    },

    automaticBehavior: async function(options: AutomaticBehaviorOptions = {}): Promise<boolean> {
      const {
        mode = 'autonomous',
        initialGoal = 'basic_survival',
        gatherRadius = 30
      } = options

      const wrapper = getWrapper()
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const GoalSystem = require('./goal-system')

      if (wrapper) {
        wrapper.currentMode = mode
        if (!wrapper.goalState && initialGoal) {
          wrapper.goalState = GoalSystem.createGoalState(initialGoal, wrapper.botId || 'unknown')
        }
        logger.debug(`[Behaviors] Setting currentMode to: ${mode}, goalState: ${wrapper.goalState?.goalId}`)
      }

      logger.debug(`Starting ${mode} behavior with goal: ${initialGoal}`)
      console.log('[Behaviors] mode from options:', mode, 'initialGoal:', initialGoal);

      try {
        console.log('[Behaviors] checking mode === autonomous, mode=', mode, 'result:', mode === 'autonomous');
        if (mode === 'autonomous') {
          console.log('[Behaviors] Starting autonomous mode, enableLLM=', wrapper.enableLLM);
          const AutonomousEngine = (await import('./autonomous-engine')).default;
          const enableLLM = wrapper.enableLLM !== undefined ? wrapper.enableLLM : true;
          console.log('[Behaviors] Creating AutonomousEngine with enableLLM=', enableLLM);
          const engine = new AutonomousEngine(bot, pathfinder, this, enableLLM)
          wrapper.autonomousEngine = engine;
          (bot as any).autonomousEngine = engine;
          (bot as any).autonomousRunning = true;

          let isRunning = true
          wrapper.autonomousRunning = true

          while (isRunning && wrapper.autonomousRunning) {
            try {
              const cycleResult = await engine.runCycle(wrapper.goalState || {})
              console.log(`[Autonomous] Cycle: ${cycleResult.state.currentAction}, Priority: ${cycleResult.state.priority}, usedLLM=${cycleResult.usedLLM}`)

              if (cycleResult.goalState && cycleResult.goalState.goalId) {
                wrapper.goalState = cycleResult.goalState
                try {
                  const BotGoal = require('../config/models/BotGoal').default || require('../config/models/BotGoal');
                  await BotGoal.saveGoal(wrapper.botId, cycleResult.goalState.goalId, cycleResult.goalState)
                } catch (saveErr: any) {
                  logger.debug(`[Autonomous] Failed to save goal: ${saveErr.message}`)
                }
              }

              await new Promise(resolve => setTimeout(resolve, 2000))
            } catch (cycleError: any) {
              logger.error(`[Autonomous] Cycle error: ${cycleError.message}`)
              await new Promise(resolve => setTimeout(resolve, 10000))
            }
          }

          logger.debug('Autonomous behavior stopped')
          return true
        } else {
          return await originalAutomaticBehavior.call(this, options)
        }
      } catch (error: any) {
        logger.error('Error in automatic behavior:', error)
        throw new Error(`Automatic behavior failed: ${error.message}`)
      }
    },

    findSafeRetreat: async function(): Promise<boolean> {
      const wrapper = getWrapper()
      const botPos = bot.entity.position

      const safeBlocks = ['water', 'cave_air']
      const shelterBlocks = ['oak_log', 'birch_log', 'spruce_log', 'cobblestone', 'stone']

      logger.info('[Behaviors] Finding safe retreat position...')

      try {
        const waterPos = bot.findBlocks({
          point: botPos,
          matching: 'water',
          maxDistance: 16,
          minCount: 1
        })

        if (waterPos && waterPos.length > 0) {
          logger.info('[Behaviors] Found water, diving in...')
          await pathfinder.moveTo(waterPos[0], { timeout: 15000 })
          return true
        }

        const caveBlocks = bot.findBlocks({
          point: botPos,
          matching: ['cave_air', 'stone', 'dirt', 'granite'],
          maxDistance: 12,
          minCount: 20
        })

        if (caveBlocks && caveBlocks.length > 10) {
          const cavePos = caveBlocks[Math.floor(caveBlocks.length / 2)]
          logger.info('[Behaviors] Found cave, taking shelter...')
          await pathfinder.moveTo(cavePos, { timeout: 15000 })
          return true
        }

        const treeBlocks = bot.findBlocks({
          point: botPos,
          matching: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log'],
          maxDistance: 20,
          minCount: 1
        })

        if (treeBlocks && treeBlocks.length > 0) {
          const treePos = treeBlocks[0]
          logger.info('[Behaviors] Found tree, climbing for safety...')
          await pathfinder.moveTo(new Vec3(treePos.x, treePos.y + 5, treePos.z), { timeout: 15000 })
          return true
        }

        const hostiles: any[] = []

        for (const entity of Object.values(bot.entities || {})) {
          if (!entity.position || !entity.type) continue
          const isHostile = ['zombie', 'skeleton', 'spider', 'creeper', 'pillager', 'witch'].some(m => entity.name?.includes(m))
          if (isHostile && entity.position.distanceTo(botPos) < 20) {
            hostiles.push(entity)
          }
        }

        if (hostiles.length > 0) {
          let sumX = 0, sumZ = 0
          for (const h of hostiles) {
            sumX += h.position.x - botPos.x
            sumZ += h.position.z - botPos.z
          }
          const avgX = sumX / hostiles.length
          const avgZ = sumZ / hostiles.length

          const fleePos = new Vec3(
            botPos.x - avgX * 1.5 + (Math.random() - 0.5) * 10,
            botPos.y,
            botPos.z - avgZ * 1.5 + (Math.random() - 0.5) * 10
          )

          logger.info(`[Behaviors] Fleeing from ${hostiles.length} hostiles...`)
          await pathfinder.moveTo(fleePos, { timeout: 20000 })
          return true
        }

        const randomPos = new Vec3(
          botPos.x + (Math.random() - 0.5) * 30,
          botPos.y,
          botPos.z + (Math.random() - 0.5) * 30
        )
        await pathfinder.moveTo(randomPos, { timeout: 20000 })
        return true

      } catch (err: any) {
        logger.error(`[Behaviors] Retreat failed: ${err.message}`)
        return false
      }
    },

    explore: async function(options: ExploreOptions = {}): Promise<boolean> {
      const radius = options.radius || 32;
      const timeout = options.timeout || 30000;

      logger.debug(`[Behaviors] Exploring radius ${radius}...`);

      try {
        const botPos = bot.entity.position;
        const angle = Math.random() * Math.PI * 2;
        const explorePos = new Vec3(
          botPos.x + Math.cos(angle) * radius,
          botPos.y,
          botPos.z + Math.sin(angle) * radius
        );

        logger.debug(`[Behaviors] Moving to explore position: ${explorePos.x.toFixed(1)}, ${explorePos.y.toFixed(1)}, ${explorePos.z.toFixed(1)}`);
        await pathfinder.moveTo(explorePos, { timeout, range: 2 });
        logger.debug('[Behaviors] Explore move completed');
        return true;
      } catch (err: any) {
        logger.debug(`[Behaviors] Explore failed: ${err.message}`);
        return false;
      }
    }
  }
}

export default behaviors;
