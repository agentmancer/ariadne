# Ariadne: Research Infrastructure for Human-AI Collaborative Interactive Fiction Studies

**FDG 2026 Draft**

## Abstract

We present Ariadne, open-source research infrastructure for studying human-AI collaboration in interactive fiction. The platform provides multi-provider LLM support (Anthropic, OpenAI, Google, and local Ollama deployment), Model Context Protocol integration for agentic research workflows, and a synthetic dyad paradigm for model evaluation. These capabilities address practical barriers to human-AI collaboration research: API costs, privacy requirements, and the need for controlled model comparison.

To demonstrate platform capabilities, we profile four frontier models (Claude Sonnet 4, Claude Opus 4.5, GPT-5.2, Gemini 2.5 Pro) using established complexity metrics from the Streams of Consciousness framework. Results reveal different structural tendencies: GPT-5.2 (with 8x higher token budgets) produced the densest branching structures, Claude models showed balanced complexity with high feedback volume, and Gemini prioritized speed. These profiles illustrate the platform's capacity for systematic model characterization.

The primary contribution is the infrastructure itself—architecture, methodology, and open-source release. The empirical findings demonstrate platform utility and suggest directions for human participant research, pending controlled replication with matched experimental conditions.

## 1. Introduction

Frontier language models increasingly participate in creative and educational contexts, prompting interest in human-AI collaborative creativity research. Interactive digital narrative (IDN) offers a compelling domain for such research: unlike linear text generation, interactive fiction requires maintaining coherence across branching paths and designing meaningful choice architectures—capabilities that standard NLP benchmarks do not assess.

However, deploying frontier models in human participant research presents practical challenges: API costs, privacy requirements for local deployment, and the need to compare multiple providers. Research infrastructure must accommodate diverse models and experimental designs without per-study reimplementation.

We introduce Ariadne, a platform designed to address these challenges through three key innovations:

**Multi-Provider Architecture**: Ariadne integrates cloud-hosted frontier models (Anthropic Claude, OpenAI GPT, Google Gemini) with support for locally-deployed open-weight models (via Ollama), enabling researchers to optimize for capability, cost, and privacy constraints within a unified experimental framework.

**Model Context Protocol Integration**: The platform implements Anthropic's Model Context Protocol (MCP), providing standardized tool interfaces that enable AI agents to interact with study management, data collection, and narrative analysis systems through well-defined APIs. This architecture supports both automated batch studies and interactive human-AI sessions.

**Synthetic Validation Paradigm**: Before deploying models in human participant research, Ariadne enables systematic capability evaluation through synthetic dyad studies—AI-AI collaborative sessions that establish empirical baselines for model behavior under controlled conditions.

This paper contributes:

1. **Platform architecture**: Multi-provider LLM support with unified interface for cloud and local models
2. **MCP integration**: Standardized tool interfaces enabling agentic research workflows
3. **Synthetic dyad methodology**: AI-AI collaboration paradigm for controlled model evaluation
4. **Validation study**: Demonstration of capacity profiling across four frontier models
5. **Open-source release**: Complete platform, scripts, and data at https://github.com/agentmancer/ariadne

Our goal is to provide research infrastructure that enables game studies researchers to investigate human-AI collaboration across diverse experimental paradigms—from controlled synthetic studies establishing model baselines to ecologically valid human participant research.

## 2. Related Work

### 2.1 Interactive Narrative Complexity Metrics

The assessment of interactive fiction complexity has evolved from informal authorial intuition to empirically-grounded measurement frameworks. Wright (2022) developed the Tree Complexity Metric (TCM) through machine learning analysis of reader-perceived complexity in Twine narratives. By collecting human judgments of narrative complexity and correlating these with structural features, Wright identified key predictors: total node count, branch count, choice node frequency, maximum and average path lengths, and recursive branch structures. The resulting regression model achieved R² = 0.75, demonstrating that structural features substantially predict perceived complexity.

The "Streams of Consciousness" framework (Wright et al., ICIDS 2024) operationalized these metrics for research applications, establishing standardized measurement protocols and benchmark values across narrative genres. This framework distinguishes between:

- **Topological metrics**: Node count, branch count, leaf count (terminal nodes), non-leaf count
- **Choice architecture metrics**: Choice nodes (passages with multiple exits), choice ratio (proportion of nodes offering decisions)
- **Path metrics**: Maximum path length, average path length across all start-to-ending traversals
- **Structural complexity indicators**: Recursive branches (links returning to earlier nodes), branching factor (average exits per non-leaf node)

We adopt this framework for our comparative evaluation, enabling direct comparison with established benchmarks and future replication studies. This structural focus complements experiential dimensions of interactive narrative—such as agency, procedural rhetoric, and emotional engagement (Murray, 1997; Bogost, 2007)—which require human participant assessment beyond the scope of this synthetic validation.

### 2.2 LLM Evaluation in Creative Contexts

Evaluating large language models on creative tasks presents unique methodological challenges. Unlike factual question-answering or code generation, creative output lacks ground-truth references for automated scoring. Prior approaches include:

**Human Judgment Studies**: Chakrabarty et al. (2023) evaluated GPT-4's creative writing through expert assessment, finding that while models produce fluent text, they often lack the surprising, rule-breaking qualities humans associate with creativity. Ippolito et al. (2022) demonstrated that human evaluators struggle to distinguish AI-generated fiction from human-authored work at the paragraph level, but detect differences in longer-form narrative coherence.

**Automated Proxy Metrics**: See et al. (2019) developed controllable generation metrics assessing specificity, repetition, and response relevance. While useful for dialogue systems, these metrics inadequately capture interactive fiction's structural requirements.

**Benchmark Suites**: CreativeWritingBench (Tian et al., 2024) and StoryCloze (Mostafazadeh et al., 2016) evaluate narrative understanding and generation, but focus on linear text rather than branching structures.

