import React, { useEffect, useState } from 'react';
import Modal from '../Modal.jsx';
import { registerDialogHost } from '../../lib/dialog.js';
import { tr } from '../../lib/i18n.js';

/** Renders the confirmations asked with confirmDialog(), one at a time, in the app's own dialog. */
export default function DialogHost() {
  const [queue, setQueue] = useState([]);
  useEffect(() => registerDialogHost(req => setQueue(q => [...q, req])), []);
  const cur = queue[0];
  if (!cur) return null;
  const done = ok => { cur.resolve(ok); setQueue(q => q.slice(1)); };
  return (
    <Modal key={queue.length} title={cur.title || tr('Xác nhận')} onClose={() => done(false)}
      buttons={[
        { label: cur.cancelLabel || tr('Huỷ'), fn: () => done(false) },
        { label: cur.confirmLabel || tr('Đồng ý'), cls: cur.danger ? 'warn' : 'add', fn: () => done(true) },
      ]}>
      {cur.message && <p className="m-text">{cur.message}</p>}
    </Modal>
  );
}
