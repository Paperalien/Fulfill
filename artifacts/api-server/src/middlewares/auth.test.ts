import { describe, it, expect, vi, beforeAll } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import type { Request, Response } from "express";
import { createRequireAuth } from "./auth";

const ISSUER = "https://test.supabase.co/auth/v1";

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let privateKey: SigningKey;
let publicKey: SigningKey;
// A second, unrelated keypair used to simulate a token signed by a different key.
let otherPrivateKey: SigningKey;

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair("ES256"));
  ({ privateKey: otherPrivateKey } = await generateKeyPair("ES256"));
});

interface TokenOptions {
  sub?: string | null;
  email?: string | null;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  signWith?: SigningKey;
}

async function makeToken(opts: TokenOptions = {}): Promise<string> {
  const claims: Record<string, unknown> = {};
  if (opts.email !== null) claims.email = opts.email ?? "user@example.com";

  let builder = new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? "authenticated")
    .setExpirationTime(opts.expiresIn ?? "1h");

  if (opts.sub !== null) builder = builder.setSubject(opts.sub ?? "user-123");

  return builder.sign(opts.signWith ?? privateKey);
}

function mockContext(authHeader?: string) {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;

  const res = {
    statusCode: 200 as number,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };

  const next = vi.fn();
  return { req, res: res as unknown as Response & typeof res, next };
}

describe("createRequireAuth", () => {
  it("accepts a valid token and attaches req.user", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const token = await makeToken({ sub: "abc-123", email: "a@b.com" });
    const { req, res, next } = mockContext(`Bearer ${token}`);

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: "abc-123", email: "a@b.com" });
    expect(res.statusCode).toBe(200);
  });

  it("defaults email to empty string when the claim is absent", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const token = await makeToken({ sub: "no-email", email: null });
    const { req, res, next } = mockContext(`Bearer ${token}`);

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: "no-email", email: "" });
  });

  it("rejects a request with no Authorization header", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const { req, res, next } = mockContext();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: "Missing or invalid Authorization header",
    });
  });

  it("rejects an Authorization header without the Bearer scheme", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const token = await makeToken();
    const { req, res, next } = mockContext(token); // no "Bearer " prefix

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects an expired token", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const token = await makeToken({ expiresIn: "-1h" });
    const { req, res, next } = mockContext(`Bearer ${token}`);

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Invalid or expired token" });
  });

  it("rejects a token with the wrong issuer", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const token = await makeToken({ issuer: "https://evil.example.com/auth/v1" });
    const { req, res, next } = mockContext(`Bearer ${token}`);

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects a token with the wrong audience", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const token = await makeToken({ audience: "anon" });
    const { req, res, next } = mockContext(`Bearer ${token}`);

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects a token signed by a different key (bad signature)", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const token = await makeToken({ signWith: otherPrivateKey });
    const { req, res, next } = mockContext(`Bearer ${token}`);

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects a token without a subject claim", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const token = await makeToken({ sub: null });
    const { req, res, next } = mockContext(`Bearer ${token}`);

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects a malformed token string", async () => {
    const middleware = createRequireAuth(publicKey, ISSUER);
    const { req, res, next } = mockContext("Bearer not-a-real-jwt");

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
