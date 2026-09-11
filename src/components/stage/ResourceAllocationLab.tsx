import { useState } from 'react';

type Phase = 'waiting' | 'running' | 'done';
const names = ['训练模型 B', '训练模型 C'];

export function ResourceAllocationLab() {
  const [capacity, setCapacity] = useState(1);
  const [cleaned, setCleaned] = useState(false);
  const [phases, setPhases] = useState<Phase[]>(['waiting', 'waiting']);
  const [owners, setOwners] = useState(['助手 B', '助手 C']);
  const [selected, setSelected] = useState<number | null>(null);
  const used = phases.filter(p => p === 'running').length;
  const schedule = () => {
    if (!cleaned) return;
    let free = capacity - used;
    const busy = new Set(owners.filter((_, i) => phases[i] === 'running'));
    setPhases(phases.map((p, i) => {
      if (p !== 'waiting' || free <= 0 || busy.has(owners[i])) return p;
      free--; busy.add(owners[i]); return 'running';
    }));
  };
  const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
  return <section className="h-full overflow-auto bg-slate-50 p-6" aria-label="任务与资源分配实验">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-lg font-bold text-slate-900">任务与资源分配实验</h1><p className="mt-2 text-xs leading-6 text-slate-500">示例数据 · 操作仅在本页模拟，离开后重置。Harmoni 记录任务编排；资源容量和占用独立管理。</p></div><button className="rounded-lg border bg-white px-4 py-2 text-xs" onClick={() => { setCleaned(false); setPhases(['waiting', 'waiting']); setOwners(['助手 B', '助手 C']); setCapacity(1); setSelected(null); }}>重置实验</button></div>
    <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
      <div><div className="mb-3 text-xs font-semibold text-slate-500">工作 DAG · 数据 → 并行训练 → 比较结果</div>
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-slate-300 p-5">
          <article className={card}><h2 className="font-semibold">清洗数据</h2><p className="my-3 text-xs text-slate-500">助手 A · {cleaned ? '已交付' : '执行中'}</p><button disabled={cleaned} onClick={() => setCleaned(true)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white disabled:opacity-40">提交清洗数据</button></article>
          <span aria-hidden="true">→</span><div className="flex flex-col gap-4">{names.map((name, i) => <button key={name} onClick={() => setSelected(i)} className={`${card} text-left ${selected === i ? 'ring-2 ring-sky-400' : ''}`}><h2 className="font-semibold">{name}</h2><p className="mt-2 text-xs text-slate-500">{owners[i]}</p><p className="mt-3 text-xs text-sky-700">{phases[i] === 'done' ? '已交付模型和指标' : phases[i] === 'running' ? '训练中 · 占用 1 个 GPU 名额' : !cleaned ? '等待上游数据' : '待分配 · 需要助手空闲及 GPU 名额'}</p></button>)}</div>
          <span aria-hidden="true">→</span><article className={card}><h2 className="font-semibold">比较结果</h2><p className="mt-3 text-xs text-slate-500">负责人 · {phases.every(p => p === 'done') ? '输入齐备，可以开始' : '等待两个模型交付'}</p></article>
        </div>
        <div className="mb-3 mt-6 text-xs font-semibold text-slate-500">资源栏 · 独立于 Harmoni</div><div className={card}><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold">GPU 训练池</h2><p className="mt-2 text-xs text-slate-500">已用 {used} / {capacity} · {used ? names.filter((_, i) => phases[i] === 'running').join('、') : '当前空闲'}</p></div><label className="text-xs">训练名额 <select aria-label="GPU 训练名额" value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="ml-2 rounded-lg border p-2"><option disabled={used > 1} value={1}>1</option><option value={2}>2</option></select></label></div><p className="mt-4 text-xs text-slate-400">两个训练节点均连接此资源。增加名额可观察并行执行；同一助手一次承担一个训练工作。</p></div>
      </div>
      <aside className={card}><h2 className="font-semibold">分配控制</h2><p className="my-3 text-xs leading-6 text-slate-500">提交上游数据后，按 B、C 顺序匹配空闲助手和 GPU 名额。完成训练会释放占用，再次分配可启动等待工作。</p><button disabled={!cleaned} onClick={schedule} className="w-full rounded-lg bg-sky-600 p-3 text-sm text-white disabled:opacity-40">模拟自动分配</button>
        {selected !== null && <div className="mt-6 border-t pt-4"><h3 className="text-sm font-semibold">{names[selected]}</h3><label className="mt-4 block text-xs">负责人<select aria-label="实验节点负责人" disabled={phases[selected] !== 'waiting'} value={owners[selected]} onChange={e => setOwners(owners.map((o, i) => i === selected ? e.target.value : o))} className="mt-2 w-full rounded-lg border p-2"><option>助手 B</option><option>助手 C</option></select></label><p className="my-4 text-xs leading-6 text-slate-500">输入：清洗数据<br />输出：模型、评估指标<br />资源需求：1 个 GPU 名额</p><button disabled={phases[selected] !== 'running'} onClick={() => setPhases(phases.map((p, i) => i === selected ? 'done' : p))} className="w-full rounded-lg border p-2 text-xs disabled:opacity-40">完成训练并释放资源</button></div>}
      </aside>
    </div>
  </section>;
}
