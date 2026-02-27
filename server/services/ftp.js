import { Client } from 'basic-ftp';
import path from 'path';
import { Readable, PassThrough, Writable } from 'stream';

export const FTP_BASE = process.env.FTP_BASE_PATH || 'uploads';

/**
 * Creates and connects an FTP client using Explicit FTPS.
 */
async function createClient() {
  const client = new Client();
  await client.access({
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS,
    secure: true, // explicit TLS (FTPES / "Explicit FTP over TLS")
    secureOptions: {
      // Shared hosting FTP servers often use the provider's wildcard cert
      // (e.g. *.us.cloudlogin.co) rather than the customer's domain.
      rejectUnauthorized: false,
    },
  });
  return client;
}

/**
 * Uploads a local file to the FTP server.
 * Creates any required remote directories automatically.
 *
 * @param {string} localPath  - Absolute path to the local file
 * @param {string} remotePath - Path relative to FTP_BASE (e.g. "Video/2025/01/1234-file.mp4")
 */
export async function uploadToFtp(localPath, remotePath) {
  const client = await createClient();
  try {
    const fullRemote = `${FTP_BASE}/${remotePath}`;
    const remoteDir = path.posix.dirname(fullRemote);
    await client.ensureDir(remoteDir);
    // ensureDir changes cwd — reset to root before uploading to use absolute path
    await client.cd('/');
    await client.uploadFrom(localPath, fullRemote);
  } finally {
    client.close();
  }
}

/**
 * Uploads a readable stream to the FTP server.
 *
 * @param {Readable} readable  - Source readable stream
 * @param {string} remotePath  - Path relative to FTP_BASE
 */
export async function uploadStreamToFtp(readable, remotePath) {
  const client = await createClient();
  try {
    const fullRemote = `${FTP_BASE}/${remotePath}`;
    const remoteDir = path.posix.dirname(fullRemote);
    await client.ensureDir(remoteDir);
    await client.cd('/');
    await client.uploadFrom(readable, fullRemote);
  } finally {
    client.close();
  }
}

/**
 * Uploads an in-memory Buffer to the FTP server.
 *
 * @param {Buffer} buffer     - File content as Buffer
 * @param {string} remotePath - Path relative to FTP_BASE
 */
export async function uploadBufferToFtp(buffer, remotePath) {
  const client = await createClient();
  try {
    const fullRemote = `${FTP_BASE}/${remotePath}`;
    const remoteDir = path.posix.dirname(fullRemote);
    await client.ensureDir(remoteDir);
    await client.cd('/');
    await client.uploadFrom(Readable.from(buffer), fullRemote);
  } finally {
    client.close();
  }
}

/**
 * Appends an in-memory Buffer to an existing remote file.
 * Creates target directory if needed.
 *
 * @param {Buffer} buffer     - File content as Buffer
 * @param {string} remotePath - Path relative to FTP_BASE
 */
export async function appendBufferToFtp(buffer, remotePath) {
  const client = await createClient();
  try {
    const fullRemote = `${FTP_BASE}/${remotePath}`;
    const remoteDir = path.posix.dirname(fullRemote);
    await client.ensureDir(remoteDir);
    await client.cd('/');
    await client.appendFrom(Readable.from(buffer), fullRemote);
  } finally {
    client.close();
  }
}

/**
 * Downloads a file from the FTP server to a local path.
 *
 * @param {string} remotePath - Path relative to FTP_BASE
 * @param {string} localPath  - Absolute local destination path
 */
export async function downloadFromFtp(remotePath, localPath) {
  const client = await createClient();
  try {
    await client.downloadTo(localPath, `${FTP_BASE}/${remotePath}`);
  } finally {
    client.close();
  }
}

/**
 * Streams a file from the FTP server directly into a writable stream.
 * Useful for piping FTP file content directly to an HTTP response.
 *
 * @param {string}   remotePath     - Path relative to FTP_BASE
 * @param {Writable} writableStream - Destination writable stream
 * @param {{ startAt?: number, maxBytes?: number }} [options] - Optional stream options
 */
export async function streamFromFtp(remotePath, writableStream, options = {}) {
  const { startAt = 0, maxBytes } = options;
  const client = await createClient();
  try {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      await client.downloadTo(writableStream, `${FTP_BASE}/${remotePath}`, startAt);
      return;
    }

    let forwarded = 0;
    let completedEarly = false;

    const limiter = new Writable({
      write(chunk, encoding, callback) {
        if (completedEarly) return callback();

        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
        const remaining = maxBytes - forwarded;

        if (remaining <= 0) {
          completedEarly = true;
          writableStream.end();
          client.close();
          return callback();
        }

        const slice = buffer.length <= remaining ? buffer : buffer.subarray(0, remaining);
        forwarded += slice.length;

        const finalize = () => {
          if (forwarded >= maxBytes) {
            completedEarly = true;
            writableStream.end();
            client.close();
          }
          callback();
        };

        if (!writableStream.write(slice)) {
          writableStream.once('drain', finalize);
        } else {
          finalize();
        }
      },
      final(callback) {
        if (!completedEarly) writableStream.end();
        callback();
      },
    });

    await client.downloadTo(limiter, `${FTP_BASE}/${remotePath}`, startAt).catch((err) => {
      if (completedEarly) return;
      throw err;
    });
  } finally {
    client.close();
  }
}

/**
 * Downloads a remote file into memory as a Buffer.
 * Intended for small-to-medium chunks (e.g. upload chunk blocks).
 *
 * @param {string} remotePath - Path relative to FTP_BASE
 * @returns {Promise<Buffer>}
 */
