/**
 * Tab navigation component for Study Editor
 */

export type StudyTab = 'overview' | 'settings' | 'conditions' | 'surveys' | 'consent' | 'test';

interface StudyTabsProps {
  activeTab: StudyTab;
  onTabChange: (tab: StudyTab) => void;
  counts?: {
    conditions: number;
    surveys: number;
  };
}

const TABS: { id: StudyTab; label: string; showCount?: boolean; icon?: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'settings', label: 'Settings' },
  { id: 'conditions', label: 'Conditions', showCount: true },
  { id: 'surveys', label: 'Surveys', showCount: true },
  { id: 'consent', label: 'Consent' },
  { id: 'test', label: 'Test' },
];

export function StudyTabs({ activeTab, onTabChange, counts }: StudyTabsProps) {
  return (
    <div className="border-b border-gray-200 mb-6 overflow-x-auto">
      <nav className="flex gap-1 min-w-max">
        {TABS.map((tab) => {
          const count = tab.showCount
            ? tab.id === 'conditions'
              ? counts?.conditions
              : counts?.surveys
            : undefined;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`py-3 px-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {count !== undefined && count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                  activeTab === tab.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
