import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerRoutes } from './routes.ts';
import { setupVite, log } from './vite-dev.ts';
import { env } from './config/env.ts';
import compression from 'compression';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import logger from './logger.ts';
import { ensureCsrfToken } from './middleware/csrf.ts';
import { apiLimiter } from './middleware/security.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Security middleware
if (process.env.NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
  }));
}

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    const allowed = process.env.ALLOWED_ORIGINS?.split(',') || [];
    // Allow requests with no origin (like mobile apps) or matching allowed domains
    if (!origin || allowed.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(ensureCsrfToken);

// Global rate limiting for all API routes
app.use('/api', apiLimiter);

// Register all API routes
await registerRoutes(app);

// Setup Vite dev server or production static file serving
if (process.env.NODE_ENV === 'development') {
  await setupVite(app, server);
} else {
  const publicDir = path.resolve(__dirname, '../public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// Start server
const port = parseInt(process.env.PORT || '5000', 10);
server.listen(port, '0.0.0.0', () => {
  const mode = process.env.NODE_ENV || 'development';
  if (mode === 'development') {
    log(`Server running at http://0.0.0.0:${port}`, 'server');
  } else {
    logger.info(`SkateHubba production server running on port ${port}`);
  }
});
