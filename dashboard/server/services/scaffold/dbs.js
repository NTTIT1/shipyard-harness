// Databases the wizard offers. Every stack reads the same env names, so README, .env.example and
// docker-compose are shared; each stack only decides how its framework consumes them.

export const DB_LABEL = {
  postgresql: 'PostgreSQL', mysql: 'MySQL', mongodb: 'MongoDB', sqlite: 'SQLite', redis: 'Redis', none: 'Không dùng',
};

export const isSql = db => db === 'postgresql' || db === 'mysql';

/** Dev-only defaults. `change-me` marks every value that must be replaced outside a laptop. */
export function dbEnv(db, slug, host = 'localhost') {
  const name = slug.replace(/-/g, '_');
  switch (db) {
    case 'postgresql':
      return { DB_HOST: host, DB_PORT: '5432', DB_NAME: name, DB_USER: name, DB_PASSWORD: 'change-me' };
    case 'mysql':
      return { DB_HOST: host, DB_PORT: '3306', DB_NAME: name, DB_USER: name, DB_PASSWORD: 'change-me' };
    case 'mongodb':
      return { MONGODB_URI: `mongodb://${host}:27017/${name}` };
    case 'redis':
      return { REDIS_HOST: host, REDIS_PORT: '6379' };
    case 'sqlite':
      return { SQLITE_PATH: './data/app.db' };
    default:
      return {};
  }
}

/** docker-compose service for the database, or null. */
export function dbService(db, slug) {
  const e = dbEnv(db, slug);
  switch (db) {
    case 'postgresql':
      return { name: 'db', yaml: [
        '  db:',
        '    image: postgres:16-alpine',
        '    environment:',
        `      POSTGRES_DB: ${e.DB_NAME}`,
        `      POSTGRES_USER: ${e.DB_USER}`,
        '      POSTGRES_PASSWORD: ${DB_PASSWORD:-change-me}',
        '    ports: ["5432:5432"]',
        '    volumes: [db-data:/var/lib/postgresql/data]',
        '    healthcheck:',
        `      test: ["CMD-SHELL", "pg_isready -U ${e.DB_USER}"]`,
        '      interval: 5s',
        '      retries: 10',
      ] };
    case 'mysql':
      return { name: 'db', yaml: [
        '  db:',
        '    image: mysql:8.4',
        '    environment:',
        `      MYSQL_DATABASE: ${e.DB_NAME}`,
        `      MYSQL_USER: ${e.DB_USER}`,
        '      MYSQL_PASSWORD: ${DB_PASSWORD:-change-me}',
        '      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD:-change-me-root}',
        '    ports: ["3306:3306"]',
        '    volumes: [db-data:/var/lib/mysql]',
        '    healthcheck:',
        '      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]',
        '      interval: 5s',
        '      retries: 20',
      ] };
    case 'mongodb':
      return { name: 'db', yaml: [
        '  db:',
        '    image: mongo:7',
        '    ports: ["27017:27017"]',
        '    volumes: [db-data:/data/db]',
      ] };
    case 'redis':
      return { name: 'db', yaml: [
        '  db:',
        '    image: redis:7-alpine',
        '    ports: ["6379:6379"]',
      ] };
    default:
      return null;
  }
}

export function envFile(vars) {
  return Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + (Object.keys(vars).length ? '\n' : '');
}
