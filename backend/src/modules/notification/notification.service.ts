import { query } from '../../config/db.js';
import { getInvoicePdfSignedUrl } from '../../utils/storage.js';
import { whatsappProvider, isWhatsAppConfigured } from './providers/whatsapp.provider.js';
import { emailProvider, isEmailConfigured } from './providers/email.provider.js';
import {
  NotificationChannel,
  NotificationLogRecord,
} from './notification.types.js';
import { NotFoundError, ValidationError } from '../../errors/app-error.js';
import { ERROR_CODES } from '../../constants/error-codes.js';

export class NotificationService {
  /**
   * Dispatches invoice notification using cascade strategy:
   * 1. Try WhatsApp primary (if WhatsApp is configured).
   * 2. If WhatsApp fails or is not configured, cascade to Email fallback (if retailer has email).
   * If forceChannel is specified (e.g. via admin resend), dispatches only on that channel.
   */
  async sendInvoiceNotification(
    invoiceId: number,
    options?: { forceChannel?: NotificationChannel }
  ): Promise<NotificationLogRecord[]> {
    const invRes = await query(
      `SELECT
         i.invoice_id,
         i.invoice_number,
         i.total,
         i.pdf_path,
         i.billed_to,
         rp.email AS user_email,
         u.phone AS user_phone,
         rp.shop_name,
         rp.whatsapp_number
       FROM invoices i
       JOIN users u ON i.retailer_id = u.id
       LEFT JOIN retailer_profiles rp ON u.id = rp.user_id
       WHERE i.invoice_id = $1`,
      [invoiceId]
    );

    if (invRes.rowCount === 0) {
      throw new NotFoundError({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Invoice not found',
      });
    }

    const invoice = invRes.rows[0];
    const billedTo = typeof invoice.billed_to === 'string' ? JSON.parse(invoice.billed_to) : invoice.billed_to;
    const shopName = invoice.shop_name || billedTo?.shopName || 'Valued Pharmacy';
    const recipientPhone = invoice.whatsapp_number || billedTo?.phone || invoice.user_phone || 'N/A';
    const recipientEmail = invoice.user_email || billedTo?.email || null;

    const pdfUrl = await getInvoicePdfSignedUrl(invoice.pdf_path || '', 86400);
    const totalAmount = parseFloat(invoice.total).toFixed(2);

    const createdLogs: NotificationLogRecord[] = [];
    const forceChannel = options?.forceChannel;

    // DIRECT EMAIL CHANNEL DISPATCH
    if (forceChannel === 'EMAIL') {
      if (!recipientEmail) {
        throw new ValidationError({
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Retailer has no email address configured for email notification',
        });
      }

      if (!isEmailConfigured()) {
        const logRes = await query(
          `INSERT INTO notification_logs (
             invoice_id, channel, recipient, status, attempts, error_message, last_attempt_at
           )
           VALUES ($1, 'EMAIL', $2, 'FAILED', 1, 'Email SMTP credentials are not configured in environment', NOW())
           RETURNING *`,
          [invoiceId, recipientEmail]
        );
        createdLogs.push(this.mapLogRow(logRes.rows[0]));
        return createdLogs;
      }

      const logRes = await query(
        `INSERT INTO notification_logs (
           invoice_id, channel, recipient, status, attempts, last_attempt_at
         )
         VALUES ($1, 'EMAIL', $2, 'PENDING', 1, NOW())
         RETURNING *`,
        [invoiceId, recipientEmail]
      );
      const log = logRes.rows[0];

      try {
        const sendResult = await emailProvider.sendInvoiceEmail({
          recipientEmail,
          invoiceNumber: invoice.invoice_number,
          pdfUrl,
          totalAmount,
          shopName,
        });

        const updateRes = await query(
          `UPDATE notification_logs
           SET status = 'SENT',
               provider_message_id = $1,
               last_attempt_at = NOW()
           WHERE log_id = $2
           RETURNING *`,
          [sendResult.providerMessageId, log.log_id]
        );
        createdLogs.push(this.mapLogRow(updateRes.rows[0]));
      } catch (err: any) {
        const updateRes = await query(
          `UPDATE notification_logs
           SET status = 'FAILED',
               error_message = $1,
               last_attempt_at = NOW()
           WHERE log_id = $2
           RETURNING *`,
          [err.message, log.log_id]
        );
        createdLogs.push(this.mapLogRow(updateRes.rows[0]));
      }

      return createdLogs;
    }

    // DIRECT WHATSAPP DISPATCH
    if (forceChannel === 'WHATSAPP') {
      if (!isWhatsAppConfigured()) {
        const logRes = await query(
          `INSERT INTO notification_logs (
             invoice_id, channel, recipient, status, attempts, error_message, last_attempt_at
           )
           VALUES ($1, 'WHATSAPP', $2, 'FAILED', 1, 'WhatsApp service is disabled because credentials are not configured', NOW())
           RETURNING *`,
          [invoiceId, recipientPhone]
        );
        createdLogs.push(this.mapLogRow(logRes.rows[0]));
        return createdLogs;
      }

      const waLogRes = await query(
        `INSERT INTO notification_logs (
           invoice_id, channel, recipient, status, attempts, last_attempt_at
         )
         VALUES ($1, 'WHATSAPP', $2, 'PENDING', 1, NOW())
         RETURNING *`,
        [invoiceId, recipientPhone]
      );
      const waLog = waLogRes.rows[0];

      try {
        const sendResult = await whatsappProvider.sendInvoiceMessage({
          recipientPhone,
          invoiceNumber: invoice.invoice_number,
          pdfUrl,
          totalAmount,
          shopName,
        });

        const updateRes = await query(
          `UPDATE notification_logs
           SET status = 'SENT',
               provider_message_id = $1,
               last_attempt_at = NOW()
           WHERE log_id = $2
           RETURNING *`,
          [sendResult.providerMessageId, waLog.log_id]
        );
        createdLogs.push(this.mapLogRow(updateRes.rows[0]));
      } catch (err: any) {
        const updateRes = await query(
          `UPDATE notification_logs
           SET status = 'FAILED',
               error_message = $1,
               last_attempt_at = NOW()
           WHERE log_id = $2
           RETURNING *`,
          [err.message, waLog.log_id]
        );
        createdLogs.push(this.mapLogRow(updateRes.rows[0]));
      }

      return createdLogs;
    }

    // AUTOMATIC CASCADE MODE:
    // 1. Try WhatsApp IF configured
    let waSuccess = false;
    if (isWhatsAppConfigured()) {
      const waLogRes = await query(
        `INSERT INTO notification_logs (
           invoice_id, channel, recipient, status, attempts, last_attempt_at
         )
         VALUES ($1, 'WHATSAPP', $2, 'PENDING', 1, NOW())
         RETURNING *`,
        [invoiceId, recipientPhone]
      );
      const waLog = waLogRes.rows[0];

      try {
        const sendResult = await whatsappProvider.sendInvoiceMessage({
          recipientPhone,
          invoiceNumber: invoice.invoice_number,
          pdfUrl,
          totalAmount,
          shopName,
        });

        const updateRes = await query(
          `UPDATE notification_logs
           SET status = 'SENT',
               provider_message_id = $1,
               last_attempt_at = NOW()
           WHERE log_id = $2
           RETURNING *`,
          [sendResult.providerMessageId, waLog.log_id]
        );
        createdLogs.push(this.mapLogRow(updateRes.rows[0]));
        waSuccess = true;
      } catch (err: any) {
        const updateRes = await query(
          `UPDATE notification_logs
           SET status = 'FAILED',
               error_message = $1,
               last_attempt_at = NOW()
           WHERE log_id = $2
           RETURNING *`,
          [err.message, waLog.log_id]
        );
        createdLogs.push(this.mapLogRow(updateRes.rows[0]));
      }
    }

    // 2. Cascade to Email if WhatsApp not sent and not forced
    if (!waSuccess) {
      if (!recipientEmail) {
        // If WhatsApp was unconfigured AND no email exists, provide an informative log
        const emailLogRes = await query(
          `INSERT INTO notification_logs (
             invoice_id, channel, recipient, status, attempts, error_message, last_attempt_at
           )
           VALUES ($1, 'EMAIL', 'N/A', 'FAILED', 1, 'Retailer has no email address configured for notification', NOW())
           RETURNING *`,
          [invoiceId]
        );
        createdLogs.push(this.mapLogRow(emailLogRes.rows[0]));
      } else if (!isEmailConfigured()) {
        const emailLogRes = await query(
          `INSERT INTO notification_logs (
             invoice_id, channel, recipient, status, attempts, error_message, last_attempt_at
           )
           VALUES ($1, 'EMAIL', $2, 'FAILED', 1, 'Email SMTP credentials are not configured in environment', NOW())
           RETURNING *`,
          [invoiceId, recipientEmail]
        );
        createdLogs.push(this.mapLogRow(emailLogRes.rows[0]));
      } else {
        const emailLogRes = await query(
          `INSERT INTO notification_logs (
             invoice_id, channel, recipient, status, attempts, last_attempt_at
           )
           VALUES ($1, 'EMAIL', $2, 'PENDING', 1, NOW())
           RETURNING *`,
          [invoiceId, recipientEmail]
        );
        const emailLog = emailLogRes.rows[0];

        try {
          const sendResult = await emailProvider.sendInvoiceEmail({
            recipientEmail,
            invoiceNumber: invoice.invoice_number,
            pdfUrl,
            totalAmount,
            shopName,
          });

          const updateRes = await query(
            `UPDATE notification_logs
             SET status = 'SENT',
                 provider_message_id = $1,
                 last_attempt_at = NOW()
             WHERE log_id = $2
             RETURNING *`,
            [sendResult.providerMessageId, emailLog.log_id]
          );
          createdLogs.push(this.mapLogRow(updateRes.rows[0]));
        } catch (err: any) {
          const updateRes = await query(
            `UPDATE notification_logs
             SET status = 'FAILED',
                 error_message = $1,
                 last_attempt_at = NOW()
             WHERE log_id = $2
             RETURNING *`,
            [err.message, emailLog.log_id]
          );
          createdLogs.push(this.mapLogRow(updateRes.rows[0]));
        }
      }
    }

    return createdLogs;
  }

  private mapLogRow(row: any): NotificationLogRecord {
    return {
      logId: row.log_id,
      invoiceId: row.invoice_id,
      channel: row.channel,
      recipient: row.recipient,
      status: row.status,
      attempts: row.attempts,
      providerMessageId: row.provider_message_id || null,
      errorMessage: row.error_message || null,
      lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}

export const notificationService = new NotificationService();
