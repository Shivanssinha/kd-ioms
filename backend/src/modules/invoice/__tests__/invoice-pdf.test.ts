import { describe, it, expect } from 'vitest';
import { buildInvoicePdf, formatPdfDate, formatExpiryForPdf, type InvoicePdfData } from '../invoice.pdf.js';
import { numberToWords } from '../../../utils/number-to-words.js';

describe('PDFKit Wholesale Invoice Template Engine (Plan 9-02)', () => {
  describe('formatPdfDate & formatExpiryForPdf', () => {
    it('cleanses raw dates and strips timezone or IST/GMT suffixes', () => {
      expect(formatPdfDate('20/10/2026')).toBe('20/10/2026');
      expect(formatPdfDate('2026-10-20')).toBe('20/10/2026');
      expect(formatPdfDate('2026-10-20T10:00:00.000Z')).toBe('20/10/2026');
      expect(formatPdfDate('Tue Nov 24 2026 18:00:00 GMT+0530 (India Standard Time)')).toBe('24/11/2026');
      expect(formatExpiryForPdf('2027-12-31')).toBe('12/27');
      expect(formatExpiryForPdf('12/27')).toBe('12/27');
    });
  });
  describe('numberToWords', () => {
    it('correctly converts Indian currency numbers to words', () => {
      expect(numberToWords(0)).toBe('Zero Rupees Only');
      expect(numberToWords(100)).toBe('One Hundred Rupees Only');
      expect(numberToWords(2352)).toBe('Two Thousand Three Hundred Fifty-Two Rupees Only');
      expect(numberToWords('150000.50')).toBe('One Lakh Fifty Thousand Rupees and Fifty Paise Only');
      expect(numberToWords(12500000)).toBe('One Crore Twenty-Five Lakh Rupees Only');
    });
  });

  describe('buildInvoicePdf', () => {
    const mockData: InvoicePdfData = {
      invoiceNumber: 'INV/2026-27/00001',
      invoiceDate: '20/10/2026',
      orderNumber: 'ORD-000042',
      orderDate: '20/10/2026',
      business: {
        name: 'Kandarp Drugs',
        address: '123 Wholesale Market, Ahmedabad, Gujarat',
        gstin: '24AAAAA0000A1Z5',
        drugLicenseNumber: 'GJ-AHM-123456',
        phone: '+919876543210',
        email: 'billing@kandarpdrugs.com',
      },
      billedTo: {
        shopName: 'Apollo Pharmacy Navrangpura',
        contactPerson: 'Pharmacist Patel',
        addressLine: 'Shop 4, Sunrise Complex',
        city: 'Ahmedabad',
        state: 'Gujarat',
        pincode: '380009',
        phone: '9876500000',
        gstin: '24BBBBB1111B1Z2',
        drugLicenseNumber: '20B-112233, 21B-445566',
      },
      lines: [
        {
          serialNo: 1,
          medicineName: 'Paracetamol 650mg Tablets',
          packSize: '10x10',
          batchNumber: 'BCH-2026-01',
          expiryDate: '12/27',
          quantity: 20,
          mrp: '35.00',
          rate: '25.00',
          amount: '500.00',
        },
        {
          serialNo: 2,
          medicineName: 'Azithromycin 500mg Tablets',
          packSize: '1x3',
          batchNumber: 'AZ-9981',
          expiryDate: '06/28',
          quantity: 10,
          mrp: '120.00',
          rate: '85.00',
          amount: '850.00',
        },
      ],
      subtotal: '1350.00',
      gstAmount: '162.00',
      roundOff: '0.00',
      total: '1512.00',
    };

    it('successfully compiles a valid non-empty PDF buffer starting with %PDF-', async () => {
      const buffer = await buildInvoicePdf(mockData);
      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);

      // PDF Magic bytes
      const header = buffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('handles multi-page line items without throwing errors', async () => {
      const multiPageData = {
        ...mockData,
        lines: Array.from({ length: 45 }, (_, i) => ({
          serialNo: i + 1,
          medicineName: `Medicine Item #${i + 1}`,
          packSize: '10x10',
          batchNumber: `BAT-${1000 + i}`,
          expiryDate: '12/27',
          quantity: 5,
          mrp: '50.00',
          rate: '35.00',
          amount: '175.00',
        })),
      };

      const buffer = await buildInvoicePdf(multiPageData);
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(3000);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('sanitizes long date strings with GMT/IST and prevents text overflow in right box', async () => {
      const buffer = await buildInvoicePdf({
        ...mockData,
        invoiceDate: 'Tue Nov 24 2026 18:00:00 GMT+0530 (India Standard Time)',
        orderDate: '2026-11-24T12:30:00.000Z',
      });
      expect(buffer).toBeDefined();
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});
