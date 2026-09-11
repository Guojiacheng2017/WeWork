import { createInterface } from 'node:readline';

// readline owns streaming UTF-8 decoding, CRLF and the final unterminated line.
export function readPiJsonLines(input, consume, fail) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', line => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); }
    catch (error) { fail(new Error(`Invalid Pi RPC output: ${error.message}`)); return; }
    try { consume(event); } catch (error) { fail(error); }
  });
  return () => lines.close();
}
