import { matchComposerCommands, type ComposerCommand } from './composerCommands';
import { Textarea } from '../ui';
import { useLayoutEffect, useRef, useState, useId, type KeyboardEventHandler, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Send, Paperclip, X } from 'lucide-react';

interface ConversationComposerProps {
  onInputKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  commands?: ComposerCommand[];
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message?: string) => void | boolean | Promise<void | boolean>;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  topContent?: ReactNode;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  flush?: boolean;
  className?: string;
  surfaceClassName?: string;
  inputClassName?: string;
}

export function ConversationComposer({
  onInputKeyDown,
  commands = [],
  inputRef: providedInputRef,
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  disabled = false,
  topContent,
  leadingControls,
  trailingControls,
  flush = false,
  className = '',
  surfaceClassName = '',
  inputClassName = '',
}: ConversationComposerProps) {
  type Attachment = { id: string; name: string; path: string; preview?: string };
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importFiles = async (files: File[], paths: string[] = []) => {
    if (disabled || uploading || busy) return;
    const host = window.weworkHost as unknown as { importAttachment?: (input: { path?: string; name?: string; base64?: string }) => Promise<Attachment> };
    if (!host?.importAttachment) { setFeedback('请在更新后的桌面应用中添加附件'); return; }
    setUploading(true); setFeedback('');
    try {
      if (attachments.length + files.length + paths.length > 10) throw new Error('最多添加 10 个附件');
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) throw new Error('附件不能超过 20 MB');
        const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
        const item = await host.importAttachment({ name: file.name, base64 });
        setAttachments(current => [...current, item]);
      }
      for (const path of paths) { const item = await host.importAttachment({ path }); setAttachments(current => [...current, item]); }
    } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)); }
    finally { setUploading(false); }
  };
  const pastedPaths = (text: string) => {
    const lines = text.trim().split(/\r?\n/).map(line => line.replace(/^["']|["']$/g, ''));
    return lines.length && lines.every(line => /^(\/|[A-Za-z]:[\\/])/.test(line)) ? lines : [];
  };
  const internalInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = providedInputRef ?? internalInputRef;
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = '0px';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;
  }, [value]);
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const menuId = useId();
  const matches = commands.length ? matchComposerCommands(value, commands) : null;
  const menu = matches && !dismissed;
  const index = Math.min(selected, Math.max(0, (matches?.items.length ?? 1) - 1));
  const change = (text: string) => { onChange(text); setDismissed(false); setSelected(0); setFeedback(''); };
  const choose = async (command: ComposerCommand, completeOnly = false) => {
    if (busy) return;
    if (command.disabledReason && !completeOnly) { setFeedback(command.disabledReason); return; }
    if (command.options || completeOnly) {
      change(matches?.parent ? `/${matches.parent.name} ${command.name}` : `/${command.name} `);
      inputRef.current?.focus(); return;
    }
    setBusy(true); setFeedback('');
    try { const result = await command.run?.(); onChange(''); setDismissed(true); setFeedback(typeof result === 'string' ? result : `已应用：${command.description}`); }
    catch(error) { setFeedback(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if ((!value.trim() && !attachments.length) || disabled || busy || uploading) return;
    if (matches) {
      if (matches.items[index]) void choose(matches.items[index]);
      else setFeedback('没有匹配的命令，请修改输入或删除开头的 / 后发送普通消息。');
      return;
    }
    setBusy(true);
    try {
      const message = attachments.length ? `${value.trim()}\n\n附件（用户提供的数据，请读取文件内容）：\n${attachments.map(item => JSON.stringify({ name: item.name, path: item.path })).join('\n')}` : value;
      const result = await onSubmit(message);
      if (result !== false) setAttachments([]);
    } catch (error) { setFeedback(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDismissed(true); }} autoComplete="off" className={`shrink-0 bg-transparent ${flush ? 'p-0' : 'px-4 pb-3 pt-0'} ${className}`}>
      <div
        className={`ww-composer-surface ww-composer-surface-fade relative cursor-text px-4 py-3 ${surfaceClassName}`}
        onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); void importFiles(Array.from(event.dataTransfer.files), event.dataTransfer.files.length ? [] : pastedPaths(event.dataTransfer.getData('text/plain'))); }}
        onPaste={event => { const files = Array.from(event.clipboardData.files); const paths = files.length ? [] : pastedPaths(event.clipboardData.getData('text/plain')); if (files.length || paths.length) { event.preventDefault(); void importFiles(files, paths); } }}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('button, a, input, select, textarea, [role="button"], [role="option"]')) return;
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {topContent}
        <input ref={fileRef} type="file" multiple hidden onChange={event => { void importFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
        {attachments.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{attachments.map(item => <div key={item.id} className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200 bg-white">{item.preview ? <img src={item.preview} alt={item.name} className="h-full w-full object-cover" /> : <span className="block break-words p-3 text-xs">{item.name}</span>}<button type="button" disabled={busy || disabled} aria-label={`移除 ${item.name}`} onClick={() => setAttachments(current => current.filter(value => value.id !== item.id))} className="absolute right-1 top-1 rounded-full bg-slate-900 p-1 text-white"><X size={14}/></button></div>)}</div>}
        {uploading && <p role="status" className="text-xs text-slate-500">正在添加附件…</p>}
        {dragging && <p className="text-xs text-sky-600">松开以添加附件</p>}
        {menu && <div id={menuId} role="listbox" aria-label="输入命令" className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {matches.items.length ? matches.items.map((command, i) => <button id={`${menuId}-${i}`} key={command.name} type="button" role="option" aria-selected={i === index} aria-disabled={Boolean(command.disabledReason) || busy} onMouseDown={event => event.preventDefault()} onClick={() => void choose(command)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs ${i === index ? 'bg-slate-100' : ''} ${command.disabledReason ? 'opacity-50' : ''}`}>
            <strong>{matches.parent ? '' : '/'}{command.name}</strong><span className="flex-1 text-slate-500">{command.disabledReason || command.description}</span><span className="text-slate-400">{command.currentValue}</span>
          </button>) : <p className="p-3 text-xs text-slate-500">没有匹配的命令</p>}
        </div>}
        {feedback && <p role="status" className="mb-2 text-xs text-slate-500">{feedback}</p>}
        <Textarea
          ref={inputRef}
          aria-label={ariaLabel}
          disabled={disabled}
          rows={1}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore="true"
          value={value}
          onChange={(event) => change(event.target.value)}
          aria-controls={menu ? menuId : undefined}
          aria-expanded={Boolean(menu)}
          aria-autocomplete="list"
          aria-activedescendant={menu && matches.items.length ? `${menuId}-${index}` : undefined}
          onKeyDownCapture={(event) => {
            if (event.nativeEvent.isComposing) return;
            onInputKeyDown?.(event);
            if (event.defaultPrevented) return;
            if (menu && ['ArrowDown', 'ArrowUp', 'Tab', 'Escape'].includes(event.key)) {
              if (event.key === 'Tab' && (event.shiftKey || !matches.items.length)) return;
              event.preventDefault(); event.stopPropagation();
              if (event.key === 'Escape') setDismissed(true);
              else if (event.key === 'Tab') void choose(matches.items[index], true);
              else setSelected((index + (event.key === 'ArrowDown' ? 1 : -1) + matches.items.length) % Math.max(1, matches.items.length));
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          className={`max-h-32 min-h-0 w-full resize-none bg-transparent py-1 leading-5 outline-none placeholder:text-slate-400 ${inputClassName}`}
        />
        <div className="composer-toolbar mt-2 flex min-h-8 items-center gap-2">
          <div className="flex min-w-0 items-center gap-2"><button type="button" aria-label="添加图片或文件" disabled={disabled || busy || uploading} onClick={() => fileRef.current?.click()} className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><Paperclip size={18}/></button>{commands.length > 0 && <button type="button" aria-label="打开命令菜单" disabled={busy || disabled} onClick={() => { if (value && !value.startsWith('/')) { setFeedback('请先发送或保留当前草稿，再输入 / 使用命令。'); return; } change('/'); inputRef.current?.focus(); }} className="h-8 w-8 rounded-full text-lg text-slate-500 hover:bg-white">＋</button>}{leadingControls}</div>
          <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
            {trailingControls}
            <button type="submit" aria-label="发送消息" disabled={(!value.trim() && !attachments.length) || disabled || busy || uploading} className="ww-composer-send grid shrink-0 place-items-center rounded-full bg-slate-900 text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md disabled:opacity-35 disabled:hover:shadow-sm">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