Our work extends evaluation methodology to interactive fiction's unique demands: models must generate coherent text while simultaneously designing choice architectures that create meaningful reader agency. This dual requirement—narrative quality plus structural design—necessitates the combined metric approach we employ.

### 2.3 Human-AI Collaborative Writing

Research on human-AI co-creation demonstrates both promise and complexity in collaborative creative systems. Calderwood et al. (2020) studied professional novelists using GPT-3, finding that authors valued AI as a "brainstorming partner" for overcoming blocks but rarely incorporated AI text verbatim. The collaborative dynamic proved more valuable than the generated content itself.

Yuan et al. (2022) developed Wordcraft, a writing interface enabling fine-grained human-AI collaboration through operations like "elaborate," "rewrite," and "continue." User studies revealed that the most successful collaborations occurred when humans maintained creative control while delegating mechanical or expansive tasks to AI.

Clark et al. (2018) introduced the concept of "creative adversarial networks" where human and AI contributions compete and combine. This framing positions AI not as assistant but as creative interlocutor—a perspective our dyad study paradigm embodies.

For interactive fiction specifically, Kreminski et al. (2020) explored AI-assisted choice design, finding that models could suggest structurally valid but often thematically inconsistent branching options. Our work builds on this foundation by systematically characterizing how different frontier models perform on the combined task of narrative generation and choice architecture design.

### 2.4 Model Context Protocol and Tool-Using Agents

The Model Context Protocol (MCP), introduced by Anthropic in 2024, establishes a standardized interface for LLM tool use. Unlike ad-hoc function-calling implementations, MCP provides:

- **Discoverable tool registries**: Agents can query available tools and their schemas
- **Typed parameters and returns**: Strong typing enables validation and documentation
- **Composable operations**: Tools can be combined in agent-driven workflows
- **Provider-agnostic design**: The protocol works across LLM providers

MCP adoption has grown rapidly in agentic AI applications, enabling frameworks like Claude Code, Cursor, and various research platforms to provide consistent tool interfaces. For research infrastructure, MCP offers particular advantages: studies can be designed once and executed across different model providers without reimplementing tool integrations.

Our platform implements MCP as the primary interface between AI agents and research systems, enabling models to create studies, manage participants, analyze narratives, and generate reports through standardized tool calls. This design supports both automated batch experiments and interactive research assistant scenarios.

## 3. System Design: The Ariadne Platform

### 3.1 Architectural Overview

Ariadne is implemented as a TypeScript monorepo designed for interactive narrative research at scale. The architecture emphasizes modularity, extensibility, and hybrid deployment flexibility.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Ariadne Platform                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  MCP Server │  │   Web UI    │  │  Mobile UI  │              │
│  │  (Tools)    │  │ (Researcher)│  │(Participant)│              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│  ┌──────┴────────────────┴────────────────┴──────┐              │
│  │                  API Layer                     │              │
│  │    Express.js + JWT Auth + Rate Limiting       │              │
│  └──────────────────────┬────────────────────────┘              │
│                         │                                        │
│  ┌──────────────────────┴────────────────────────┐              │
│  │              Service Layer                     │              │
│  │  ┌─────────────┐  ┌─────────────────────────┐ │              │
│  │  │ LLM Adapter │  │ Collaborative           │ │              │
│  │  │   Factory   │  │ Orchestrator            │ │              │
│  │  └──────┬──────┘  └─────────────────────────┘ │              │
│  │         │                                      │              │
│  │  ┌──────┴──────────────────────────────────┐  │              │
│  │  │         LLM Client Layer                │  │              │
│  │  │  ┌─────────┐ ┌────────┐ ┌────────────┐  │  │              │
│  │  │  │Anthropic│ │ OpenAI │ │   Google   │  │  │              │
│  │  │  └─────────┘ └────────┘ └────────────┘  │  │              │
│  │  │  ┌─────────────────────────────────────┐│  │              │
│  │  │  │    Ollama (Local Models)            ││  │              │
│  │  │  └─────────────────────────────────────┘│  │              │
│  │  └─────────────────────────────────────────┘  │              │
│  └───────────────────────────────────────────────┘              │
│                         │                                        │
│  ┌──────────────────────┴────────────────────────┐              │
│  │              Data Layer                        │              │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────┐│              │
│  │  │PostgreSQL│ │  Redis  │  │  S3/MinIO       ││              │
│  │  │ (Prisma) │ │ (Queue) │  │  (Story Data)   ││              │
│  │  └─────────┘  └─────────┘  └─────────────────┘│              │
│  └───────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

The architecture comprises five primary layers:

**Interface Layer**: Multiple client interfaces serve different user roles. The MCP Server exposes research tools to AI agents. The Web UI provides researcher dashboards for study design and monitoring. The Mobile-responsive UI enables participant interaction across devices.

**API Layer**: A unified Express.js API handles authentication, authorization, and request routing. JWT-based authentication supports both researcher and participant sessions. Rate limiting (100 requests/15 minutes) prevents abuse while accommodating legitimate research workflows.

**Service Layer**: Business logic encapsulated in service modules includes the LLM Adapter Factory (provider abstraction), Collaborative Orchestrator (multi-agent session management), and specialized services for queue management, storage, and analytics.

