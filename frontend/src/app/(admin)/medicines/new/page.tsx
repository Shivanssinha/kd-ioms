'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MedicineForm } from '../../../../features/medicines/components/MedicineForm';
import { useCreateMedicine } from '../../../../features/medicines/hooks';
import type { CreateMedicinePayload, MedicineRecord } from '../../../../features/medicines/types';

function NewMedicineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromInward = searchParams.get('fromInward') === 'true';
  const nameParam = searchParams.get('name') || '';

  const createMutation = useCreateMedicine();

  const handleCreate = async (payload: CreateMedicinePayload) => {
    const created = await createMutation.mutateAsync(payload);
    if (fromInward) {
      router.push(
        `/stock/inward?medicineId=${created.medicineId}&medicineName=${encodeURIComponent(
          created.name
        )}&medicineCompany=${encodeURIComponent(created.company)}&gstRate=${created.gstRate}`
      );
    } else {
      router.push('/medicines');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Add New Medicine</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {fromInward
            ? 'Create medicine record to link directly back into your in-progress stock inward session.'
            : 'Create a new pharmaceutical product record with packaging details, tax slabs, and active salts.'}
        </p>
      </div>

      <MedicineForm
        initialData={nameParam ? ({ name: nameParam } as Partial<MedicineRecord> as MedicineRecord) : undefined}
        onSubmit={handleCreate as (payload: unknown) => Promise<void>}
        isLoading={createMutation.isPending}
      />
    </div>
  );
}

export default function NewMedicinePage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-6 text-sm text-slate-400">Loading form...</div>}>
      <NewMedicineContent />
    </Suspense>
  );
}
