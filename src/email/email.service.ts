import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getEmailConfig } from './config/email.config';
import { SendReceiptParams } from './interfaces/email.interface';
import { generateReceiptEmailTemplate } from './templates/receipt.template';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './dto/email-template.dto.js';
import { EmailLogFilterDto } from './dto/email-log-filter.dto.js';
import {
  EmailTemplate,
  EmailTemplateDocument,
} from './schemas/email-template.schema.js';
import { EmailLog, EmailLogDocument, EmailStatus } from './schemas/email-log.schema.js';

/**
 * Email Service
 * Handles sending emails, particularly receipt emails
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter!: Transporter;

  constructor(
    @InjectModel(EmailTemplate.name)
    private readonly emailTemplateModel: Model<EmailTemplateDocument>,
    @InjectModel(EmailLog.name)
    private readonly emailLogModel: Model<EmailLogDocument>,
  ) {
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter based on configuration
   */
  private initializeTransporter(): void {
    const config = getEmailConfig();

    if (config.provider === 'smtp' && config.smtp) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.auth.user,
          pass: config.smtp.auth.pass,
        },
      });

      this.logger.log(
        `Email transporter initialized with SMTP: ${config.smtp.host}:${config.smtp.port}`,
      );
    } else {
      this.logger.warn('Email provider not configured properly');
    }
  }

  /**
   * Validate email address format
   * Requirements: 4.2
   * Property 2: Email Validation
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Send receipt email to customer
   * Requirements: 4.2, 4.3, 4.4, 4.5
   * Property 1: Email Delivery Confirmation
   */
  async sendReceipt(params: SendReceiptParams): Promise<void> {
    const { to, receiptData } = params;
    const subject = `Receipt #${receiptData.receiptNumber} - ${getEmailConfig().from.name}`;

    // Validate email address
    if (!this.validateEmail(to)) {
      throw new BadRequestException('Invalid email address format');
    }

    if (!this.transporter) {
      throw new Error('Email transporter not initialized');
    }

    const config = getEmailConfig();
    const htmlContent = generateReceiptEmailTemplate(receiptData);

    try {
      const info = await this.transporter.sendMail({
        from: `"${config.from.name}" <${config.from.email}>`,
        to,
        subject,
        html: htmlContent,
      });

      await this.emailLogModel.create({
        to,
        subject,
        template: 'receipt',
        status: EmailStatus.SENT,
        sentAt: new Date(),
      });

      this.logger.log(
        `Receipt email sent successfully to ${to}: ${info.messageId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.emailLogModel.create({
        to,
        subject,
        template: 'receipt',
        status: EmailStatus.FAILED,
        error: errorMessage,
      });

      this.logger.error(`Failed to send receipt email to ${to}:`, error);
      throw new Error('Failed to send receipt email. Please try again later.');
    }
  }

  async getTemplates(): Promise<EmailTemplateDocument[]> {
    return this.emailTemplateModel.find().sort({ createdAt: -1 }).exec();
  }

  async createTemplate(
    dto: CreateEmailTemplateDto,
  ): Promise<EmailTemplateDocument> {
    return this.emailTemplateModel.create({
      ...dto,
      isActive: dto.isActive ?? true,
    });
  }

  async updateTemplate(
    id: string,
    dto: UpdateEmailTemplateDto,
  ): Promise<EmailTemplateDocument> {
    const updated = await this.emailTemplateModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Email template ${id} not found`);
    }

    return updated;
  }

  async toggleTemplateStatus(id: string): Promise<EmailTemplateDocument> {
    const template = await this.emailTemplateModel.findById(id).exec();

    if (!template) {
      throw new NotFoundException(`Email template ${id} not found`);
    }

    template.isActive = !template.isActive;
    return template.save();
  }

  async getLogs(filter: EmailLogFilterDto): Promise<EmailLogDocument[]> {
    const query: Record<string, unknown> = {};

    if (filter.search) {
      query.$or = [
        { to: { $regex: filter.search, $options: 'i' } },
        { subject: { $regex: filter.search, $options: 'i' } },
      ];
    }

    if (filter.status) {
      query.status = filter.status;
    }

    if (filter.from || filter.to) {
      query.createdAt = {};
      if (filter.from) {
        (query.createdAt as Record<string, unknown>).$gte = new Date(filter.from);
      }
      if (filter.to) {
        (query.createdAt as Record<string, unknown>).$lte = new Date(filter.to);
      }
    }

    return this.emailLogModel.find(query).sort({ createdAt: -1 }).limit(500).exec();
  }

  /**
   * Verify email transporter connection
   * Useful for health checks
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      this.logger.log('Email transporter connection verified');
      return true;
    } catch (error) {
      this.logger.error('Email transporter connection failed:', error);
      return false;
    }
  }
}
