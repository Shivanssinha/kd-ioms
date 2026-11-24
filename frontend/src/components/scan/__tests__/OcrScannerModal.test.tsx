import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OcrScannerModal } from '../OcrScannerModal';

// Mock Tesseract.js recognize API
vi.mock('tesseract.js', () => ({
  default: {
    recognize: vi.fn().mockImplementation(async (_image, _lang, options) => {
      // Simulate progress callback
      if (options?.logger) {
        options.logger({ status: 'recognizing text', progress: 0.5 });
        options.logger({ status: 'recognizing text', progress: 1.0 });
      }
      return {
        data: {
          text: `
            CIPLA PHARMA
            B.No. CIP-9921
            EXP. 12/2028
            M.R.P. Rs. 185.00
          `,
        },
      };
    }),
  },
}));

describe('OcrScannerModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnCandidatesDetected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal when open with tabs and title', () => {
    render(
      <OcrScannerModal
        isOpen={true}
        onClose={mockOnClose}
        onCandidatesDetected={mockOnCandidatesDetected}
      />
    );

    expect(screen.getByText('Packaging Photo OCR Scanner')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Live Camera Snap/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Upload Photo/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Text Paste Fallback/i })).toBeTruthy();
  });

  it('allows manual text entry and parses candidates via heuristic rules', async () => {
    render(
      <OcrScannerModal
        isOpen={true}
        onClose={mockOnClose}
        onCandidatesDetected={mockOnCandidatesDetected}
      />
    );

    // Switch to paste tab
    const pasteTab = screen.getByRole('button', { name: /Text Paste Fallback/i });
    fireEvent.click(pasteTab);

    // Enter raw packaging text
    const textarea = screen.getByLabelText(/Paste OCR text from external camera apps/i);
    fireEvent.change(textarea, {
      target: { value: 'SUN PHARMA B.No. SUN-881 EXP: 09/27 M.R.P. Rs. 240.00' },
    });

    // Click Parse Text Heuristics
    const parseBtn = screen.getByRole('button', { name: /Parse Text Heuristics/i });
    fireEvent.click(parseBtn);

    // Verify candidates are extracted and displayed in editable inputs
    await waitFor(() => {
      const batchInput = screen.getByLabelText(/Batch Number/i) as HTMLInputElement;
      const expInput = screen.getByLabelText(/Expiry Date/i) as HTMLInputElement;
      const mrpInput = screen.getByLabelText(/M\.R\.P/i) as HTMLInputElement;
      expect(batchInput.value).toBe('SUN-881');
      expect(expInput.value).toBe('2027-09-30');
      expect(mrpInput.value).toBe('240.00');
    });

    // Verify user can tweak the batch number directly in the input
    const batchInput = screen.getByLabelText(/Batch Number/i) as HTMLInputElement;
    fireEvent.change(batchInput, { target: { value: 'SUN-881-CORRECTED' } });

    // Click Apply Candidates to Form
    const applyBtn = screen.getByRole('button', { name: /Apply Candidates to Form/i });
    fireEvent.click(applyBtn);

    expect(mockOnCandidatesDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        batchNumber: 'SUN-881-CORRECTED',
        expiryDate: '2027-09-30',
        mrp: '240.00',
      })
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('processes uploaded photo with mock Tesseract OCR engine and extracts candidates', async () => {
    render(
      <OcrScannerModal
        isOpen={true}
        onClose={mockOnClose}
        onCandidatesDetected={mockOnCandidatesDetected}
      />
    );

    // Switch to upload tab
    const uploadTab = screen.getByRole('button', { name: /Upload Photo/i });
    fireEvent.click(uploadTab);

    // Simulate file input change
    const file = new File(['fake-image-bytes'], 'medicine-box.jpg', { type: 'image/jpeg' });
    const fileInput = document.getElementById('ocr-file-upload') as HTMLInputElement;

    // Mock createObjectURL
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-preview-url');

    fireEvent.change(fileInput, { target: { files: [file] } });

    // Wait for OCR to complete and show candidates in inputs
    await waitFor(() => {
      const batchInput = screen.getByLabelText(/Batch Number/i) as HTMLInputElement;
      const expInput = screen.getByLabelText(/Expiry Date/i) as HTMLInputElement;
      const mrpInput = screen.getByLabelText(/M\.R\.P/i) as HTMLInputElement;
      expect(batchInput.value).toBe('CIP-9921');
      expect(expInput.value).toBe('2028-12-31');
      expect(mrpInput.value).toBe('185.00');
    });

    // Apply to form
    const applyBtn = screen.getByRole('button', { name: /Apply Candidates to Form/i });
    fireEvent.click(applyBtn);

    expect(mockOnCandidatesDetected).toHaveBeenCalledWith(
      expect.objectContaining({
        batchNumber: 'CIP-9921',
        expiryDate: '2028-12-31',
        mrp: '185.00',
      })
    );
  });
});
