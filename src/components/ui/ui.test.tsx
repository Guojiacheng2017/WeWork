import { selectOptions } from './FormSelect';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, IconButton, Input, Field, NativeSelect, Tabs, Select } from './index';

describe('UIKit native semantics', () => {
  it('keeps native form submission attributes while blocking duplicate pending actions', () => {
    const html = renderToStaticMarkup(<Button type="submit" name="action" value="create" form="team-form" loading>创建</Button>);
    expect(html).toContain('type="submit"');
    expect(html).toContain('name="action"');
    expect(html).toContain('form="team-form"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('创建');
  });
  it('gives icon-only actions an accessible name and non-submit behavior', () => {
    const html = renderToStaticMarkup(<IconButton label="关闭设置"><span /></IconButton>);
    expect(html).toContain('aria-label="关闭设置"');
    expect(html).toContain('type="button"');
  });
  it('connects labels, existing descriptions, hints and errors without losing native validation', () => {
    const html = renderToStaticMarkup(<Field label="团队名称" hint="可修改" error="名称不能为空"><Input id="team-name" aria-describedby="external-help" required /></Field>);
    expect(html).toContain('for="team-name"');
    expect(html).toContain('aria-describedby="external-help team-name-hint team-name-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('required=""');
    expect(html).toContain('id="team-name-error"');
  });
  it('preserves values and native selects for existing controlled forms', () => {
    const html = renderToStaticMarkup(<NativeSelect name="status" value="done" onChange={()=>{}}><option value="open">待办</option><option value="done">完成</option></NativeSelect>);
    expect(html).toContain('name="status"');
    expect(html).toContain('value="done" selected=""');
  });
  it('exposes one tab stop and hides inactive panels, including disabled tabs', () => {
    const html = renderToStaticMarkup(<Tabs label="团队页签" value="a" onChange={()=>{}} items={[{value:'a',label:'成员',content:'成员内容'},{value:'b',label:'群聊',content:'群聊内容',disabled:true}]} />);
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('hidden=""');
    expect(html).toContain('disabled=""');
    const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(match=>match[1]);
    for (const id of controls) expect(html).toContain(`id="${id}" role="tabpanel"`);
  });
  it('makes empty or disabled custom selects unavailable without opening a portal', () => {
    const html = renderToStaticMarkup(<Select label="状态" value="" options={[]} onChange={()=>{}} />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-expanded="false"');
  });
});


describe('shared form select', () => {
  it('preserves values and disabled flags from mapped and grouped option children', () => {
    const options = selectOptions(<><option value="">请选择</option><optgroup label="锁定" disabled><option value={7}>不可用</option></optgroup>{['a','b'].map(value=><option key={value} value={value}>名称 {value}</option>)}</>);
    expect(options).toEqual([
      {value:'',label:'请选择',disabled:false},
      {value:'7',label:'不可用',disabled:true},
      {value:'a',label:'名称 a',disabled:false},
      {value:'b',label:'名称 b',disabled:false},
    ]);
  });
  it('puts the label and descriptions on the visible control while retaining form validation', () => {
    const html = renderToStaticMarkup(<Field label="状态" hint="选择初始状态"><NativeSelect id="status" name="status" required defaultValue=""><option value="">请选择</option><option value="done">已完成</option></NativeSelect></Field>);
    expect(html).toContain('for="status"');
    expect(html).toContain('id="status-native"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('aria-describedby="status-hint"');
    expect(html).toContain('required=""');
    expect(html).toContain('aria-haspopup="listbox"');
  });
});
