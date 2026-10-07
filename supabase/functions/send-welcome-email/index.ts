/// <reference path="../deno.d.ts" />
// Supabase Edge Function: send-welcome-email
// Sends dual emails via Resend:
//  1. Welcome email -> to the waitlist subscriber
//  2. Founder/Admin notification -> to the ADMIN_EMAIL secret address
// Uses EdgeRuntime.waitUntil() for zero-latency background execution.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ─── CORS Headers ────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Email HTML Template (built ONCE at module load) ────────────────────────
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
                © 2026 Enrollaa · You received this because you joined the waitlist at enrollaa.com.ng<br/>
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

// ─── Send Welcome Email via Resend (with 4-second timeout guard) ───────────────
async function sendWelcomeEmail(name: string, email: string, apiKey: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    console.error(`[send-welcome-email] Welcome email Resend fetch ABORTED after 4000ms for ${email}`);
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
        from: "Enrollaa <hello@enrollaa.com.ng>",
        to: [email],
        subject: "You're on the Enrollaa Waitlist! 🎉",
        html,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const elapsed = Date.now() - t0;

    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      body = { raw: await res.text().catch(() => "(unreadable)") };
    }

    if (!res.ok) {
      console.error(`[send-welcome-email] Welcome email Resend error ${res.status} in ${elapsed}ms:`, JSON.stringify(body));
      return { ok: false, error: `Resend HTTP ${res.status}: ${JSON.stringify(body)}` };
    }

    console.log(`[send-welcome-email] Welcome email sent OK in ${elapsed}ms → id=${body.id} to=${email}`);
    return { ok: true, id: body.id as string };

  } catch (err: unknown) {
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.includes("aborted") || msg.includes("AbortError");
    console.error(`[send-welcome-email] Welcome email fetch ${isAbort ? "TIMEOUT" : "EXCEPTION"} after ${elapsed}ms:`, msg);
    return { ok: false, error: isAbort ? "Resend API timeout (>4s)" : msg };
  }
}

// ─── Send Founder/Admin Notification via Resend ──────────────────────────────
async function sendAdminNotification(name: string, email: string, apiKey: string, adminEmail: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!adminEmail) {
    console.log("[send-welcome-email] ADMIN_EMAIL secret is not set, skipping founder notification.");
    return { ok: false, error: "ADMIN_EMAIL secret is not set" };
  }

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    console.error(`[send-welcome-email] Admin notification fetch ABORTED after 4000ms`);
  }, 4000);

  try {
    const timestamp = new Date().toISOString();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>New Enrollaa waitlist signup</title>
</head>
<body style="margin:0;padding:0;background-color:#0D1117;font-family:system-ui,-apple-system,sans-serif;color:#FFFFFF;">
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
              <h2 style="color:#37E915;font-size:22px;font-weight:700;margin:0 0 16px;">
                New Enrollaa waitlist signup 🎉
              </h2>
              <p style="color:#A5ADCF;font-size:15px;line-height:1.6;margin:0 0 20px;">
                A new user has just joined the Enrollaa waitlist:
              </p>
              <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:20px;margin-bottom:20px;">
                <p style="color:#FFFFFF;font-size:15px;margin:0 0 8px;"><strong>Name:</strong> ${name}</p>
                <p style="color:#FFFFFF;font-size:15px;margin:0 0 8px;"><strong>Email:</strong> ${email}</p>
                <p style="color:#A5ADCF;font-size:14px;margin:0;"><strong>Joined:</strong> ${timestamp}</p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Enrollaa <hello@enrollaa.com.ng>",
        to: [adminEmail],
        subject: "New Enrollaa waitlist signup",
        html,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    const elapsed = Date.now() - t0;

    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      body = { raw: await res.text().catch(() => "(unreadable)") };
    }

    if (!res.ok) {
      console.error(`[send-welcome-email] Admin notification Resend error ${res.status} in ${elapsed}ms:`, JSON.stringify(body));
      return { ok: false, error: `Resend HTTP ${res.status}: ${JSON.stringify(body)}` };
    }

    console.log(`[send-welcome-email] Admin notification sent OK in ${elapsed}ms → id=${body.id}`);
    return { ok: true, id: body.id as string };

  } catch (err: unknown) {
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = msg.includes("aborted") || msg.includes("AbortError");
    console.error(`[send-welcome-email] Admin notification fetch ${isAbort ? "TIMEOUT" : "EXCEPTION"} after ${elapsed}ms:`, msg);
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

  const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") ?? "").trim();

  console.log(`[send-welcome-email] Received signup event — name="${name}" email="${email}"`);

  // 4. Dispatch both emails concurrently (Welcome email + Admin notification)
  const dualEmailPromise = Promise.allSettled([
    sendWelcomeEmail(name, email, RESEND_API_KEY),
    sendAdminNotification(name, email, RESEND_API_KEY, ADMIN_EMAIL),
  ]);

  // Use EdgeRuntime.waitUntil() so emails process in background without blocking response
  // @ts-ignore — EdgeRuntime is a Deno Deploy / Supabase global
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(
      dualEmailPromise.then(([welcomeRes, adminRes]) => {
        const elapsed = Date.now() - start;
        if (welcomeRes.status === "fulfilled" && welcomeRes.value.ok) {
          console.log(`[send-welcome-email] Welcome email DONE in ${elapsed}ms — id=${welcomeRes.value.id}`);
        } else {
          const err = welcomeRes.status === "fulfilled" ? welcomeRes.value.error : welcomeRes.reason;
          console.error(`[send-welcome-email] Welcome email FAILED after ${elapsed}ms:`, err);
        }

        if (adminRes.status === "fulfilled" && adminRes.value.ok) {
          console.log(`[send-welcome-email] Admin notification DONE in ${elapsed}ms — id=${adminRes.value.id}`);
        } else if (ADMIN_EMAIL) {
          const err = adminRes.status === "fulfilled" ? adminRes.value.error : adminRes.reason;
          console.error(`[send-welcome-email] Admin notification FAILED after ${elapsed}ms:`, err);
        }
      })
    );

    console.log(`[send-welcome-email] Response sent immediately to client in ${Date.now() - start}ms`);
    return new Response(
      JSON.stringify({ ok: true, message: "Emails queued" }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  // 5. Fallback: await directly if EdgeRuntime.waitUntil is unavailable
  const [welcomeRes, adminRes] = await dualEmailPromise;
  const elapsed = Date.now() - start;

  const welcomeOk = welcomeRes.status === "fulfilled" && welcomeRes.value.ok;
  if (!welcomeOk) {
    const err = welcomeRes.status === "fulfilled" ? welcomeRes.value.error : String(welcomeRes.reason);
    console.error(`[send-welcome-email] Welcome email FAILED in ${elapsed}ms:`, err);
    return new Response(
      JSON.stringify({ ok: false, error: err }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }

  console.log(`[send-welcome-email] Both emails processed in ${elapsed}ms`);
  return new Response(
    JSON.stringify({
      ok: true,
      welcomeId: welcomeRes.status === "fulfilled" ? welcomeRes.value.id : undefined,
      adminId: adminRes.status === "fulfilled" ? adminRes.value.id : undefined,
    }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
});