export async function downloadBufferFromFtp(remotePath) {
  const client = await createClient();
  try {
    const parts = [];
    const sink = new PassThrough();
    sink.on('data', (chunk) => {
      parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    await client.downloadTo(sink, `${FTP_BASE}/${remotePath}`);
    return Buffer.concat(parts);
  } finally {
    client.close();
  }
}

/**
 * Returns the size (in bytes) of a remote file.
 *
 * @param {string} remotePath - Path relative to FTP_BASE
 * @returns {Promise<number>}
 */
export async function ftpFileSize(remotePath) {
  const client = await createClient();
  try {
    return await client.size(`${FTP_BASE}/${remotePath}`);
  } finally {
    client.close();
  }
}

/**
 * Deletes a file from the FTP server.
 * Silently ignores errors (e.g. file already deleted).
 *
 * @param {string} remotePath - Path relative to FTP_BASE
 */
export async function deleteFromFtp(remotePath) {
  const client = await createClient();
  try {
    await client.remove(`${FTP_BASE}/${remotePath}`);
  } catch (err) {
    console.warn('[ftp] delete warning:', err.message);
  } finally {
    client.close();
  }
}

/**
 * Renames/moves a remote file within the FTP base path.
 *
 * @param {string} fromRemotePath - Source path relative to FTP_BASE
 * @param {string} toRemotePath   - Target path relative to FTP_BASE
 */
export async function moveOnFtp(fromRemotePath, toRemotePath) {
  const client = await createClient();
  try {
    const fromFull = `${FTP_BASE}/${fromRemotePath}`;
    const toFull = `${FTP_BASE}/${toRemotePath}`;
    const toDir = path.posix.dirname(toFull);
    await client.ensureDir(toDir);
    await client.cd('/');
    await client.rename(fromFull, toFull);
  } finally {
    client.close();
  }
}

/**
 * Creates a directory (and any parent directories) on the FTP server.
 *
 * @param {string} remoteDirPath - Directory path relative to FTP_BASE
 */
export async function mkdirOnFtp(remoteDirPath) {
  const client = await createClient();
  try {
    await client.ensureDir(`${FTP_BASE}/${remoteDirPath}`);
  } finally {
    client.close();
  }
}

/**
 * Removes an empty directory from the FTP server.
 * Silently ignores errors (e.g. directory not empty or not found).
 *
 * @param {string} remoteDirPath - Directory path relative to FTP_BASE
 */
export async function removeDirOnFtp(remoteDirPath) {
  const client = await createClient();
  try {
    await client.removeDir(`${FTP_BASE}/${remoteDirPath}`);
  } catch (err) {
    console.warn('[ftp] removeDir warning:', err.message);
  } finally {
    client.close();
  }
}

/**
 * Renames/moves a directory on the FTP server.
 * Creates the target parent directory if needed.
 * Silently ignores errors (e.g. source not found).
 *
 * @param {string} fromDirPath - Source directory relative to FTP_BASE
 * @param {string} toDirPath   - Target directory relative to FTP_BASE
 */
export async function renameDirOnFtp(fromDirPath, toDirPath) {
  const client = await createClient();
  try {
    const fromFull = `${FTP_BASE}/${fromDirPath}`;
    const toFull = `${FTP_BASE}/${toDirPath}`;
    const toParent = path.posix.dirname(toFull);
    await client.ensureDir(toParent);
    await client.cd('/');
    await client.rename(fromFull, toFull);
  } catch (err) {
    console.warn('[ftp] renameDir warning:', err.message);
  } finally {
    client.close();
  }
}

/**
 * Check if a file exists on the FTP server.
 *
 * @param {string} remotePath - File path relative to FTP_BASE
 * @returns {Promise<boolean>} True if file exists
 */
export async function existsOnFtp(remotePath) {
  const client = await createClient();
  try {
    await client.size(`${FTP_BASE}/${remotePath}`);
    return true;
  } catch {
    return false;
  } finally {
    client.close();
  }
}

/**
 * Recursively list directories and files under FTP_BASE (or a subpath).
 *
 * @param {string} [remoteStartPath=''] - Path relative to FTP_BASE to start from
 * @returns {Promise<{ directories: Array<{ path: string }>, files: Array<{ path: string, size: number, modifiedAt: Date|null }> }>} 
 */
export async function listTreeOnFtp(remoteStartPath = '') {
  const client = await createClient();
  try {
    const normalize = (p) => String(p || '').replace(/^\/+|\/+$/g, '');
    const startRel = normalize(remoteStartPath);
    const startFull = startRel ? `${FTP_BASE}/${startRel}` : FTP_BASE;

    const directories = [];
    const files = [];
    const queue = [{ full: startFull, rel: startRel }];

    while (queue.length > 0) {
      const current = queue.shift();
      const entries = await client.list(current.full);

      for (const entry of entries) {
        if (!entry || !entry.name || entry.name === '.' || entry.name === '..') continue;
        const relPath = current.rel ? `${current.rel}/${entry.name}` : entry.name;

        if (entry.isDirectory) {
          directories.push({ path: relPath });
          queue.push({ full: `${current.full}/${entry.name}`, rel: relPath });
          continue;
        }

        if (entry.isFile) {
          files.push({
            path: relPath,
            size: Number(entry.size) || 0,
            modifiedAt: entry.modifiedAt instanceof Date ? entry.modifiedAt : null,
          });
        }
      }
    }

    return { directories, files };
  } finally {
    client.close();
  }
}