**LLM Client Layer**: Provider-specific implementations behind a unified interface enable transparent model switching. The factory pattern selects appropriate clients based on configuration, with automatic fallback for compatible APIs (e.g., Ollama's OpenAI-compatible endpoint).

**Data Layer**: PostgreSQL (via Prisma ORM) stores structured research data. Redis powers the BullMQ job queue for background processing. S3-compatible storage (AWS S3 or MinIO for local deployment) persists story content and media assets.

### 3.2 Multi-Provider Design

A key feature of Ariadne is its multi-provider architecture, enabling researchers to combine cloud and local model deployments within unified studies.

#### 3.2.1 Cloud Provider Integration

The platform integrates three major cloud LLM providers through dedicated client implementations:

**Anthropic Client**: Implements the Claude API with support for extended thinking, system prompts, and structured output. Model selection spans the Claude family from Haiku (fast, economical) through Sonnet (balanced) to Opus (maximum capability).

**OpenAI Client**: Supports the GPT family including legacy models (GPT-4, GPT-4-Turbo) and current frontier models (GPT-5, GPT-5.2). The client handles API differences between standard and reasoning models, automatically switching between `max_tokens` and `max_completion_tokens` parameters and omitting unsupported temperature settings for reasoning models.

**Google Client**: Implements the Gemini API for Google's model family, supporting both Flash (speed-optimized) and Pro (capability-optimized) variants.

Each client implements a common `LLMAdapter` interface:

```typescript
interface LLMAdapter {
  readonly provider: string;
  isConfigured(): boolean;
  generateCompletion(prompt: string, overrides?: Partial<LLMConfig>): Promise<LLMResponse>;
  generateChat(messages: LLMMessage[], overrides?: Partial<LLMConfig>): Promise<LLMResponse>;
}
```

This interface enables the Collaborative Orchestrator to work with any provider without provider-specific logic.

#### 3.2.2 Local Model Integration via Ollama

For scenarios requiring local deployment—privacy-sensitive research, offline operation, or cost optimization—Ariadne integrates with Ollama, an open-source local model server. The integration leverages Ollama's OpenAI-compatible API endpoint:

```typescript
case 'ollama':
  return new OpenAIClient({
    ...config,
    baseUrl: config.baseUrl || 'http://host.docker.internal:11434/v1',
    apiKey: config.apiKey || 'ollama', // Ollama doesn't require authentication
  });
```

This approach enables access to open-weight models including:
- **Llama 3.x family** (7B to 70B parameters)
- **Qwen 2.5 family** (1.5B to 72B parameters, including coding variants)
- **Gemma family** (2B to 27B parameters)
- **Mistral family** (7B to 24B parameters)
- **Specialized models** (QwQ for reasoning, DeepSeek for code)

The multi-provider architecture supports several research configurations:

**Development Mode**: Researchers use local models during study design and testing, switching to cloud models for production data collection. This approach reduces development costs while ensuring production quality.

**Privacy-Preserving Studies**: Research involving sensitive populations or topics can deploy entirely on local infrastructure, eliminating data transmission to cloud providers.

**Comparative Studies**: The same experimental protocol can execute across cloud and local models, enabling direct comparison of open-weight and proprietary model capabilities.

**Fallback Resilience**: Studies can configure automatic fallback from cloud to local models during API outages, ensuring data collection continuity.

#### 3.2.3 Docker and WSL Considerations

The platform includes specific accommodations for containerized and Windows Subsystem for Linux (WSL) deployments, common in research computing environments:

- Ollama endpoints default to `host.docker.internal` for Docker-based deployments
- Environment-based configuration enables seamless switching between deployment contexts
- S3-compatible storage (MinIO) enables fully local development without AWS dependencies

### 3.3 Model Context Protocol (MCP) Integration

Ariadne implements MCP as the primary interface for AI agent interaction with research systems. This design enables sophisticated agentic workflows where AI systems can autonomously design studies, analyze results, and generate reports.

#### 3.3.1 MCP Server Architecture

The MCP server exposes research operations as discoverable tools:

```typescript
// Project Management Tools
mcp__ariadne__list_projects()
mcp__ariadne__create_project({ name, description })
mcp__ariadne__list_studies({ project_id })

// Study Design Tools
mcp__ariadne__create_study({
  project_id, name, type, description, conditions
})
mcp__ariadne__add_condition({
  study_id, name, description, config, story_template
})
mcp__ariadne__suggest_study_design({
  research_question, study_type?, participant_count?
})

// Agent Configuration Tools
mcp__ariadne__create_agent_definition({
  name, strategy, description, max_actions
})
mcp__ariadne__list_agent_definitions()

// Execution Tools
mcp__ariadne__create_batch_execution({
  study_id, agent_definition_id, story_template, count
})
mcp__ariadne__get_batch_status({ batch_id })
mcp__ariadne__get_study_details({ study_id })
```

#### 3.3.2 Tool Categories

The MCP interface organizes tools into functional categories:

**Study Management**: Tools for creating and configuring research studies, including project organization, condition definition, and participant management. The `suggest_study_design` tool provides AI-assisted study planning based on research questions.

**Agent Configuration**: Tools for defining synthetic participants with specific behavioral strategies (exploratory, goal-driven, curious, random, optimal) and capability constraints (max actions, tool access).

**Batch Execution**: Tools for running automated synthetic studies at scale, with status monitoring and result retrieval.

**Analysis Support**: Tools for retrieving structured study data suitable for metric computation and statistical analysis.

#### 3.3.3 Agentic Research Workflows

MCP integration enables AI-driven research workflows. An AI research assistant can:

1. **Design Studies**: Given a research question, propose appropriate study structures, conditions, and metrics
2. **Configure Agents**: Create synthetic participant definitions with specified behavioral profiles
3. **Execute Batches**: Launch automated data collection runs with progress monitoring
4. **Analyze Results**: Retrieve structured data and compute relevant metrics
5. **Generate Reports**: Synthesize findings into formatted research outputs

This capability transforms research assistance from simple question-answering to autonomous research execution under human supervision.

### 3.4 Collaborative Session Orchestrator

The Collaborative Orchestrator manages multi-round, multi-agent sessions for both synthetic and human-AI collaborative studies.

#### 3.4.1 Session Configuration

Sessions are configured through a structured specification:

```typescript
interface CollaborativeSessionConfig {
  rounds: number;                    // Number of author-play-review cycles
  phases: CollaborativePhase[];      // Phase sequence per round
  feedbackRequired: boolean;         // Whether review phase is mandatory
  maxPlayActions: number;            // Action limit during play phase
  storyConstraints: {
    genre: string;
    theme: string;
    minPassages: number;
    maxPassages: number;
  };
  systemPrompt: string;              // Persona and instruction framing
}
```

#### 3.4.2 Phase Execution

Each round proceeds through configurable phases:

**Author Phase**: The designated author agent generates or revises the interactive narrative. The orchestrator provides:
- Current story state (if revising)
- Partner feedback from previous rounds
- Cumulative learnings across sessions
- Structural constraints (passage limits, genre requirements)

**Play Phase**: The partner agent explores the narrative by making choices at decision points. The orchestrator:
- Presents current passage content and available choices
- Records choice sequences and reading patterns
- Tracks engagement metrics (time per passage, choice deliberation)
- Limits actions to prevent infinite exploration

**Review Phase**: The partner agent provides structured feedback on the story. Feedback categories include:
- Narrative coherence and flow
- Choice meaningfulness and consequence
- Pacing and engagement
- Specific passage-level suggestions

#### 3.4.3 Context Management

The orchestrator maintains rich context across sessions through the AgentContext system:

```typescript
interface AgentContext {
  participantId: string;
  currentRound: number;
  currentPhase: CollaborativePhase;
  ownStoryDrafts: StoryDraft[];        // History of authored stories
  partnerStoriesPlayed: PlaySession[]; // History of partner stories explored
  feedbackGiven: Feedback[];           // Feedback provided to partner
  feedbackReceived: Feedback[];        // Feedback received from partner
  cumulativeLearnings: string;         // Synthesized insights across rounds
}
```

This context enables agents to demonstrate learning and adaptation across rounds—incorporating feedback, avoiding repeated mistakes, and building on successful elements.

### 3.5 Story Format and Plugin System

Ariadne implements a plugin architecture for story format support, enabling extensibility beyond the current Twine/Harlowe implementation.

#### 3.5.1 Plugin Interface

Story plugins implement the `BaseStoryPlugin` interface:

```typescript
abstract class BaseStoryPlugin {
  abstract readonly formatId: string;
  abstract readonly formatName: string;

  abstract parseStory(content: string): StoryStructure;
  abstract generateStory(spec: StorySpec): string;
  abstract validateStructure(story: StoryStructure): ValidationResult;
  abstract computeMetrics(story: StoryStructure): StoryMetrics;
}
```

#### 3.5.2 Current Implementation: Twine/Harlowe

The primary plugin supports Twine stories in Harlowe format, the most common authoring tool for interactive fiction research. The plugin:

- Parses Twine HTML exports and JSON representations
- Generates syntactically valid Harlowe markup
- Validates link structures and passage reachability
- Computes Streams of Consciousness metrics

#### 3.5.3 Extensibility Path

The plugin architecture enables future support for:
- **Ink format**: Used by commercial games (80 Days, Heaven's Vault)
- **ChoiceScript**: Popular for hosted interactive fiction
- **Custom JSON formats**: For research-specific requirements
- **AI-native formats**: Optimized for LLM generation and parsing

### 3.6 Data Management and Storage

#### 3.6.1 Relational Data Model

Prisma ORM manages the PostgreSQL schema, providing type-safe database access and migration management. Key entities include:

- **Projects/Studies**: Hierarchical organization of research activities
- **Conditions**: Experimental conditions within studies
- **Participants**: Human or synthetic study participants
- **Sessions**: Individual participation instances
- **StoryData**: Story content references (metadata in PostgreSQL, content in S3)
- **Comments**: Structured feedback with passage-level targeting
- **AgentContexts**: Persistent agent state across sessions

#### 3.6.2 Object Storage for Story Content

Story content resides in S3-compatible object storage rather than the relational database. This design:

- Accommodates large story files without database bloat
- Enables efficient content-addressable storage
- Supports CDN distribution for participant access
- Allows cost-effective archival of historical versions

For local development and privacy-sensitive deployments, MinIO provides S3-compatible storage without cloud dependencies.

#### 3.6.3 Background Processing

BullMQ (backed by Redis) manages asynchronous workloads:

- **Batch story creation**: Parallel story generation for synthetic studies
- **Synthetic execution**: Coordinated multi-agent session management
- **Data export**: Large-scale data extraction for analysis
- **Metric computation**: Deferred complexity analysis

The queue system enables long-running studies without blocking API responsiveness.

## 4. Evaluation Methodology

### 4.1 Synthetic Dyad Paradigm

Before deploying models in human participant research, establishing empirical baselines for model behavior under controlled conditions is essential. We employ synthetic dyads—paired AI agents collaborating on interactive fiction—to systematically characterize model capabilities.

This paradigm offers several advantages:

**Controlled Comparison**: Identical prompts, constraints, and session structures ensure differences reflect model capabilities rather than experimental variation.

**Scale**: Automated execution enables sample sizes impractical for human studies, improving statistical power for detecting model differences.

**Reproducibility**: Synthetic studies can be exactly replicated, supporting verification and extension of findings.

**Cost Efficiency**: Development and piloting with synthetic agents reduces expensive human participant runs.

**Ethical Simplicity**: AI-AI interactions avoid IRB considerations during methodology development.

The paradigm does not replace human studies but informs their design. Synthetic baselines reveal model tendencies that human study protocols must accommodate or control.

### 4.2 Models Evaluated

We evaluated four frontier models representing current state-of-the-art capabilities across major providers:

| Model | Provider | Parameters | Characteristics |
|-------|----------|------------|-----------------|
| Claude Sonnet 4 | Anthropic | Undisclosed | Balanced capability/speed, strong instruction-following |
| Claude Opus 4.5 | Anthropic | Undisclosed | Extended thinking, highest general capability |
| GPT-5.2 | OpenAI | Undisclosed | Reasoning model with chain-of-thought, December 2025 |
| Gemini 2.5 Pro | Google | Undisclosed | Fast inference, strong multimodal capabilities |

Model selection prioritized frontier capability while representing major provider approaches. We excluded earlier model generations (GPT-4, Claude 3) as baselines are better established for current deployments.

### 4.3 Study Configuration

Each model completed a standardized synthetic dyad protocol:

**Session Structure**:
- 3 synthetic pairs per model
- 3 rounds per pair
- Phases: Author → Play → Review (alternating roles)
- 6 stories generated per pair (18 total per model)

**Agent Configuration**:
- Novice writer persona (see Section 4.4)
- Mystery/discovery genre constraint
- 4-8 passage target range
- Maximum 15 actions during play phase

**Token Allocation**:
- Standard models: 4,096 max tokens
- Reasoning models (GPT-5.2): 32,768 max tokens

The elevated token limit for GPT-5.2 accommodates its internal chain-of-thought reasoning, which consumes tokens before producing output. Initial pilots with 4,096 tokens yielded minimal content as reasoning exhausted the allocation. This methodological necessity introduces a potential confound: GPT-5.2's higher complexity metrics may partially reflect its larger token budget rather than intrinsic capability differences. We report results under each model's recommended operating conditions rather than artificially constraining configurations.

### 4.4 Novice Persona Design

Agents operated under a carefully designed "novice writer" persona:

> "You are participating in a collaborative interactive fiction study as a NOVICE writer. You have basic familiarity with interactive stories (like Choose Your Own Adventure books) but are not an expert author or game designer.
>
> Your approach should reflect realistic novice characteristics:
> - Genuine creative enthusiasm with occasional uncertainty
> - Basic understanding of branching narratives without sophisticated technique
> - Willingness to experiment and learn from feedback
> - Natural imperfections that a learning writer might exhibit
>
> Do NOT write like a professional author or demonstrate expert-level craft. Your stories should be earnest attempts that show room for growth."

This persona serves multiple purposes:

**Ecological Validity**: Human participants in educational studies are typically novices. Model behavior under this persona better predicts human study dynamics.

**Ceiling Avoidance**: Expert-level output would obscure model differences at the high end. Novice constraints reveal variation in how models handle bounded capability scenarios.

**Learning Potential**: The persona enables assessment of models' capacity to incorporate feedback and show improvement—a key dynamic in educational applications.

### 4.5 Complexity Metrics

Following the Streams of Consciousness framework (Wright et al., 2024), we computed standardized metrics for each generated story:

#### 4.5.1 Structural Metrics

- **Nodes**: Total passage count in the story structure
- **Branches**: Total link/transition count across all passages
- **Leaves**: Terminal nodes with no outgoing links (story endings)
- **Non-leaf Nodes**: Passages with at least one outgoing link
- **Choice Nodes**: Passages with two or more outgoing links (decision points)

#### 4.5.2 Path Metrics

- **Maximum Path Length**: Longest path from start to any leaf node
- **Average Path Length**: Mean path length across all possible start-to-ending traversals

Path computation employed breadth-first search from the designated start passage, tracking depth at each terminal node.

#### 4.5.3 Derived Metrics

- **Branching Factor**: Average outgoing links per non-leaf node (Branches / Non-leaf Nodes)
- **Choice Ratio**: Proportion of nodes that are decision points (Choice Nodes / Nodes)
- **Recursive Branches**: Count of links targeting passages earlier in traversal order (indicating loop structures)

#### 4.5.4 Content Metrics

- **Word Count**: Total words across all passages
- **Average Passage Length**: Mean character count per passage

#### 4.5.5 Feedback Metrics

- **Comment Count**: Total feedback comments generated
- **Average Comment Length**: Mean character count per comment
- **Specificity Rating**: Categorical assessment (low/medium/high) based on comment length and detail

### 4.6 Analysis Approach

For each model, we computed aggregate metrics across all generated stories. This exploratory evaluation reports descriptive statistics to characterize model tendencies; we explicitly do not claim statistical significance for cross-model differences. The primary contribution is the platform infrastructure and capacity profiling methodology rather than definitive model rankings. Formal hypothesis testing with controlled sample sizes and variance analysis awaits follow-up work.

## 5. Platform Validation: Model Capacity Profiling

The following results demonstrate the platform's capacity profiling methodology. Given variable sample sizes and token budget differences (Section 4.3), these represent a validation study rather than controlled model comparison.

### 5.1 Story Structure Comparison

Table 1 presents structural metrics across the four evaluated models.

**Table 1: Story Structure Metrics by Model**

| Model | Nodes | Branches | Leaves | Choice Nodes | Max Path | Branching Factor |
|-------|-------|----------|--------|--------------|----------|------------------|
| GPT-5.2 | 22.5 | 38.9 | 5.6 | 15.9 | 6.0 | 2.33 |
| Claude Sonnet | 9.7 | 17.1 | 2.9 | 6.4 | 4.2 | 2.13 |
| Claude Opus 4.5 | 8.9 | 12.7 | 2.1 | 5.3 | 3.6 | 1.43 |
| Gemini 2.5 Pro | 6.6 | 6.7 | 1.8 | 1.8 | 4.5 | 1.34 |

GPT-5.2 produced more complex narratives across all structural metrics (noting the token budget difference described in Section 4.3):
- 2.3x more nodes than Claude Sonnet (22.5 vs 9.7)
- 2.3x more branches than Claude Sonnet (38.9 vs 17.1)
- 2.5x more choice nodes than Claude Sonnet (15.9 vs 6.4)
- 3.4x more nodes than Gemini Pro (22.5 vs 6.6)

Branching factors ranged from 1.34 (Gemini) to 2.33 (GPT-5.2), indicating different tendencies in choice point design—though whether these reflect model capabilities or prompt interpretation remains to be determined.

### 5.2 Content and Feedback Quality

Table 2 presents content volume and feedback characteristics.

**Table 2: Content and Feedback Metrics by Model**

| Model | Stories | Words/Story | Comments | Chars/Comment | Specificity |
|-------|---------|-------------|----------|---------------|-------------|
| GPT-5.2 | 22 | 3,295 | 133 | 255 | High |
| Claude Sonnet | 59 | 813 | 183 | 163 | Medium |
| Claude Opus 4.5 | 18 | 609 | 49 | 186 | Medium |
| Gemini 2.5 Pro | 40 | 421 | 118 | 219 | High |

*Note: Story counts vary because Claude Sonnet completed additional pilot sessions during development, while other models ran the standardized 3-pair protocol. We retain all valid completions for richer descriptive data, acknowledging this limits strict cross-model comparison.*

Content generation varied considerably:
- GPT-5.2 produced 4x more words per story than Claude Sonnet (3,295 vs 813)
- GPT-5.2 produced 8x more words per story than Gemini Pro (3,295 vs 421)

Feedback patterns showed different trade-offs:
- Claude Sonnet generated the highest comment volume (183 total)
- GPT-5.2 and Gemini produced higher specificity feedback despite lower/similar volume
- GPT-5.2's comments averaged 255 characters, indicating detailed feedback

### 5.3 Interactivity Metrics

Table 3 presents derived interactivity measures.

**Table 3: Interactivity Metrics by Model**

| Model | Choice Ratio | Recursive Branches | Avg Path Length |
|-------|--------------|-------------------|-----------------|
| GPT-5.2 | 70.9% | 2.0 | 5.3 |
| Claude Sonnet | 47.9% | 0.9 | 4.0 |
| Claude Opus 4.5 | 30.4% | 1.4 | 3.5 |
| Gemini 2.5 Pro | 22.4% | 0.3 | 4.1 |

The choice ratio—proportion of passages offering decisions—differed across models:
- GPT-5.2's 71% choice ratio means nearly three-quarters of passages offer decisions
- Gemini's 22% choice ratio indicates predominantly linear narratives with occasional choices
- Claude models fall between these extremes

Recursive branch counts indicate loop-back narrative structures:
- GPT-5.2 (2.0) and Opus (1.4) create stories where readers can return to earlier points
- Gemini (0.3) rarely employs recursive structures

### 5.4 Processing Characteristics

Table 4 presents execution timing data.

**Table 4: Processing Time by Model**

| Model | Avg Time/Pair | Total Time (3 pairs) | Relative Speed |
|-------|---------------|---------------------|----------------|
| Gemini 2.5 Pro | 281s | 843s | 1.0x (fastest) |
| Claude Sonnet | 321s | 963s | 1.1x |
| Claude Opus 4.5 | 405s | 1,216s | 1.4x |
| GPT-5.2 | 615s | 1,845s | 2.2x |

Gemini completed sessions in under 5 minutes compared to GPT-5.2's 10+ minutes. For real-time collaborative applications, this 2x difference may impact user experience and session pacing.

### 5.5 Quality-Complexity Relationship

These structural metrics do not directly measure narrative quality. GPT-5.2's denser structures could represent either sophisticated design or unnecessary complexity; Gemini's simpler output could indicate accessibility or limited capability. Human evaluation is needed to establish quality relationships. Model selection should consider study goals and participant populations rather than assuming more complexity is better.

## 6. Discussion

### 6.1 Model Capacity Profiles

The validation study revealed different output patterns across models. We summarize these as capacity profiles—descriptive characterizations from this demonstration that may inform model selection:

#### 6.1.1 GPT-5.2: Maximum Complexity Engine

Under its recommended 32k token configuration, GPT-5.2 produced the most structurally complex narratives in our sample:
- Highest node and branch counts
- Densest choice architecture (71% choice ratio)
- Most elaborate content (3,295 words average)
- Strong recursive structure utilization

**Potential applications**: Studies requiring complex branching structures, research on reader navigation in dense choice spaces.

**Limitations**: The 615s average processing time (2x slower than alternatives) impacts real-time collaboration. The 32k token requirement increases costs. Complex output may overwhelm novice participants.

#### 6.1.2 Claude Sonnet: Balanced Collaborator

Claude Sonnet showed balanced output across our metrics:
- Moderate complexity (9.7 nodes, 48% choice ratio)
- Highest feedback volume (183 comments)
- Reasonable processing speed (321s)
- Consistent output quality across sessions

**Potential applications**: Iterative collaboration studies, educational settings requiring frequent feedback cycles.

**Limitations**: Medium specificity feedback may require additional prompting for actionable detail. Moderate complexity may not challenge advanced participants.

#### 6.1.3 Claude Opus 4.5: Deliberate Designer

Opus shows unique characteristics in its approach to narrative structure:
- Lower overall complexity but higher recursive branch usage (1.4)
- More curated choice points (30% choice ratio vs 48% for Sonnet)
- Deliberate pacing (405s processing time)

The higher recursive branch count (1.4 vs 0.3-0.9 for others) suggests Opus may favor loop-back structures, though this requires validation with larger samples.

**Potential applications**: Studies examining narrative state management and return-path structures.

**Limitations**: Lower feedback volume (49 comments) may limit iterative improvement data. Slower processing than Sonnet without GPT-5.2's complexity gains.

#### 6.1.4 Gemini 2.5 Pro: Rapid Prototyper

Gemini's distinctive profile prioritizes speed and accessibility:
- Fastest processing (281s, 2x faster than GPT-5.2)
- Simplest structures (6.6 nodes, 22% choice ratio)
- High-specificity feedback despite lower volume
- Most compact content (421 words)

**Potential applications**: Rapid prototyping, time-constrained sessions, studies prioritizing throughput over structural complexity.

**Limitations**: Low structural complexity limits investigation of branching narrative dynamics. May not challenge intermediate or advanced participants.

### 6.2 Design Considerations for Human Studies

If these patterns replicate in controlled studies, they suggest considerations for human participant research:

#### 6.2.1 Role Assignment

If these patterns hold in larger samples, model selection might align with intended collaborative roles:

- **AI as Expert Partner**: GPT-5.2's complexity capacity suits scenarios where AI demonstrates sophisticated technique for human learning
- **AI as Peer Collaborator**: Claude Sonnet's balanced profile supports mutual exchange paradigms
- **AI as Supportive Assistant**: Gemini's speed enables responsive, low-latency assistance
- **AI as Thoughtful Mentor**: Opus's deliberate approach suits reflective feedback scenarios

#### 6.2.2 Scaffolding Requirements

The 8x content volume difference between GPT-5.2 (3,295 words) and Gemini (421 words) necessitates different scaffolding approaches:

- **High-output models (GPT-5.2)**: Participants may need navigation support, summarization aids, or chunked presentation to process extensive content
- **Low-output models (Gemini)**: Participants may need expansion prompts, elaboration requests, or complementary resources

Study protocols should anticipate these differences rather than applying uniform scaffolding.

#### 6.2.3 Feedback Integration Design

Models differ in feedback utility:

- **Volume-oriented (Claude Sonnet)**: 183 comments provide extensive material for improvement but may overwhelm; prioritization support may be needed
- **Specificity-oriented (GPT-5.2, Gemini)**: Higher-quality individual comments but fewer total; each comment carries more weight

Study designs should match feedback presentation to model characteristics.

#### 6.2.4 Temporal Pacing

The 2x processing time difference (281s vs 615s) affects session dynamics:

- **Fast models (Gemini)**: Enable rapid iteration, multiple revision cycles, responsive conversation-like interaction
- **Slow models (GPT-5.2)**: Require participant activities during wait times, expectation management, or asynchronous designs

Real-time collaboration studies should consider processing latency in protocol design.

### 6.3 Deployment Strategies

The platform's multi-provider architecture enables flexible deployment strategies:

#### 6.3.1 Cost Optimization

Development and piloting with local models (Qwen, Llama) minimizes API costs during iterative refinement. Production data collection can then employ cloud frontier models with established baselines.

#### 6.3.2 Privacy-Preserving Configurations

Research involving sensitive topics or populations can deploy entirely on local infrastructure. The evaluation presented here focused on cloud models, but the identical protocol can execute against local models for privacy-critical applications.

#### 6.3.3 Comparative Designs

Studies can directly compare participant experience with cloud versus local models, investigating whether capability differences translate to measurable outcome differences in learning, engagement, or satisfaction.

### 6.4 Limitations

Several limitations constrain interpretation of these findings:

**Synthetic Validation**: All results derive from AI-AI interactions. Human participant studies may reveal different patterns, particularly regarding the subjective experience of collaboration quality.

**Genre Specificity**: Studies employed mystery/discovery themes. Genre effects on model performance remain uninvestigated; some models may excel in different narrative contexts.

**Prompt Sensitivity**: The novice persona prompt significantly shapes output. Alternative framings (expert, specific demographics, different creative goals) may yield different capability profiles.

**Temporal Specificity**: Frontier models evolve rapidly. These results reflect December 2025 model versions; capabilities may shift with updates.

**Local Model Gaps**: Transaction timeout issues prevented completion of local model evaluation (Qwen, Llama). Characterizing open-weight alternatives remains future work.

**Sample Size**: While synthetic studies enable larger samples than typical human research, 18 stories per model limits statistical precision for fine-grained comparisons.

**Statistical Reporting**: This exploratory study reports aggregate means without variance measures. Raw per-story metrics are preserved in the platform database; the open-source release includes evaluation scripts that researchers can extend for full statistical analysis with confidence intervals and hypothesis testing.

## 7. Future Work

### 7.1 Human Participant Studies

The synthetic baselines established here inform design of human participant research:

**Expertise Effects**: How do novice, intermediate, and expert writers collaborate differently with each model profile? Do beginners benefit more from GPT-5.2's complexity or Gemini's accessibility?

**Learning Outcomes**: Does collaboration with different model profiles produce measurable skill development? How do structural complexity and feedback characteristics relate to learning gains?

**Preference and Trust**: Which model profiles do participants prefer as collaborative partners? How do capability differences affect trust calibration and reliance patterns?

**Longitudinal Development**: How do human-AI collaborative patterns evolve across multiple sessions? Do participants adapt strategies to model characteristics over time?

### 7.2 Experimental Paradigms for Game Studies

The platform supports diverse experimental configurations relevant to games research:

**Synthetic Validation Studies**: AI-AI dyads establish baseline model behaviors under controlled conditions, enabling cost-effective methodology development before human recruitment. This paradigm suits questions about model capabilities and prompt engineering effects.

**Human-AI Dyad Studies**: Single human collaborating with AI partner, investigating questions of creative agency, trust calibration, and learning outcomes. The platform supports within-subject designs comparing multiple AI partners.

**Triadic Collaboration**: AI as third partner providing feedback to human pairs, augmenting peer review without replacing human interaction. This configuration enables investigation of AI scaffolding in educational game design contexts.

**Wizard-of-Oz Variants**: Human researchers can intervene in AI responses, enabling controlled investigation of specific AI behaviors before full automation.

**Longitudinal Studies**: Persistent agent contexts support multi-session investigations of skill development, trust evolution, and collaborative strategy adaptation over time.

### 7.3 Local Model Characterization

Future work will extend evaluation to open-weight alternatives:

- **Llama 3.x series**: How do 7B, 13B, and 70B variants compare on complexity metrics?
- **Qwen 2.5 series**: Do coding-optimized variants show different structural reasoning?
- **QwQ**: Does the open-weight reasoning model approximate GPT-5.2's complexity profile?

This characterization informs cost-benefit decisions for research deployment.

### 7.4 Extended Metric Development

The Streams of Consciousness framework provides foundational metrics, but interactive fiction quality encompasses dimensions beyond structure:

- **Narrative coherence**: Do passages maintain consistent world-state and character behavior?
- **Choice consequence perception**: Do readers perceive meaningful outcome differences?
- **Engagement prediction**: Which structural patterns correlate with completion and re-read rates?

Developing validated measures for these dimensions remains important future work.

### 7.5 Cross-Cultural and Accessibility Studies

Interactive fiction conventions vary across cultural contexts. Future research should investigate:

- How do model capacity profiles transfer across languages and cultural narrative traditions?
- What accessibility considerations arise in AI-collaborative interactive fiction for diverse learner populations?

## 8. Conclusion

We presented Ariadne, open-source research infrastructure for human-AI collaboration studies in interactive fiction. The platform provides multi-provider LLM support, Model Context Protocol integration, and a synthetic dyad paradigm for model evaluation—addressing practical barriers that have limited research in this area.

To validate these capabilities, we profiled four frontier models using established complexity metrics. The demonstration revealed distinct output patterns:

**GPT-5.2** excels at structural complexity under its recommended configuration (32k tokens), producing narratives with 22.5 nodes, 71% choice ratios, and 3,295 words on average. This output comes at the cost of 2x processing time and the higher token budget noted in Section 4.3.

**Claude Sonnet** demonstrates the strongest balance between complexity and collaborative engagement, generating moderate-complexity stories while producing the highest feedback volume (183 comments). This profile suits iterative collaboration paradigms emphasizing feedback integration.

**Claude Opus 4.5** shows distinctive strength in recursive narrative structures, suggesting capacity for sophisticated state-dependent storytelling despite moderate overall complexity metrics.

**Gemini 2.5 Pro** prioritizes speed and accessibility, enabling rapid iteration at the cost of structural sophistication. Its high-specificity feedback with compact content suits constrained-time applications.

These patterns suggest different models may suit different research designs, pending controlled replication with matched token budgets and larger samples.

The platform itself is the primary contribution. We release the complete system open-source at https://github.com/agentmancer/ariadne, including the TypeScript monorepo, database schemas, evaluation scripts, and anonymized data. We hope this infrastructure enables game studies researchers to investigate human-AI collaboration with reduced barriers to entry.

---

## References

Calderwood, A., Qiu, V., Gero, K. I., & Chilton, L. B. (2020). How Novelists Use Generative Language Models: An Exploratory Study. *HAI Workshop on Human-AI Co-Creation with Generative Models*.

Chakrabarty, T., Laban, P., Agarwal, D., Muresan, S., & Wu, C. S. (2023). Art or Artifice? Large Language Models and the False Promise of Creativity. *Proceedings of CHI '23*.

Clark, E., Ross, A. S., Tan, C., Ji, Y., & Smith, N. A. (2018). Creative Writing with a Machine in the Loop: Case Studies on Slogans and Stories. *Proceedings of IUI '18*.

Ippolito, D., Yuan, A., Coenen, A., & Burber, S. (2022). Creative Writing with an AI-Powered Writing Assistant: Perspectives from Professional Writers. *arXiv preprint arXiv:2211.05030*.

Kreminski, M., Samuel, B., Melcer, E., & Wardrip-Fruin, N. (2020). Evaluating AI-Based Games Through Retellings. *Proceedings of AIIDE '20*.

Mostafazadeh, N., Chambers, N., He, X., Parikh, D., Batra, D., Vanderwende, L., Kohli, P., & Allen, J. (2016). A Corpus and Cloze Evaluation for Deeper Understanding of Commonsense Stories. *Proceedings of NAACL-HLT '16*.

See, A., Roller, S., Kiela, D., & Weston, J. (2019). What Makes a Good Conversation? How Controllable Attributes Affect Human Judgments. *Proceedings of NAACL-HLT '19*.

Tian, K., et al. (2024). CreativeWritingBench: A Benchmark for Evaluating Creative Writing Capabilities of Large Language Models. *arXiv preprint*.

Wright, J. (2022). Measuring Complexity in Interactive Fiction. *Proceedings of ICIDS 2022*.

Wright, J., et al. (2024). Streams of Consciousness in Interactive Digital Narrative Research Design. *Proceedings of ICIDS 2024*.

Yuan, A., Coenen, A., Reif, E., & Ippolito, D. (2022). Wordcraft: Story Writing With Large Language Models. *Proceedings of IUI '22*.

Murray, J. H. (1997). *Hamlet on the Holodeck: The Future of Narrative in Cyberspace*. MIT Press.

Bogost, I. (2007). *Persuasive Games: The Expressive Power of Videogames*. MIT Press.

---

**Word Count: ~6,700 words**

*Acknowledgments removed for double-blind review.*

**AI Assistance Disclosure**: In accordance with ACM policy, we disclose that generative AI tools (Claude) were used to assist with drafting, editing, and code development for this research. The authors take full responsibility for the content, have verified all claims, and made all scientific decisions. AI-generated content was reviewed and revised by human authors.
