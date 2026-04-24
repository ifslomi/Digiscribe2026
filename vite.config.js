import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { config as loadEnv } from 'dotenv'

loadEnv()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, 'server', 'uploads')
const devApiOrigin = `http://localhost:${process.env.PORT || 3001}`

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const EXT_TO_MIME = {
  // Images
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg', '.pjpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.tiff': 'image/tiff', '.tif': 'image/tiff', '.avif': 'image/avif', '.heic': 'image/heic', '.heif': 'image/heif',
  // Audio
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.aac': 'audio/aac',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.wma': 'audio/x-ms-wma', '.opus': 'audio/opus',
  '.aiff': 'audio/aiff', '.aif': 'audio/aiff', '.amr': 'audio/amr', '.mid': 'audio/midi', '.midi': 'audio/midi',
  // Video
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv', '.m4v': 'video/mp4', '.3gp': 'video/3gpp', '.ts': 'video/mp2t',
  '.ogv': 'video/ogg', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg',
}

function fileServerPlugin() {
  return {
    name: 'file-server',
    configureServer(server) {
      // GET /api/files — serve uploaded files from disk (metadata/bulk routes are proxied to Express)
      server.middlewares.use('/api/files', (req, res, next) => {
        if (req.method !== 'GET') return next()

        // Skip metadata & bulk routes — let proxy handle them
        const urlPath = req.url.replace(/^\//, '').split('?')[0]
        if (urlPath.startsWith('metadata') || urlPath.startsWith('bulk-')) return next()

        const filePath = urlPath
        const isDownload = req.url.includes('download=1')
        if (filePath) {
          // Decode URI components for backward compatibility with %2F-encoded paths
          const decoded = decodeURIComponent(filePath)

          // Prevent path traversal
          const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '')
          const fullPath = path.join(uploadsDir, normalized)

          // Verify the resolved path is still within uploadsDir
          if (!fullPath.startsWith(uploadsDir)) {
            res.writeHead(403)
            return res.end('Access denied')
          }

          // Try full structured path first, then fallback to basename (legacy flat files)
          let resolvedPath = fullPath
          if (!fs.existsSync(fullPath)) {
            const baseName = path.basename(normalized)
            const flatPath = path.join(uploadsDir, baseName)
            if (fs.existsSync(flatPath)) {
              resolvedPath = flatPath
            } else {
              // File is not in local dev uploads; allow proxy/backend to handle it.
              return next()
            }
          }

          const safeName = path.basename(resolvedPath)
          const ext = path.extname(safeName).toLowerCase()
          const mime = EXT_TO_MIME[ext] || 'application/octet-stream'
          const stat = fs.statSync(resolvedPath)
          const fileSize = stat.size

          // Range request support for video/audio seeking
          const rangeHeader = req.headers.range
          if (rangeHeader) {
            const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-')
            const start = parseInt(startStr, 10)
            const end = endStr ? parseInt(endStr, 10) : fileSize - 1

            if (start >= fileSize || end >= fileSize || start > end) {
              res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` })
              return res.end()
            }

            const chunkSize = end - start + 1
            res.writeHead(206, {
              'Content-Type': mime,
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Content-Length': chunkSize,
              'Accept-Ranges': 'bytes',
              'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${safeName}"`,
            })
            fs.createReadStream(resolvedPath, { start, end }).pipe(res)
          } else {
            res.writeHead(200, {
              'Content-Type': mime,
              'Content-Length': fileSize,
              'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${safeName}"`,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'public, max-age=3600',
            })
            fs.createReadStream(resolvedPath).pipe(res)
          }
          return
        }

        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [fileServerPlugin(), react()],
  server: {
    proxy: {
      '/api/upload': devApiOrigin,
      '/api/admin': devApiOrigin,
      '/api/quote': devApiOrigin,
      '/api/files': devApiOrigin,
      '/api/files/metadata': devApiOrigin,
      '/api/files/bulk-download': devApiOrigin,
      '/api/files/bulk-delete': devApiOrigin,
      '/api/files/bulk-move': devApiOrigin,
      '/api/files/bulk-status': devApiOrigin,
      '/api/files/download-folder': devApiOrigin,
      '/api/delete-jobs': devApiOrigin,
      '/api/pipeline': devApiOrigin,
      '/api/folders': devApiOrigin,
      '/api/lgus': devApiOrigin,
      '/api/transcriptions': devApiOrigin,
    },
  },
})
