import { useState, type ReactNode } from 'react';
import { ArrowLeft, Plus, Settings2 } from 'lucide-react';
import { WeWorkLogoMark } from '../employee/WeWorkLogoMark';
import { Button, IconButton, Input, Textarea, FormSelect, Field, Badge, Dialog, DialogFooter, Select, Tabs, Tooltip, ViewSwitcher } from './index';
import { ConversationComposer } from '../common/ConversationComposer';
import './showcase.css';

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return <section id={id} className="ww-kit-section"><header><h2>{title}</h2><p>{description}</p></header><div>{children}</div></section>;
}

export default function UIKitPage() {
  const [name, setName] = useState('视觉算法团队');
  const [selected, setSelected] = useState('planning');
  const [tab, setTab] = useState('members');
  const [view, setView] = useState('issues');
  const [dialog, setDialog] = useState(false);
  const [dialogName, setDialogName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [message, setMessage] = useState('');
  const options = [{ value: 'planning', label: '待规划' }, { value: 'working', label: '进行中' }, { value: 'done', label: '已完成' }];
  return <main className="ww-kit">
    <header className="ww-kit-header"><div className="ww-kit-brand"><WeWorkLogoMark size={32} /><strong>WeWork</strong><span>UIKit</span></div><a href="/" className="ww-kit-back"><ArrowLeft size={14} />返回工作平台</a></header>
    <div className="ww-kit-layout">
      <nav aria-label="组件目录" className="ww-kit-nav"><span>组件</span>{[['foundation','基础样式'],['buttons','按钮'],['fields','表单'],['selection','选择与切换'],['feedback','状态与提示'],['dialog','弹窗'],['conversation','对话输入']].map(([id,label])=><a key={id} href={`#${id}`}>{label}</a>)}</nav>
      <div className="ww-kit-content">
        <div className="ww-kit-intro"><Badge>基于现有 Wework</Badge><h1>同一套组件，同一种体验。</h1><p>这里展示页面正在使用的真实组件。点击、输入或用键盘操作，检查默认、选中、禁用与反馈状态。</p></div>
        <Section id="foundation" title="基础样式" description="沿用现有浅色工作台、深色主操作与交互色。">
          <div className="ww-kit-swatches">{[['页面','--ww-canvas'],['面板','--ww-surface'],['边框','--ww-border'],['正文','--ww-text'],['交互','--ww-accent']].map(([label,token])=><div key={token}><span style={{background:`var(${token})`}}/><strong>{label}</strong><code>{token}</code></div>)}</div>
          <p className="ww-kit-caption">控件 8px · 面板 12px · 弹窗 16px 圆角；输入高度 36px，紧凑操作 32px。</p>
        </Section>
        <Section id="buttons" title="按钮" description="按操作意图选择样式；尺寸、焦点与加载行为由组件管理。">
          <div className="ww-kit-row"><Button variant="primary" onClick={()=>setFeedback('已执行主操作')}><Plus size={14}/>新建工作项</Button><Button variant="secondary" onClick={()=>setFeedback('已执行次要操作')}>查看详情</Button><Button variant="ghost" onClick={()=>setFeedback('已取消')}>取消</Button><Button variant="danger" onClick={()=>setFeedback('这是展示页，没有删除数据')}>移除</Button><Tooltip content="打开组件设置提示"><IconButton label="组件设置" onClick={()=>setFeedback('设置按钮已点击')}><Settings2 size={16}/></IconButton></Tooltip></div>
          <div className="ww-kit-row"><Button variant="primary" disabled>不可用</Button><Button variant="primary" loading>正在保存</Button><Button variant="secondary" size="sm">紧凑按钮</Button><Button variant="secondary" size="md">标准按钮</Button></div>
          <p role="status" className="ww-kit-feedback">{feedback || '操作反馈会显示在这里。'}</p>
        </Section>
        <Section id="fields" title="表单" description="标签、说明与错误关联到同一个控件，保留原生表单能力。">
          <div className="ww-kit-grid"><Field label="团队名称" hint="可以在团队设置中修改。"><Input required value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="项目名称" error="请填写项目名称。"><Input placeholder="输入项目名称" /></Field><Field label="工作目录" hint="当前不可修改。"><Input disabled value="Documents/WeWork" readOnly/></Field><Field label="工作说明"><Textarea rows={3} placeholder="描述本次工作目标…" /></Field></div>
        </Section>
        <Section id="selection" title="选择与切换" description="项目选择器与表单下拉框共用同一套菜单，保持一致的选中与焦点样式。">
          <div className="ww-kit-grid"><div className="ww-kit-select"><span>项目状态</span><Select appearance="field" label="项目状态" value={selected} options={options} onChange={setSelected}/></div><Field label="表单状态选择"><FormSelect value={selected} onChange={e=>setSelected(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</FormSelect></Field><div className="ww-kit-select"><span>禁用选择器</span><Select appearance="field" label="禁用选择器" value="planning" options={options} disabled onChange={()=>{}}/></div></div>
          <div className="ww-kit-row"><ViewSwitcher label="项目视图展示" value={view} onChange={setView} items={[{value:'issues',label:'工作项'},{value:'board',label:'看板'},{value:'gantt',label:'甘特图'}]}/><Badge>{view === 'issues' ? '工作项' : view === 'board' ? '看板' : '甘特图'}</Badge></div>
          <Tabs label="团队页面展示" value={tab} onChange={setTab} items={[{value:'members',label:'成员职责',content:<p>在此查看团队成员和职责。使用左右方向键切换页签。</p>},{value:'chat',label:'团队群聊',content:<p>团队消息与协作记录显示在此处。</p>},{value:'disabled',label:'暂不可用',disabled:true,content:null}]}/>
        </Section>
        <Section id="feedback" title="状态与提示" description="状态由文字与颜色共同表达，提示支持鼠标与键盘。"><div className="ww-kit-row"><Badge>未开始</Badge><Badge tone="info">进行中</Badge><Badge tone="success">已完成</Badge><Badge tone="warning">等待处理</Badge><Badge tone="danger">执行失败</Badge><Tooltip content="按 Escape 可关闭这条提示"><Button variant="secondary">悬停或聚焦查看提示</Button></Tooltip></div></Section>
        <Section id="dialog" title="弹窗" description="统一标题、关闭操作、焦点约束和底部按钮。"><Button variant="secondary" onClick={()=>setDialog(true)}>打开团队弹窗</Button><Dialog open={dialog} onClose={()=>setDialog(false)} title="新建协同团队" description="此处仅演示组件，不会创建真实团队。"><form onSubmit={e=>{e.preventDefault();setDialog(false);setFeedback(`已验证表单：${dialogName} · ${new FormData(e.currentTarget).get('demo-status')}`)}}><Field label="团队名称"><Input required value={dialogName} onChange={e=>setDialogName(e.target.value)} placeholder="输入团队名称" /></Field><div className="mt-4"><Field label="初始状态"><FormSelect name="demo-status" required defaultValue=""><option value="">请选择状态</option><option value="planning">待规划</option><option value="unavailable" disabled>暂不可用</option><option value="working">进行中</option></FormSelect></Field></div><DialogFooter><Button type="button" variant="ghost" onClick={()=>setDialog(false)}>取消</Button><Button type="submit" variant="primary" disabled={!dialogName.trim()}>确认</Button></DialogFooter></form></Dialog></Section>
        <Section id="conversation" title="对话输入" description="复用助手工作台和团队群聊的输入组件，支持 Enter 发送与 Shift + Enter 换行。"><div className="ww-kit-composer"><ConversationComposer value={message} onChange={setMessage} onSubmit={()=>{setFeedback(`演示消息：${message}`);setMessage('')}} placeholder="描述要交给助手的工作…" ariaLabel="演示消息"/></div></Section>
      </div>
    </div>
  </main>;
}
