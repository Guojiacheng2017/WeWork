import {expect,test} from 'vitest';
import {operationErrorMessage} from './operationError';
test('bridge errors give an actionable message without declaring the operation failed',()=>{
 expect(operationErrorMessage(new Error('Unexpected end of JSON input'))).toContain('确认结果');
 expect(operationErrorMessage(new Error("Error invoking remote method 'wework-host:invoke': Error: 拒绝操作"))).toBe('拒绝操作');
 expect(operationErrorMessage(new Error('fetch failed'))).toContain('页面和数据已保留');
});
