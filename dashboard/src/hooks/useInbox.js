import { useCallback, useEffect, useRef, useState } from 'react';
import { platform } from '../lib/platform.js';
import { STEP_LABEL } from '../lib/review.js';

// Gates waiting for the signed-in user; polls every 10 s and notifies on new ones.
export function useInbox() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const seen = useRef(null);
  const refresh = useCallback(async () => {
    try {
      const list = await platform.inbox();
      setItems(list);
      setError('');
      const ids = new Set(list.map(i => i.approvalId));
      if (seen.current) {
        const fresh = list.filter(i => !seen.current.has(i.approvalId));
        if (fresh.length && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification('Có bước cần bạn duyệt', { body: fresh.map(i => `${STEP_LABEL[i.step]} — ${i.runTitle}`).join('\n'), tag: 'shipyard-inbox' });
        }
      }
      seen.current = ids;
    } catch (e) {
      setError(e.status === 503 ? 'Không kết nối được Shipyard Platform' : e.message);
    }
  }, []);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10000);
    return () => clearInterval(id);
  }, [refresh]);
  return { items, error, refresh };
}
