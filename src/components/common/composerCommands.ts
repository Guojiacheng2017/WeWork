export type ComposerCommand = {
  name: string;
  description: string;
  currentValue?: string;
  disabledReason?: string;
  run?: () => void | string | Promise<void | string>;
  options?: ComposerCommand[];
};
export function matchComposerCommands(value: string, commands: ComposerCommand[]) {
  const match = /^\/([^\s]*)(?:\s+(.*))?$/.exec(value);
  if (!match) return null;
  const parent = commands.find(command => command.name === match[1]);
  if (match[2] !== undefined && parent?.options) {
    return { parent, items: parent.options.filter(item => `${item.name} ${item.description}`.toLowerCase().includes(match[2].toLowerCase())) };
  }
  if (match[2]?.trim()) return { items: [] as ComposerCommand[] };
  return { items: commands.filter(command => `${command.name} ${command.description}`.toLowerCase().includes(match[1].toLowerCase())) };
}
