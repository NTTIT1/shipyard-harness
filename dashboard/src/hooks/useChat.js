import { useEffect, useState } from 'react';

// SSE chat for one lane. The server replays the whole log after a 'hello', so a
// reconnect simply resets the list — no client-side dedup needed.
export function useChat(n) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState({ session_running: false, session_resumable: false, pending_kind: '' });
  useEffect(() => {
    setEvents([]);
    setStatus({ session_running: false, session_resumable: false, pending_kind: '' });
    if (n == null) return undefined;
    const es = new EventSource(`/api/lane/${n}/chat/stream`);
    es.onmessage = m => {
      const ev = JSON.parse(m.data);
      if (ev.kind === 'hello') setEvents([]);
      else if (ev.kind === 'status') setStatus(ev);
      else {
        setEvents(list => [...list, ev]);
        // A fresh ask while the tab is in the background: surface it as a system notification.
        if ((ev.kind === 'question' || ev.kind === 'permission') && document.hidden
            && 'Notification' in window && Notification.permission === 'granted'
            && Date.now() - Date.parse(ev.ts) < 60000) {
          new Notification(`Lane ${n} cần bạn trả lời`, { body: ev.kind === 'question' ? ev.questions[0]?.question : ev.tool, tag: `lane-${n}` });
        }
      }
    };
    return () => es.close();
  }, [n]);
  return { events, status };
}
