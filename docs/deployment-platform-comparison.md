# Deployment platform comparison (Fulfill)

This document compares the project’s current deployment stack (Fly.io, Cloudflare, Supabase, GitHub Actions) with alternatives such as a small AWS Linux instance or other VPS-style hosting. It is grounded in the repository as of the analysis date.

## What the project actually deploys

Fulfill runs as a single Fly.io application (`fulfill-paperalien`), in the `lax` region, on a 256MB machine. Express listens on port 3000. The React SPA is built into the Docker image with `BASE_PATH=/fulfill` and is served as static files under `/fulfill`; API routes live under `/api`. See `Dockerfile`, `fly.toml`, and `artifacts/api-server/src/app.ts`.

Traffic for `paperalien.com` is fronted by Cloudflare (DNS and SSL termination). The origin is Fly.io, typically with SSL mode set to “Full” so Cloudflare encrypts to Fly’s endpoint.

Deployments are triggered from GitHub Actions on pushes to `main`: install dependencies, run `pnpm run typecheck`, run `pnpm -F @workspace/pm-app test`, run `pnpm check:drift` and `pnpm check:schema`, then `flyctl deploy --remote-only`. Secrets such as `FLY_API_TOKEN` live in GitHub.

Supabase provides managed Postgres (used via Drizzle from the API) and authentication (magic links, sessions, JWTs). The API validates bearer tokens with `supabase.auth.getUser()` in `artifacts/api-server/src/middlewares/auth.ts`.

Fly is configured for scale-to-zero-style behavior: `auto_stop_machines = 'stop'`, `min_machines_running = 0`, with HTTP health checks against `/api/healthz`. That keeps cost low when idle at the expense of possible cold-start latency after idle periods.

In practice, “complexity” in this stack is several managed services with distinct roles—not a large fleet of hand-tuned servers.

## Current stack: pros and cons

### Pros

- **Predictable deploys:** Merging to `main` runs automated gates and deploys without routine SSH or manual pull/restart on a box.
- **Less VM toil:** Compared to a DIY Linux server, you are not on the hook for OS patching, baseline hardening, and the same day-to-day process supervision story (though Fly and the app still need monitoring).
- **SSL without certbot on the instance:** Cloudflare issues and renews certificates for the public hostname; the app does not run Let’s Encrypt renewal logic.
- **Supabase covers more than “send the magic link”:** It handles email OTP/magic-link UX, session and token refresh in the client, and server-side user resolution from JWTs. Replacing it means standing up email delivery, token issuance and verification, and session semantics yourself (or via another auth product)—a scoped project, not a config tweak.
- **Cost can stay small:** Stopped machines when idle align with a low-traffic side project, with cold starts as the tradeoff.

### Cons

- **More vendors and mental models:** Fly (machines, secrets, releases), Cloudflare (DNS, proxy, SSL mode), and Supabase (auth, DB) each have dashboards and failure modes. That can feel “busier” than one EC2 instance you SSH into.
- **Cold starts:** With `min_machines_running = 0`, the first request after idle may be slower while a machine starts.
- **Memory headroom:** A 256MB Node process is adequate until traffic, dependencies, or heap behavior push against the limit; you may need to resize or optimize later.
- **AWS familiarity is underused:** If your operational comfort is strongest on AWS, Fly-specific concepts are extra learning—not necessarily bad, but real.

## Small AWS EC2 (or similar VPS) without replacing Supabase

### Pros

- **Familiar operational pattern:** SSH, systemd or PM2, logs on disk, full root access—many teams already know this.
- **Flexible data plane:** You could point the app at Supabase’s Postgres as today, or introduce RDS later, without changing the “one box runs Node” picture.

### Cons

- **You do not remove Supabase by moving compute.** Auth and (today) the production database still depend on Supabase unless you deliberately migrate. You mostly relocate the Node process while keeping external auth and DB—or you sign up for a larger rewrite.
- **You inherit server ownership:** Updates, failure recovery, log retention, and a repeatable deploy story (ideally still CI-driven) become your responsibility. The workflow file you have today is portable in spirit but targets Fly; reproducing the same gates for EC2 is work.
- **TLS story:** Either you terminate TLS on the instance (e.g. certbot + reverse proxy), use an AWS load balancer with ACM, or keep a proxy like Cloudflare in front—each adds pieces or ongoing maintenance.

## Small AWS EC2 with “all-in on AWS” (replace Supabase auth; own or RDS Postgres)

### Pros

- **Single-cloud narrative:** Billing, IAM, and support channels can align with an AWS-first organization or personal preference.

### Cons

- **Highest upfront cost:** Auth (magic links or OTP, secure token handling, refresh, revocation) plus database hosting and migration (if leaving Supabase DB) is a deliberate project. It is not equivalent to “same code, different host.”

## Other valid options (brief)

- **AWS Lightsail:** Often simpler than raw EC2 for fixed bundles; the same Supabase-vs-rewrite tradeoffs apply for auth and DB.
- **Render, Railway, or similar PaaS:** Comparable to Fly for “connect repo, run build, serve container/process”; compare pricing, regions, and cold-start behavior.
- **ECS/Fargate or similar:** More native to AWS, but for one small app it often means more networking and IAM surface area than Fly for little gain unless you are standardizing on it.

## Recommendation

- If the priority is **low ongoing operational toil while keeping the current architecture**, **staying on Fly.io with Supabase** is the pragmatic default. Moving to EC2 **without** leaving Supabase mostly **moves** complexity onto a Linux host **without** reducing how many external systems the app depends on.
- If the priority is **deliberate consolidation on AWS** (compliance, unified billing, skill alignment), treat it as a **scoped migration**: choose compute, decide explicitly whether **Supabase Auth stays or is replaced**, and decide where **Postgres** lives—not as a quick “spin up a t3.nano” swap.

## References in this repo

- Architecture and diagram: `CLAUDE.md`
- Container and Fly config: `Dockerfile`, `fly.toml`
- CI/CD: `.github/workflows/fly-deploy.yml`
- Static SPA + API mounting: `artifacts/api-server/src/app.ts`
- JWT validation: `artifacts/api-server/src/middlewares/auth.ts`
