'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { inwardStockFormSchema, type InwardStockFormData } from '../schema';
import { useInwardStock } from '../hooks';
import { MedicineSearch } from '../../medicines/components/MedicineSearch';
import type { MedicineRecord } from '../../medicines/types';
import type { InwardStockResult } from '../types';
import { AlertCircle, CheckCircle2, PackageCheck, AlertTriangle, Sparkles } from 'lucide-react';
import { Spinner } from '../../../components/ui/Spinner';

export interface ScanConfirmFormProps {
  initialValues?: Partial<InwardStockFormData>;
  onSuccess?: (result: InwardStockResult) => void;
  onReset?: () => void;
}

export function ScanConfirmForm({
  initialValues,
  onSuccess,
  onReset,
}: ScanConfirmFormProps) {
  const router = useRouter();
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineRecord | null>(null);
  const [inwardSuccess, setInwardSuccess] = useState<InwardStockResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [today, setToday] = useState('');
  const [priceInclGstInput, setPriceInclGstInput] = useState(() => {
    if (initialValues?.sellingPrice) {
      const sp = parseFloat(initialValues.sellingPrice);
      const gst = initialValues.gstRate ?? 12;
      if (!isNaN(sp) && sp > 0) {
        return (sp * (1 + gst / 100)).toFixed(2);
      }
    }
    return '';
  });

  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<InwardStockFormData>({
    resolver: zodResolver(inwardStockFormSchema),
    defaultValues: {
      medicineId: initialValues?.medicineId || 0,
      medicineName: initialValues?.medicineName || '',
      medicineCompany: initialValues?.medicineCompany || '',
      gstRate: initialValues?.gstRate || 12,
      batchNumber: initialValues?.batchNumber || '',
      expiryDate: initialValues?.expiryDate || '',
      mrp: initialValues?.mrp || '',
      sellingPrice: initialValues?.sellingPrice || '',
      purchaseRate: initialValues?.purchaseRate || '0.00',
      quantity: initialValues?.quantity || 1,
      supplierName: initialValues?.supplierName || '',
      gtin: initialValues?.gtin || '',
      qrPayload: initialValues?.qrPayload || '',
      captureMethod: initialValues?.captureMethod || 'MANUAL',
    },
  });

  const inwardMutation = useInwardStock();

  // Load draft from localStorage on initial render if present
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kd_stock_inward_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const hasSignificantData = Boolean(
            parsed.batchNumber ||
              parsed.expiryDate ||
              parsed.mrp ||
              parsed.sellingPrice ||
              (parsed.quantity && parsed.quantity > 1) ||
              parsed.supplierName ||
              parsed.medicineName
          );

          if (hasSignificantData) {
            if (!initialValues?.batchNumber && parsed.batchNumber) setValue('batchNumber', parsed.batchNumber);
            if (!initialValues?.expiryDate && parsed.expiryDate) setValue('expiryDate', parsed.expiryDate);
            if (!initialValues?.mrp && parsed.mrp) setValue('mrp', parsed.mrp);
            if (!initialValues?.sellingPrice && parsed.sellingPrice) {
              setValue('sellingPrice', parsed.sellingPrice);
              const sp = parseFloat(parsed.sellingPrice);
              const gst = parsed.gstRate ?? 12;
              if (!isNaN(sp) && sp > 0) {
                setPriceInclGstInput((sp * (1 + gst / 100)).toFixed(2));
              }
            }
            if (!initialValues?.purchaseRate && parsed.purchaseRate) setValue('purchaseRate', parsed.purchaseRate);
            if (!initialValues?.quantity && parsed.quantity) setValue('quantity', parsed.quantity);
            if (!initialValues?.supplierName && parsed.supplierName) setValue('supplierName', parsed.supplierName);
            if (!initialValues?.gtin && parsed.gtin) setValue('gtin', parsed.gtin);
            if (!initialValues?.medicineName && parsed.medicineName) setValue('medicineName', parsed.medicineName);
            if (!initialValues?.medicineCompany && parsed.medicineCompany) setValue('medicineCompany', parsed.medicineCompany);
            if (!initialValues?.medicineId && parsed.medicineId) setValue('medicineId', parsed.medicineId);

            setDraftRestored(true);
          }
        }
      }
    } catch {
      // ignore localStorage / JSON parse error
    }
  }, [initialValues, setValue]);

  // Continuously persist form state to draft in localStorage
  useEffect(() => {
    const subscription = watch((values) => {
      if (!values) return;
      try {
        localStorage.setItem('kd_stock_inward_draft', JSON.stringify(values));
      } catch {
        // ignore storage errors
      }
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  // Keep form updated when initialValues change from external scan
  useEffect(() => {
    if (initialValues) {
      if (initialValues.medicineId) {
        setValue('medicineId', initialValues.medicineId, { shouldValidate: true, shouldDirty: true });
      }
      if (initialValues.medicineName) {
        setValue('medicineName', initialValues.medicineName, { shouldValidate: true, shouldDirty: true });
      }
      if (initialValues.medicineCompany) {
        setValue('medicineCompany', initialValues.medicineCompany);
      }
      if (initialValues.gstRate !== undefined) {
        setValue('gstRate', initialValues.gstRate);
      }
      if (initialValues.batchNumber) {
        setValue('batchNumber', initialValues.batchNumber, { shouldValidate: true, shouldDirty: true });
      }
      if (initialValues.expiryDate) {
        setValue('expiryDate', initialValues.expiryDate, { shouldValidate: true, shouldDirty: true });
      }
      if (initialValues.mrp) {
        setValue('mrp', initialValues.mrp, { shouldValidate: true, shouldDirty: true });
      }
      if (initialValues.sellingPrice) {
        setValue('sellingPrice', initialValues.sellingPrice, { shouldValidate: true, shouldDirty: true });
        const sp = parseFloat(initialValues.sellingPrice);
        const gst = initialValues.gstRate ?? 12;
        if (!isNaN(sp) && sp > 0) {
          setPriceInclGstInput((sp * (1 + gst / 100)).toFixed(2));
        }
      }
      if (initialValues.purchaseRate) {
        setValue('purchaseRate', initialValues.purchaseRate);
      }
      if (initialValues.quantity) {
        setValue('quantity', initialValues.quantity);
      }
      if (initialValues.supplierName) {
        setValue('supplierName', initialValues.supplierName);
      }
      if (initialValues.gtin) {
        setValue('gtin', initialValues.gtin, { shouldValidate: true });
      }
      if (initialValues.qrPayload) {
        setValue('qrPayload', initialValues.qrPayload);
      }
      if (initialValues.captureMethod) {
        setValue('captureMethod', initialValues.captureMethod);
      }
    }
  }, [initialValues, setValue]);

  const watchedSellingPrice = watch('sellingPrice');
  const watchedMrp = watch('mrp');
  const watchedGstRate = watch('gstRate') ?? 12;
  const watchedCaptureMethod = watch('captureMethod');

  // Compute live price inclusive of GST & MRP ceiling
  const parsedSp = parseFloat(watchedSellingPrice || '0');
  const parsedMrp = parseFloat(watchedMrp || '0');
  const parsedPriceInclGst = parseFloat(priceInclGstInput || '0');
  const calculatedPriceInclGst = (parsedSp * (1 + watchedGstRate / 100)).toFixed(2);
  const effectivePriceInclGst = parsedPriceInclGst > 0 ? parsedPriceInclGst : parseFloat(calculatedPriceInclGst);
  const exceedsMrp = parsedMrp > 0 && effectivePriceInclGst > parsedMrp;

  const handlePriceInclGstChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPriceInclGstInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      const baseSp = (parsed / (1 + watchedGstRate / 100)).toFixed(2);
      setValue('sellingPrice', baseSp, { shouldValidate: true, shouldDirty: true });
    } else {
      setValue('sellingPrice', '', { shouldValidate: true, shouldDirty: true });
    }
  };

  const handleMedicineSelect = (medicine: MedicineRecord) => {
    setSelectedMedicine(medicine);
    setValue('medicineId', medicine.medicineId, { shouldValidate: true });
    setValue('medicineName', medicine.name);
    setValue('medicineCompany', medicine.company);
    const rate = parseFloat(medicine.gstRate) || 12;
    setValue('gstRate', rate);
    if (priceInclGstInput) {
      const entered = parseFloat(priceInclGstInput);
      if (!isNaN(entered) && entered > 0) {
        setValue('sellingPrice', (entered / (1 + rate / 100)).toFixed(2), { shouldValidate: true });
      }
    }
  };

  const handleCreateNewMedicine = (medicineName: string) => {
    const currentValues = watch();
    try {
      localStorage.setItem(
        'kd_stock_inward_draft',
        JSON.stringify({
          ...currentValues,
          medicineName,
        })
      );
    } catch {
      // ignore
    }
    router.push(`/medicines/new?fromInward=true&name=${encodeURIComponent(medicineName)}`);
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem('kd_stock_inward_draft');
    } catch {
      // ignore
    }
    setDraftRestored(false);
    setPriceInclGstInput('');
    reset({
      medicineId: 0,
      medicineName: '',
      medicineCompany: '',
      gstRate: 12,
      batchNumber: '',
      expiryDate: '',
      mrp: '',
      sellingPrice: '',
      purchaseRate: '0.00',
      quantity: 1,
      supplierName: '',
      gtin: '',
      qrPayload: '',
      captureMethod: 'MANUAL',
    });
    setSelectedMedicine(null);
  };

  const onSubmit = async (data: InwardStockFormData) => {
    setFormError(null);
    try {
      const response = await inwardMutation.mutateAsync({
        medicineId: data.medicineId,
        batchNumber: data.batchNumber.trim(),
        expiryDate: data.expiryDate,
        mrp: parseFloat(data.mrp).toFixed(2),
        sellingPrice: parseFloat(data.sellingPrice).toFixed(2),
        purchaseRate: data.purchaseRate ? parseFloat(data.purchaseRate).toFixed(2) : '0.00',
        quantity: data.quantity,
        supplierName: data.supplierName?.trim() || undefined,
        gtin: data.gtin?.trim() || undefined,
        qrPayload: data.qrPayload || undefined,
        captureMethod: data.captureMethod,
      });

      try {
        localStorage.removeItem('kd_stock_inward_draft');
      } catch {
        // ignore
      }

      setInwardSuccess(response.data);
      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to record stock inward');
    }
  };

  const handleReceiveAnother = () => {
    try {
      localStorage.removeItem('kd_stock_inward_draft');
    } catch {
      // ignore
    }
    setInwardSuccess(null);
    setSelectedMedicine(null);
    setFormError(null);
    reset({
      medicineId: 0,
      medicineName: '',
      medicineCompany: '',
      gstRate: 12,
      batchNumber: '',
      expiryDate: '',
      mrp: '',
      sellingPrice: '',
      purchaseRate: '0.00',
      quantity: 1,
      supplierName: '',
      gtin: '',
      qrPayload: '',
      captureMethod: 'MANUAL',
    });
    if (onReset) onReset();
  };

  if (inwardSuccess) {
    return (
      <div className="bg-white rounded-2xl border border-emerald-200 p-8 shadow-sm text-center max-w-xl mx-auto">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">
          Stock Inward Successfully Recorded!
        </h3>
        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full text-xs font-semibold">
          <PackageCheck className="w-4 h-4" />
          {inwardSuccess.action === 'CREATED' ? 'New Batch Created' : 'Existing Batch Topped Up'}
        </div>

        <div className="mt-6 bg-slate-50 rounded-xl p-4 text-left border border-slate-200 text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Batch Number:</span>
            <span className="font-mono font-semibold text-slate-900">{inwardSuccess.batch.batchNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Expiry Date:</span>
            <span className="text-slate-900">{inwardSuccess.batch.expiryDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Updated Stock Balance:</span>
            <span className="font-semibold text-emerald-700">{inwardSuccess.ledgerEntry.balanceAfter} units</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Ledger Entry ID:</span>
            <span className="font-mono text-slate-700">#{inwardSuccess.ledgerEntry.entryId}</span>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <button
            type="button"
            onClick={handleReceiveAnother}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            Receive Another Batch
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {formError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{formError}</span>
        </div>
      )}

      {/* Restored Draft Banner */}
      {draftRestored && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Draft Restored:</strong> Your in-progress batch and pricing details have been recovered.
            </span>
          </div>
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="text-xs text-amber-700 hover:text-amber-900 font-bold hover:underline shrink-0 ml-2"
          >
            Discard Draft
          </button>
        </div>
      )}

      {/* Capture Mode Indicator */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Capture Mode
        </span>
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
            watchedCaptureMethod === 'SCAN_BARCODE'
              ? 'bg-purple-100 text-purple-800'
              : watchedCaptureMethod === 'SCAN_OCR'
              ? 'bg-amber-100 text-amber-800'
              : 'bg-slate-100 text-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {watchedCaptureMethod}
        </span>
      </div>

      {/* 1. Medicine Selection */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Medicine <span className="text-red-500">*</span>
        </label>
        {selectedMedicine || watch('medicineName') ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {selectedMedicine?.name || watch('medicineName')}
              </p>
              <p className="text-xs text-slate-500">
                {selectedMedicine?.company || watch('medicineCompany')} • GST: {watchedGstRate}%
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedMedicine(null);
                setValue('medicineId', 0);
                setValue('medicineName', '');
              }}
              className="text-xs text-indigo-600 hover:underline font-semibold"
            >
              Change
            </button>
          </div>
        ) : (
          <div>
            <MedicineSearch
              onSelect={handleMedicineSelect}
              onCreateNew={handleCreateNewMedicine}
              placeholder="Search medicine to link..."
            />
            {errors.medicineId && (
              <p className="text-xs text-red-600 mt-1">{errors.medicineId.message}</p>
            )}
          </div>
        )}
      </div>

      {/* 2. Batch Number & Expiry Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Batch Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            {...register('batchNumber')}
            placeholder="e.g. B-99420"
            style={{ color: '#000000', WebkitTextFillColor: '#000000', colorScheme: 'light' }}
            className="w-full px-3 py-2 text-sm bg-white text-black !text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono placeholder:text-slate-400"
          />
          {errors.batchNumber && (
            <p className="text-xs text-red-600 mt-1">{errors.batchNumber.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Expiry Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            min={today}
            {...register('expiryDate')}
            style={{ color: '#000000', WebkitTextFillColor: '#000000', colorScheme: 'light' }}
            className="w-full px-3 py-2 text-sm bg-white text-black !text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.expiryDate && (
            <p className="text-xs text-red-600 mt-1">{errors.expiryDate.message}</p>
          )}
        </div>
      </div>

      {/* 3. Pricing: MRP, Selling Price, Price Incl. GST calculation */}
      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              MRP (₹) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('mrp')}
              placeholder="e.g. 150.00"
              style={{ color: '#000000', WebkitTextFillColor: '#000000', colorScheme: 'light' }}
              className="w-full px-3 py-2 text-sm bg-white text-black !text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono placeholder:text-slate-400"
            />
            {errors.mrp && <p className="text-xs text-red-600 mt-1">{errors.mrp.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Selling Price (incl. GST) (₹) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={priceInclGstInput}
              onChange={handlePriceInclGstChange}
              placeholder="e.g. 134.40"
              style={{ color: '#000000', WebkitTextFillColor: '#000000', colorScheme: 'light' }}
              className="w-full px-3 py-2 text-sm bg-white text-black !text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono placeholder:text-slate-400"
            />
            <input type="hidden" {...register('sellingPrice')} />
            {errors.sellingPrice && (
              <p className="text-xs text-red-600 mt-1">{errors.sellingPrice.message}</p>
            )}
          </div>
        </div>

        {/* Base Selling Price Preview & Ceiling Warning */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs pt-1 border-t border-slate-200">
          <span className="text-slate-600">
            Selling Price (excl. {watchedGstRate}% GST):{' '}
            <strong className="text-slate-900 font-mono">
              ₹{watchedSellingPrice && !isNaN(parseFloat(watchedSellingPrice)) ? parseFloat(watchedSellingPrice).toFixed(2) : '0.00'}
            </strong>
          </span>
          {exceedsMrp && (
            <span className="text-red-600 font-semibold flex items-center gap-1 mt-1 sm:mt-0">
              <AlertTriangle className="w-3.5 h-3.5" /> Exceeds MRP ceiling of ₹{parsedMrp.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* 4. Quantity, Purchase Rate & Supplier */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Quantity Received <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            {...register('quantity', { valueAsNumber: true })}
            placeholder="e.g. 50"
            style={{ color: '#000000', WebkitTextFillColor: '#000000', colorScheme: 'light' }}
            className="w-full px-3 py-2 text-sm bg-white text-black !text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono placeholder:text-slate-400"
          />
          {errors.quantity && (
            <p className="text-xs text-red-600 mt-1">{errors.quantity.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Purchase Rate (₹)
          </label>
          <input
            type="text"
            {...register('purchaseRate')}
            placeholder="0.00"
            style={{ color: '#000000', WebkitTextFillColor: '#000000', colorScheme: 'light' }}
            className="w-full px-3 py-2 text-sm bg-white text-black !text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono placeholder:text-slate-400"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Supplier Name
          </label>
          <input
            type="text"
            {...register('supplierName')}
            placeholder="e.g. Apex Pharma Dist."
            style={{ color: '#000000', WebkitTextFillColor: '#000000', colorScheme: 'light' }}
            className="w-full px-3 py-2 text-sm bg-white text-black !text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* 5. GTIN (optional barcode identifier) */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          GTIN / Barcode (optional)
        </label>
        <input
          type="text"
          {...register('gtin')}
          placeholder="e.g. 08901234567890"
          style={{ color: '#000000', WebkitTextFillColor: '#000000', colorScheme: 'light' }}
          className="w-full px-3 py-2 text-sm bg-white text-black !text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono placeholder:text-slate-400"
        />
        {errors.gtin && <p className="text-xs text-red-600 mt-1">{errors.gtin.message}</p>}
      </div>

      {/* Submit Button */}
      <div className="pt-4 flex justify-end">
        <button
          type="submit"
          disabled={inwardMutation.isPending || exceedsMrp}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm flex items-center gap-2"
        >
          {inwardMutation.isPending ? (
            <>
              <Spinner size="sm" />
              Recording Inward...
            </>
          ) : (
            'Confirm & Inward Stock'
          )}
        </button>
      </div>
    </form>
  );
}
