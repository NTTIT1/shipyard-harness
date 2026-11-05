#!/usr/bin/env python3
"""A map of a project's source code and documents, for the AI roles and for people (feedback item 7).

    code-graph.py <repo_dir> [--out graph.json] [--report GRAPH_REPORT.md] [--max-files N]

Reads the repo (no network, nothing installed, standard library only) and builds a graph:
  nodes  MODULE  a class / component / module file      (Java, Kotlin, TS/JS, Python)
         API     an HTTP endpoint, "GET /api/leaves"    (Spring, NestJS, Express, FastAPI)
         TABLE   a database table                       (JPA @Entity/@Table, SQL CREATE TABLE, SQLAlchemy)
         SCREEN  a page / route component of a UI       (React/Vue pages, routes)
         DOC     a Markdown document                    (README, docs/, specs/)
  edges  DEPENDS_ON  module → module it imports
         IMPLEMENTS  module → API it serves
         TOUCHES     module → table it maps / queries
         MENTIONS    document → code entity it names
         LINKS       document → document it links to
The JSON goes to --out (default: stdout); --report writes a short Markdown overview: the most connected
modules, entry points, APIs, tables, documents, and what the documents mention that no longer exists.
Keys are lower-case (the project memory matches them against text).
"""
import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

SKIP_DIRS = {'.git', 'node_modules', 'target', 'build', 'dist', 'out', '.gradle', '.venv', 'venv', '__pycache__',
             '.idea', '.next', 'coverage', '.playwright-mcp', '.shipyard', 'vendor', '.mvn', 'generated'}
CODE_EXT = {'.java', '.kt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.vue', '.sql'}
DOC_EXT = {'.md', '.mdx'}
MAX_BYTES = 400_000

HTTP = r'(Get|Post|Put|Delete|Patch)'
RX = {
    'java_pkg': re.compile(r'^\s*package\s+([\w.]+)\s*;', re.M),
    'java_type': re.compile(r'^\s*(?:public\s+|abstract\s+|final\s+|sealed\s+)*(?:class|interface|enum|record)\s+(\w+)', re.M),
    'kt_type': re.compile(r'^\s*(?:(?:data|open|abstract|sealed|enum|internal|public)\s+)*(?:class|interface|object)\s+(\w+)', re.M),
    'java_import': re.compile(r'^\s*import\s+(?:static\s+)?([\w.]+)\s*;?', re.M),
    'spring_base': re.compile(r'@RequestMapping\(\s*(?:value\s*=\s*|path\s*=\s*)?"([^"]*)"'),
    'spring_map': re.compile(r'@' + HTTP + r'Mapping(?:\(\s*(?:value\s*=\s*|path\s*=\s*)?(?:\{\s*)?"([^"]*)")?'),
    'spring_req': re.compile(r'@RequestMapping\([^)]*method\s*=\s*RequestMethod\.(\w+)[^)]*\)'),
    'jpa_entity': re.compile(r'@Entity\b'),
    'jpa_table': re.compile(r'@Table\(\s*(?:name\s*=\s*)?"(\w+)"'),
    'repo_of': re.compile(r'(?:JpaRepository|CrudRepository|MongoRepository|PagingAndSortingRepository)<\s*(\w+)'),
    'sql_table': re.compile(r'create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?(?:\w+\.)?(\w+)', re.I),
    'js_import': re.compile(r'''(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\(\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]'''),
    'js_component': re.compile(r'export\s+(?:default\s+)?(?:function|class|const)\s+([A-Z]\w*)'),
    'nest_ctrl': re.compile(r'@Controller\(\s*[\'"]?([^\'")]*)'),
    'nest_map': re.compile(r'@' + HTTP + r'\(\s*[\'"]?([^\'")]*)'),
    'express': re.compile(r'''\b(?:router|app|r)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]'''),
    'route_path': re.compile(r'''<Route\s[^>]*path=["']([^"']+)["'][^>]*element=\{\s*<(\w+)'''),
    'py_import': re.compile(r'^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))', re.M),
    'py_class': re.compile(r'^class\s+(\w+)', re.M),
    'fastapi': re.compile(r'@(?:\w+)\.(get|post|put|delete|patch)\(\s*[\'"]([^\'"]+)[\'"]'),
    'fastapi_prefix': re.compile(r'APIRouter\([^)]*prefix\s*=\s*[\'"]([^\'"]+)[\'"]'),
    'sqla_table': re.compile(r'__tablename__\s*=\s*[\'"](\w+)[\'"]'),
    'md_link': re.compile(r'\[[^\]]*\]\(([^)#\s]+\.mdx?)(?:#[^)]*)?\)'),
    'md_title': re.compile(r'^#\s+(.+)$', re.M),
    'md_code': re.compile(r'`([^`\n]{3,80})`'),
}


