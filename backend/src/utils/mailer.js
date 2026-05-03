const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const PURPOSE_MAP = {
  verify: "verify your CricTrack account",
  reset: "reset your CricTrack password",
};

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildHtmlEmail(otp, purpose) {
  const actionText = PURPOSE_MAP[purpose] || "complete your action";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CricTrack OTP</title>
  </head>
  <body style="margin:0;padding:0;background:#060a10;font-family:Arial,Helvetica,sans-serif;color:#e2e8f0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
      style="background:#060a10;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
            style="max-width:520px;background:#0d1117;border:1px solid rgba(249,115,22,0.15);
            border-radius:20px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.4);">

            <!-- HEADER -->
            <tr>
              <td style="padding:32px 32px 24px;text-align:center;
                background:linear-gradient(180deg,rgba(249,115,22,0.1),rgba(13,17,23,0));">

                <!-- Logo row using table -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                  align="center" style="margin:0 auto 20px;">
                  <tr>
                    <td align="center" valign="middle"
                      style="width:34px;height:34px;background:#f97316;
                      border-radius:50%;text-align:center;line-height:34px;">
                      <span style="font-size:15px;font-weight:900;
                        color:#0d1117;line-height:34px;">C</span>
                    </td>
                    <td width="10"></td>
                    <td align="left" valign="middle">
                      <span style="font-size:17px;font-weight:900;
                        letter-spacing:4px;text-transform:uppercase;
                        color:#ffffff;">CRICTRACK</span>
                    </td>
                  </tr>
                </table>

                <h1 style="margin:0 0 10px;font-size:26px;line-height:1.2;
                  color:#f9fbff;font-weight:800;">
                  Your one-time passcode
                </h1>
                <p style="margin:0;font-size:14px;line-height:1.7;color:#94a3b8;">
                  Use this code to ${actionText}.
                </p>
              </td>
            </tr>

            <!-- OTP BOX -->
            <tr>
              <td style="padding:8px 32px 0;text-align:center;">
                <div style="display:inline-block;padding:20px 32px;
                  border-radius:14px;background:#0b1220;
                  border:1px solid rgba(249,115,22,0.35);">
                  <span style="font-size:36px;font-weight:800;
                    letter-spacing:10px;color:#f97316;
                    font-family:'Courier New',monospace;">
                    ${otp}
                  </span>
                </div>
                <p style="margin:14px 0 0;font-size:13px;
                  line-height:1.6;color:#64748b;">
                  Expires in 10 minutes
                </p>
              </td>
            </tr>

            <!-- FOOTER NOTE -->
            <tr>
              <td style="padding:28px 32px 32px;text-align:center;">
                <p style="margin:0 0 20px;font-size:13px;
                  line-height:1.8;color:#475569;">
                  If you did not request this code, you can safely ignore this email.
                </p>
                <hr style="border:none;border-top:1px solid rgba(255,255,255,0.05);
                  margin:0 0 20px;">
                <p style="margin:0;font-size:11px;letter-spacing:2px;
                  text-transform:uppercase;color:#1e293b;">
                  From gully to glory &nbsp;·&nbsp; CricTrack
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendOTPEmail({ to, subject, otp, purpose }) {
  const textBody = `Your CricTrack one-time passcode is ${otp}. It expires in 10 minutes.`;
  const htmlBody = buildHtmlEmail(otp, purpose);

  await transporter.sendMail({
    from: `"CricTrack" <${process.env.MAIL_USER}>`,
    to,
    subject,
    text: textBody,
    html: htmlBody,
  });
}

module.exports = { sendOTPEmail, generateOTP };