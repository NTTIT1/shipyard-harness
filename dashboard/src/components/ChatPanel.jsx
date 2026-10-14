import React, { useEffect, useRef, useState } from 'react';
import { Check, CircleHelp, ShieldQuestion, Settings, OctagonX, Send } from 'lucide-react';
import Button from './ui/Button.jsx';
import { useChat } from '../hooks/useChat.js';
import StepModels from './StepModels.jsx';
import { sendChat, answerChat, fetchProviders, saveLaneModels } from '../lib/api.js';

// Shown when the lane is blocked (typically a step failed on its provider): edit the
// feature's step models, save, and tell the session to continue.
function ChangeModels({ lane, onDone }) {
  const [info, setInfo] = useState(null);
  const [value, setValue] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchProviders().then(d => { setInfo(d); setValue({ ...d.defaults, ...(lane.models || {}) }); }).catch(e => setError(e.message));
  }, [lane.lane]);
  const save = async () => {
    setError('');
    try {
      const { impl_agents, ...models } = value;
      await saveLaneModels(lane.lane, models);
      await sendChat(lane.lane, 'continue — models for the failed step were changed on the dashboard; re-run that step');
      onDone();
    } catch (e) { setError(e.message); }
  };
  if (!info || !value) return error ? <p className="m-err">{error}</p> : null;
  return (
    <div className="chat-approve" style={{ display: 'block' }}>
      <StepModels info={info} value={value} onChange={setValue} />
      <Button variant="primary" onClick={save}>Lưu và tiếp tục</Button>
      {error && <p className="m-err">{error}</p>}
    </div>
  );
}

function QuestionForm({ ev, onAnswer }) {
  const [sel, setSel] = useState({});     // question -> label[] 
  const [other, setOther] = useState({}); // question -> text
  const toggle = (q, label) => setSel(s => {
    const cur = s[q.question] || [];
    return { ...s, [q.question]: q.multiSelect ? (cur.includes(label) ? cur.filter(x => x !== label) : [...cur, label]) : [label] };
  });
  const submit = () => {
    const answers = {};
    for (const q of ev.questions) {
      const parts = [...(sel[q.question] || [])];
      if ((other[q.question] || '').trim()) parts.push(other[q.question].trim());
      answers[q.question] = parts.join(', ');
    }
    onAnswer({ answers });
  };
  const complete = ev.questions.every(q => (sel[q.question] || []).length || (other[q.question] || '').trim());
  return (
    <div className="qform">
      {ev.questions.map(q => (
        <div key={q.question} className="qq">
          <div className="qq-t">{q.question}</div>
          {q.options.map(o => (
            <label key={o.label} className="qq-o" title={o.description || ''}>
              <input type={q.multiSelect ? 'checkbox' : 'radio'} name={q.question}
                checked={(sel[q.question] || []).includes(o.label)} onChange={() => toggle(q, o.label)} />
              {' '}{o.label}{o.description ? <span className="qq-d"> — {o.description}</span> : null}
            </label>
          ))}
          <input className="qq-x" placeholder="Khác…" value={other[q.question] || ''}
            onChange={e => setOther(s => ({ ...s, [q.question]: e.target.value }))} />
        </div>
      ))}
      <Button variant="primary" disabled={!complete} onClick={submit}>Gửi câu trả lời</Button>
    </div>
  );
}

