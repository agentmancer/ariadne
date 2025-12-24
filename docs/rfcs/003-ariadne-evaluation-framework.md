# RFC 003: Ariadne Evaluation Framework

**Status:** Draft
**Author:** Claude Code
**Created:** 2025-12-20
**Last Updated:** 2025-12-21

## Abstract

This RFC proposes the **Ariadne Evaluation Framework**, a backend system for systematic parameterization, A/B testing, and comparative analysis of LLM-based applications. Ariadne provides APIs for experiment management, prompt versioning, metrics computation, and human evaluation orchestration.

This RFC covers the **backend infrastructure**. Frontend integration (e.g., Story plugin UI) is covered in separate, consumer-specific RFCs.

## Motivation

Evaluating LLM applications requires:
1. Systematic experiment design with controlled variables
2. Prompt version control with performance tracking
3. Automated and human evaluation metrics
4. Statistical analysis of results

Current approaches rely on ad-hoc scripts and manual tracking. Ariadne provides a unified backend for evaluation workflows that any frontend (Story plugin, mobile app, CLI tools) can consume.

## Design Goals

1. **Framework-Agnostic**: Support any LLM application, not just narrative systems
2. **API-First**: RESTful API that any client can consume
3. **Extensible Metrics**: Plugin architecture for custom evaluation metrics
4. **Scalable Execution**: Parallel experiment runs with queue management
5. **Version Control**: Git-like semantics for prompt management
6. **Statistical Rigor**: Built-in statistical analysis for experiment results

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Consumer Applications                         │
│  (Story Plugin, Mobile App, CLI, Jupyter Notebooks, etc.)        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Ariadne REST API                              │
│  /api/v1/experiments  /api/v1/prompts  /api/v1/metrics          │
│  /api/v1/configs      /api/v1/evaluations  /api/v1/traces       │
└───────┬───────────────────────┬───────────────────────┬─────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐   ┌───────────────────┐   ┌─────────────────────┐
│ Experiment    │   │ Prompt Version    │   │ Metrics Engine      │
│ Manager       │   │ Control           │   │                     │
│ - Queue       │   │ - Versions        │   │ - Automated         │
│ - Scheduler   │   │ - Diffs           │   │ - LLM-as-Judge      │
│ - Execution   │   │ - Branches        │   │ - Human Eval        │
└───────────────┘   └───────────────────┘   └─────────────────────┘
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Layer                                    │
│  PostgreSQL / SQLite    Redis (cache/queue)    Object Storage   │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 0: Design Decisions
Resolve architectural questions before implementation begins.

- [ ] **Database Choice**: PostgreSQL for production, SQLite for local dev
  - Recommendation: Support both via SQLAlchemy abstraction
- [ ] **Queue System**: Redis-based job queue vs in-process threading
  - Recommendation: Redis with Celery for production, threading for local
- [ ] **Prompt Storage**: Database BLOBs vs filesystem with DB metadata
  - Recommendation: Database for small prompts, S3/filesystem for large assets
- [ ] **Multi-tenancy**: Single-tenant vs multi-tenant architecture
  - Recommendation: Multi-tenant with workspace isolation from start

**Issues to create:**
- `ARIADNE-100`: Design decision review and documentation

### Phase 1: Core API & Data Model
Foundation for experiment management.

#### Data Models

```python
@dataclass
class Experiment:
    experiment_id: str
    workspace_id: str  # Multi-tenancy support
    name: str
    description: str
    hypothesis: str
    status: Literal["draft", "queued", "running", "completed", "failed", "cancelled"]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    # Experimental design
    conditions: List[ExperimentCondition]
    n_per_cell: int  # Runs per condition

    # Execution tracking
    progress: Dict[str, int]  # {condition_id: completed_count}

@dataclass
class ExperimentCondition:
    condition_id: str
    name: str
    description: str

    # Configuration reference (flexible schema)
    config_type: str  # e.g., "story_architecture", "chat_prompt", "agent_config"
    config_id: str    # Reference to stored configuration
    config_overrides: Dict[str, Any]  # Inline overrides

    # Metrics to collect
    metrics: List[str]

@dataclass
class ExperimentRun:
    run_id: str
    experiment_id: str
    condition_id: str
    status: Literal["pending", "running", "completed", "failed"]

    # Execution context
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    executor_id: Optional[str]  # Which worker ran this

    # Results
    outputs: Dict[str, Any]  # Raw outputs from the run
    metrics: Dict[str, float]  # Computed metrics
    error: Optional[str]
```

