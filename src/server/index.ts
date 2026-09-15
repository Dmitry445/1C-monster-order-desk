import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { documentsRouter } from './routes/documents';

export function createExpressApp(appBasePath?: string): express.Application {
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : true
    })
  );
  app.use(express.json({ limit: '100kb' }));

  app.use(
    (error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (error instanceof SyntaxError && 'body' in error) {
        return res
          .status(400)
          .json({ code: 'INVALID_JSON', message: 'Некорректный JSON', retryable: false });
      }
      return next(error);
    }
  );

  app.use('/api/documents', documentsRouter);

  const basePath = appBasePath ?? process.cwd();
  const isStaticMode =
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'test' ||
    fs.existsSync(path.join(basePath, 'dist/client/index.html'));

  const clientPath = path.join(basePath, isStaticMode ? 'dist/client' : 'src/client');
  app.use(express.static(clientPath));

  if (isStaticMode) {
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientPath, 'index.html'));
    });
  }

  return app;
}

export interface ServerInstance {
  server: http.Server;
  port: number;
  stop: () => Promise<void>;
}

export interface ServerOptions {
  port?: number;
  appBasePath?: string;
}

export function startServer(portOrOptions?: number | ServerOptions): Promise<ServerInstance> {
  const options: ServerOptions =
    typeof portOrOptions === 'number' ? { port: portOrOptions } : (portOrOptions ?? {});

  const port = options.port ?? Number(process.env.PORT ?? 3000);

  if (Number.isNaN(port) || port < 0) {
    throw new Error('Invalid PORT value');
  }

  const app = createExpressApp(options.appBasePath);

  return new Promise((resolve, reject) => {
    const server = http.createServer(app);

    server.once('error', reject);

    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;

      // eslint-disable-next-line no-console
      console.log(`Сервер запущен на http://127.0.0.1:${actualPort}`);

      resolve({
        server,
        port: actualPort,
        stop: () =>
          new Promise<void>((stopResolve, stopReject) => {
            server.close(err =>
              err !== null && err !== undefined ? stopReject(err) : stopResolve()
            );
          })
      });
    });
  });
}

// Запуск в автономном режиме (когда скрипт выполняется напрямую через node/tsx)
if (require.main === module) {
  startServer().catch(err => {
    // eslint-disable-next-line no-console
    console.error('Ошибка запуска сервера:', err);
    process.exit(1);
  });
}
