// Supabase Edge Function: send-welcome-email
// FIX: Resolves 546 WORKER_RESOURCE_LIMIT by:
//  1. Building HTML template ONCE at module scope (not per-request)
//  2. Adding a 4-second AbortController timeout on the Resend fetch
//  3. Using EdgeRuntime.waitUntil() so response returns immediately,
//     email is sent in the background — no user-facing timeout
//  4. Structured logging at every step for traceability

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─── CORS Headers ────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Email HTML Template (built ONCE at module load, not per request) ─────────
// This is the critical fix for 546: heavy string work happens at cold-start,
// not on every invocation. The {{NAME}} placeholder is replaced per-request
// with a single lightweight .replace() call.
const EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Welcome to Enrollaa</title>
</head>
<body style="margin:0;padding:0;background-color:#0D1117;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:560px;background:#151152;border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#0F0040,#1a0060);padding:32px;text-align:center;">
              <span style="font-size:36px;font-weight:800;color:#FFFFFF;letter-spacing:-1px;">
                Enr<span style="color:#37E915;">o</span>llaa
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;">
              <h1 style="color:#FFFFFF;font-size:24px;font-weight:700;margin:0 0 12px;">
                You're officially on the list, {{NAME}}! 🎉
              </h1>
              <p style="color:#A5ADCF;font-size:16px;line-height:1.6;margin:0 0 24px;">
                Thank you for joining the Enrollaa waitlist. We're building a real-time JAMB
                admission tracker that gives Nigerian students the clarity and confidence they deserve.
              </p>
              <p style="color:#A5ADCF;font-size:16px;line-height:1.6;margin:0 0 24px;">
                You'll be the <strong style="color:#FFFFFF;">first to know</strong> when we launch,
                and as an early member, you'll get exclusive early access.
              </p>
              <div style="background:rgba(55,233,21,0.08);border:1px solid rgba(55,233,21,0.3);border-radius:12px;padding:20px;margin-bottom:28px;">
                <p style="color:#37E915;font-size:14px;font-weight:600;margin:0 0 8px;">✅ What's coming for you:</p>
                <ul style="color:#A5ADCF;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
                  <li>Real-time JAMB admission status tracking</li>
                  <li>AI-powered score analysis &amp; cut-off predictions</li>
                  <li>Instant admission list alerts — zero scams</li>
                  <li>Post-UTME updates for Nigerian universities</li>
                </ul>
              </div>
              <p style="color:#A5ADCF;font-size:14px;line-height:1.6;margin:0 0 12px;">
                Until then, follow us for updates:
              </p>
              <p style="margin:0;">
                <a href="https://twitter.com/useenrollaa" style="color:#37E915;text-decoration:none;font-weight:600;">Twitter/X</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="https://instagram.com/useenrollaa" style="color:#37E915;text-decoration:none;font-weight:600;">Instagram</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="https://tiktok.com/@useenrollaa" style="color:#37E915;text-decoration:none;font-weight:600;">TikTok</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid rgba(255,255,255,0.08);padding:24px 32px;text-align:center;">
              <p style="color:#5A6273;font-size:12px;margin:0;">
                © 2026 Enrollaa · You received this because you joined the waitlist at enrollaa.com<br/>
                If you didn't sign up, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

// ─── Send Email via Resend (with 4-second hard timeout) ───────────────────────
async function sendWelcomeEmail(name: string, email: string, apiKey: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const t0 = Date.now();

  // AbortController gives us a clean exit if Resend takes too long
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    console.error(`[send-welcome-email] Resend fetch ABORTED after 4000ms for ${email}`);
  }, 4000);

  try {
    const html = EMAIL_TEMPLATE.replace("{{NAME}}", name);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // ⚠️  Change this to your verified Resend sender domain.
        // During testing use: onboarding@resend.dev (delivers only to your own account email)
        from: "Enrollaa <hello@enrollaa.com>",
        to: [email],
        subject: "You're on the Enrollaa Waitlist! 🎉",
        html,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const elapsed = Date.now() - t0;

    // Read body safely — a failed response might have a non-JSON body
    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      body = { raw: await res.text().catch(() => "(unreadable)") };
    }

    if (!res.ok) {
      console.error(`[send-welcome-email] Resend error ${res.status} in ${elapsed}ms:`, JSON.stringify(body));
      return { ok: false, error: `Resend HTTP ${res.status}: ${JSON.stringify(body)}` };
    }

    console.log(`[send-welcome-email] Email sent OK in ${elapsed}ms → id=${body.id} to=${email}`);
    return { ok: true, id: body.id as string };

  } catch (err: unknown) {
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.includes("aborted") || msg.includes("AbortError");
    console.error(`[send-welcome-email] Fetch ${isAbort ? "TIMEOUT" : "EXCEPTION"} after ${elapsed}ms:`, msg);
    return { ok: false, error: isAbort ? "Resend API timeout (>4s)" : msg };
  }
}

// ─── Edge Function Handler ────────────────────────────────────────────────────
serve(async (req: Request) => {
  const start = Date.now();

  // 1. CORS preflight — return instantly
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // 2. Parse body
  let name: string, email: string;
  try {
    const body = await req.json();
    name = (body.name ?? "").toString().trim();
    email = (body.email ?? "").toString().trim().toLowerCase();
  } catch {
    console.error("[send-welcome-email] Failed to parse request JSON");
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  if (!name || !email) {
    console.error(`[send-welcome-email] Missing fields — name="${name}" email="${email}"`);
    return new Response(
      JSON.stringify({ ok: false, error: "name and email are required" }),
      { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  // 3. Validate API key is configured
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!RESEND_API_KEY) {
    console.error("[send-welcome-email] RESEND_API_KEY secret is not set");
    return new Response(
      JSON.stringify({ ok: false, error: "Email service not configured — RESEND_API_KEY missing" }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  console.log(`[send-welcome-email] Received request — name="${name}" email="${email}"`);

  // 4. KEY FIX: Use EdgeRuntime.waitUntil() so the email is sent in the
  //    background AFTER we've already returned 200 to the browser.
  //    This means Resend latency (0–3s) NEVER causes a timeout for the user.
  //    The function worker stays alive to finish the email send.
  const emailPromise = sendWelcomeEmail(name, email, RESEND_API_KEY);

  // Check if waitUntil is available (it is in Supabase Edge Runtime)
  // @ts-ignore — EdgeRuntime is a Deno Deploy / Supabase global
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(
      emailPromise.then((result) => {
        const elapsed = Date.now() - start;
        if (!result.ok) {
          console.error(`[send-welcome-email] Background email FAILED after ${elapsed}ms:`, result.error);
        } else {
          console.log(`[send-welcome-email] Background email DONE in ${elapsed}ms — id=${result.id}`);
        }
      })
    );

    // Respond to the browser immediately — don't wait for Resend
    console.log(`[send-welcome-email] Response sent immediately to client in ${Date.now() - start}ms`);
    return new Response(
      JSON.stringify({ ok: true, message: "Email queued" }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  // 5. Fallback: if waitUntil is unavailable, await directly (still has timeout guard)
  const result = await emailPromise;
  const elapsed = Date.now() - start;

  if (!result.ok) {
    console.error(`[send-welcome-email] Email FAILED in ${elapsed}ms:`, result.error);
    return new Response(
      JSON.stringify({ ok: false, error: result.error }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  console.log(`[send-welcome-email] Email SUCCESS in ${elapsed}ms — id=${result.id}`);
  return new Response(
    JSON.stringify({ ok: true, id: result.id }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
});
