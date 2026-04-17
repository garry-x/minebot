declare module 'vec3' {
  export class Vec3 {
    x: number;
    y: number;
    z: number;

    constructor(x: number, y: number, z: number);

    static fromPitchYaw(pitch: number, yaw: number): Vec3;
    static fromNotchianPitchYaw(pitch: number, yaw: number): Vec3;

    plus(v: Vec3 | { x: number; y: number; z: number }): Vec3;
    minus(v: Vec3 | { x: number; y: number; z: number }): Vec3;
    times(scalar: number): Vec3;
    dividedBy(scalar: number): Vec3;

    floor(): Vec3;
    ceil(): Vec3;
    round(): Vec3;
    abs(): Vec3;

    length(): number;
    lengthSquared(): number;
    distanceTo(v: Vec3): number;
    distanceSquared(v: Vec3): number;
    dot(v: Vec3): number;
    cross(v: Vec3): Vec3;
    normalize(): Vec3;

    toString(): string;
    toArray(): [number, number, number];
    equals(v: Vec3): boolean;

    clone(): Vec3;

    min(v: Vec3): Vec3;
    max(v: Vec3): Vec3;

    offset(x: number, y: number, z: number): Vec3;
  }

  export function isVec3(v: any): v is Vec3;
}