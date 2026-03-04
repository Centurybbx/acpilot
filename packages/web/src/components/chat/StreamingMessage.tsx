import { MessageBubble } from './MessageBubble.js';

interface StreamingMessageProps {
  content: string;
}

export function StreamingMessage({ content }: StreamingMessageProps) {
  return <MessageBubble role="assistant" content={content} isStreaming />;
}
