// @ts-nocheck
import 'dotenv/config';
import ssh2 from 'ssh2';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { generateKeyPairSync } from 'crypto';

const { Server, utils } = ssh2;
const { STATUS_CODE, OPEN_MODE } = utils.sftp;

export interface MockSftpConfig {
  port: number;
  host: string;
  username: string;
  password: string;
  rootDir: string;
  keyPath: string;
}

const defaultConfig: MockSftpConfig = {
  port: Number(process.env.MOCK_SFTP_PORT || 2222),
  host: process.env.MOCK_SFTP_HOST || '0.0.0.0',
  username: process.env.MOCK_SFTP_USER || 'andbank',
  password: process.env.MOCK_SFTP_PASS || 'sftp-test',
  rootDir: path.resolve(process.env.MOCK_SFTP_ROOT || 'data'),
  keyPath: path.resolve(process.env.MOCK_SFTP_KEY_PATH || '.mock-sftp/host_rsa_key')
};

async function ensureHostKey(keyPath: string): Promise<Buffer> {
  const dir = path.dirname(keyPath);
  await fsp.mkdir(dir, { recursive: true });

  try {
    return await fsp.readFile(keyPath);
  } catch (err) {
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
    });
    await fsp.writeFile(keyPath, privateKey, { mode: 0o600 });
    return Buffer.from(privateKey);
  }
}

function normalizePath(requestPath: string, rootDir: string): string {
  let cleanPath = requestPath;
  if (!cleanPath || cleanPath === '.') cleanPath = '/';
  if (!cleanPath.startsWith('/')) {
    cleanPath = `/${cleanPath}`;
  }
  const resolved = path.resolve(rootDir, `.${cleanPath}`);
  if (!resolved.startsWith(rootDir)) {
    throw new Error('Path escapes root');
  }
  return resolved;
}

function attrsFromStat(stat: fs.Stats) {
  return {
    mode: stat.mode,
    uid: stat.uid ?? 0,
    gid: stat.gid ?? 0,
    size: stat.size,
    atime: Math.floor(stat.atimeMs / 1000),
    mtime: Math.floor(stat.mtimeMs / 1000)
  };
}

let serverInstance: ssh2.Server | null = null;
let startingPromise: Promise<ssh2.Server> | null = null;

