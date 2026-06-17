import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface ServiceToken {
  token: string;
  expiresAt: number;
}

interface PaymentStats {
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  byMethod: { method: string; count: number; total: number }[];
}

interface DailyIncome {
  date: string;
  total: number;
  byMethod: { method: string; total: number }[];
}

interface OutstandingBalance {
  orderId: string;
  orderNumber: string;
  balance: number;
  patientName?: string;
}

interface ExpenditureSummary {
  total: number;
  byCategory: { category: string; total: number; count: number }[];
  flaggedTotal: number;
}

interface DailyReport {
  date: string;
  orders: { total: number; paid: number; pending: number; subtotal: number; discounts: number; billed: number };
  income: { cash: number; orangeMoney: number; afrimoney: number; total: number };
  expenditures: { cash: number; orangeMoney: number; afrimoney: number; total: number; items: any[] };
  netExpected: { cash: number; orangeMoney: number; afrimoney: number; total: number };
  reconciliation: {
    actualCash: number;
    actualOrangeMoney: number;
    actualAfrimoney: number;
    actualTotal: number;
    cashVariance: number;
    orangeMoneyVariance: number;
    afrimoneyVariance: number;
    totalVariance: number;
    status: string;
    submittedBy: string;
    notes?: string;
  } | null;
}

interface RevenueReport {
  totalRevenue: number;
  byType: { type: string; total: number; count: number }[];
  byMethod: { method: string; total: number; count: number }[];
  daily: { date: string; total: number }[];
}

@Injectable()
export class MicroserviceClientService {
  private readonly logger = new Logger(MicroserviceClientService.name);
  private emrToken: ServiceToken | null = null;
  private labToken: ServiceToken | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  // --- Authentication --------------------------------------

  private async getEmrToken(): Promise<string> {
    if (this.emrToken && Date.now() < this.emrToken.expiresAt) {
      return this.emrToken.token;
    }
    const baseUrl = this.config.get<string>('EMR_API_BASE_URL');
    const username = this.config.get<string>('EMR_API_USERNAME');
    const password = this.config.get<string>('EMR_API_PASSWORD');
    if (!baseUrl || !username || !password) {
      throw new Error('EMR API credentials not configured');
    }
    try {
      const res = await firstValueFrom(
        this.http.post(`${baseUrl}/auth/login`, { username, password }),
      );
      const data = res.data;
      this.emrToken = {
        token: data.accessToken || data.access_token || data.token,
        expiresAt: Date.now() + 50 * 60 * 1000,
      };
      this.logger.log('EMR token obtained');
      return this.emrToken.token;
    } catch (error: any) {
      this.logger.error(`EMR auth failed: ${error.message}`);
      throw error;
    }
  }

  private async getLabToken(): Promise<string> {
    if (this.labToken && Date.now() < this.labToken.expiresAt) {
      return this.labToken.token;
    }
    const baseUrl = this.config.get<string>('LAB_API_BASE_URL');
    const username = this.config.get<string>('LAB_API_USERNAME');
    const password = this.config.get<string>('LAB_API_PASSWORD');
    if (!baseUrl || !username || !password) {
      throw new Error('LAB API credentials not configured');
    }
    try {
      const res = await firstValueFrom(
        this.http.post(`${baseUrl}/auth/login`, { username, password }),
      );
      const data = res.data;
      this.labToken = {
        token: data.accessToken || data.access_token || data.token,
        expiresAt: Date.now() + 50 * 60 * 1000,
      };
      this.logger.log('LAB token obtained');
      return this.labToken.token;
    } catch (error: any) {
      this.logger.error(`LAB auth failed: ${error.message}`);
      throw error;
    }
  }

