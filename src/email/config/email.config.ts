export interface EmailConfig {
  provider: 'smtp' | 'sendgrid';
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  sendgrid?: {
    apiKey: string;
  };
  from: {
    name: string;
    email: string;
  };
}

export const getEmailConfig = (): EmailConfig => {
  const provider = process.env.EMAIL_PROVIDER || 'smtp';

  if (provider === 'smtp') {
    return {
      provider: 'smtp',
      smtp: {
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
      },
      from: {
        name: process.env.EMAIL_FROM_NAME || 'Pharmacy POS',
        email: process.env.EMAIL_FROM_EMAIL || 'noreply@pharmacy.com',
      },
    };
  }

  // SendGrid configuration (for future use)
  return {
    provider: 'sendgrid',
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || '',
    },
    from: {
      name: process.env.EMAIL_FROM_NAME || 'Pharmacy POS',
      email: process.env.EMAIL_FROM_EMAIL || 'noreply@pharmacy.com',
    },
  };
};
