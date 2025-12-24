import { useEffect, useState } from 'react';
import { Partner } from '../../services/api';
import LoadingSpinner from '../LoadingSpinner';

interface WaitingRoomProps {
  partner: Partner | null;
  onReady: () => void;
}

export default function WaitingRoom({ partner, onReady }: WaitingRoomProps) {
  const [dots, setDots] = useState('');

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const isPartnerReady = partner !== null;

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
      <div className="mb-8">
        <LoadingSpinner size="lg" />
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-4">
        Waiting Room
      </h2>

      {isPartnerReady ? (
        <>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-green-800 font-medium">
              Your partner has arrived!
            </p>
            {partner.bio && (
              <p className="text-green-700 text-sm mt-2">
                {partner.bio}
              </p>
            )}
          </div>

          <button
            onClick={onReady}
            className="px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            Begin Session
          </button>
        </>
      ) : (
        <>
          <p className="text-gray-600 mb-2">
            Waiting for your partner to join{dots}
          </p>
          <p className="text-sm text-gray-500">
            The session will begin once both participants are ready.
          </p>
        </>
      )}
    </div>
  );
}