  private async emrGet<T>(path: string): Promise<T | null> {
    try {
      const token = await this.getEmrToken();
      const baseUrl = this.config.get<string>('EMR_API_BASE_URL');
      const res = await firstValueFrom(
        this.http.get(`${baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      return (res.data?.data ?? res.data) as T;
    } catch (error: any) {
      this.logger.warn(`EMR GET ${path} failed: ${error.message}`);
      return null;
    }
  }

  private async labGet<T>(path: string): Promise<T | null> {
    try {
      const token = await this.getLabToken();
      const baseUrl = this.config.get<string>('LAB_API_BASE_URL');
      const res = await firstValueFrom(
        this.http.get(`${baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      return (res.data?.data ?? res.data) as T;
    } catch (error: any) {
      this.logger.warn(`LAB GET ${path} failed: ${error.message}`);
      return null;
    }
  }

  // --- EMR Endpoints ---------------------------------------

  async getEmrPaymentStats(): Promise<PaymentStats | null> {
    return this.emrGet<PaymentStats>('/orders/stats/payment');
  }

  async getEmrDailyIncome(): Promise<DailyIncome[] | null> {
    return this.emrGet<DailyIncome[]>('/orders/stats/daily-income');
  }

  async getEmrOutstanding(): Promise<OutstandingBalance[] | null> {
    return this.emrGet<OutstandingBalance[]>('/orders/stats/outstanding');
  }

  async getEmrExpenditureSummary(): Promise<ExpenditureSummary | null> {
    return this.emrGet<ExpenditureSummary>('/expenditures/summary');
  }

  async getEmrDailyReport(date?: string): Promise<DailyReport | null> {
    const d = date || new Date().toISOString().slice(0, 10);
    return this.emrGet<DailyReport>(`/reconciliation/daily-report/${d}`);
  }

  async getEmrRevenueReport(): Promise<RevenueReport | null> {
    return this.emrGet<RevenueReport>('/admin/revenue');
  }

  // --- LAB Endpoints ---------------------------------------

  async getLabPaymentStats(): Promise<PaymentStats | null> {
    return this.labGet<PaymentStats>('/orders/stats/payment');
  }

  async getLabDailyIncome(): Promise<DailyIncome[] | null> {
    return this.labGet<DailyIncome[]>('/orders/stats/daily-income');
  }

  async getLabOutstanding(): Promise<OutstandingBalance[] | null> {
    return this.labGet<OutstandingBalance[]>('/orders/stats/outstanding');
  }

  async getLabExpenditureSummary(): Promise<ExpenditureSummary | null> {
    return this.labGet<ExpenditureSummary>('/expenditures/summary');
  }

  async getLabDailyReport(date?: string): Promise<DailyReport | null> {
    const d = date || new Date().toISOString().slice(0, 10);
    return this.labGet<DailyReport>(`/reconciliation/daily-report/${d}`);
  }

  async getLabRevenueReport(): Promise<RevenueReport | null> {
    return this.labGet<RevenueReport>('/reports/revenue');
  }

  // --- Combined Fetch --------------------------------------

  async getAllFinancialData(): Promise<{
    emr: {
      paymentStats: PaymentStats | null;
      expenditureSummary: ExpenditureSummary | null;
      dailyReport: DailyReport | null;
      revenueReport: RevenueReport | null;
    };
    lab: {
      paymentStats: PaymentStats | null;
      expenditureSummary: ExpenditureSummary | null;
      dailyReport: DailyReport | null;
      revenueReport: RevenueReport | null;
    };
  }> {
    const [emrPayment, emrExpend, emrDaily, emrRevenue, labPayment, labExpend, labDaily, labRevenue] = await Promise.allSettled([
      this.getEmrPaymentStats(),
      this.getEmrExpenditureSummary(),
      this.getEmrDailyReport(),
      this.getEmrRevenueReport(),
      this.getLabPaymentStats(),
      this.getLabExpenditureSummary(),
      this.getLabDailyReport(),
      this.getLabRevenueReport(),
    ]);

    return {
      emr: {
        paymentStats: emrPayment.status === 'fulfilled' ? emrPayment.value : null,
        expenditureSummary: emrExpend.status === 'fulfilled' ? emrExpend.value : null,
        dailyReport: emrDaily.status === 'fulfilled' ? emrDaily.value : null,
        revenueReport: emrRevenue.status === 'fulfilled' ? emrRevenue.value : null,
      },
      lab: {
        paymentStats: labPayment.status === 'fulfilled' ? labPayment.value : null,
        expenditureSummary: labExpend.status === 'fulfilled' ? labExpend.value : null,
        dailyReport: labDaily.status === 'fulfilled' ? labDaily.value : null,
        revenueReport: labRevenue.status === 'fulfilled' ? labRevenue.value : null,
      },
    };
  }
}
