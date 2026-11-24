'use client';

import React, { useState } from 'react';
import { ScanConfirmForm } from '../../../../features/stock/components/ScanConfirmForm';
import { CameraScannerModal } from '../../../../components/scan/CameraScannerModal';
import { OcrScannerModal, type OcrCandidateResult } from '../../../../components/scan/OcrScannerModal';
import { useBarcodeScanner } from '../../../../hooks/useBarcodeScanner';
import { useResolveScan } from '../../../../features/stock/hooks';
import { parseBarcodePayload } from '../../../../lib/scanner/gs1Parser';
import type { InwardStockFormData } from '../../../../features/stock/schema';
import { Camera, FileText, PlusCircle, Sparkles, CheckCircle2 } from 'lucide-react';

export default function StockInwardPage() {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isOcrOpen, setIsOcrOpen] = useState(false);
  const [formInitialValues, setFormInitialValues] = useState<Partial<InwardStockFormData>>({
    captureMethod: 'MANUAL',
  });
  const [scanStatusMessage, setScanStatusMessage] = useState<string | null>(null);

  const resolveScanMutation = useResolveScan();

  const handleResolvePayload = async (payload: string, method: 'SCAN_BARCODE' | 'SCAN_OCR') => {
    // 1. Instant client-side parsing (Zero-latency auto-fill)
    const clientParsed = parseBarcodePayload(payload);

    const initialFastValues: Partial<InwardStockFormData> = {
      captureMethod: method,
      qrPayload: payload,
      gtin: clientParsed.gtin,
      batchNumber: clientParsed.batchNumber,
      expiryDate: clientParsed.expiryDate,
      mrp: clientParsed.mrp,
    };

    setFormInitialValues((prev) => ({
      ...prev,
      ...initialFastValues,
    }));

    setScanStatusMessage(
      `Scanned code: ${
        [
          clientParsed.batchNumber ? `Batch ${clientParsed.batchNumber}` : null,
          clientParsed.expiryDate ? `Exp ${clientParsed.expiryDate}` : null,
          clientParsed.gtin ? `GTIN ${clientParsed.gtin}` : null,
        ]
          .filter(Boolean)
          .join(' • ') || payload
      }`
    );

    // 2. Query backend to match medicine & batch pricing from catalog
    try {
      const res = await resolveScanMutation.mutateAsync({ payload });
      const data = res.data;

      // Read from both flat and nested properties
      const gtin = data?.gtin || data?.parsedGs1?.gtin || clientParsed.gtin;
      const batchNumber = data?.batchNumber || data?.parsedGs1?.batchNumber || clientParsed.batchNumber;
      const expiryDate = data?.expiryDate || data?.parsedGs1?.expiryDate || clientParsed.expiryDate;
      const mrp = data?.mrp || data?.matchedBatch?.mrp || clientParsed.mrp;

      const matchedMed = data?.matchedMedicine || data?.medicineSuggestions?.[0];
      const matchedBatch = data?.matchedBatch;

      const finalValues: Partial<InwardStockFormData> = {
        ...initialFastValues,
        gtin,
        batchNumber,
        expiryDate,
      };

      if (matchedMed) {
        finalValues.medicineId = matchedMed.medicineId;
        finalValues.medicineName = matchedMed.name;
        finalValues.medicineCompany = matchedMed.company;
        finalValues.gstRate = matchedMed.gstRate;
      }

      if (matchedBatch) {
        finalValues.mrp = matchedBatch.mrp;
        finalValues.sellingPrice = matchedBatch.sellingPrice;
        if (matchedBatch.purchaseRate) {
          finalValues.purchaseRate = matchedBatch.purchaseRate;
        }
      } else if (mrp) {
        finalValues.mrp = mrp;
      }

      setFormInitialValues(finalValues);

      if (matchedMed) {
        setScanStatusMessage(
          `✓ Auto-matched: ${matchedMed.name} (${
            finalValues.batchNumber ? `Batch ${finalValues.batchNumber}` : 'New Batch'
          }, Exp ${finalValues.expiryDate || 'N/A'})`
        );
      } else {
        setScanStatusMessage(
          `✓ Parsed: ${[
            finalValues.batchNumber ? `Batch ${finalValues.batchNumber}` : null,
            finalValues.expiryDate ? `Exp ${finalValues.expiryDate}` : null,
            finalValues.gtin ? `GTIN ${finalValues.gtin}` : null,
          ]
            .filter(Boolean)
            .join(' • ')}. Select medicine to inward.`
        );
      }
    } catch {
      // Backend lookup failed (e.g. offline/network) — clientParsed still maintains batch, exp, GTIN
      setScanStatusMessage(
        `✓ Parsed: ${[
          clientParsed.batchNumber ? `Batch ${clientParsed.batchNumber}` : null,
          clientParsed.expiryDate ? `Exp ${clientParsed.expiryDate}` : null,
        ]
          .filter(Boolean)
          .join(' • ')}. Select medicine below.`
      );
    }
  };

  // Hardware Scanner Hook (Global key listener for USB / Bluetooth guns)
  useBarcodeScanner({
    enabled: !isCameraOpen && !isOcrOpen,
    onScan: (scannedString) => {
      handleResolvePayload(scannedString, 'SCAN_BARCODE');
    },
  });

  const handleOcrCandidatesDetected = (result: OcrCandidateResult) => {
    setFormInitialValues((prev) => ({
      ...prev,
      captureMethod: 'SCAN_OCR',
      batchNumber: result.batchNumber || prev?.batchNumber,
      expiryDate: result.expiryDate || prev?.expiryDate,
      mrp: result.mrp || prev?.mrp,
    }));

    const foundParts: string[] = [];
    if (result.batchNumber) foundParts.push(`Batch ${result.batchNumber}`);
    if (result.expiryDate) foundParts.push(`Exp ${result.expiryDate}`);
    if (result.mrp) foundParts.push(`MRP ₹${result.mrp}`);

    setScanStatusMessage(
      foundParts.length > 0
        ? `OCR recognized candidates: ${foundParts.join(' • ')}`
        : 'OCR text captured and analyzed'
    );
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Stock Inward Hub</h1>
        <p className="text-sm text-slate-500 mt-1">
          Receive physical stock into KD-IOMS using hardware barcode guns, mobile camera scanner, packaging photo OCR, or manual entry.
        </p>
      </div>

      {/* 3 Capture Mode Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {/* Mode 1: Camera / Hardware Scanner */}
        <button
          type="button"
          onClick={() => setIsCameraOpen(true)}
          className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all text-left flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              Live & Gun
            </span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
              Barcode / GS1 Scan
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              USB gun active automatically. Click to open live camera viewfinder.
            </p>
          </div>
        </button>

        {/* Mode 2: Packaging Photo OCR */}
        <button
          type="button"
          onClick={() => setIsOcrOpen(true)}
          className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-amber-400 hover:shadow-md transition-all text-left flex flex-col justify-between group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              Vision OCR
            </span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
              Packaging Photo OCR
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Snap packaging photo or upload image to auto-extract batch, expiry, and MRP.
            </p>
          </div>
        </button>

        {/* Mode 3: Manual Inward */}
        <button
          type="button"
          onClick={() => {
            setFormInitialValues({ captureMethod: 'MANUAL' });
            setScanStatusMessage(null);
          }}
          className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-400 hover:shadow-md transition-all text-left flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <PlusCircle className="w-5 h-5" />
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
              Direct
            </span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-slate-700 transition-colors">
              Manual Inward
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Directly type medicine and batch details without scanning.
            </p>
          </div>
        </button>
      </div>

      {/* Status banner when scan payload is resolved */}
      {scanStatusMessage && (
        <div className="mb-6 p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-medium">{scanStatusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setScanStatusMessage(null)}
            className="text-xs text-indigo-600 hover:underline font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Stock Inward Form Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <h2 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-indigo-600" />
          Batch Inward Confirmation
        </h2>
        <ScanConfirmForm
          initialValues={formInitialValues}
          onReset={() => {
            setFormInitialValues({ captureMethod: 'MANUAL' });
            setScanStatusMessage(null);
          }}
        />
      </div>

      {/* Live Camera Scanner Modal */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onDetected={(code) => {
          handleResolvePayload(code, 'SCAN_BARCODE');
        }}
      />

      {/* Packaging OCR Modal with Live Camera & Photo Upload */}
      <OcrScannerModal
        isOpen={isOcrOpen}
        onClose={() => setIsOcrOpen(false)}
        onCandidatesDetected={handleOcrCandidatesDetected}
      />
    </div>
  );
}
