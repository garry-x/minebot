import type { Connection } from "../connection/connection.js";
import type { Vec3 } from "../utils/vec3.js";

export class Movement {
  private connection: Connection;
  private isSneaking = false;
  private isSprinting = false;
  private currentPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private currentYaw = 0;
  private currentPitch = 0;
  private moveX = 0;
  private moveY = 0;
  private tick = 0;
  private pendingAttack: { runtimeId: bigint; pos?: { x: number; y: number; z: number } } | null = null;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  updateServerPosition(x: number, y: number, z: number): void {
    this.currentPosition = { x, y, z };
  }

  setPosition(x: number, y: number, z: number): void {
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return;
    if (Math.abs(x) > 30000000 || Math.abs(z) > 30000000) return;

    const dx = x - this.currentPosition.x;
    const dz = z - this.currentPosition.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.05) {
      this.moveX = 0;
      this.moveY = 0;
    } else {
      this.moveX = (dx / dist);
      this.moveY = (dz / dist);
    }

    this.currentPosition = { x: this.currentPosition.x + this.moveX * 0.26, y, z: this.currentPosition.z + this.moveY * 0.26 };
  }

  setRotation(yaw: number, pitch: number): void {
    this.currentYaw = ((yaw % 360) + 360) % 360;
    this.currentPitch = Math.max(-90, Math.min(90, pitch));
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

  attack(targetRuntimeId: bigint, targetPos?: { x: number; y: number; z: number }): void {
    this.pendingAttack = { runtimeId: targetRuntimeId, pos: targetPos };
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

  clickBlock(blockPos: Vec3, face: number, slot: number): void {
    const entityId = this.connection.getEntityId();
    this.connection.queue("player_auth_input", {
      runtime_entity_id: entityId,
      motion: { x: 0, y: 0, z: 0 },
      input_data: 0x02,
      tick: BigInt(0),
      transaction: {
        data: {
          action_type: 0,
          block_position: { x: blockPos.x, y: blockPos.y, z: blockPos.z },
          face: face,
          hotbar_slot: slot,
          held_item: { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 },
          player_pos: this.currentPosition,
          click_pos: { x: 0, y: 0, z: 0 },
          block_runtime_id: 0,
        },
      },
    });
  }

  clickItem(slot: number): void {
    const entityId = this.connection.getEntityId();
    this.connection.queue("player_auth_input", {
      runtime_entity_id: entityId,
      motion: { x: 0, y: 0, z: 0 },
      input_data: 0x02,
      tick: BigInt(0),
      transaction: {
        data: {
          action_type: 1,
          block_position: { x: 0, y: 0, z: 0 },
          face: 0,
          hotbar_slot: slot,
          held_item: { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 },
          player_pos: this.currentPosition,
          click_pos: { x: 0, y: 0, z: 0 },
          block_runtime_id: 0,
        },
      },
    });
  }

  swapSlots(fromSlot: number, toSlot: number): void {
    this.connection.queue("inventory_transaction", {
      transaction: {
        legacy: {
          legacy_request_id: 0,
        },
        transaction_type: "normal",
        actions: [
          { source_type: "container", inventory_id: 0, slot: fromSlot, old_item: { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 }, new_item: { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 } },
          { source_type: "container", inventory_id: 0, slot: toSlot, old_item: { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 }, new_item: { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 } },
        ],
      },
    });
  }

  openBlock(blockPos: Vec3): void {
    this.connection.queue("player_action", {
      runtime_entity_id: this.connection.getEntityId(),
      action: "interact_block",
      position: { x: blockPos.x, y: blockPos.y, z: blockPos.z },
      result_position: { x: blockPos.x, y: blockPos.y, z: blockPos.z },
      face: 0,
    });
  }

  flush(): void {
    this.tick++;

    const hasAttack = this.pendingAttack !== null;
    const attackData = this.pendingAttack;

    let clickPos = { x: 0, y: 0, z: 0 };
    if (attackData?.pos) {
      const dx = attackData.pos.x - this.currentPosition.x;
      const dy = (attackData.pos.y + 1.5) - (this.currentPosition.y + 1.6);
      const dz = attackData.pos.z - this.currentPosition.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 0.001) {
        clickPos = { x: dx / len, y: dy / len, z: dz / len };
      }
    }

    this.pendingAttack = null;

    const params: Record<string, unknown> = {
      pitch: this.currentPitch,
      yaw: this.currentYaw,
      position: this.currentPosition,
      move_vector: { x: this.moveX, z: this.moveY },
      head_yaw: this.currentYaw,
      input_data: {
        ascend: false,
        descend: false,
        north_jump: false,
        jump_down: false,
        sprint_down: false,
        change_height: false,
        jumping: false,
        auto_jumping_in_water: false,
        sneaking: this.isSneaking,
        sneak_down: false,
        up: this.moveY > 0,
        down: this.moveY < 0,
        left: this.moveX < 0,
        right: this.moveX > 0,
        up_left: false,
        up_right: false,
        want_up: false,
        want_down: false,
        want_down_slow: false,
        want_up_slow: false,
        sprinting: this.isSprinting,
        ascend_block: false,
        descend_block: false,
        sneak_toggle_down: false,
        persist_sneak: false,
        start_sprinting: false,
        stop_sprinting: false,
        start_sneaking: false,
        stop_sneaking: false,
        start_swimming: false,
        stop_swimming: false,
        start_jumping: false,
        start_gliding: false,
        stop_gliding: false,
        item_interact: false,
        block_action: false,
        item_stack_request: false,
        handled_teleport: false,
        emoting: false,
        missed_swing: hasAttack,
        start_crawling: false,
        stop_crawling: false,
        start_flying: false,
        stop_flying: false,
        received_server_data: false,
        client_predicted_vehicle: false,
        paddling_left: false,
        paddling_right: false,
        block_breaking_delay_enabled: false,
        horizontal_collision: false,
        vertical_collision: false,
        down_left: false,
        down_right: false,
        start_using_item: false,
        camera_relative_movement_enabled: false,
        rot_controlled_by_move_direction: false,
        start_spin_attack: false,
        stop_spin_attack: false,
        hotbar_only_touch: false,
        jump_released_raw: false,
        jump_pressed_raw: false,
        jump_current_raw: false,
        sneak_released_raw: false,
        sneak_pressed_raw: false,
        sneak_current_raw: false,
      },
      input_mode: "mouse",
      play_mode: "normal",
      interaction_model: "crosshair",
      interact_rotation: { x: 0, z: 0 },
      tick: BigInt(this.tick),
      delta: { x: 0, y: 0, z: 0 },
      analogue_move_vector: { x: this.moveX, z: this.moveY },
      camera_orientation: { x: 0, y: 0, z: 0 },
      raw_move_vector: { x: this.moveX, z: this.moveY },
    };

    if (hasAttack && attackData) {
      this.connection.write("interact", {
        action_id: "mouse_over_entity",
        target_entity_id: attackData.runtimeId,
        has_position: false,
      });
      this.connection.write("animate", {
        action_id: "swing_arm",
        runtime_entity_id: this.connection.getEntityId(),
        data: 0,
        has_swing_source: false,
      });
      this.connection.write("inventory_transaction", {
        transaction: {
          legacy: { legacy_request_id: 0 },
          transaction_type: "item_use_on_entity",
          actions: [],
          transaction_data: {
            entity_runtime_id: attackData.runtimeId,
            action_type: "attack",
            hotbar_slot: 0,
            held_item: { network_id: 0 },
            player_pos: this.currentPosition,
            click_pos: clickPos,
          },
        },
      });
    }

    this.connection.write("player_auth_input", params);
  }

  getPosition(): Vec3 {
    return { ...this.currentPosition };
  }
}
