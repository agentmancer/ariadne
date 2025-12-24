import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import { TwineStory, TwinePassage, extractLinks } from './types';

interface TwinePlayerProps {
  /** Story to play */
  story: TwineStory;
  /** Called when player navigates to a new passage */
  onPassageChange?: (passageName: string, fromPassage?: string) => void;
  /** Called when story ends (no more links) */
  onComplete?: (history: string[]) => void;
  /** Called when player makes a choice */
  onChoice?: (choice: { passageName: string; choiceIndex: number; choiceText: string; targetPassage: string }) => void;
  /** Read-only mode (hides navigation) */
  readOnly?: boolean;
  /** Show passage history sidebar */
  showHistory?: boolean;
  /** Current passage to highlight (for external control) */
  highlightPassage?: string;
}

interface NavigationState {
  currentPassage: string;
  history: string[];
  historyIndex: number;
}

/**
 * TwinePlayer - Renders and plays Twine stories
 *
 * Supports basic Harlowe-style syntax:
 * - [[Link Text]] - navigates to passage named "Link Text"
 * - [[Display Text|Target]] - shows "Display Text", navigates to "Target"
 * - Basic text formatting (bold, italic)
 */
export default function TwinePlayer({
  story,
  onPassageChange,
  onComplete,
  onChoice,
  readOnly = false,
  showHistory = true,
  highlightPassage,
}: TwinePlayerProps) {
  // Build passage lookup map
  const passageMap = useMemo(() => {
    const map = new Map<string, TwinePassage>();
    story.passages.forEach(p => map.set(p.name, p));
    return map;
  }, [story.passages]);

  // Navigation state
  const [nav, setNav] = useState<NavigationState>(() => {
    const startPassageName = story.startPassage || story.passages[0]?.name || '';
    return {
      currentPassage: startPassageName,
      history: [startPassageName],
      historyIndex: 0,
    };
  });

  // Track elapsed time
  const startTimeRef = useRef(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  // Track completion to prevent multiple onComplete calls
  const completedRef = useRef(false);

  // Track current passage in a ref to avoid stale closures
  const currentPassageRef = useRef(nav.currentPassage);
  currentPassageRef.current = nav.currentPassage;

  // Get current passage
  const currentPassage = passageMap.get(nav.currentPassage);

  // Extract links from current passage
  const links = useMemo(() => {
    if (!currentPassage) return [];
    return extractLinks(currentPassage.text);
  }, [currentPassage]);

  // Check if story is complete (dead end or no links)
  const isComplete = links.length === 0 && !readOnly;

  // Timer update - stops when story completes
  useEffect(() => {
    if (isComplete) return; // Don't run timer when story is complete

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isComplete]);

  // Navigate to a passage
  const navigateTo = useCallback((passageName: string, choiceIndex?: number, choiceText?: string) => {
    if (!passageMap.has(passageName)) {
      console.warn(`Passage "${passageName}" not found`);
      return;
    }

    // Use ref to avoid stale closure - gets the current value at call time
    const fromPassage = currentPassageRef.current;

    setNav(prev => {
      // Trim forward history if we navigated back then chose new path
      const newHistory = [...prev.history.slice(0, prev.historyIndex + 1), passageName];
      return {
        currentPassage: passageName,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });

    // Fire callbacks
    onPassageChange?.(passageName, fromPassage);

    if (choiceIndex !== undefined && choiceText) {
      onChoice?.({
        passageName: fromPassage,
        choiceIndex,
        choiceText,
        targetPassage: passageName,
      });
    }
  }, [passageMap, onPassageChange, onChoice]);

  // Navigate back in history
  const navigateBack = useCallback(() => {
    if (nav.historyIndex <= 0) return;

    const newIndex = nav.historyIndex - 1;
    const passageName = nav.history[newIndex];

    setNav(prev => ({
      ...prev,
      currentPassage: passageName,
      historyIndex: newIndex,
    }));

    onPassageChange?.(passageName, nav.currentPassage);
  }, [nav, onPassageChange]);

  // Navigate forward in history (if available)
  const navigateForward = useCallback(() => {
    if (nav.historyIndex >= nav.history.length - 1) return;

    const newIndex = nav.historyIndex + 1;
    const passageName = nav.history[newIndex];

    setNav(prev => ({
      ...prev,
      currentPassage: passageName,
      historyIndex: newIndex,
    }));

    onPassageChange?.(passageName, nav.currentPassage);
  }, [nav, onPassageChange]);

  // Fire completion callback when story ends (only once)
  useEffect(() => {
    if (isComplete && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(nav.history);
    }
  }, [isComplete, nav.history, onComplete]);

  // Render passage text with basic formatting and clickable links
  const renderPassageContent = (text: string) => {
    // Remove [[links]] from text - we render them as buttons
    let processedText = text.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '');

    // Basic Harlowe formatting
    // Bold: ''text''
    processedText = processedText.replace(/''([^']+)''/g, '<strong>$1</strong>');
    // Italic: //text//
    processedText = processedText.replace(/\/\/([^/]+)\/\//g, '<em>$1</em>');
    // Line breaks
    processedText = processedText.replace(/\n/g, '<br/>');

    // Sanitize HTML to prevent XSS attacks
    const sanitizedHtml = DOMPurify.sanitize(processedText, {
      ALLOWED_TAGS: ['strong', 'em', 'br', 'p', 'span'],
      ALLOWED_ATTR: [],
    });

    return (
      <div
        className="prose prose-lg max-w-none text-gray-800 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  };

  // Format elapsed time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get unique passages visited
  const uniquePassagesVisited = useMemo(() => {
    return new Set(nav.history).size;
  }, [nav.history]);

  if (!currentPassage) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 p-8">
        <div className="text-center">
          <div className="text-red-500 text-lg font-medium mb-2">Story Error</div>
          <p className="text-gray-600">
            {story.passages.length === 0
              ? 'This story has no passages.'
              : `Cannot find passage "${nav.currentPassage}".`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Story header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back/Forward navigation */}
            {!readOnly && (
              <div className="flex items-center gap-1">
                <button
                  onClick={navigateBack}
                  disabled={nav.historyIndex <= 0}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Go back"
                  aria-label="Go back to previous passage"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={navigateForward}
                  disabled={nav.historyIndex >= nav.history.length - 1}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Go forward"
                  aria-label="Go forward to next passage"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}

            <div>
              <h2 className="font-medium text-gray-900">{story.name}</h2>
              <p className="text-sm text-gray-500">
                {currentPassage.name}
                {currentPassage.tags?.length ? (
                  <span className="ml-2">
                    {currentPassage.tags.map(tag => (
                      <span key={tag} className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded mr-1">
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Story content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto">
            {/* Passage content */}
            <div className={`bg-white rounded-lg shadow-sm p-6 mb-6 ${
              highlightPassage === currentPassage.name ? 'ring-2 ring-primary-500' : ''
            }`}>
              {renderPassageContent(currentPassage.text)}
            </div>

            {/* Choice links */}
            {links.length > 0 && !readOnly && (
              <div className="space-y-3">
                {links.map((link, index) => (
                  <button
                    key={`${link.target}-${index}`}
                    onClick={() => navigateTo(link.target, index, link.text)}
                    className="w-full text-left px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors group"
                  >
                    <span className="text-primary-600 group-hover:text-primary-700">
                      {link.text}
                    </span>
                    {link.text !== link.target && (
                      <span className="text-gray-400 text-sm ml-2">
                        → {link.target}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Story complete */}
            {isComplete && (
              <div className="text-center p-6 bg-green-50 rounded-lg border border-green-200">
                <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-medium text-green-800 mb-2">Story Complete</h3>
                <p className="text-green-600 text-sm">
                  You've reached the end of this path.
                </p>
              </div>
            )}

            {/* Dead end warning */}
            {links.length === 0 && !isComplete && !readOnly && (
              <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-yellow-700 text-sm">
                  This passage has no links. Use the back button to explore other paths.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* History sidebar */}
        {showHistory && (
          <div className="w-64 bg-white border-l border-gray-200 flex flex-col">
            <div className="p-3 border-b border-gray-200">
              <h3 className="font-medium text-gray-900 text-sm">Journey</h3>
            </div>
            <div className="flex-1 overflow-auto p-3">
              <div className="space-y-1">
                {nav.history.map((passageName, index) => (
                  <button
                    key={`${passageName}-${index}`}
                    onClick={() => {
                      if (!readOnly && index !== nav.historyIndex) {
                        setNav(prev => ({
                          ...prev,
                          currentPassage: passageName,
                          historyIndex: index,
                        }));
                        onPassageChange?.(passageName, nav.currentPassage);
                      }
                    }}
                    disabled={readOnly}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded transition-colors ${
                      index === nav.historyIndex
                        ? 'bg-primary-100 text-primary-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    } ${readOnly ? 'cursor-default' : ''}`}
                  >
                    <span className="text-gray-400 mr-2">{index + 1}.</span>
                    {passageName}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Progress footer */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-4">
          <span>
            {uniquePassagesVisited} / {story.passages.length} passages visited
          </span>
          <span className="text-gray-300">|</span>
          <span>
            {nav.history.length} steps taken
          </span>
        </div>
        <div>
          <span>{formatTime(elapsedTime)} elapsed</span>
        </div>
      </div>
    </div>
  );
}
