import { describe, expect, it } from 'vitest';
import { performancePages, portalPageMeta, servicePages } from './portalNavigation';

describe('WeWork导航', () => {
  it('提供两类团队绩效考核页面', () => {
    expect(performancePages.map((item) => item.label)).toEqual(['业务绩效', '个人绩效']);
  });

  it('按指定顺序提供五个服务受理阶段', () => {
    expect(servicePages.map((item) => item.label)).toEqual(['业务分解', '任务匹配', '任务执行', '任务监控', '任务反馈']);
    expect(servicePages.map((item) => portalPageMeta[item.id].step)).toEqual([1, 2, 3, 4, 5]);
  });
});
