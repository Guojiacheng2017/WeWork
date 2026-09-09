import { useLayoutEffect, useRef, useState } from 'react';

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
  useLayoutEffect(latest, [sessionKey]);
  useLayoutEffect(() => { if (follow.current && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [revision, sessionKey]);
  const onScroll = () => {
    const node = ref.current;
    if (!node) return;
    follow.current = node.scrollHeight - node.clientHeight - node.scrollTop < 64;
    setAway(!follow.current);
  };
  return { ref, onScroll, latest, away };
}
