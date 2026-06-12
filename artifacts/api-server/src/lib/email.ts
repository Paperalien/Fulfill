import { Resend } from "resend";

const FROM = "Fulfill <accounts@paperalien.com>";

// Construct the Resend client lazily (R3): doing it at module load throws
// "Missing API key" when RESEND_API_KEY is unset, which would crash the whole
// server on boot — even for deployments/dev that never send mail. Build it on
// first use instead, and fail with a clear error only when a send is attempted.
let client: Resend | null = null;
function resendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set — cannot send email");
  }
  return (client ??= new Resend(apiKey));
}

export async function sendInvitationEmail(opts: {
  to: string;
  inviterEmail: string;
  workspaceName: string;
  inviteUrl: string;
}): Promise<void> {
  const { to, inviterEmail, workspaceName, inviteUrl } = opts;

  const { error } = await resendClient().emails.send({
    from: FROM,
    to,
    subject: `${inviterEmail} invited you to join ${workspaceName} on Fulfill`,
    html: `
      <p>Hi,</p>
      <p><strong>${inviterEmail}</strong> has invited you to collaborate in the
      <strong>${workspaceName}</strong> workspace on <strong>Fulfill</strong>,
      a task management app.</p>
      <p style="margin: 24px 0;">
        <a href="${inviteUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
          Join ${workspaceName}
        </a>
      </p>
      <p>This invitation expires in 7 days. If you weren't expecting this, you can safely ignore it.</p>
      <p style="color:#6b7280;font-size:13px;">
        Can't click the button? Copy this link into your browser:<br>
        ${inviteUrl}
      </p>
    `,
  });

  // Surface delivery failures (R3): Resend reports API errors via the returned
  // `{ error }` rather than throwing, so the previous code silently reported
  // success even when no email was sent. Throw so the caller returns a real error.
  if (error) {
    throw new Error(`Failed to send invitation email: ${error.message ?? String(error)}`);
  }
}