#### API Endpoints

```
# Experiments
GET    /api/v1/experiments              # List experiments (paginated)
POST   /api/v1/experiments              # Create experiment
GET    /api/v1/experiments/:id          # Get experiment details
PATCH  /api/v1/experiments/:id          # Update experiment
DELETE /api/v1/experiments/:id          # Delete experiment
POST   /api/v1/experiments/:id/start    # Queue experiment for execution
POST   /api/v1/experiments/:id/cancel   # Cancel running experiment
GET    /api/v1/experiments/:id/runs     # Get all runs for experiment
GET    /api/v1/experiments/:id/results  # Get aggregated results with stats

# Runs
GET    /api/v1/runs/:id                 # Get run details
GET    /api/v1/runs/:id/outputs         # Get raw outputs
GET    /api/v1/runs/:id/metrics         # Get computed metrics
```

**Issues to create:**
- `ARIADNE-101`: Implement experiment CRUD API
- `ARIADNE-102`: Implement run tracking and status management
- `ARIADNE-103`: Add database migrations for core tables
- `ARIADNE-104`: Create experiment queue system

### Phase 2: Prompt Version Control
Git-like versioning for prompts and configurations.

#### Data Models

```python
@dataclass
class PromptRepository:
    repo_id: str
    workspace_id: str
    name: str
    description: str
    prompt_type: str  # "system", "user", "template", etc.
    created_at: datetime

    # Current state
    default_branch: str

@dataclass
class PromptVersion:
    version_id: str
    repo_id: str
    branch: str

    # Content
    content: str
    variables: List[str]  # Extracted template variables

    # History
    parent_version: Optional[str]
    created_at: datetime
    author: str
    message: str

    # Performance tracking
    metrics_summary: Optional[Dict[str, float]]  # Aggregated from experiments

@dataclass
class PromptBranch:
    branch_id: str
    repo_id: str
    name: str
    head_version: str
    created_at: datetime
```

#### API Endpoints

```
# Repositories
GET    /api/v1/prompts                     # List prompt repos
POST   /api/v1/prompts                     # Create prompt repo
GET    /api/v1/prompts/:repo               # Get repo details

# Versions
GET    /api/v1/prompts/:repo/versions      # List versions (branch filter)
POST   /api/v1/prompts/:repo/versions      # Create new version
GET    /api/v1/prompts/:repo/versions/:id  # Get version details
GET    /api/v1/prompts/:repo/diff          # Diff between versions

# Branches
GET    /api/v1/prompts/:repo/branches      # List branches
POST   /api/v1/prompts/:repo/branches      # Create branch
POST   /api/v1/prompts/:repo/merge         # Merge branches
```

**Issues to create:**
- `ARIADNE-105`: Implement prompt repository CRUD
- `ARIADNE-106`: Implement version creation and history
- `ARIADNE-107`: Build diff algorithm for prompt comparison
- `ARIADNE-108`: Add branch/merge support

### Phase 3: Metrics Engine
Extensible system for computing evaluation metrics.

#### Architecture

```python
class MetricPlugin(ABC):
    """Base class for metric plugins"""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique metric identifier"""
        pass

    @property
    @abstractmethod
    def requires(self) -> List[str]:
        """Required input fields from run outputs"""
        pass

    @abstractmethod
    async def compute(self, outputs: Dict[str, Any]) -> float:
        """Compute metric value from run outputs"""
        pass

# Built-in metrics
class RepetitionScore(MetricPlugin):
    """Measures text repetition using n-gram overlap"""
    name = "repetition_score"
    requires = ["generated_text"]

class LLMJudge(MetricPlugin):
    """Uses LLM to evaluate quality on custom rubric"""
    name = "llm_judge"
    requires = ["generated_text", "rubric"]

class ResponseLatency(MetricPlugin):
    """Measures response generation time"""
    name = "response_latency"
    requires = ["start_time", "end_time"]
```

