import { Resend } from 'resend';
import { env } from '../config/env';
import logger from '../logger';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

if (!resend) {
  logger.warn('RESEND_API_KEY not configured — password reset and verification emails will be logged to console only');
}

// Email templates
const getVerificationEmailTemplate = (name: string, verificationUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your SkateHubba account</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #181818; color: #fafafa;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #f97316; font-size: 32px; margin: 0;">🛹 SkateHubba</h1>
      <p style="color: #fafafa; margin: 10px 0 0 0;">Own your tricks. Play SKATE anywhere.</p>
    </div>
    
    <div style="background-color: #232323; border-radius: 8px; padding: 30px; border: 1px solid #333;">
      <h2 style="color: #fafafa; margin-top: 0;">Welcome to SkateHubba, ${name}!</h2>
      
      <p style="color: #fafafa; line-height: 1.6;">
        Thanks for signing up! To complete your registration and start connecting with the skateboarding community, please verify your email address.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" 
           style="background-color: #f97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      
      <p style="color: #888; font-size: 14px; line-height: 1.6;">
        If the button doesn't work, copy and paste this link into your browser:
        <br>
        <a href="${verificationUrl}" style="color: #f97316; word-break: break-all;">${verificationUrl}</a>
      </p>
      
      <p style="color: #888; font-size: 14px; margin-top: 30px;">
        This verification link will expire in 24 hours. If you didn't create an account with SkateHubba, you can safely ignore this email.
      </p>
    </div>
    
    <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
      <p>© 2026 SkateHubba. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

const getPasswordResetEmailTemplate = (name: string, resetUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your SkateHubba password</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #181818; color: #fafafa;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #f97316; font-size: 32px; margin: 0;">🛹 SkateHubba</h1>
      <p style="color: #fafafa; margin: 10px 0 0 0;">Own your tricks. Play SKATE anywhere.</p>
    </div>
    
    <div style="background-color: #232323; border-radius: 8px; padding: 30px; border: 1px solid #333;">
      <h2 style="color: #fafafa; margin-top: 0;">Reset Your Password</h2>
      
      <p style="color: #fafafa; line-height: 1.6;">
        Hi ${name},
      </p>
      
      <p style="color: #fafafa; line-height: 1.6;">
        We received a request to reset your SkateHubba password. Click the button below to create a new password:
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" 
           style="background-color: #f97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
          Reset Password
        </a>
      </div>
      
      <p style="color: #888; font-size: 14px; line-height: 1.6;">
        If the button doesn't work, copy and paste this link into your browser:
        <br>
        <a href="${resetUrl}" style="color: #f97316; word-break: break-all;">${resetUrl}</a>
      </p>
      
      <p style="color: #888; font-size: 14px; margin-top: 30px;">
        This password reset link will expire in 24 hours. If you didn't request a password reset, you can safely ignore this email.
      </p>
    </div>
    
    <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
      <p>© 2026 SkateHubba. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

const getBaseUrl = (): string => {
  if (env.NODE_ENV === 'production') {
    return env.PRODUCTION_URL || 'https://skatehubba.com';
  }
  // Dev: use Vite dev server port (5173), not Express port (3001)
  return `http://localhost:${process.env.DEV_VITE_PORT || '5173'}`;
};

// Send verification email
export async function sendVerificationEmail(email: string, token: string, name: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  if (resend) {
    await resend.emails.send({
      from: 'SkateHubba <hello@skatehubba.com>',
      to: email,
      subject: 'Verify your SkateHubba account 🛹',
      html: getVerificationEmailTemplate(name, verificationUrl),
    });
  } else {
    // Log without PII in message string (email goes in structured context
    // where the logger's redact() can mask it). Never log the full URL
    // since it contains the secret verification token.
    logger.warn('Verification email not sent (RESEND_API_KEY not configured)', { email });
  }
}

// Send password reset email
export async function sendPasswordResetEmail(email: string, token: string, name: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  if (resend) {
    await resend.emails.send({
      from: 'SkateHubba <hello@skatehubba.com>',
      to: email,
      subject: 'Reset your SkateHubba password',
      html: getPasswordResetEmailTemplate(name, resetUrl),
    });
  } else {
    logger.warn('Password reset email not sent (RESEND_API_KEY not configured)', { email });
  }
}
