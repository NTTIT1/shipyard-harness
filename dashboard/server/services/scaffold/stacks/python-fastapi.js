import { writeFiles } from '../util.js';
import { isSql } from '../dbs.js';

// FastAPI has no official generator, so Shipyard owns this template. Layout follows the FastAPI
// docs' "bigger applications" structure; dependencies are managed with uv.

export function pythonDeps(o) {
  const deps = ['fastapi>=0.115', 'uvicorn[standard]>=0.30', 'pydantic-settings>=2.4'];
  if (isSql(o.db) || o.db === 'sqlite') deps.push('sqlalchemy>=2.0');
  if (o.db === 'postgresql') deps.push('psycopg[binary]>=3.2');
  if (o.db === 'mysql') deps.push('pymysql>=1.1');
  if (o.db === 'mongodb') deps.push('pymongo>=4.9');
  if (o.db === 'redis') deps.push('redis>=5.0');
  if (o.auth === 'jwt') deps.push('pyjwt>=2.9');
  return deps;
}

const pkg = slug => slug.replace(/-/g, '_');

function settingsPy(o) {
  const f = ['    app_name: str = "app"', '    port: int = 8000'];
  if (isSql(o.db)) f.push('    db_host: str = "localhost"', `    db_port: int = ${o.db === 'postgresql' ? 5432 : 3306}`,
    '    db_name: str = "app"', '    db_user: str = "app"', '    db_password: str = ""');
  if (o.db === 'sqlite') f.push('    sqlite_path: str = "./data/app.db"');
  if (o.db === 'mongodb') f.push('    mongodb_uri: str = "mongodb://localhost:27017/app"');
  if (o.db === 'redis') f.push('    redis_host: str = "localhost"', '    redis_port: int = 6379');
  if (o.auth === 'jwt') f.push('    jwt_secret: str = ""', '    jwt_algorithm: str = "HS256"');
  let extra = '';
  if (isSql(o.db)) {
    const driver = o.db === 'postgresql' ? 'postgresql+psycopg' : 'mysql+pymysql';
    extra = `\n    @property\n    def database_url(self) -> str:\n        return f"${driver}://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"\n`;
  }
  if (o.db === 'sqlite') extra = '\n    @property\n    def database_url(self) -> str:\n        return f"sqlite:///{self.sqlite_path}"\n';
  return `from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Reads environment variables (and .env). Names match .env.example."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

${f.join('\n')}
${extra}

@lru_cache
def get_settings() -> Settings:
    return Settings()
`;
}

const DB_PY = `from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
`;

const AUTH_PY = `import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

bearer = HTTPBearer(auto_error=False)


def current_claims(cred: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    """Dependency for protected routes: returns the verified JWT claims."""
    s = get_settings()
    if cred is None or not s.jwt_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unauthorized")
    try:
        return jwt.decode(cred.credentials, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unauthorized") from None
`;

function mainPy(ctx) {
  return `from fastapi import FastAPI

from .config import get_settings

app = FastAPI(title=${JSON.stringify(ctx.name)})


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": get_settings().app_name}
`;
}

const TEST_PY = (p) => `from fastapi.testclient import TestClient

from ${p}.main import app


def test_health() -> None:
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
`;

function pyproject(ctx) {
  const deps = pythonDeps(ctx.options).map(d => `    "${d}",`).join('\n');
  return `[project]
name = "${ctx.slug}"
version = "0.1.0"
description = ${JSON.stringify(ctx.description || ctx.name)}
requires-python = ">=${ctx.options.python}"
dependencies = [
${deps}
]

[dependency-groups]
dev = [
    "pytest>=8.3",
    "httpx>=0.27",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["src"]
`;
}

function dockerfile(ctx) {
  const p = pkg(ctx.slug);
  return `FROM python:${ctx.options.python}-slim
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN useradd --system --uid 10001 app
USER app
ENV PYTHONPATH=/app/src
EXPOSE 8000
CMD ["/app/.venv/bin/uvicorn", "${p}.main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
}

export default {
  id: 'python-fastapi',
  language: 'python', languageLabel: 'Python',
  label: 'FastAPI', description: 'REST API với FastAPI, quản lý gói bằng uv',
  appPort: 8000,
  options: [
    { id: 'python', label: 'Phiên bản Python', type: 'choice', default: '3.12',
      choices: [{ id: '3.13', label: 'Python 3.13' }, { id: '3.12', label: 'Python 3.12' }] },
    { id: 'db', label: 'Database', type: 'choice', default: 'postgresql', group: 'db',
      choices: ['postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'none'] },
    { id: 'auth', label: 'Xác thực', type: 'choice', default: 'none',
      choices: [{ id: 'none', label: 'Không' }, { id: 'jwt', label: 'JWT' }] },
    { id: 'docker', label: 'Dockerfile + docker-compose', type: 'bool', default: true },
  ],
  requires: () => ['uv', 'git'],
  check: () => '',

  async generate(ctx) {
    const p = pkg(ctx.slug);
    const o = ctx.options;
    writeFiles(ctx.dir, {
      'pyproject.toml': pyproject(ctx),
      '.python-version': `${o.python}\n`,
      [`src/${p}/__init__.py`]: '',
      [`src/${p}/main.py`]: mainPy(ctx),
      [`src/${p}/config.py`]: settingsPy(o),
      [`src/${p}/db.py`]: isSql(o.db) || o.db === 'sqlite' ? DB_PY : null,
      [`src/${p}/auth.py`]: o.auth === 'jwt' ? AUTH_PY : null,
      'tests/__init__.py': '',
      'tests/test_health.py': TEST_PY(p),
      'data/.gitkeep': o.db === 'sqlite' ? '' : null,
    });
    ctx.log('Đã tạo khung FastAPI từ template của Shipyard');
  },

  overlay(ctx) {
    return {
      Dockerfile: ctx.options.docker ? dockerfile(ctx) : null,
      '.dockerignore': ctx.options.docker ? '.venv/\n__pycache__/\n.env\n.git/\ndata/\n' : null,
    };
  },

  env: ctx => ({ APP_NAME: ctx.slug, PORT: '8000', ...(ctx.options.auth === 'jwt' ? { JWT_SECRET: 'change-me' } : {}) }),

  commands: ctx => ({
    install: 'uv sync',
    dev: `uv run uvicorn ${pkg(ctx.slug)}.main:app --reload --app-dir src`,
    test: 'uv run pytest',
    build: 'uv build',
  }),

  async verify(ctx) {
    await ctx.run('uv', ['sync', '--python', ctx.options.python], { cwd: ctx.dir });
    await ctx.run('uv', ['run', 'pytest', '-q'], { cwd: ctx.dir });
  },

  gitignore: () => '__pycache__/\n*.py[cod]\n.venv/\n.pytest_cache/\ndist/\ndata/*.db\n',
};
