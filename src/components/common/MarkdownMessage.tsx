import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownMessage({ children, inverted = false }: { children: string; inverted?: boolean }) {
  return <div className="min-w-0 overflow-hidden break-words text-xs leading-6">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h1>,
      h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-bold first:mt-0">{children}</h2>,
      h3: ({ children }) => <h3 className="mb-1.5 mt-3 text-xs font-bold first:mt-0">{children}</h3>,
      p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
      ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
      blockquote: ({ children }) => <blockquote className={`my-2 border-l-2 pl-3 ${inverted ? 'border-slate-500 text-slate-300' : 'border-slate-300 text-slate-600'}`}>{children}</blockquote>,
      a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{children}</a>,
      code: ({ children, className }) => className ? <code className="block overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-100">{children}</code> : <code className={`rounded px-1 py-0.5 font-mono text-[11px] ${inverted ? 'bg-slate-700' : 'bg-slate-100'}`}>{children}</code>,
      pre: ({ children }) => <pre className="my-2 max-w-full overflow-x-auto">{children}</pre>,
      table: ({ children }) => <span className="my-2 block max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-[11px]">{children}</table></span>,
      th: ({ children }) => <th className="border border-slate-300 bg-slate-100 px-2 py-1 font-semibold text-slate-700">{children}</th>,
      td: ({ children }) => <td className="border border-slate-200 px-2 py-1 align-top">{children}</td>,
      hr: () => <hr className={`my-3 ${inverted ? 'border-slate-700' : 'border-slate-200'}`} />,
      input: (props) => <input {...props} disabled className="mr-1 align-middle accent-sky-600" />,
    }}>{children}</ReactMarkdown>
  </div>;
}
