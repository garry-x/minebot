declare module 'mineflayer' {
  import { EventEmitter } from 'events';
  import { Vec3 } from 'vec3';

  export interface BotOptions {
    host: string;
    port?: number;
    username: string;
    password?: string;
    version?: string;
    auth?: 'mojang' | 'microsoft' | 'offline';
    keepAlive?: boolean;
    timeout?: number;
    [key: string]: any;
  }

  export interface Bot extends EventEmitter {
    entity: Entity;
    username: string;
    version: string;
    isAlive: boolean;
    health: number;
    food: number;
    experience: Experience;
    game: GameState;
    time: { timeOfDay: number };
    players: { [username: string]: Player };
    entities: { [id: string]: Entity };
    inventory: Inventory;
    quickBar: Inventory;
    respawnPos: Vec3 | null;
    mcData: any;
    _client: { mcData?: any };
    velocity: Vec3 | null;
    creative: boolean;
    gameMode: number | string;
    settings: { physics: { speed: number } };

    lookAt(position: Vec3 | { x: number; y: number; z: number }, force?: boolean): Promise<void>;
    moveAt(position: Vec3): Promise<void>;
    placeBlock(reference: Block | null, face: Vec3): Promise<void>;
    dig(block: Block, force?: boolean): Promise<void>;
    attack(entity: Entity): void;
    canDigBlock(block: Block): boolean;
    recipesFor(item: string): any[];
    craft(recipe: any, count?: number, mirror?: boolean): Promise<void>;
    findBlocks(options: FindBlocksOptions): Vec3[];

    equip(item: Item, destination: 'hand' | 'off-hand' | 'head' | 'torso' | 'legs' | 'feet'): Promise<void>;
    consume(): Promise<void>;

    setControlState(control: string, state: boolean): void;
    controlState: {
      forward: boolean;
      back: boolean;
      left: boolean;
      right: boolean;
      jump: boolean;
      sprint: boolean;
    };

    pathfinder: {
      setMovements(movements: any): void;
      goto(goal: any): Promise<void>;
      stop(): void;
    };

    quit(reason?: string): void;
    chat(message: string): void;
    whisper(username: string, message: string): void;
    blockAt(point: Vec3): Block | null;
    canSeeBlock(block: Block): boolean;
    findBlock(options: FindBlockOptions): Block | null;

    on(event: 'chat', listener: (username: string, message: string, translate?: string, json?: any) => void): this;
    on(event: 'login', listener: () => void): this;
    on(event: 'spawn', listener: () => void): this;
    on(event: 'death', listener: () => void): this;
    on(event: 'kicked', listener: (reason: string, loggedIn: boolean) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (message: string, json: any, position: string) => void): this;
    on(event: 'playerJoined', listener: (player: Player) => void): this;
    on(event: 'playerLeft', listener: (player: Player) => this): this;
    on(event: 'blockUpdate', listener: (oldBlock: Block | null, newBlock: Block | null) => void): this;
    on(event: 'chunkColumnLoad', listener: (point: Vec3, chunk: any) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;

    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
  }

  export function createBot(options: BotOptions): Bot;

  export interface Entity {
    id: number;
    type: string;
    position: Vec3;
    velocity: Vec3;
    yaw: number;
    pitch: number;
    onGround: boolean;
    height: number;
    width: number;
    name?: string;
    metadata?: any;
  }

  export interface Player {
    username: string;
    ping: number;
    uuid: string;
    gamemode?: number;
    position?: Vec3;
  }

  export interface Experience {
    level: number;
    progress: number;
    total: number;
  }

  export interface GameState {
    dimension: string;
    difficulty: number;
    gameMode: number;
    hardcore: boolean;
    height: number;
    rain: number;
    time: number;
  }

  export interface Item {
    type: number;
    count: number;
    metadata: number;
    nbt: any;
    name?: string;
    displayName?: string;
  }

  export interface Block {
    type: number;
    meta: number;
    position: Vec3;
    displayName: string;
    name: string;
    hardness: number | null;
    biome?: Biome;
    light?: number;
    skyLight?: number;
  }

  export interface Biome {
    id: number;
    name: string;
    displayName: string;
    rainfall: number;
    temperature: number;
  }

  export interface Inventory {
    slots: (Item | null)[];
    armor: (Item | null)[] | { head?: Item | null; chest?: Item | null; legs?: Item | null; feet?: Item | null };
    cursor: Item | null;

    selectedItem: Item | null;
    inventoryStart: number;
    inventoryEnd: number;
    firstEmpty: number;

    items(): Item[];
    addItem(item: Item): boolean;
    removeItem(itemType: number, count?: number): Item[];
    clear(): void;
  }

  export interface FindBlockOptions {
    point: Vec3;
    matching: number | number[];
    maxDistance?: number;
    count?: number;
  }

  export interface FindBlocksOptions {
    point: Vec3;
    matching: string | string[];
    maxDistance: number;
    minCount?: number;
    count?: number;
  }
}