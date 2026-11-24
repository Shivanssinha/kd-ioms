import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requirePasswordChanged } from '../../middleware/require-password-changed.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { USER_ROLE } from '../../enums/user-role.enum.js';
import { inwardStockSchema, scanResolveSchema, scanOcrSchema } from './stock-inward.validation.js';
import * as stockInwardController from './stock-inward.controller.js';
import { listLedgerSchema } from '../batch/batch.validation.js';
import * as batchController from '../batch/batch.controller.js';

import { searchScanLimiter } from '../../middleware/rate-limit.js';

const router = Router();

// OCR image parsing is a read-only vision utility — rate limited by searchScanLimiter
router.post('/scan/ocr', searchScanLimiter, validate(scanOcrSchema), asyncHandler(stockInwardController.handleScanOcr));

// Mutating stock operations, barcode catalog resolution, and ledger viewing are gated strictly to ADMIN
router.use(authenticate, authorize(USER_ROLE.ADMIN), requirePasswordChanged);

router.post('/inward', validate(inwardStockSchema), asyncHandler(stockInwardController.handleInwardStock));
router.post('/scan/resolve', searchScanLimiter, validate(scanResolveSchema), asyncHandler(stockInwardController.handleResolveScan));
router.get('/ledger', validate(listLedgerSchema), asyncHandler(batchController.handleListLedger));

export default router;
