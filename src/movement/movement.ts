import type { Connection } from "../connection/connection.js";
import type { Vec3 } from "../utils/vec3.js";


export class Movement {
  private connection: Connection;
  private isSneaking = false;
  private isSprinting = false;
  private currentPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private currentYaw = 0;
  private currentPitch = 0;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  setPosition(x: number, y: number, z: number): void {
    this.currentPosition = { x, y, z };
    this.connection.queue("move_player", {
      runtime_id: this.connection.getEntityId(),
      position: { x, y, z },
      pitch: this.currentPitch,
      yaw: this.currentYaw,
      head_yaw: this.currentYaw,
      mode: "normal",
      on_ground: false,
      ridden_runtime_id: 0,
      tick: BigInt(0),
    });
  }

  setRotation(yaw: number, pitch: number): void {
    this.currentYaw = yaw;
    this.currentPitch = pitch;
    this.connection.queue("move_player", {
      runtime_id: this.connection.getEntityId(),
      position: this.currentPosition,
      pitch,
      yaw,
      head_yaw: yaw,
      mode: "normal",
      on_ground: false,
      ridden_runtime_id: 0,
      tick: BigInt(0),
    });
  }

  lookAt(target: Vec3): void {
    const dx = target.x - this.currentPosition.x;
    const dy = target.y - this.currentPosition.y;
    const dz = target.z - this.currentPosition.z;
    const yaw = Math.atan2(-dx, dz) * (180 / Math.PI);
    const horizontal = Math.sqrt(dx * dx + dz * dz);
    const pitch = -Math.atan2(dy, horizontal) * (180 / Math.PI);
    this.setRotation(yaw, pitch);
  }

  startSneaking(): void {
    if (this.isSneaking) return;
    this.isSneaking = true;
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "start_sneak",
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: 0,
    });
  }

  stopSneaking(): void {
    if (!this.isSneaking) return;
    this.isSneaking = false;
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "stop_sneak",
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: 0,
    });
  }

  startSprinting(): void {
    if (this.isSprinting) return;
    this.isSprinting = true;
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "start_sprint",
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: 0,
    });
  }

  stopSprinting(): void {
    if (!this.isSprinting) return;
    this.isSprinting = false;
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "stop_sprint",
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: 0,
    });
  }

  jump(): void {
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "jump",
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: 0,
    });
  }

  startDigging(pos: Vec3): void {
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "start_break",
      position: { x: pos.x, y: pos.y, z: pos.z },
      result_position: { x: pos.x, y: pos.y, z: pos.z },
      face: 0,
    });
  }

  stopDigging(pos: Vec3): void {
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "abort_break",
      position: { x: pos.x, y: pos.y, z: pos.z },
      result_position: { x: pos.x, y: pos.y, z: pos.z },
      face: 0,
    });
  }

  swingArm(): void {
    this.connection.queue("animate", {
      action_id: "swing_arm",
      runtime_entity_id: this.connection.getEntityId(),
      data: 0,
      has_swing_source: false,
    });
  }

  attack(targetRuntimeId: bigint): void {
    this.connection.queue("inventory_transaction", {
      transaction_type: 3,
      actions: [],
      action_type: 1,
      entity_runtime_id: targetRuntimeId,
      hotbar_slot: 0,
      held_item: { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 },
      player_pos: this.currentPosition,
      click_pos: { x: 0, y: 0, z: 0 },
      block_runtime_id: 0,
    });
  }

  selectHotbarSlot(slot: number): void {
    this.connection.queue("player_hotbar", {
      selected_slot: slot,
      window_id: 0,
    });
  }

  startEating(slot: number): void {
    const entityId = this.connection.getEntityId();
    this.connection.queue("player_action", {
      runtime_entity_id: entityId,
      action: "start_item_use_on",
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: 0,
    });
  }

  stopEating(slot: number): void {
    const entityId = this.connection.getEntityId();
    this.connection.queue("player_action", {
      runtime_entity_id: entityId,
      action: "stop_item_use_on",
      position: { x: 0, y: 0, z: 0 },
      result_position: { x: 0, y: 0, z: 0 },
      face: 0,
    });
  }

  craftRecipe(windowId: string, recipeId: string): void {
    this.connection.queue("crafting_event", {
      window_id: windowId,
      recipe_type: 1,
      recipe_id: recipeId,
      input: [],
      result: [],
    });
  }

  getPosition(): Vec3 {
    return { ...this.currentPosition };
  }
}
