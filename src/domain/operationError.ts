export function operationErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/Unexpected end of JSON|Unexpected token.*JSON/i.test(raw)) return '操作响应不完整，请刷新确认结果后再决定是否重试。其他功能仍可使用。';
  if (/fetch failed|Failed to fetch|ECONNREFUSED|Host unavailable/i.test(raw)) return '暂时无法连接执行服务。当前页面和数据已保留，请稍后重试。';
  return raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
}
