import {
  createRemoteJWKSet,
  jwtVerify,
  type JWK,
  type JWTVerifyGetKey,
} from "jose";
import type { KeyObject } from "node:crypto";
import type { RequestHandler } from "express";

// The key parameter accepted by `jwtVerify`: a concrete key (used in tests) or a
// JWKS resolver function (used in production via `createRemoteJWKSet`).
type KeyInput = CryptoKey | KeyObject | JWK | Uint8Array | JWTVerifyGetKey;

// Verifies a Supabase access token locally using the project's public signing
// keys (ES256 / ECC P-256). There is no network call to Supabase Auth on the
// request hot path: `keyResolver` (a `createRemoteJWKSet` instance in production)
// fetches the JWKS once and caches it, re-fetching only when it encounters an
// unknown key id after a rotation. Signature verification itself is pure CPU.
export function createRequireAuth(
  keyResolver: KeyInput,
  issuer: string,
): RequestHandler {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }
    const token = authHeader.slice(7);
    try {
      const options = { issuer, audience: "authenticated" } as const;
      // jwtVerify has disjoint overloads for a concrete key vs. a resolver
      // function, so branch to keep the call type-correct.
      const { payload } =
        typeof keyResolver === "function"
          ? await jwtVerify(token, keyResolver, options)
          : await jwtVerify(token, keyResolver, options);
      if (!payload.sub) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      req.user = {
        id: payload.sub,
        email: typeof payload.email === "string" ? payload.email : "",
      };
      next();
    } catch {
      // Any verification failure (bad signature, expired, wrong issuer/audience,
      // malformed token) is an authentication failure.
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}

// The production handler is built lazily so that importing this module (e.g. from
// unit tests that exercise `createRequireAuth` directly) does not require
// SUPABASE_URL to be set in the environment.
let productionHandler: RequestHandler | null = null;

function getProductionHandler(): RequestHandler {
  if (productionHandler) return productionHandler;

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL must be set for JWT verification");
  }

  // Supabase publishes its public signing keys at this endpoint.
  const jwks = createRemoteJWKSet(
    new URL("/auth/v1/.well-known/jwks.json", supabaseUrl),
  );
  // Supabase signs access tokens with `iss = <SUPABASE_URL>/auth/v1`.
  const issuer = new URL("/auth/v1", supabaseUrl).toString();

  productionHandler = createRequireAuth(jwks, issuer);
  return productionHandler;
}

export const requireAuth: RequestHandler = (req, res, next) =>
  getProductionHandler()(req, res, next);
