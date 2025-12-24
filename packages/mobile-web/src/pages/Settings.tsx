/**
 * Settings page - Configure API server and app preferences
 */

import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { PageContainer } from '../components';

export function Settings() {
  const { user, logout } = useAuth();
  const [apiUrl, setApiUrl] = useState(api.getApiUrl());
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [saved, setSaved] = useState(false);

  const testConnection = useCallback(async () => {
    setIsTesting(true);
    const connected = await api.healthCheck();
    setIsConnected(connected);
    setIsTesting(false);
  }, []);

  useEffect(() => {
    testConnection();
  }, [testConnection]);

  const handleSave = async () => {
    api.setApiUrl(apiUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await testConnection();
  };

  return (
    <PageContainer title="Settings" subtitle="Configure your preferences">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* User Profile */}
        {user && (
          <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4">Profile</h2>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-white text-2xl font-semibold">
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <p className="font-medium text-gray-900">{user.name}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
                {user.role && (
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded">
                    {user.role}
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* API Configuration */}
        <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">API Server</h2>

          {/* Connection Status */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
            <div className={`w-3 h-3 rounded-full ${
              isConnected === null ? 'bg-gray-300' :
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm text-gray-600 flex-1">
              {isTesting ? 'Testing connection...' :
               isConnected === null ? 'Not tested' :
               isConnected ? 'Connected to API server' : 'Connection failed'}
            </span>
            <button
              onClick={testConnection}
              disabled={isTesting}
              className="text-sm text-primary-600 hover:text-primary-800 disabled:opacity-50"
            >
              Test Connection
            </button>
          </div>

          {/* URL Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Server URL
            </label>
            <input
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://localhost:3000/api/v1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-500">
              The URL of your Ariadne API server.
            </p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            className="mt-4 w-full lg:w-auto px-6 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            {saved ? '✓ Saved!' : 'Save Settings'}
          </button>
        </section>

        {/* Account Actions */}
        <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Account</h2>
          <button
            onClick={() => {
              logout();
              // Use base URL from Vite config for proper routing with basename
              const basePath = import.meta.env.BASE_URL || '/';
              window.location.href = `${basePath}login`.replace('//', '/');
            }}
            className="w-full lg:w-auto px-6 py-2 text-red-600 bg-red-50 font-medium rounded-lg hover:bg-red-100 transition-colors"
          >
            Sign Out
          </button>
        </section>

        {/* About */}
        <section className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-2">About</h2>
          <div className="space-y-1">
            <p className="text-sm text-gray-600">
              Ariadne v2.0.0
            </p>
            <p className="text-xs text-gray-400">
              Research platform for interactive storytelling studies
            </p>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
