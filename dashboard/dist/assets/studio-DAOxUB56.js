import{c as x,r as p,j as e,t as a,aD as w,W as j}from"./index-DecGarGf.js";/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f={name:"monitor",size:24,node:[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]]};f.node;const y=x(f);/**
 * @license lucide-react v1.48.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const b={name:"smartphone",size:24,node:[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]]};b.node;const k=x(b);function M({advice:s}){var i;const o=j.find(t=>t.id===s.workflow);return e.jsxs("div",{className:"wz-advice st-advice",children:[e.jsx("p",{className:"wz-advice-summary",children:s.summary}),e.jsxs("div",{className:"wz-review-pills",children:[e.jsx("span",{className:"wz-pill",children:s.kind==="fullstack"?`backend/ ${s.stack}`:s.stack}),s.frontend&&e.jsxs("span",{className:"wz-pill",children:["frontend/ ",s.frontend.stack]}),((i=s.options)==null?void 0:i.db)&&s.options.db!=="none"&&e.jsx("span",{className:"wz-pill",children:s.options.db}),o&&e.jsx("span",{className:"wz-pill",children:a("Quy trình: {0}",[o.label])}),e.jsx("span",{className:"wz-pill",children:s.hasUi?a("Có thiết kế giao diện"):a("Không cần thiết kế giao diện")})]}),[[a("Vì sao"),s.reasons],[a("Với quy mô này"),s.scale],[a("Cần làm rõ"),s.risks]].filter(([,t])=>t==null?void 0:t.length).map(([t,r])=>e.jsxs("div",{className:"wz-advice-sec",children:[e.jsx("b",{children:t}),e.jsx("ul",{children:r.map((l,c)=>e.jsx("li",{children:l},c))})]},t))]})}function N(s,o){if(!o||!Array.isArray(s)||s.length===0)return-1;const i=o.trim().split("#")[0].split("?")[0];if(!i)return-1;const t=i.replace(/^\.?\//,"").replace(/\.html$/,"").toLowerCase();let r=s.findIndex(c=>{const n=(c.name||"").toLowerCase();return n===i.toLowerCase()||n===`${t}.html`||n===t});if(r!==-1)return r;const l=t.replace(/^\d+-/,"");return l&&(r=s.findIndex(c=>{const n=(c.name||"").replace(/^\.?\//,"").replace(/\.html$/,"").toLowerCase();return n.replace(/^\d+-/,"")===l||n&&n.includes(l)})),r}const u=`
<script>
(function() {
  document.addEventListener('submit', function(e) {
    e.preventDefault();
  }, true);

  document.addEventListener('click', function(e) {
    var link = e.target.closest('a');
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href === '#' || href.startsWith('javascript:')) {
      e.preventDefault();
      return;
    }

    // In-page anchor navigation (e.g. #huy-order, #order)
    if (href.startsWith('#')) {
      e.preventDefault();
      try {
        var el = document.querySelector(href);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.transition = 'outline 0.25s ease, box-shadow 0.25s ease';
          el.style.outline = '2px solid #0071e3';
          el.style.boxShadow = '0 0 0 4px rgba(0, 113, 227, 0.15)';
          setTimeout(function() {
            el.style.outline = '';
            el.style.boxShadow = '';
          }, 1600);
        }
      } catch (err) {}
      return;
    }

    // External links open in new tab
    if (/^https?:\\/\\//i.test(href)) {
      e.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }

    // Prototype screen navigation (e.g. 04-thanh-toan.html)
    e.preventDefault();
    window.parent.postMessage({
      type: 'SHIPYARD_NAVIGATE_MOCKUP',
      href: href
    }, '*');
  }, true);
})();
<\/script>
`;function g(s){return s?s.includes("</body>")?s.replace("</body>",`${u}</body>`):s+u:""}function C({mockups:s}){const[o,i]=p.useState(0),t=s[Math.min(o,s.length-1)],[r,l]=p.useState("desktop");p.useEffect(()=>{function n(d){var m;if(((m=d.data)==null?void 0:m.type)==="SHIPYARD_NAVIGATE_MOCKUP"&&d.data.href){const h=N(s,d.data.href);h!==-1&&h!==o&&i(h)}}return window.addEventListener("message",n),()=>window.removeEventListener("message",n)},[s,o]);const c=p.useMemo(()=>g(t==null?void 0:t.html),[t==null?void 0:t.html]);return t?e.jsxs("div",{className:"st-mockups-wrap",children:[e.jsxs("div",{className:"st-mock-bar",children:[e.jsx("div",{className:"st-mock-tabs",role:"tablist","aria-label":a("Danh sách màn hình mẫu"),children:s.map((n,d)=>{const m=n.name.replace(/^\d+-/,"").replace(/\.html$/,""),h=d===o;return e.jsx("button",{type:"button",role:"tab","aria-selected":h,className:`st-mock-tab-btn${h?" active":""}`,onClick:()=>i(d),children:e.jsx("span",{children:m})},n.name)})}),e.jsxs("div",{className:"st-mock-controls",children:[e.jsxs("div",{className:"st-mock-viewport-toggle",children:[e.jsxs("button",{type:"button",className:`st-vp-btn${r==="desktop"?" on":""}`,onClick:()=>l("desktop"),title:a("Chế độ Desktop"),children:[e.jsx(y,{size:12}),e.jsx("span",{children:"Desktop"})]}),e.jsxs("button",{type:"button",className:`st-vp-btn${r==="mobile"?" on":""}`,onClick:()=>l("mobile"),title:a("Chế độ Mobile (375px)"),children:[e.jsx(k,{size:12}),e.jsx("span",{children:"Mobile"})]})]}),e.jsxs("button",{type:"button",className:"st-mock-popout",title:a("Mở toàn màn hình xem thử ở tab mới"),onClick:()=>{const n=window.open("","_blank");n&&(n.document.write(t.html),n.document.close())},children:[e.jsx(w,{size:12}),e.jsx("span",{children:a("Mở tab mới")})]})]})]}),e.jsxs("div",{className:`st-mock-canvas mode-${r}`,children:[e.jsxs("div",{className:"st-browser-chrome",children:[e.jsxs("div",{className:"st-chrome-dots",children:[e.jsx("span",{className:"dot red"}),e.jsx("span",{className:"dot yellow"}),e.jsx("span",{className:"dot green"})]}),e.jsx("div",{className:"st-chrome-url",children:e.jsxs("span",{className:"st-chrome-slug",children:["localhost:3000/",t.name.replace(/^\d+-/,"").replace(/\.html$/,"")]})}),e.jsx("span",{className:"st-chrome-badge",children:r==="mobile"?"Mobile (375px)":"Responsive Desktop"})]}),e.jsx("iframe",{className:"st-mock-iframe",title:a("Giao diện mẫu {0}",[t.name]),sandbox:"allow-scripts allow-same-origin allow-forms allow-popups",srcDoc:c},t.name)]})]}):null}export{M as A,y as M,C as a};