def read(path):
    try:
        if os.path.getsize(path) > MAX_BYTES:
            return None
        with open(path, encoding='utf-8', errors='replace') as f:
            text = f.read()
    except OSError:
        return None
    lines = text.count('\n') + 1
    if '.min.' in path or (len(text) / lines > 300 and not path.endswith(('.md', '.mdx'))):
        return None  # minified / generated bundle
    return text


def files(root, max_files):
    # In a git repo: the tracked files only (what .gitignore leaves out — build output, runtime — is not the project).
    try:
        import subprocess
        r = subprocess.run(['git', '-C', root, 'ls-files', '-z'], capture_output=True, timeout=60)
        if r.returncode == 0 and r.stdout:
            out = []
            for rel in sorted(r.stdout.decode('utf-8', 'replace').split('\0')):
                parts = rel.split('/')
                if not rel or any(x in SKIP_DIRS or x.endswith('-dist') for x in parts[:-1]):
                    continue
                if os.path.splitext(rel)[1].lower() in CODE_EXT | DOC_EXT and os.path.isfile(os.path.join(root, rel)):
                    out.append(rel)
                    if len(out) >= max_files:
                        return out, True
            return out, False
    except (OSError, subprocess.SubprocessError):
        pass
    out = []
    for d, dirs, names in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS and not x.startswith('.') and not x.endswith('-dist'))
        for n in sorted(names):
            ext = os.path.splitext(n)[1].lower()
            if ext in CODE_EXT or ext in DOC_EXT:
                out.append(os.path.relpath(os.path.join(d, n), root).replace(os.sep, '/'))
                if len(out) >= max_files:
                    return out, True
    return out, False


def snake(name):
    return re.sub(r'(?<!^)(?=[A-Z])', '_', name).lower()


def api_key(method, path):
    p = '/' + '/'.join(s for s in path.split('/') if s)
    p = re.sub(r'\{[^}]+\}|:\w+', '{}', p)  # /leaves/{id} and /leaves/:id are the same endpoint
    return f'{method.upper()} {p}'.lower()


def join(*parts):
    return '/'.join(s.strip('/') for s in parts if s and s.strip('/'))


class Graph:
    def __init__(self):
        self.nodes = {}
        self.edges = set()

    def node(self, typ, key, name, file=None, line=None):
        key = key.strip().lower()[:300]
        nid = f'{typ}:{key}'
        if nid not in self.nodes:
            self.nodes[nid] = {'id': nid, 'type': typ, 'key': key, 'name': name[:300], 'file': file, 'line': line}
        elif file and not self.nodes[nid].get('file'):
            self.nodes[nid].update(file=file, line=line)
        return nid

    def edge(self, a, b, typ):
        if a and b and a != b:
            self.edges.add((a, b, typ))


def line_of(text, pos):
    return text.count('\n', 0, pos) + 1


def scan_java(g, rel, text, fqcn_index, pending):
    pkg = (RX['java_pkg'].search(text) or [None, ''])[1] if RX['java_pkg'].search(text) else ''
    m = (RX['kt_type'] if rel.endswith('.kt') else RX['java_type']).search(text)
    if not m:
        return
    cls = m.group(1)
    me = g.node('MODULE', cls, cls, rel, line_of(text, m.start()))
    fqcn_index[f'{pkg}.{cls}' if pkg else cls] = me
    pending.append((me, [i for i in RX['java_import'].findall(text)]))
    base = RX['spring_base'].search(text)
    base = base.group(1) if base and base.start() < m.start() + 400 else ''
    for mm in RX['spring_map'].finditer(text):
        a = g.node('API', api_key(mm.group(1), join(base, mm.group(2) or '')), f'{mm.group(1).upper()} /{join(base, mm.group(2) or "")}',
                   rel, line_of(text, mm.start()))
        g.edge(me, a, 'IMPLEMENTS')
    for mm in RX['spring_req'].finditer(text):
        a = g.node('API', api_key(mm.group(1), base), f'{mm.group(1).upper()} /{join(base)}', rel, line_of(text, mm.start()))
        g.edge(me, a, 'IMPLEMENTS')
    if RX['jpa_entity'].search(text):
        t = RX['jpa_table'].search(text)
        table = t.group(1) if t else snake(cls)
        g.edge(me, g.node('TABLE', table, table, rel, line_of(text, m.start())), 'TOUCHES')
    r = RX['repo_of'].search(text)
    if r:
        pending.append((me, ['__entity__:' + r.group(1)]))