function Event({ ev, pendingId, onAnswer }) {
  if (ev.kind === 'assistant') return <div className="ev ev-a">{ev.text}</div>;
  if (ev.kind === 'user') return <div className="ev ev-u">{ev.text}</div>;
  if (ev.kind === 'tool') return <div className="ev ev-t"><Settings size={12} strokeWidth={1.75} aria-hidden="true" /> {ev.name} <span className="ev-s">{ev.summary}</span></div>;
  if (ev.kind === 'system' || ev.kind === 'ended') return <div className="ev ev-sys">{ev.kind === 'ended' ? 'phiên đã dừng' : ev.text}</div>;
  if (ev.kind === 'result') return null;
  if (ev.kind === 'answered') return <div className="ev ev-sys">↳ đã trả lời: {ev.text}</div>;
  if (ev.kind === 'question') {
    return ev.id === pendingId
      ? <div className="ev ev-q"><CircleHelp size={14} strokeWidth={1.75} aria-hidden="true" /> Agent hỏi:<QuestionForm ev={ev} onAnswer={onAnswer} /></div>
      : <div className="ev ev-sys"><CircleHelp size={12} strokeWidth={1.75} aria-hidden="true" /> {ev.questions.map(q => q.question).join(' · ')}</div>;
  }
  if (ev.kind === 'permission') {
    return ev.id === pendingId
      ? <div className="ev ev-q"><ShieldQuestion size={14} strokeWidth={1.75} aria-hidden="true" /> Agent xin chạy <b>{ev.tool}</b>: <span className="ev-s">{ev.summary}</span>
          <div className="ev-btns"><Button variant="primary" size="sm" onClick={() => onAnswer({ allow: true })}>Cho phép</Button>
          <Button variant="danger" size="sm" onClick={() => onAnswer({ allow: false })}>Từ chối</Button></div></div>
      : <div className="ev ev-sys"><ShieldQuestion size={12} strokeWidth={1.75} aria-hidden="true" /> {ev.tool}</div>;
  }
  return null;
}

export default function ChatPanel({ lane }) {
  const n = lane.lane;
  const { events, status } = useChat(n);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [events.length]);

  const pending = [...events].reverse().find(e => (e.kind === 'question' || e.kind === 'permission'));
  const pendingId = status.pending_kind && pending ? pending.id : null;
  const act = fn => async (...a) => { setError(''); try { await fn(...a); } catch (e) { setError(e.message); } };
  const answer = act(payload => answerChat(n, pendingId, payload));
  const send = act(async t => { await sendChat(n, t); setText(''); });
  const awaitingSpec = lane.stage === 'spec-review' && lane.status === 'waiting' && status.session_running;
  const [changing, setChanging] = useState(false);
  const blocked = lane.status === 'blocked' && status.session_running;

  if (!events.length && !status.session_running && !status.session_resumable) {
    return <p className="muted-empty">Chưa có phiên chat cho lane này — bấm “Giao việc” để bắt đầu.</p>;
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {events.map((ev, i) => <Event key={`${i}-${ev.seq}`} ev={ev} pendingId={pendingId} onAnswer={answer} />)}
      </div>
      {awaitingSpec && (
        <div className="chat-approve">
          Spec/plan/tasks đã sẵn sàng{lane.spec_dir ? <> — <a href={`/spec/${n}/${lane.spec_dir}/spec.md`} target="_blank" rel="noreferrer">spec</a> · <a href={`/spec/${n}/${lane.spec_dir}/plan.md`} target="_blank" rel="noreferrer">plan</a> · <a href={`/spec/${n}/${lane.spec_dir}/tasks.md`} target="_blank" rel="noreferrer">tasks</a></> : null}
          {' '}<Button variant="primary" size="sm" icon={Check} onClick={() => send('ok')}>Duyệt</Button>
          <span className="hint">hoặc gõ yêu cầu sửa bên dưới</span>
        </div>
      )}
      {blocked && !changing && (
        <div className="chat-approve">
          <OctagonX size={14} strokeWidth={1.75} aria-hidden="true" /> {lane.notes || 'lane bị chặn'} <Button size="sm" onClick={() => setChanging(true)}>Đổi model bước này</Button>
        </div>
      )}
      {blocked && changing && <ChangeModels lane={lane} onDone={() => setChanging(false)} />}
      {status.session_running && (
        <div className="chat-input">
          <textarea rows={2} value={text} placeholder="Nhắn cho lane…" onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && text.trim()) { e.preventDefault(); send(text.trim()); } }} />
          <Button variant="primary" icon={Send} disabled={!text.trim()} onClick={() => send(text.trim())}>Gửi</Button>
        </div>
      )}
      {error && <p className="m-err">{error}</p>}
    </div>
  );
}
