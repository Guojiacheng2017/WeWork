import { expect, it } from 'vitest';
import { panForZoom } from './canvasViewport';
it('keeps the same graph point under the cursor when zoom changes', () => {
  const pan={x:70,y:-40},anchor={x:640,y:360};
  const next=panForZoom(pan,0.6,1.2,anchor);
  expect((anchor.x-next.x)/1.2).toBeCloseTo((anchor.x-pan.x)/0.6);
  expect((anchor.y-next.y)/1.2).toBeCloseTo((anchor.y-pan.y)/0.6);
});
it('zoom in and out around the same anchor returns to the original viewport', () => {
  const pan={x:-300,y:120},anchor={x:800,y:450};
  expect(panForZoom(panForZoom(pan,1,1.4,anchor),1.4,1,anchor)).toEqual(pan);
});
