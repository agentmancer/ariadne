/**
 * Create Study page - Form to create a new study
 */

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, Project, Study, CreateStudyInput } from '../services/api';
import { LoadingSpinner, PageContainer } from '../components';

type StudyType = Study['type'];

const STUDY_TYPES: { value: StudyType; label: string; description: string }[] = [
  {
    value: 'SINGLE_PARTICIPANT',
    label: 'Single Participant',
    description: 'One participant per session, independent experiences',
  },
  {
    value: 'PAIRED_COLLABORATIVE',
    label: 'Paired Collaborative',
    description: 'Two participants work together on shared content',
  },
  {
    value: 'MULTI_ROUND',
    label: 'Multi-Round',
    description: 'Multiple rounds of interaction with evolving content',
  },
  {
    value: 'CUSTOM',
    label: 'Custom',
    description: 'Flexible configuration for specialized studies',
  },
];

export function CreateStudy() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [studyType, setStudyType] = useState<StudyType>('SINGLE_PARTICIPANT');
  const [projectId, setProjectId] = useState<string>('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // Load projects on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        const projectList = await api.getProjects();
        setProjects(projectList);
        if (projectList.length > 0) {
          setProjectId(projectList[0].id);
        } else {
          setShowNewProject(true);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
        setShowNewProject(true);
      } finally {
        setIsLoadingProjects(false);
      }
    }
    loadProjects();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Study name is required');
      return;
    }

    if (!projectId && !newProjectName.trim()) {
      setError('Please select a project or create a new one');
      return;
    }

    setIsLoading(true);

    try {
      let finalProjectId = projectId;

      // Create new project if needed
      if (showNewProject && newProjectName.trim()) {
        const newProject = await api.createProject({
          name: newProjectName.trim(),
        });
        finalProjectId = newProject.id;
      }

      // Create the study
      const input: CreateStudyInput = {
        projectId: finalProjectId,
        name: name.trim(),
        type: studyType,
      };

      if (description.trim()) {
        input.description = description.trim();
      }

      const study = await api.createStudy(input);
      navigate(`/study/${study.id}`);
    } catch (err) {
      // Extract specific error message from API response if available
      if (err instanceof Error) {
        const axiosError = err as { response?: { data?: { error?: { message?: string } } } };
        setError(axiosError.response?.data?.error?.message || err.message || 'Failed to create study');
      } else {
        setError('Failed to create study. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingProjects) {
    return (
      <PageContainer title="Create Study" subtitle="Set up a new research study">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner text="Loading..." />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Create Study" subtitle="Set up a new research study">
      {/* Back link for mobile */}
      <Link
        to="/dashboard"
        className="lg:hidden inline-flex items-center gap-2 text-primary-600 mb-4"
      >
        ← Back to Dashboard
      </Link>

      {/* Desktop breadcrumb */}
      <nav className="hidden lg:flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/dashboard" className="hover:text-primary-600">Dashboard</Link>
        <span>/</span>
        <span className="text-gray-900">Create Study</span>
      </nav>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          {/* Study Name */}
          <div className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4">Study Details</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Study Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Interactive Story Pilot Study"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  disabled={isLoading}
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the study's purpose and goals..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Study Type */}
          <div className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4">Study Type</h2>

            <div className="space-y-3">
              {STUDY_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={`block p-4 border rounded-lg cursor-pointer transition-colors ${
                    studyType === type.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="studyType"
                      value={type.value}
                      checked={studyType === type.value}
                      onChange={(e) => setStudyType(e.target.value as StudyType)}
                      className="mt-1"
                      disabled={isLoading}
                    />
                    <div>
                      <span className="font-medium text-gray-900">{type.label}</span>
                      <p className="text-sm text-gray-500 mt-0.5">{type.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Project Selection */}
          <div className="bg-white rounded-lg p-4 lg:p-6 shadow-sm">
            <h2 className="font-semibold text-gray-800 mb-4">Project</h2>

            {projects.length > 0 && !showNewProject ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="project" className="block text-sm font-medium text-gray-700 mb-1">
                    Select Project <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="project"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={isLoading}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} ({project._count?.studies || 0} studies)
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewProject(true)}
                  className="text-sm text-primary-600 hover:text-primary-800"
                >
                  + Create new project instead
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="newProject" className="block text-sm font-medium text-gray-700 mb-1">
                    New Project Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="newProject"
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g., Interactive Fiction Research"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    disabled={isLoading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Projects help organize related studies together.
                  </p>
                </div>
                {projects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewProject(false);
                      setNewProjectName('');
                    }}
                    className="text-sm text-primary-600 hover:text-primary-800"
                  >
                    ← Use existing project instead
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 sm:flex-none px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Creating...' : 'Create Study'}
            </button>
            <Link
              to="/dashboard"
              className="flex-1 sm:flex-none px-6 py-3 text-center text-gray-700 bg-gray-100 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </Link>
          </div>

          <p className="text-sm text-gray-500">
            The study will be created in <strong>Draft</strong> status. You can add conditions and configure settings before activating it.
          </p>
        </form>
      </div>
    </PageContainer>
  );
}
