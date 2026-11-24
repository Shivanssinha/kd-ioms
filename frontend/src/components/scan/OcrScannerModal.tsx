'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Upload,
  FileText,
  X,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Eye,
  SlidersHorizontal,
  Edit3,
} from 'lucide-react';
import Tesseract from 'tesseract.js';
import { parsePackText, ParsedPackTextResult } from '@/lib/scan/parse-pack-text';
import { extractPackagingOcr } from '@/features/stock/api';

export interface OcrCandidateResult {
  batchNumber?: string;
  expiryDate?: string;
  mrp?: string;
  rawText: string;
}

export interface OcrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCandidatesDetected: (result: OcrCandidateResult) => void;
}

type TabMode = 'camera' | 'upload' | 'paste';

/**
 * Preprocesses image on an offscreen canvas:
 * 1. Clamps dimensions to a max of 1600px for speed and memory efficiency
 * 2. Applies grayscale luminance and contrast stretch for dot-matrix/foil prints
 */
function preprocessImage(imageSource: string | File): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
      return;
    }

    // Safety fallback timer if canvas or image loading is restricted (e.g. headless jsdom)
    const fallbackTimer = setTimeout(() => {
      resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
    }, 300);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      clearTimeout(fallbackTimer);
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const contrast = 25; // mild boost
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const adjusted = factor * (gray - 128) + 128;
          const clamped = Math.min(255, Math.max(0, adjusted));
          data[i] = clamped;
          data[i + 1] = clamped;
          data[i + 2] = clamped;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch {
        resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
      }
    };

    img.onerror = () => {
      clearTimeout(fallbackTimer);
      resolve(typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource));
    };

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(imageSource);
    }
  });
}

