import clsx from 'clsx';
import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageBubbleProps {
  role: 'assistant' | 'user';
  content: string;
  isStreaming?: boolean;
}

export function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
  const isAssistant = role === 'assistant';
  const copyTimerRef = useRef<number | null>(null);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Ignore copy failures in unsupported contexts.
    }
  };

  return (
    <div
      className={clsx('flex w-full', {
        'justify-start': isAssistant,
        'justify-end': !isAssistant
      })}
    >
      <div
        className={clsx('max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm', {
          'bg-app-bubble text-slate-900': isAssistant,
          'bg-app-accent text-white': !isAssistant
        })}
        onContextMenu={(event) => {
          event.preventDefault();
          void copyText();
        }}
        onTouchStart={() => {
          copyTimerRef.current = window.setTimeout(() => {
            void copyText();
          }, 600);
        }}
        onTouchEnd={() => {
          if (copyTimerRef.current) {
            window.clearTimeout(copyTimerRef.current);
            copyTimerRef.current = null;
          }
        }}
      >
        {isAssistant ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code(props) {
                const { children } = props;
                return <code className="rounded bg-slate-200 px-1 py-0.5">{children}</code>;
              }
            }}
          >
            {content}
          </ReactMarkdown>
        ) : (
          <span>{content}</span>
        )}
        {isStreaming ? <span className="ml-1 inline-block animate-pulse">|</span> : null}
      </div>
    </div>
  );
}
