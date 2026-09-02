export const DAG_MIN_ZOOM = 0.25;
export const DAG_MAX_ZOOM = 1.45;
export const DAG_CARD_ZOOM_THRESHOLD = 0.55;

export function clampDagZoom(zoom: number) {
  return Math.max(DAG_MIN_ZOOM, Math.min(DAG_MAX_ZOOM, zoom));
}

export function dagNodeDisplayMode(zoom: number): 'card' | 'avatar' {
  return zoom < DAG_CARD_ZOOM_THRESHOLD ? 'avatar' : 'card';
}
