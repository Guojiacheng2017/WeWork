import { useEffect, useState } from 'react';

export const reducedEffectsEnabled = () =>
  window.localStorage.getItem('wework.reduceEffects') === 'true'
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useReducedEffects() {
  const [reduced, setReduced] = useState(reducedEffectsEnabled);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(reducedEffectsEnabled());
    media.addEventListener('change', update);
    window.addEventListener('wework:effects-preference-changed', update);
    return () => { media.removeEventListener('change', update); window.removeEventListener('wework:effects-preference-changed', update); };
  }, []);
  return reduced;
}
