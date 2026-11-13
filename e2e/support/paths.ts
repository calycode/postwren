import path from 'node:path';
import { fileURLToPath } from 'node:url';

const supportDir = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(supportDir, '../..');
export const E2E_DIR = path.resolve(supportDir, '..');
export const AUTH_FILE = path.join(ROOT_DIR, '.auth/owner.json');
export const PORT = 8791;
export const BASE_URL = `http://localhost:${PORT}`;
export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? 'dev@example.com';
