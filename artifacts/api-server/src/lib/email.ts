import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "Fulfill <accounts@paperalien.com>";

export async function sendInvitationEmail(opts: {
  to: string;
  inviterEmail: string;
  workspaceName: string;
  inviteUrl: string;
}): Promise<void> {
  const { to, inviterEmail, workspaceName, inviteUrl } = opts;

  await resend.emails.send({
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
}
