import * as THREE from "three";

export type StageMode = "topDown" | "eyeLevel";

export type EmployeeProjection = {
  x: number;
  y: number;
  size: number;
  visible: boolean;
  depth: number;
};

export const TABLE_RADIUS = 2.55;
export const TABLE_THICKNESS = 0.08;
export const EMPLOYEE_RING_RADIUS = 3.2;
export const EMPLOYEE_ANCHOR_HEIGHT = 0.72;
export const EYE_LEVEL_CAMERA_RADIUS = 7.8;
export const TOP_DOWN_CAMERA_RADIUS = 13.4;
export const CAMERA_FOV = 38;

export function getCameraPolar(mode: StageMode) {
  return mode === "topDown" ? 0.08 : 1.22;
}

export function getCameraRadius(mode: StageMode) {
  return mode === "topDown" ? TOP_DOWN_CAMERA_RADIUS : EYE_LEVEL_CAMERA_RADIUS;
}

export function getEmployeeAzimuth(index: number, count: number) {
  return count ? index / count * Math.PI * 2 : 0;
}

export function getCameraAzimuth(selectedIndex: number, count: number) {
  return getEmployeeAzimuth(selectedIndex, count) + Math.PI;
}

export function getEmployeeWorldPosition(index: number, count: number) {
  const angle = getEmployeeAzimuth(index, count);
  return new THREE.Vector3(
    Math.sin(angle) * EMPLOYEE_RING_RADIUS,
    EMPLOYEE_ANCHOR_HEIGHT,
    Math.cos(angle) * EMPLOYEE_RING_RADIUS,
  );
}

export function projectEmployeeAnchor(
  world: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): EmployeeProjection {
  const ndc = world.clone().project(camera);
  const distance = camera.position.distanceTo(world);
  const worldDiameter = 1.35;
  const size = worldDiameter * height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance);
  return {
    x: (ndc.x + 1) * width / 2,
    y: (1 - ndc.y) * height / 2,
    size,
    visible: ndc.z > -1 && ndc.z < 1 && ndc.x > -1.25 && ndc.x < 1.25 && ndc.y > -1.25 && ndc.y < 1.25,
    depth: distance,
  };
}

export function cyclicEmployeeOffset(index: number, selectedIndex: number, count: number) {
  let offset = index - selectedIndex;
  if (offset > count / 2) offset -= count;
  if (offset < -count / 2) offset += count;
  return offset;
}

export function cycleSeatIndex(currentIndex: number, count: number, delta: number) {
  if (count <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) return delta < 0 ? count - 1 : 0;
  return ((currentIndex + delta) % count + count) % count;
}

export function getEyeLevelSeatVisibility(index: number, selectedIndex: number, count: number) {
  if (count <= 1) return { visible: true, opacity: 1 };
  const angleDelta = getEmployeeAzimuth(index, count) - getEmployeeAzimuth(selectedIndex, count);
  const angle = Math.abs(Math.atan2(Math.sin(angleDelta), Math.cos(angleDelta)));

  if (angle >= Math.PI * 0.88) return { visible: false, opacity: 0 };
  if (angle > Math.PI * 0.52) return { visible: true, opacity: 0.32 };
  return { visible: true, opacity: 1 };
}
