import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { CHECKS, MERGE, MERGE_METHOD, QC_ON_FAIL, pipelineProblem, pipelineSteps } from '../../lib/pipeline.js';

/**
 * The lane pipeline after the code is written: checks before the PR, PR + merge, after the merge.
 * `value` is a full pipeline (see lib/pipeline.js); the caller saves it — as the project's default or
 * as one lane's override. `baseHint` is the integration branch shown when no PR target is set.
 */
export default function PipelineEditor({ value, onChange, disabled = false, baseHint = 'nhánh tích hợp', idPrefix = 'pl' }) {
  const set = patch => onChange({ ...value, ...patch });
  const id = k => `${idPrefix}-${k}`;
  const pr = value.openPr !== false;
  const problem = pipelineProblem(value);
  const check = (k, label, desc, on = value[k] !== false, extra = {}) => (
    <label className={`pl-check${on ? ' on' : ''}`} key={k}>
      <input type="checkbox" checked={on} disabled={disabled || extra.disabled} onChange={e => set({ [k]: e.target.checked })} />
      <span><b>{label}</b>{desc && <small>{desc}</small>}</span>
    </label>
  );
  return (
    <div className="pl">
      <fieldset className="wfi-group">
        <legend>Kiểm tra trước khi mở PR</legend>
        <div className="pl-checks">{CHECKS.map(c => check(c.id, c.label, c.desc))}</div>
        <p className="wfi-hint">Bước tắt sẽ được bỏ qua (ghi rõ trong báo cáo), không giả là đã chạy. Kiểm định GO/NO-GO tắt thì chỉ mở PR khi mọi bước còn bật đều xanh.</p>
      </fieldset>

      <fieldset className="wfi-group">
        <legend>PR &amp; merge</legend>
        {check('openPr', 'Mở pull request', 'Tắt: không PR, không kiểm tra sau merge — chọn bên dưới lane làm gì với code.', pr)}
        {!pr && check('localMerge', 'Gộp trên máy và chạy app (demo)',
          'Lane gộp tính năng vào nhánh tích hợp ngay trên máy (không đẩy lên GitHub/GitLab), rồi chạy lại app của lane với mọi tính năng đã làm. Tắt: chỉ đẩy nhánh tính năng rồi dừng.',
          !!value.localMerge)}
        {pr && (
          <>
            <div className="wfi-row">
              <label className="wfi-field" htmlFor={id('base')}>Nhánh nhận PR
                <input id={id('base')} className="mono" value={value.prBase || ''} maxLength={100} disabled={disabled}
                  placeholder={baseHint} onChange={e => set({ prBase: e.target.value })} />
              </label>
              <span className="wfi-hint pl-inline-hint">Để trống = {baseHint}. Nhánh tính năng cũng được cắt từ nhánh này.</span>
            </div>
            <div className="wf-mode" role="radiogroup" aria-label="Ai merge PR">
              {MERGE.map(m => (
                <label key={m.id} className={value.merge === m.id ? 'on' : ''}>
                  <input type="radio" name={id('merge')} checked={value.merge === m.id} disabled={disabled} onChange={() => set({ merge: m.id })} />
                  {m.label}
                </label>
              ))}
            </div>
            {value.merge === 'AUTO' && (
              <>
                <div className="wfi-row">
                  <label className="wfi-field" htmlFor={id('method')}>Cách merge
                    <select id={id('method')} className="msel" value={value.mergeMethod || 'SQUASH'} disabled={disabled} onChange={e => set({ mergeMethod: e.target.value })}>
                      {MERGE_METHOD.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  </label>
                </div>
                <p className="pl-warn"><AlertTriangle size={14} aria-hidden="true" /> Lane tự merge chỉ khi CI của PR xanh, PR merge được, không còn góp ý cần sửa và kiểm định là GO. Code vào {value.prBase || baseHint} mà không ai bấm duyệt — hợp với dự án nội bộ/thử nghiệm. Nhánh có bảo vệ chặn thì lane vẫn chờ người.</p>
              </>
            )}
          </>
        )}
      </fieldset>

      {pr && (
        <fieldset className="wfi-group">
          <legend>Sau khi merge</legend>
          {check('deployWait', 'Chờ deploy xong', 'Chờ trạng thái CI (commit status) báo deploy thành công trước khi kiểm tra.', !!value.deployWait)}
          {value.deployWait && (
            <div className="wfi-row">
              <label className="wfi-field" htmlFor={id('ctx')}>Tên trạng thái CI
                <input id={id('ctx')} className="mono" value={value.deployContext || ''} maxLength={100} disabled={disabled}
                  placeholder="vd deploy-dev" onChange={e => set({ deployContext: e.target.value })} />
              </label>
              <label className="wfi-field" htmlFor={id('wait')}>Chờ tối đa (phút)
                <input id={id('wait')} type="number" min="1" max="240" inputMode="numeric" value={value.deployTimeoutMinutes ?? 30} disabled={disabled}
                  onChange={e => set({ deployTimeoutMinutes: e.target.value === '' ? '' : Number(e.target.value) })} />
              </label>
            </div>
          )}
          {check('testQc', 'QC trên môi trường test', 'AI dùng thử tính năng trên bản đã deploy, chụp ảnh bằng chứng.', !!value.testQc)}
          {value.testQc && (
            <>
              <div className="wfi-row">
                <label className="wfi-field" htmlFor={id('url')}>Địa chỉ môi trường test
                  <input id={id('url')} className="mono" value={value.testUrl || ''} maxLength={300} disabled={disabled}
                    placeholder="http://192.168.56.10" onChange={e => set({ testUrl: e.target.value })} />
                </label>
                <label className="wfi-field" htmlFor={id('fail')}>QC đỏ thì
                  <select id={id('fail')} className="msel" value={value.testQcOnFail || 'FIX_PR'} disabled={disabled} onChange={e => set({ testQcOnFail: e.target.value })}>
                    {QC_ON_FAIL.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </label>
              </div>
              <p className="wfi-hint">AI đăng nhập bằng tài khoản QC của từng lane (nút 🔑 trên thẻ lane); tài khoản đó phải có trên môi trường test.</p>
            </>
          )}
          {check('ticket', 'Tạo ticket', 'Tạo/cập nhật ticket khi mở PR — cần tracker đã cấu hình trong profile của dự án.', !!value.ticket)}
        </fieldset>
      )}

      {problem ? <p className="m-err" role="alert">{problem}</p>
        : <p className="pl-summary" aria-label="Tóm tắt quy trình">{pipelineSteps(value).join(' → ')}</p>}
    </div>
  );
}
