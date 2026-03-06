import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";
import { env } from "./config/env";
import logger from "./logger";

let _transporter: Mail | null = null;

function getTransporter(): Mail | null {
  if (_transporter) return _transporter;
  if (!env.EMAIL_USER || !env.EMAIL_APP_PASSWORD) {
    logger.warn(
      "EMAIL_USER or EMAIL_APP_PASSWORD not configured — subscriber notification emails disabled"
    );
    return null;
  }
  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_APP_PASSWORD,
    },
  });
  return _transporter;
}

/**
 * Send email notification when a new user subscribes to the beta list
 *
 * Sends an email to the site administrator with subscriber details.
 * Failure to send email will not prevent subscription from being recorded.
 *
 * @param subscriberData - Subscriber information
 * @param subscriberData.firstName - Subscriber's first name
 * @param subscriberData.email - Subscriber's email address
 * @returns Promise that resolves when email is sent or fails silently
 */
export async function sendSubscriberNotification(subscriberData: {
  firstName: string;
  email: string;
}) {
  const mailOptions = {
    from: env.EMAIL_USER,
    to: "jason@skatehubba.com",
    subject: "🛹 New SkateHubba Subscriber!",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f97316;">🛹 New Subscriber Alert!</h2>
        <p>You have a new subscriber to the SkateHubba newsletter:</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Name:</strong> ${subscriberData.firstName}</p>
          <p><strong>Email:</strong> ${subscriberData.email}</p>
          <p><strong>Subscribed at:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <p style="color: #666;">Keep building that community! 🚀</p>
      </div>
    `,
  };

  const transporter = getTransporter();
  if (!transporter) {
    logger.debug("Skipping subscriber notification email (not configured)");
    return;
  }

  try {
    await transporter.sendMail(mailOptions);
    logger.info("Subscriber notification email sent successfully");
  } catch (error) {
    logger.error("Failed to send subscriber notification email", { error: String(error) });
    // Don't throw error - we don't want subscription to fail if email fails
  }
}
