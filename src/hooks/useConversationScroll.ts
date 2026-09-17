import { useLayoutEffect, useRef, useState } from 'react';

const positions = new Map<string, { top: number; follow: boolean }>();

/** Follow new output only while the reader is at the bottom. */
export function useConversationScroll(sessionKey: string, revision: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [away, setAway] = useState(false);
  const latest = () => {
    follow.current = true;
    setAway(false);
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  };
  useLayoutEffect(() => {
    const previous = positions.get(sessionKey);
    follow.current = previous?.follow ?? true;
    setAway(!follow.current);
    if (ref.current) ref.current.scrollTop = previous && !previous.follow ? previous.top : ref.current.scrollHeight;
    const node = ref.current;
    return () => { if (node) positions.set(sessionKey, { top: node.scrollTop, follow: follow.current }); };
  }, [sessionKey]);
  useLayoutEffect(() => { if (follow.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [revision, sessionKey]);
  const onScroll = () => {
    const node = ref.current;
    if (!node) return;
    follow.current = node.scrollHeight - node.clientHeight - node.scrollTop < 64;
    positions.set(sessionKey, { top: node.scrollTop, follow: follow.current });
    setAway(!follow.current);
  };
  return { ref, onScroll, latest, away };
}
