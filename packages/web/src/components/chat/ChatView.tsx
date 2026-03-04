import { useEffect, useMemo, useRef, useState } from 'react';
import { PermissionCard } from '../permission/PermissionCard.js';
import { useConnectionStore } from '../../stores/connection.js';
import { useSessionStore } from '../../stores/session.js';
import { MessageBubble } from './MessageBubble.js';
import { ToolCallCard } from './ToolCallCard.js';

export function ChatView() {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const allMessages = useSessionStore((state) => state.messages);
  const respondPermission = useSessionStore((state) => state.respondPermission);
  const socket = useConnectionStore((state) => state.socket);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const messages = useMemo(() => {
    if (!currentSessionId) {
      return [];
    }
    return allMessages.get(currentSessionId) ?? [];
  }, [allMessages, currentSessionId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (autoFollow) {
      container.scrollTop = container.scrollHeight;
      setUnreadCount(0);
      return;
    }
    setUnreadCount((count) => count + 1);
  }, [autoFollow, messages.length]);

  if (!currentSessionId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
        Start a session to chat with ACpilot.
      </div>
    );
  }

  return (
    <div className="relative flex-1">
      <div
        ref={containerRef}
        className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-3"
        onScroll={(event) => {
          const target = event.currentTarget;
          const nearBottom =
            target.scrollHeight - target.scrollTop - target.clientHeight < 40;
          setAutoFollow(nearBottom);
          if (nearBottom) {
            setUnreadCount(0);
          }
        }}
      >
      {messages.map((message) => {
        if (message.role === 'permission') {
          return (
            <PermissionCard
              key={message.id}
              request={message.request}
              response={message.response}
              onRespond={(approved) => {
                respondPermission(message.request.id, approved);
                if (socket && socket.readyState === WebSocket.OPEN && currentSessionId) {
                  socket.send(
                    JSON.stringify({
                      type: 'permission:response',
                      sessionId: currentSessionId,
                      requestId: message.request.id,
                      approved
                    })
                  );
                }
              }}
            />
          );
        }

        return (
          <div key={message.id}>
            <MessageBubble
              role={message.role}
              content={message.content}
              isStreaming={message.isStreaming}
            />
            {message.role === 'assistant' && message.toolCalls?.length
              ? message.toolCalls.map((toolCall, index) => (
                  <ToolCallCard
                    key={`${message.id}-tool-${index}`}
                    toolCall={toolCall}
                  />
                ))
              : null}
          </div>
        );
      })}
      </div>
      {!autoFollow && unreadCount > 0 ? (
        <button
          type="button"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-app-accent px-3 py-1 text-xs text-white shadow"
          onClick={() => {
            const container = containerRef.current;
            if (!container) {
              return;
            }
            container.scrollTop = container.scrollHeight;
            setAutoFollow(true);
            setUnreadCount(0);
          }}
        >
          ↓ New messages
        </button>
      ) : null}
    </div>
  );
}
