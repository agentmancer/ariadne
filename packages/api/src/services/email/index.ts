/**
 * Email Service
 * Handles sending emails via Resend, with fallback to SMTP
 */

import { Resend } from 'resend';
import { config } from '../../config';
import { prisma } from '../../lib/prisma';
import { renderMarkdownWithVariables, stripHtml } from '../markdown';

// ============================================
// TYPES
// ============================================

export interface SendEmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EnrollmentEmailData {
  participantEmail: string;
  participantName: string;
  studyId: string;
  studyName: string;
  emailTemplate?: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================
// EMAIL CLIENT
// ============================================

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!config.email.resend.apiKey) {
    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(config.email.resend.apiKey);
  }

  return resendClient;
}

// ============================================
// CORE EMAIL SENDING
// ============================================

/**
 * Send an email using the configured provider
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const { to, subject, html, text, from, replyTo } = options;
  const fromAddress = from || config.email.from;

  // Try Resend first
  if (config.email.provider === 'resend') {
    const client = getResendClient();

    if (!client) {
      console.warn('⚠️ Resend API key not configured, skipping email');
      return { success: false, error: 'Email provider not configured' };
    }

    try {
      const result = await client.emails.send({
        from: fromAddress,
        to: [to],
        subject,
        html: html || text || '',
        text: text || (html ? stripHtml(html) : ''),
        replyTo,
      });

      if (result.error) {
        console.error('❌ Resend error:', result.error);
        return { success: false, error: result.error.message };
      }

      return { success: true, messageId: result.data?.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Failed to send email via Resend:', message);
      return { success: false, error: message };
    }
  }

  // SMTP fallback (not implemented in this version)
  console.warn('⚠️ SMTP provider not implemented, skipping email');
  return { success: false, error: 'SMTP provider not implemented' };
}

// ============================================
// ENROLLMENT EMAILS
// ============================================

/**
 * Default enrollment confirmation email template
 */
const DEFAULT_ENROLLMENT_TEMPLATE = `
# Welcome to {{studyName}}!

Dear {{participantName}},

Thank you for enrolling in our research study. Your participation is greatly appreciated.

## What happens next?

You will receive further instructions via email when it's time to participate in the study. Please keep an eye on your inbox.

## Questions?

If you have any questions about the study, please reply to this email.

Thank you again for your participation!

Best regards,
The Research Team
`;

/**
 * Send enrollment confirmation email to a participant
 */
export async function sendEnrollmentConfirmation(
  data: EnrollmentEmailData
): Promise<EmailResult> {
  const { participantEmail, participantName, studyId, studyName, emailTemplate } = data;

  const template = emailTemplate || DEFAULT_ENROLLMENT_TEMPLATE;

  // Render the email with variable substitution
  const html = renderMarkdownWithVariables(template, {
    participantName,
    studyName,
    participantEmail,
  });

  const text = stripHtml(html);

  const result = await sendEmail({
    to: participantEmail,
    subject: `Enrollment Confirmed: ${studyName}`,
    html,
    text,
  });

  // Log the email in the communication log
  await logEmail({
    participantEmail,
    studyId,
    type: 'ENROLLMENT_CONFIRMATION',
    subject: `Enrollment Confirmed: ${studyName}`,
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  });

  return result;
}

/**
 * Send a test email to verify configuration
 */
export async function sendTestEmail(
  to: string,
  studyName: string,
  template: string
): Promise<EmailResult> {
  const html = renderMarkdownWithVariables(template, {
    participantName: 'Test Participant',
    studyName,
    participantEmail: to,
  });

  const text = stripHtml(html);

  return sendEmail({
    to,
    subject: `[TEST] Enrollment Email Preview: ${studyName}`,
    html,
    text,
  });
}

// ============================================
// COMMUNICATION LOGGING
// ============================================

interface EmailLogEntry {
  participantId?: string;
  participantEmail: string;
  studyId: string;
  type: string;
  subject: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Log an email send attempt to the database
 */
async function logEmail(entry: EmailLogEntry): Promise<void> {
  try {
    await prisma.communicationLog.create({
      data: {
        participantId: entry.participantId,
        type: entry.type,
        recipient: entry.participantEmail,
        subject: entry.subject,
        status: entry.success ? 'sent' : 'failed',
        metadata: JSON.stringify({
          studyId: entry.studyId,
          messageId: entry.messageId,
          error: entry.error,
        }),
        sentAt: new Date(),
      },
    });
  } catch (error) {
    // Don't fail the email send if logging fails
    console.error('❌ Failed to log email:', error);
  }
}

/**
 * Get email logs for a participant
 */
export async function getEmailLogs(participantId: string) {
  return prisma.communicationLog.findMany({
    where: { participantId },
    orderBy: { sentAt: 'desc' },
    take: 100,
  });
}

/**
 * Get all email logs with studyId in metadata (for admin view)
 */
export async function getEmailLogsByStudy(studyId: string) {
  // Since studyId is stored in metadata JSON, we need to filter in application
  const logs = await prisma.communicationLog.findMany({
    orderBy: { sentAt: 'desc' },
    take: 500,
  });

  return logs.filter((log) => {
    try {
      const metadata = JSON.parse(log.metadata || '{}');
      return metadata.studyId === studyId;
    } catch {
      return false;
    }
  });
}
