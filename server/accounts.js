import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const DUMMY_SALT = Buffer.alloc(16, 0x5a);

const sessionDigest = token => createHash('sha256').update(token).digest('hex');
const usernameKey = username => username.toLowerCase();

const derivePasswordHash = promisify(scrypt);
async function passwordHash(password, salt) {
  return derivePasswordHash(password, salt, 32);
}

export class AccountStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { version: 1, accounts: {}, sessions: {} };
    if (existsSync(filePath)) {
      const loaded = JSON.parse(readFileSync(filePath, 'utf8'));
      if (loaded?.version !== 1 || !loaded.accounts || !loaded.sessions) throw new Error('Account database format is invalid.');
      this.data = loaded;
      const now = Date.now();
      let changed = false;
      for (const [digest, session] of Object.entries(this.data.sessions)) {
        if (!session || session.expiresAt <= now || !this.data.accounts[session.usernameKey]) {
          delete this.data.sessions[digest]; changed = true;
        }
      }
      if (changed) this.#save(this.data);
    }
  }

  #save(next) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(next), { mode: 0o600 });
    renameSync(tempPath, this.filePath);
  }

  #createSession(account) {
    const token = randomBytes(32).toString('base64url');
    const digest = sessionDigest(token);
    const next = structuredClone(this.data);
    next.sessions[digest] = { usernameKey: usernameKey(account.username), expiresAt: Date.now() + SESSION_LIFETIME_MS };
    this.#save(next);
    this.data = next;
    return { account: { username: account.username }, token, sessionDigest: digest };
  }

  async signup(usernameValue, passwordValue) {
    const username = String(usernameValue ?? '').trim();
    const password = String(passwordValue ?? '');
    if (!USERNAME_PATTERN.test(username)) throw new Error('Use a username with 3–20 letters, numbers, or underscores.');
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new Error('Password must be 8–128 characters.');
    }
    const key = usernameKey(username);
    if (this.data.accounts[key]) throw new Error('That username is already taken. Try logging in instead.');
    const salt = randomBytes(16);
    const passwordDigest = await passwordHash(password, salt);
    if (this.data.accounts[key]) throw new Error('That username is already taken. Try logging in instead.');
    const account = {
      username,
      salt: salt.toString('hex'),
      passwordHash: passwordDigest.toString('hex'),
      createdAt: Date.now(),
    };
    const next = structuredClone(this.data);
    next.accounts[key] = account;
    this.#save(next);
    this.data = next;
    return this.#createSession(account);
  }

  async login(usernameValue, passwordValue) {
    const username = String(usernameValue ?? '').trim();
    const password = String(passwordValue ?? '');
    const account = USERNAME_PATTERN.test(username) ? this.data.accounts[usernameKey(username)] : null;
    if (!account || password.length > PASSWORD_MAX_LENGTH) {
      await passwordHash(password.slice(0, PASSWORD_MAX_LENGTH), DUMMY_SALT);
      throw new Error('Username or password is incorrect.');
    }
    const expected = Buffer.from(account.passwordHash, 'hex');
    const actual = await passwordHash(password, Buffer.from(account.salt, 'hex'));
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error('Username or password is incorrect.');
    }
    return this.#createSession(account);
  }

  resume(tokenValue) {
    const token = String(tokenValue ?? '');
    if (token.length < 32 || token.length > 128) throw new Error('Sign in again to continue.');
    const digest = sessionDigest(token);
    const session = this.data.sessions[digest];
    const account = session && session.expiresAt > Date.now() && this.data.accounts[session.usernameKey];
    if (!account) {
      if (session) {
        const next = structuredClone(this.data);
        delete next.sessions[digest];
        this.#save(next);
        this.data = next;
      }
      throw new Error('Your sign-in expired. Please log in again.');
    }
    return { account: { username: account.username }, sessionDigest: digest };
  }

  logout(digest) {
    if (!digest || !this.data.sessions[digest]) return;
    const next = structuredClone(this.data);
    delete next.sessions[digest];
    this.#save(next);
    this.data = next;
  }
}