#### API Endpoints

```
# Metric definitions
GET    /api/v1/metrics                    # List available metrics
GET    /api/v1/metrics/:name              # Get metric details
POST   /api/v1/metrics/compute            # Compute metrics for outputs

# Aggregations
GET    /api/v1/experiments/:id/stats      # Statistical analysis
POST   /api/v1/experiments/compare        # Compare multiple experiments
```

**Issues to create:**
- `ARIADNE-109`: Implement metric plugin system
- `ARIADNE-110`: Build repetition/similarity metrics
- `ARIADNE-111`: Implement LLM-as-judge infrastructure
- `ARIADNE-112`: Add statistical analysis (mean, std, p-values)

### Phase 4: Execution Engine
Parallel experiment execution with queue management.

#### Architecture

```python
class ExecutionEngine:
    """Manages experiment execution across workers"""

    async def enqueue_experiment(self, experiment_id: str):
        """Add experiment runs to the queue"""
        pass

    async def execute_run(self, run_id: str):
        """Execute a single run (called by worker)"""
        pass

    async def get_progress(self, experiment_id: str) -> ExperimentProgress:
        """Get real-time progress"""
        pass

class RunExecutor(ABC):
    """Base class for run executors (one per application type)"""

    @abstractmethod
    async def execute(self, config: Dict, context: Dict) -> Dict:
        """Execute a run and return outputs"""
        pass

# Example executor for Story plugin
class StoryRunExecutor(RunExecutor):
    """Executes narrative generation runs"""

    async def execute(self, config: Dict, context: Dict) -> Dict:
        # Call Story backend API
        pass
```

#### Configuration

```yaml
# execution_config.yaml
queue:
  backend: redis  # or "memory" for local dev
  redis_url: redis://localhost:6379/0

workers:
  count: 4
  timeout: 300  # seconds per run

retry:
  max_attempts: 3
  backoff: exponential

limits:
  max_concurrent_experiments: 10
  max_runs_per_experiment: 1000
  token_budget_per_run: 100000
```

**Issues to create:**
- `ARIADNE-113`: Implement Redis-based job queue
- `ARIADNE-114`: Build worker pool management
- `ARIADNE-115`: Add progress tracking with SSE
- `ARIADNE-116`: Implement retry logic and failure handling

### Phase 5: Human Evaluation
Queue-based human evaluation with blind assignment.

#### Data Models

```python
@dataclass
class EvaluationTask:
    task_id: str
    experiment_id: str
    run_id: str

    # What to evaluate
    content_type: str  # "passage", "conversation", "image", etc.
    content: Dict[str, Any]

    # Evaluation form
    rubric_id: str

    # Assignment
    status: Literal["pending", "assigned", "completed", "skipped"]
    assigned_to: Optional[str]
    assigned_at: Optional[datetime]

    # Blinding
    condition_hidden: bool  # Hide which condition this is from evaluator

@dataclass
class EvaluationRubric:
    rubric_id: str
    name: str
    dimensions: List[RubricDimension]

@dataclass
class RubricDimension:
    name: str
    description: str
    scale: Literal["likert_5", "likert_7", "binary", "ranking"]
    anchors: Dict[int, str]  # Scale point descriptions

@dataclass
class EvaluationResponse:
    response_id: str
    task_id: str
    evaluator_id: str

    ratings: Dict[str, int]  # dimension -> rating
    comments: Optional[str]
    duration_seconds: int

    created_at: datetime
```

#### API Endpoints

```
# Evaluation queue
GET    /api/v1/evaluations/queue          # Get next task for evaluator
POST   /api/v1/evaluations                # Submit evaluation
GET    /api/v1/evaluations/stats          # Inter-rater reliability

# Rubrics
GET    /api/v1/rubrics                    # List rubrics
POST   /api/v1/rubrics                    # Create rubric
GET    /api/v1/rubrics/:id                # Get rubric details
```

