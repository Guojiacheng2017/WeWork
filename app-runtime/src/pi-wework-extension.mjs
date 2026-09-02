const definitions = JSON.parse(Buffer.from(process.env.WEWORK_PI_TOOL_DEFINITIONS || 'W10=', 'base64').toString());
export default function weworkPiExtension(pi) {
  for (const definition of definitions) pi.registerTool({ ...definition, async execute(callId, args, signal) {
    const response = await fetch(process.env.WEWORK_PI_TOOL_URL, { method: 'POST', signal, headers: { authorization: `Bearer ${process.env.WEWORK_PI_TOOL_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: definition.name, callId, arguments: args }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'WeWork tool failed'); return result;
  } });
}
