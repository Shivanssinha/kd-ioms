import { Suspense } from 'react';
import { DeliveryPoolView } from '@/features/delivery/DeliveryPoolView';
import { Spinner } from '@/components/ui/Spinner';

export const metadata = {
  title: 'Dispatch Pool | KD-IOMS Delivery',
  description: 'Claim wholesale orders ready for delivery',
};

export default function DeliveryPoolPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Suspense
        fallback={
          <div className="py-12 flex justify-center">
            <Spinner size="lg" />
          </div>
        }
      >
        <DeliveryPoolView />
      </Suspense>
    </div>
  );
}