**Issues to create:**
- `ARIADNE-117`: Implement evaluation queue with blind assignment
- `ARIADNE-118`: Build rubric management system
- `ARIADNE-119`: Add inter-rater reliability metrics (Krippendorff's alpha)
- `ARIADNE-120`: Create evaluation response storage

### Phase 6: Configuration Management
Flexible configuration storage for different application types.

#### Data Models

```python
@dataclass
class ConfigurationSchema:
    """Defines the schema for a configuration type"""
    schema_id: str
    name: str  # e.g., "story_architecture", "chat_agent"
    version: str
    json_schema: Dict  # JSON Schema for validation

@dataclass
class Configuration:
    config_id: str
    workspace_id: str
    schema_id: str
    name: str

    data: Dict[str, Any]  # The actual configuration

    created_at: datetime
    updated_at: datetime
```

#### API Endpoints

```
# Schemas
GET    /api/v1/schemas                    # List configuration schemas
POST   /api/v1/schemas                    # Register new schema
GET    /api/v1/schemas/:id                # Get schema details

# Configurations
GET    /api/v1/configs                    # List configurations
POST   /api/v1/configs                    # Create configuration
GET    /api/v1/configs/:id                # Get configuration
PUT    /api/v1/configs/:id                # Update configuration
POST   /api/v1/configs/:id/fork           # Fork configuration
GET    /api/v1/configs/:id/validate       # Validate against schema
```

**Issues to create:**
- `ARIADNE-121`: Implement configuration schema registry
- `ARIADNE-122`: Build configuration CRUD with validation
- `ARIADNE-123`: Add fork/version tracking for configs

---

## API Standards

### Error Response Format

All error responses follow a consistent structure:

```json
{
  "error": {
    "code": "EXPERIMENT_NOT_FOUND",
    "message": "Experiment with ID 'abc123' not found",
    "details": {
      "experiment_id": "abc123"
    }
  },
  "status": 404,
  "timestamp": "2025-12-20T10:30:00Z",
  "request_id": "req_xyz789"
}
```

**Standard Error Codes:**

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `INVALID_REQUEST` | Malformed request body or parameters |
| 400 | `VALIDATION_ERROR` | Request data fails schema validation |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT` | State conflict (e.g., experiment already running) |
| 422 | `UNPROCESSABLE` | Valid syntax but cannot be processed |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

### Pagination

List endpoints support cursor-based pagination:

```
GET /api/v1/experiments?limit=20&cursor=eyJpZCI6IjEyMyJ9
```

Response includes:
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6IjE0MyJ9",
    "has_more": true
  }
}
```

### Filtering & Sorting

```
GET /api/v1/experiments?status=running&sort=-created_at
```

---

## Data Storage

### Database Schema (PostgreSQL/SQLite)

```sql
-- Workspaces (multi-tenancy)
CREATE TABLE workspaces (
    workspace_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Experiments
CREATE TABLE experiments (
    experiment_id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces,
    name TEXT NOT NULL,
    description TEXT,
    hypothesis TEXT,
    status TEXT DEFAULT 'draft',
    config JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_experiments_workspace ON experiments(workspace_id);
CREATE INDEX idx_experiments_status ON experiments(status);

-- Experiment runs
CREATE TABLE experiment_runs (
    run_id TEXT PRIMARY KEY,
    experiment_id TEXT REFERENCES experiments ON DELETE CASCADE,
    condition_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    outputs JSONB,
    metrics JSONB,
    error TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX idx_runs_experiment ON experiment_runs(experiment_id);
CREATE INDEX idx_runs_status ON experiment_runs(status);

-- Prompt repositories
CREATE TABLE prompt_repos (
    repo_id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces,
    name TEXT NOT NULL,
    description TEXT,
    prompt_type TEXT,
    default_branch TEXT DEFAULT 'main',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prompt versions
CREATE TABLE prompt_versions (
    version_id TEXT PRIMARY KEY,
    repo_id TEXT REFERENCES prompt_repos ON DELETE CASCADE,
    branch TEXT NOT NULL,
    content TEXT NOT NULL,
    variables JSONB,
    parent_version TEXT,
    author TEXT,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_versions_repo ON prompt_versions(repo_id);
CREATE INDEX idx_versions_branch ON prompt_versions(repo_id, branch);

-- Configurations
CREATE TABLE configurations (
    config_id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces,
    schema_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Human evaluations
CREATE TABLE evaluation_tasks (
    task_id TEXT PRIMARY KEY,
    experiment_id TEXT REFERENCES experiments,
    run_id TEXT REFERENCES experiment_runs,
    rubric_id TEXT NOT NULL,
    content JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    assigned_to TEXT,
    assigned_at TIMESTAMP,
    condition_hidden BOOLEAN DEFAULT true
);

CREATE TABLE evaluation_responses (
    response_id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES evaluation_tasks,
    evaluator_id TEXT NOT NULL,
    ratings JSONB NOT NULL,
    comments TEXT,
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Security Considerations

### Authentication & Authorization

1. **API Authentication**: Bearer token (JWT) required for all endpoints
2. **Workspace Isolation**: Users can only access resources in their workspace
3. **Role-Based Access**:
   - `admin`: Full access, can manage workspace settings
   - `researcher`: Create/run experiments, manage prompts
   - `evaluator`: Submit human evaluations only
   - `viewer`: Read-only access to results

### Rate Limiting & Resource Protection

4. **API Rate Limits**:
   - 100 requests/minute for management endpoints
   - 1000 requests/minute for read-only endpoints
5. **Execution Limits**:
   - Max 10 concurrent experiments per workspace
   - Max 1000 runs per experiment
   - Token budget limits per run (configurable)

### Data Protection

6. **Input Validation**: All inputs validated against schemas
7. **Prompt Sanitization**: Template variables validated against whitelist
8. **Audit Logging**: All mutations logged with actor and timestamp

---

## Performance Considerations

### Execution Parallelism

1. **Worker Pool**: Configurable number of workers (default: 4)
2. **Queue Priority**: FIFO with priority override for urgent experiments
3. **Backpressure**: Queue limits prevent resource exhaustion

### Caching

4. **Metric Cache**: Computed metrics cached (Redis, 1 hour TTL)
5. **Configuration Cache**: Frequently accessed configs cached
6. **Query Cache**: Aggregation queries cached with invalidation

### Database Optimization

7. **Indexes**: On all foreign keys and common query patterns
8. **Partitioning**: Runs table partitioned by created_at for large deployments
9. **Connection Pooling**: Configurable pool size

---

## Testing Strategy

### Unit Tests

| Module | Coverage Target | Focus Areas |
|--------|-----------------|-------------|
| `experiment_manager` | 90% | Lifecycle, validation, state transitions |
| `prompt_versioning` | 85% | Version creation, diff, merge |
| `metrics_engine` | 90% | All metric computations, edge cases |
| `execution_engine` | 80% | Queue, worker, retry logic |

### Integration Tests

- API endpoint tests with real database
- Queue system tests with Redis
- End-to-end experiment execution

### Load Tests

| Scenario | Target |
|----------|--------|
| 100 concurrent API requests | < 100ms p95 |
| 50 parallel experiment runs | No degradation |
| 10,000 runs query | < 2 seconds |

---

## References

- [Promptfoo](https://github.com/promptfoo/promptfoo) - Prompt testing framework
- [DeepEval](https://www.confident-ai.com/blog/llm-testing-in-2024-top-methods-and-strategies) - LLM evaluation
- [Braintrust](https://www.braintrust.dev/) - LLM evaluation platform
- [LangSmith](https://docs.smith.langchain.com) - Trace and evaluation
- [Weights & Biases](https://wandb.ai/) - Experiment tracking patterns

---

## Appendix: Integration with Story Plugin

The Story plugin consumes Ariadne APIs to provide narrative-specific evaluation:

1. **Configuration Schema**: Story plugin registers `story_architecture` schema
2. **Run Executor**: Story plugin provides `StoryRunExecutor` that calls its backend
3. **Custom Metrics**: Story plugin registers narrative-specific metrics (repetition, action responsiveness)
4. **UI Integration**: Story frontend components call Ariadne APIs for experiment management

See: `story/docs/RFC_ARIADNE_UI_INTEGRATION.md` for Story-specific integration details.
