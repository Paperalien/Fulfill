import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { fileURLToPath } from "url";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = process.env['FRONTEND_DIST']
  ?? path.join(__dirname, '../../pm-app-dist');

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use("/api", router);

// Serve the SPA at the root (the app lives at the root of its own subdomain,
// e.g. https://fulfill.paperalien.com). Static assets first; any unmatched
// /api/* path returns a JSON 404 (so API consumers never receive index.html);
// everything else falls through to the SPA shell for client-side routing.
app.use(express.static(frontendDist));
app.use('/api', (_req, res) => {
  res.status(404).json({ error: "Not found" });
});
app.get('/*splat', (_req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// Global error handler — catches any unhandled throws from route handlers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  (req as Request & { log: { error: (err: unknown, msg: string) => void } }).log?.error(err, "Unhandled error");
  logger.error(err, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
