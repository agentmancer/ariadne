import { useSession } from '../../context/SessionContext';

export default function Completion() {
  const { participant, logout } = useSession();

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
      {/* Success icon */}
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Session Complete!
      </h2>

      <p className="text-gray-600 mb-6 max-w-md">
        Thank you for participating in this study. Your contributions help advance research
        in interactive storytelling.
      </p>

      {participant && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600">
            Participant ID: <span className="font-mono">{participant.participantId}</span>
          </p>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          You may now close this window or leave the session.
        </p>
        <button
          onClick={logout}
          className="px-6 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Leave Session
        </button>
      </div>
    </div>
  );
}