def resolve_js(rel, spec, known):
    if not spec.startswith('.') and not spec.startswith('@/') and not spec.startswith('~/'):
        return None
    base = os.path.dirname(rel)
    p = os.path.normpath(os.path.join(base, spec)) if spec.startswith('.') else 'src/' + spec[2:]
    p = p.replace(os.sep, '/')
    for cand in (p, *(p + e for e in ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue')),
                 *(p + '/index' + e for e in ('.ts', '.tsx', '.js', '.jsx'))):
        if cand in known:
            return cand
    return None


def scan_js(g, rel, text, file_node, known):
    stem = os.path.splitext(os.path.basename(rel))[0]
    comp = RX['js_component'].search(text)
    # A component file (Button.jsx) is known by its component; any other module by its path.
    if not (comp and comp.group(1) == stem and re.fullmatch(r'[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)*', stem)):
        comp = None
    me = g.node('MODULE', stem if comp else rel, stem if comp else rel, rel, line_of(text, comp.start()) if comp else 1)
    file_node[rel] = me
    if re.search(r'(^|/)(pages|views|screens|routes|app)/', rel) and comp:
        g.edge(me, g.node('SCREEN', stem, stem, rel, line_of(text, comp.start())), 'IMPLEMENTS')
    ctrl = RX['nest_ctrl'].search(text)
    base = ctrl.group(1) if ctrl else ''
    if ctrl:
        for mm in RX['nest_map'].finditer(text):
            g.edge(me, g.node('API', api_key(mm.group(1), join(base, mm.group(2))), f'{mm.group(1).upper()} /{join(base, mm.group(2))}',
                              rel, line_of(text, mm.start())), 'IMPLEMENTS')
    for mm in RX['express'].finditer(text):
        if mm.group(2).startswith('/'):
            g.edge(me, g.node('API', api_key(mm.group(1), mm.group(2)), f'{mm.group(1).upper()} {mm.group(2)}', rel, line_of(text, mm.start())), 'IMPLEMENTS')
    for mm in RX['route_path'].finditer(text):
        g.edge(me, g.node('SCREEN', mm.group(2), f'{mm.group(2)} ({mm.group(1)})', rel, line_of(text, mm.start())), 'SHOWS')
    return [resolve_js(rel, s, known) for s in RX['js_import'].findall(text)]


def scan_py(g, rel, text, file_node):
    mod = rel[:-3].replace('/', '.')
    c = RX['py_class'].search(text)
    me = g.node('MODULE', mod, mod, rel, 1)
    file_node[mod] = me
    prefix = (RX['fastapi_prefix'].search(text) or [None, ''])[1] if RX['fastapi_prefix'].search(text) else ''
    for mm in RX['fastapi'].finditer(text):
        g.edge(me, g.node('API', api_key(mm.group(1), join(prefix, mm.group(2))), f'{mm.group(1).upper()} /{join(prefix, mm.group(2))}',
                          rel, line_of(text, mm.start())), 'IMPLEMENTS')
    for mm in RX['sqla_table'].finditer(text):
        g.edge(me, g.node('TABLE', mm.group(1), mm.group(1), rel, line_of(text, mm.start())), 'TOUCHES')
    deps = []
    for a, b in RX['py_import'].findall(text):
        deps.append(a or b)
    return deps, c


def build(root, max_files=5000):
    g = Graph()
    rels, truncated = files(root, max_files)
    known = set(rels)
    fqcn, java_pending, js_pending, py_pending, file_node = {}, [], [], [], {}
    docs = {}
    for rel in rels:
        text = read(os.path.join(root, rel))
        if text is None:
            continue
        ext = os.path.splitext(rel)[1].lower()
        if ext in ('.java', '.kt'):
            scan_java(g, rel, text, fqcn, java_pending)
        elif ext in ('.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue'):
            if re.search(r'(\.test|\.spec)\.|(^|/)(test|tests|__tests__)/', rel):
                continue
            js_pending.append((rel, scan_js(g, rel, text, file_node, known)))
        elif ext == '.py':
            if re.search(r'(^|/)tests?/|(^|/)test_', rel):
                continue
            py_pending.append((rel, *scan_py(g, rel, text, file_node)))
        elif ext == '.sql':
            for mm in RX['sql_table'].finditer(text):
                g.node('TABLE', mm.group(1), mm.group(1), rel, line_of(text, mm.start()))
        elif ext in DOC_EXT:
            docs[rel] = text
    # Imports resolved once every module is known.
    simple = defaultdict(list)
    for fq, nid in fqcn.items():
        simple[fq.rsplit('.', 1)[-1]].append(nid)
    for me, imports in java_pending:
        for imp in imports:
            if imp.startswith('__entity__:'):
                for nid in simple.get(imp.split(':', 1)[1], []):
                    for (a, b, t) in list(g.edges):
                        if a == nid and t == 'TOUCHES':
                            g.edge(me, b, 'TOUCHES')
                continue
            g.edge(me, fqcn.get(imp), 'DEPENDS_ON')
    for rel, targets in js_pending:
        for t in targets:
            if t and t in file_node:
                g.edge(file_node[rel], file_node[t], 'DEPENDS_ON')
    for rel, deps, _ in py_pending:
        me = file_node.get(rel[:-3].replace('/', '.'))
        for d in deps:
            for cand in (d, d.rsplit('.', 1)[0]):
                if cand in file_node:
                    g.edge(me, file_node[cand], 'DEPENDS_ON')
                    break
    # Documents: what they name, what they link to. A name counts when it is unmistakably code: a compound
    # name (LeaveRequestService, leave_requests) written as such, or anything written in `backticks`.
    compound = re.compile(r'^(?:[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+|[a-z0-9]+(?:_[a-z0-9]+)+)$')
    by_name = {}
    for n in g.nodes.values():
        if n['type'] in ('MODULE', 'TABLE', 'SCREEN') and '/' not in n['key'] and len(n['key']) >= 4:
            by_name.setdefault(n['name'] if n['type'] != 'TABLE' else n['key'], n['id'])
    lower_names = {k.lower(): v for k, v in by_name.items()}
    apis = {n['key'].split(' ', 1)[1]: n['id'] for n in g.nodes.values() if n['type'] == 'API' and n['key'].count('/') >= 2}
    word = re.compile(r'[A-Za-z_][A-Za-z0-9_]{3,}')
    stale = []
    for rel, text in docs.items():
        t = RX['md_title'].search(text)
        d = g.node('DOC', rel, t.group(1).strip() if t else rel, rel, 1)
        ticks = set(RX['md_code'].findall(text))
        for w in set(word.findall(text)):
            if w in by_name and compound.match(w):
                g.edge(d, by_name[w], 'MENTIONS')
        for code in ticks:
            c = code.strip().strip('()')
            nid = by_name.get(c) or lower_names.get(c.lower())
            if nid:
                g.edge(d, nid, 'MENTIONS')
        low = text.lower()
        for path_, nid in apis.items():
            if path_ in low:
                g.edge(d, nid, 'MENTIONS')
        for link in RX['md_link'].findall(text):
            if '://' in link:
                continue
            target = os.path.normpath(os.path.join(os.path.dirname(rel), link)).replace(os.sep, '/')
            if target in docs:
                g.edge(d, g.node('DOC', target, target, target, 1), 'LINKS')
        # `LeaveService` in a document while no such class exists any more → probably out of date.
        for code in ticks:
            if re.fullmatch(r'[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+(?:Service|Controller|Repository|Entity|Page|Screen|Component)', code) \
                    and code not in by_name:
                stale.append((rel, code))
    return g, docs, {'files': len(rels), 'truncated': truncated, 'stale': stale}


def report(g, meta, title):
    deg = Counter()
    for a, b, t in g.edges:
        if t in ('MENTIONS', 'LINKS'):
            continue
        deg[a] += 1
        deg[b] += 1
    by_type = Counter(n['type'] for n in g.nodes.values())
    incoming = Counter(b for a, b, t in g.edges if t == 'DEPENDS_ON')
    outgoing = Counter(a for a, b, t in g.edges if t == 'DEPENDS_ON')
    mods = [n for n in g.nodes.values() if n['type'] == 'MODULE']
    L = [f'# Bản đồ mã nguồn & tài liệu — {title}', '',
         f'{meta["files"]} file đã đọc{" (đã dừng ở giới hạn)" if meta["truncated"] else ""} · '
         + ' · '.join(f'{by_type[t]} {lbl}' for t, lbl in (('MODULE', 'module'), ('API', 'API'), ('TABLE', 'bảng'),
                                                            ('SCREEN', 'màn hình'), ('DOC', 'tài liệu'))) + f' · {len(g.edges)} quan hệ', '']
    top = sorted(mods, key=lambda n: -deg[n['id']])[:12]
    if top:
        L += ['## Module trung tâm (nhiều quan hệ nhất — sửa cẩn thận)', '']
        L += [f'- `{n["name"]}` — {deg[n["id"]]} quan hệ, {incoming[n["id"]]} nơi dùng · {n["file"]}' for n in top]
        L.append('')
    entry = [n for n in mods if incoming[n['id']] == 0 and outgoing[n['id']] > 0][:10]
    if entry:
        L += ['## Điểm vào (không module nào gọi tới)', ''] + [f'- `{n["name"]}` · {n["file"]}' for n in entry] + ['']
    for typ, head in (('API', 'API'), ('TABLE', 'Bảng dữ liệu'), ('SCREEN', 'Màn hình')):
        rows = sorted((n for n in g.nodes.values() if n['type'] == typ), key=lambda n: n['name'])
        if rows:
            L += [f'## {head} ({len(rows)})', '']
            L += [f'- {n["name"]}' + (f' · {n["file"]}' if n.get('file') else '') for n in rows[:60]]
            if len(rows) > 60:
                L.append(f'- … và {len(rows) - 60} mục khác')
            L.append('')
    docs = [n for n in g.nodes.values() if n['type'] == 'DOC']
    if docs:
        mentions = Counter(a for a, b, t in g.edges if t == 'MENTIONS')
        L += ['## Tài liệu', ''] + [f'- {n["key"]} — {n["name"]} ({mentions[n["id"]]} chỗ nhắc tới code)' for n in sorted(docs, key=lambda n: n['key'])[:40]] + ['']
        undocumented = [n for n in top if not any(b == n['id'] and t == 'MENTIONS' for a, b, t in g.edges)]
        if undocumented:
            L += ['## Module trung tâm chưa tài liệu nào nhắc tới', ''] + [f'- `{n["name"]}`' for n in undocumented] + ['']
    if meta['stale']:
        L += ['## Tài liệu có thể đã cũ (nhắc tới thứ không còn trong code)', '']
        L += [f'- {rel}: `{code}`' for rel, code in meta['stale'][:30]] + ['']
    return '\n'.join(L)


def to_json(g, docs, meta, title, report_text, with_docs):
    out = {'title': title, 'files': meta['files'], 'truncated': meta['truncated'],
           'nodes': list(g.nodes.values()),
           'edges': [{'from': a, 'to': b, 'type': t} for a, b, t in sorted(g.edges)],
           'stale': [{'file': f, 'name': c} for f, c in meta['stale']], 'report': report_text}
    if with_docs:
        out['docs'] = [{'path': p, 'content': t[:60_000]} for p, t in sorted(docs.items())]
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description='Map of a repo\'s code and documents')
    ap.add_argument('repo')
    ap.add_argument('--out', default='-')
    ap.add_argument('--report', default='')
    ap.add_argument('--title', default='')
    ap.add_argument('--max-files', type=int, default=5000)
    ap.add_argument('--with-docs', action='store_true', help='include each document\'s text (for the project memory)')
    a = ap.parse_args(argv)
    if not os.path.isdir(a.repo):
        print(f'code-graph: no such folder {a.repo}', file=sys.stderr)
        return 64
    title = a.title or os.path.basename(os.path.abspath(a.repo))
    g, docs, meta = build(a.repo, a.max_files)
    text = report(g, meta, title)
    data = to_json(g, docs, meta, title, text, a.with_docs)
    if a.report:
        with open(a.report, 'w', encoding='utf-8') as f:
            f.write(text + '\n')
    s = json.dumps(data, ensure_ascii=False)
    if a.out == '-':
        sys.stdout.write(s + '\n')
    else:
        with open(a.out, 'w', encoding='utf-8') as f:
            f.write(s)
        print(f'CODE-GRAPH: nodes={len(g.nodes)} edges={len(g.edges)} docs={len(docs)} files={meta["files"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
