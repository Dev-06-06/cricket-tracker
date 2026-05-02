const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

async function sendOTPEmail({ to, subject, otp, purpose }) {
  const purposeText = {
    verify: "verify your CricTrack account",
    reset: "reset your CricTrack password",
  }[purpose] || "complete your action";

  const html = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; background: #0d1117;
      color: #fff; padding: 40px 20px; max-width: 480px; margin: 0 auto;
      border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-flex; align-items: center; gap: 8px;">
          <div style="width: 32px; height: 32px; border-radius: 50%;
            background: #f97316; display: inline-flex; align-items: center;
            justify-content: center;">
            <span style="font-size: 14px; font-weight: 900; color: #0d1117;">C</span>
          </div>
          <span style="font-size: 18px; font-weight: 900;
            letter-spacing: 0.18em; text-transform: uppercase; color: #fff;">
            CricTrack
          </span>
        </div>
      </div>
      <p style="color: #94a3b8; font-size: 14px; margin-bottom: 8px;">
        Use this OTP to ${purposeText}.
      </p>
      <div style="background: rgba(249,115,22,0.1); border: 1px solid
        rgba(249,115,22,0.3); border-radius: 12px; padding: 24px;
        text-align: center; margin: 24px 0;">
        <p style="font-size: 40px; font-weight: 900; letter-spacing: 0.3em;
          color: #f97316; margin: 0;">${otp}</p>
        <p style="font-size: 12px; color: #64748b; margin-top: 8px;">
          Expires in 10 minutes
        </p>
      </div>
      <p style="color: #475569; font-size: 12px; text-align: center;">
        If you didn't request this, ignore this email.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"CricTrack" <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  });
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = { sendOTPEmail, generateOTP };