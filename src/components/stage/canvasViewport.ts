export type CanvasPoint = { x: number; y: number };
export function panForZoom(pan: CanvasPoint, previousZoom: number, nextZoom: number, anchor: CanvasPoint): CanvasPoint {
  return { x: anchor.x - (anchor.x - pan.x) * nextZoom / previousZoom, y: anchor.y - (anchor.y - pan.y) * nextZoom / previousZoom };
}