export function OcrScannerModal({
  isOpen,
  onClose,
  onCandidatesDetected,
}: OcrScannerModalProps) {
  const [activeTab, setActiveTab] = useState<TabMode>('camera');

  // Camera stream state
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ocrSource, setOcrSource] = useState<'gemini' | 'local' | null>(null);

  // Captured / Uploaded Image preview
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // Raw and parsed results
  const [rawText, setRawText] = useState<string>('');
  const [candidates, setCandidates] = useState<ParsedPackTextResult>({});
  const [showRawText, setShowRawText] = useState<boolean>(true);

  // Textarea manual paste state
  const [manualText, setManualText] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera tracks safely
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setErrorMessage(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        'Live camera is not accessible in this browser context (requires HTTPS or localhost). Please use image upload instead.'
      );
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'NotAllowedError') {
        setCameraError('Camera access was denied. Please enable camera permissions in your browser.');
      } else if (error.name === 'NotFoundError') {
        setCameraError('No camera found on this device. Please use photo upload or manual entry.');
      } else {
        setCameraError('Unable to start live camera stream. Use photo upload below to analyze.');
      }
      setIsCameraActive(false);
    }
  }, [stopCamera]);

  // Handle active tab switches & open/close lifecycle
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setImagePreviewUrl(null);
      setRawText('');
      setCandidates({});
      setIsProcessing(false);
      setOcrProgress(0);
      setErrorMessage(null);
      return;
    }

    if (activeTab === 'camera') {
      void startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, startCamera, stopCamera]);

  // Execute OCR analysis on an image source (Blob, File, or Data URL)
  const processImageWithOcr = async (imageSource: string | File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setOcrProgress(15);
    setOcrSource(null);
    setOcrStatus('Scanning packaging with Gemini 1.5 Flash Vision AI...');

    try {
      // 1. Convert image source to Data URL (base64)
      let dataUrl: string;
      if (typeof imageSource === 'string') {
        dataUrl = imageSource;
      } else {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(imageSource);
        });
      }

      // 2. Attempt high-accuracy cloud extraction with Gemini 1.5 Flash first
      try {
        setOcrProgress(35);
        const geminiRes = await extractPackagingOcr({ imageBase64: dataUrl });
        if (geminiRes.success && geminiRes.data?.source === 'gemini') {
          const { batchNumber, expiryDate, mrp, rawText: geminiRawText } = geminiRes.data;
          setRawText(geminiRawText || '');
          setCandidates({
            batchNumber: batchNumber || undefined,
            expiryDate: expiryDate || undefined,
            mrp: mrp != null ? String(mrp) : undefined,
          });
          setOcrSource('gemini');
          setOcrProgress(100);

          if (!batchNumber && !expiryDate && !mrp) {
            setErrorMessage(
              'Gemini Vision AI scanned the photo, but could not detect batch, expiry, or MRP. You can adjust the image, re-snap, or type directly into the candidate fields below.'
            );
          }
          return;
        }
      } catch (geminiErr) {
        // Fall back silently to local Tesseract OCR engine
        console.warn('Gemini packaging OCR unavailable, falling back to local OCR:', geminiErr);
      }

      // 3. Fallback: Local Tesseract.js engine + heuristics
      setOcrSource('local');
      setOcrStatus('Enhancing contrast for local packaging scan...');
      const enhancedDataUrl = await preprocessImage(imageSource);

      setOcrStatus('Loading pharmaceutical OCR engine...');

      const result = await Tesseract.recognize(enhancedDataUrl, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrStatus('Recognizing text on packaging...');
            setOcrProgress(Math.round((m.progress || 0) * 100));
          } else if (m.status === 'loading tesseract core') {
            setOcrStatus('Loading OCR engine...');
          } else if (m.status === 'loading language traineddata') {
            setOcrStatus('Loading language model...');
          }
        },
      });

      const extractedText = result.data.text || '';
      setRawText(extractedText);

      // Parse candidates using heuristic rules
      const parsed = parsePackText(extractedText);
      setCandidates(parsed);

      if (!parsed.batchNumber && !parsed.expiryDate && !parsed.mrp) {
        setErrorMessage(
          'OCR captured text, but could not automatically match batch, expiry, or MRP patterns. You can edit the fields or text below directly.'
        );
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(`OCR Processing failed: ${error.message || 'Unknown error occurred'}`);
    } finally {
      setIsProcessing(false);
      setOcrStatus('');
    }
  };

  // Capture current video frame
  const handleSnapPhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setImagePreviewUrl(dataUrl);

    stopCamera();
    void processImageWithOcr(dataUrl);
  };

  // Handle uploaded file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);
    void processImageWithOcr(file);
  };

  // Handle manual paste parse
  const handleApplyManualText = () => {
    if (!manualText.trim()) return;
    setRawText(manualText);
    const parsed = parsePackText(manualText);
    setCandidates(parsed);
  };

  // Apply to inward form
  const handleApplyToForm = () => {
    onCandidatesDetected({
      batchNumber: candidates.batchNumber?.trim(),
      expiryDate: candidates.expiryDate?.trim(),
      mrp: candidates.mrp?.trim(),
      rawText: rawText || manualText,
    });
    onClose();
  };

  // Retake / Clear current capture
  const handleRetake = () => {
    setImagePreviewUrl(null);
    setRawText('');
    setCandidates({});
    setErrorMessage(null);
    if (activeTab === 'camera') {
      void startCamera();
    }
  };

  if (!isOpen) return null;

  const hasAnyCandidate = Boolean(candidates.batchNumber || candidates.expiryDate || candidates.mrp);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ocr-modal-title"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="ocr-modal-title" className="text-base font-bold text-slate-900 leading-tight">
                Packaging Photo OCR Scanner
              </h2>
              <p className="text-xs text-slate-500">
                In-browser text recognition for pharmaceutical cartons & blister strips
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close OCR modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 px-6 bg-white gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'camera'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Camera className="w-4 h-4" />
            Live Camera Snap
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'upload'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload Photo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`py-3 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'paste'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            Text Paste Fallback
          </button>
        </div>

        {/* Modal Body Area */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TAB 1: Live Camera View */}
          {activeTab === 'camera' && (
            <div className="space-y-4">
              {!imagePreviewUrl ? (
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3] flex items-center justify-center border border-slate-800 shadow-inner">
                  {cameraError ? (
                    <div className="p-6 text-center max-w-sm">
                      <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-2" />
                      <p className="text-xs text-rose-200 mb-4">{cameraError}</p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('upload')}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors"
                      >
                        Switch to Photo Upload
                      </button>
                    </div>
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                        autoPlay
                      />
                      {/* Pharmaceutical carton target guides */}
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                        <div className="w-[85%] h-[60%] border-2 border-dashed border-amber-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] flex flex-col justify-between p-3">
                          <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider bg-slate-900/70 px-2 py-0.5 rounded self-start">
                            Batch / Expiry / MRP
                          </span>
                          <span className="text-[10px] font-medium text-slate-200 bg-slate-900/70 px-2 py-0.5 rounded self-center text-center">
                            Hold packaging steady & well-lit
                          </span>
                        </div>
                      </div>

                      {/* Snap Photo Trigger */}
                      <div className="absolute bottom-4 inset-x-0 flex justify-center">
                        <button
                          type="button"
                          onClick={handleSnapPhoto}
                          disabled={!isCameraActive || isProcessing}
                          className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-50 text-slate-950 rounded-full text-xs font-bold shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                          Snap & Analyze OCR
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Snapped photo preview */
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-slate-900 max-h-56 flex items-center justify-center border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreviewUrl}
                      alt="Captured Packaging Strip"
                      className="max-h-56 object-contain w-full"
                    />
                    <button
                      type="button"
                      onClick={handleRetake}
                      className="absolute top-3 right-3 px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold backdrop-blur-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retake
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Upload Photo View */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="ocr-file-upload"
              />

              {!imagePreviewUrl ? (
                <label
                  htmlFor="ocr-file-upload"
                  className="border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/20 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">
                    Click to select medicine packaging photo
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm">
                    Supports carton sides, blister pack prints, or packaging crop photos (JPEG, PNG, WebP up to 10MB)
                  </p>
                </label>
              ) : (
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 max-h-56 flex items-center justify-center border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreviewUrl}
                    alt="Uploaded packaging strip"
                    className="max-h-56 object-contain w-full"
                  />
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="absolute top-3 right-3 px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold backdrop-blur-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Choose Another
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Text Paste Fallback */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <label htmlFor="manual-ocr-text" className="text-xs font-semibold text-slate-700 block">
                Paste OCR text from external camera apps or scanners:
              </label>
              <textarea
                id="manual-ocr-text"
                rows={4}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="e.g. B.No. A23910 EXP. 08/27 M.R.P. Rs. 145.50"
                className="w-full p-3 text-xs bg-white text-slate-900 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <button
                type="button"
                onClick={handleApplyManualText}
                disabled={!manualText.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" /> Parse Text Heuristics
              </button>
            </div>
          )}

          {/* OCR In-Progress Status Bar */}
          {isProcessing && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                  {ocrStatus}
                </span>
                <span>{ocrProgress}%</span>
              </div>
              <div className="w-full bg-amber-200/60 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-600 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(ocrProgress, 10)}%` }}
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <p>{errorMessage}</p>
                {imagePreviewUrl && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void processImageWithOcr(imagePreviewUrl)}
                      disabled={isProcessing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                      Re-parse Text from Image
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Extracted Candidates Summary Card with Direct Inline Editing */}
          {(hasAnyCandidate || rawText || Boolean(imagePreviewUrl)) && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Detected Candidates
                  </h4>
                  {ocrSource === 'gemini' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <Sparkles className="w-3 h-3 text-emerald-600" /> Gemini 1.5 Flash Vision
                    </span>
                  )}
                  {ocrSource === 'local' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">
                      Local OCR Engine
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                  <Edit3 className="w-3 h-3 text-slate-400" /> Editable fields before applying
                </span>
              </div>

              {/* Candidate Metrics Grid - Direct Editable Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
                  <label htmlFor="ocr-cand-batch" className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Batch Number
                  </label>
                  <input
                    id="ocr-cand-batch"
                    type="text"
                    value={candidates.batchNumber || ''}
                    onChange={(e) => setCandidates((prev) => ({ ...prev, batchNumber: e.target.value }))}
                    placeholder="e.g. CIP-9921"
                    className="w-full text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
                  <label htmlFor="ocr-cand-expiry" className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    Expiry Date (YYYY-MM-DD)
                  </label>
                  <input
                    id="ocr-cand-expiry"
                    type="text"
                    value={candidates.expiryDate || ''}
                    onChange={(e) => setCandidates((prev) => ({ ...prev, expiryDate: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                    className="w-full text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
                  <label htmlFor="ocr-cand-mrp" className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                    M.R.P. (₹)
                  </label>
                  <input
                    id="ocr-cand-mrp"
                    type="text"
                    value={candidates.mrp || ''}
                    onChange={(e) => setCandidates((prev) => ({ ...prev, mrp: e.target.value }))}
                    placeholder="e.g. 145.50"
                    className="w-full text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
              </div>

              {/* Raw OCR Text Area with Instant Re-Parse */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-500" /> Raw Recognized Text
                  </span>
                  <div className="flex items-center gap-2">
                    {imagePreviewUrl && (
                      <button
                        type="button"
                        onClick={() => void processImageWithOcr(imagePreviewUrl)}
                        disabled={isProcessing}
                        className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} /> Re-scan Image
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (imagePreviewUrl && !rawText.trim()) {
                          void processImageWithOcr(imagePreviewUrl);
                        } else {
                          const parsed = parsePackText(rawText);
                          setCandidates(parsed);
                        }
                      }}
                      disabled={isProcessing}
                      className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} /> Re-parse Text
                    </button>
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={rawText}
                  onChange={(e) => {
                    const text = e.target.value;
                    setRawText(text);
                    const parsed = parsePackText(text);
                    setCandidates(parsed);
                  }}
                  placeholder="Raw OCR text appears here. You can also paste or tweak text directly to re-parse."
                  className="w-full p-2.5 text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyToForm}
            disabled={!hasAnyCandidate}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            Apply Candidates to Form <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