export async function startMockSftpServer(configOverrides: Partial<MockSftpConfig> = {}): Promise<ssh2.Server> {
  if (serverInstance) {
    return serverInstance;
  }
  if (startingPromise) {
    return startingPromise;
  }

  const config: MockSftpConfig = { ...defaultConfig, ...configOverrides };
  startingPromise = (async () => {
    const hostKey = await ensureHostKey(config.keyPath);
    await fsp.mkdir(config.rootDir, { recursive: true });

    const server = new Server({ hostKeys: [hostKey] }, (client) => {
    console.log('🔌 Client connected');

    client.on('authentication', (ctx) => {
        if (ctx.method === 'password' && ctx.username === config.username && ctx.password === config.password) {
        ctx.accept();
      } else {
        ctx.reject();
      }
    });

    client.on('ready', () => {
      console.log('✅ Client authenticated');
      client.on('session', (accept, reject) => {
        const session = accept();
        session.on('sftp', (acceptStream, rejectStream) => {
          const sftpStream = acceptStream();
          const openFiles = new Map<string, number>();
          const openDirs = new Map<string, { files: string[]; index: number; dirPath: string }>();
          let handleCount = 0;

          const createHandle = () => {
            const buf = Buffer.alloc(4);
            buf.writeUInt32BE(handleCount++, 0);
            return buf;
          };

          const handleKey = (handle: Buffer) => handle.toString('hex');

          sftpStream.on('REALPATH', (reqid, givenPath) => {
            sftpStream.name(reqid, [
              {
                filename: '/',
                longname: '/',
                attrs: {}
              }
            ]);
          });

          sftpStream.on('STAT', async (reqid, pathname) => {
            try {
              const resolved = normalizePath(pathname, config.rootDir);
              const stat = await fsp.stat(resolved);
              sftpStream.attrs(reqid, attrsFromStat(stat));
            } catch (error) {
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftpStream.on('LSTAT', async (reqid, pathname) => {
            try {
              const resolved = normalizePath(pathname, config.rootDir);
              const stat = await fsp.lstat(resolved);
              sftpStream.attrs(reqid, attrsFromStat(stat));
            } catch (error) {
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftpStream.on('OPENDIR', async (reqid, pathname) => {
            try {
              const resolved = normalizePath(pathname, config.rootDir);
              const files = await fsp.readdir(resolved);
              const handle = createHandle();
              openDirs.set(handleKey(handle), { files, index: 0, dirPath: resolved });
              sftpStream.handle(reqid, handle);
            } catch (error) {
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftpStream.on('READDIR', async (reqid, handle) => {
            const key = handleKey(handle);
            const dirInfo = openDirs.get(key);
            if (!dirInfo) {
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
              return;
            }

            if (dirInfo.index >= dirInfo.files.length) {
              sftpStream.status(reqid, STATUS_CODE.EOF);
              return;
            }

            const entry = dirInfo.files[dirInfo.index++];
            const fullPath = path.join(dirInfo.dirPath, entry);
            try {
              const stat = await fsp.stat(fullPath);
              sftpStream.name(reqid, [
                {
                  filename: entry,
                  longname: `${stat.isDirectory() ? 'd' : '-'}rwxr-xr-x 1 user group ${stat.size} ${stat.mtime.toDateString()} ${entry}`,
                  attrs: attrsFromStat(stat)
                }
              ]);
            } catch (error) {
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftpStream.on('OPEN', async (reqid, filename, flags) => {
            try {
              if ((flags & OPEN_MODE.READ) === 0) {
                sftpStream.status(reqid, STATUS_CODE.PERMISSION_DENIED);
                return;
              }
              const resolved = normalizePath(filename, config.rootDir);
              const fd = await fsp.open(resolved, 'r');
              const handle = createHandle();
              openFiles.set(handleKey(handle), fd.fd);
              sftpStream.handle(reqid, handle);
            } catch (error) {
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftpStream.on('READ', (reqid, handle, offset, length) => {
            const key = handleKey(handle);
            const fd = openFiles.get(key);
            if (typeof fd !== 'number') {
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
              return;
            }
            const buffer = Buffer.alloc(length);
            fs.read(fd, buffer, 0, length, offset, (err, bytesRead) => {
              if (err) {
                sftpStream.status(reqid, STATUS_CODE.FAILURE);
                return;
              }
              if (!bytesRead) {
                sftpStream.status(reqid, STATUS_CODE.EOF);
                return;
              }
              sftpStream.data(reqid, buffer.subarray(0, bytesRead));
            });
          });

          sftpStream.on('CLOSE', async (reqid, handle) => {
            const key = handleKey(handle);
            if (openFiles.has(key)) {
              const fd = openFiles.get(key)!;
              openFiles.delete(key);
              fs.close(fd, (err) => {
                if (err) {
                  sftpStream.status(reqid, STATUS_CODE.FAILURE);
                } else {
                  sftpStream.status(reqid, STATUS_CODE.OK);
                }
              });
              return;
            }
            if (openDirs.has(key)) {
              openDirs.delete(key);
              sftpStream.status(reqid, STATUS_CODE.OK);
              return;
            }
            sftpStream.status(reqid, STATUS_CODE.FAILURE);
          });
        });
      });
    });

    client.on('end', () => {
      console.log('🔌 Client disconnected');
    });
  });

    server.listen(config.port, config.host, () => {
    console.log('===========================================');
    console.log('🗄️  Mock SFTP server ready');
      console.log(`📂 Root directory: ${config.rootDir}`);
      console.log(`👤 Username: ${config.username}`);
      console.log(`🔑 Password: ${config.password}`);
      console.log(`📡 Host: ${config.host}:${config.port}`);
    console.log('===========================================');
      serverInstance = server;
    });

    server.on('close', () => {
      serverInstance = null;
      startingPromise = null;
    });

    server.on('error', (err) => {
      console.error('Mock SFTP server error:', err);
    });

    return server;
  })().catch((err) => {
    startingPromise = null;
    throw err;
  });

  return startingPromise;
}

export async function ensureMockSftpServer(configOverrides: Partial<MockSftpConfig> = {}) {
  return startMockSftpServer(configOverrides);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMockSftpServer().catch((error) => {
    console.error('Mock SFTP server failed to start:', error);
    process.exit(1);
  });
}

