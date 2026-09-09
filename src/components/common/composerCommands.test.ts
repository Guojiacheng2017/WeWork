import { expect, test } from 'vitest';
import { matchComposerCommands } from './composerCommands';
const commands = [{name:'model',description:'切换模型',options:[{name:'pi:test',description:'Test model'}]},{name:'context',description:'查看上下文'}];
test('slash filters commands and model parameters without matching normal prose',()=>{
 expect(matchComposerCommands('hello /model',commands)).toBeNull();
 expect(matchComposerCommands('/',commands)?.items).toHaveLength(2);
 expect(matchComposerCommands('/mo',commands)?.items[0].name).toBe('model');
 expect(matchComposerCommands('/model ',commands)?.parent?.name).toBe('model');
 expect(matchComposerCommands('/model TEST',commands)?.items[0].name).toBe('pi:test');
 expect(matchComposerCommands('/unknown',commands)?.items).toEqual([]);
 expect(matchComposerCommands('/context unexpected',commands)?.items).toEqual([]);
});
