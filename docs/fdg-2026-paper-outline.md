# Comparing Human and Automated Analysis of Collaborative Interactive Narrative Design

**Target Venue:** Foundations of Digital Games (FDG) 2026
**Paper Type:** Research Paper (Empirical Study)

---

## Abstract (150 words)

Analyzing collaborative creative processes in interactive narrative design poses unique challenges for researchers. We present a comparative study examining human qualitative coding versus automated LLM-based analysis of data from a remote dyad workshop where paired participants iteratively designed Twine stories while exchanging play feedback. Using the Sherlock platform, we collected story snapshots at each authoring phase, player comments during play sessions, and exit surveys. We compare: (1) traditional qualitative hand-coding of story evolution and peer feedback themes; (2) automated extraction using LLM analysis of the same artifacts. Our findings reveal where automated methods excel (identifying structural changes, quantifying feedback patterns) and where human analysis remains essential (interpreting creative intent, contextualizing cultural references). We contribute guidelines for hybrid human-AI analysis workflows and release our analysis instruments as part of the open-source Sherlock 2.0 platform.

---

## 1. Introduction

### 1.1 Motivation
- Growing interest in peer learning through collaborative IF authoring
- Challenge: Qualitative analysis of creative process data is time-intensive
- Opportunity: LLMs can assist but not replace human interpretation
- Gap: No systematic comparison of human vs automated analysis for IF design data

### 1.2 Research Questions
- **RQ1**: What aspects of collaborative IF design can be reliably analyzed through automation?
- **RQ2**: Where does human qualitative coding provide essential insights that automation misses?
- **RQ3**: How can human and automated analysis be combined in a productive workflow?

### 1.3 Contributions
1. **Empirical comparison** of hand-coding vs LLM analysis on dyad workshop data
2. **Taxonomy** of analysis tasks by automation suitability
3. **Hybrid workflow guidelines** for IF research
4. **Open instruments** integrated into Sherlock 2.0 platform

---

## 2. Related Work

### 2.1 Collaborative IF Authoring Studies
- Peer feedback in creative writing education
- Dyad/pair studies in game design
- Previous Sherlock platform studies

### 2.2 Qualitative Analysis of Creative Processes
- Process tracing in design research
- Thematic analysis of design artifacts
- Challenges of temporal analysis (evolution over time)

### 2.3 LLM-Assisted Qualitative Research
- Automated coding assistance (Dovetail, Atlas.ti AI)
- Limitations: hallucination, cultural bias, missing context
- Hybrid human-AI analysis workflows

### 2.4 Computational Analysis of Narratives
- Story structure extraction
- Sentiment and theme analysis
- Interactive narrative specific metrics

---

## 3. The Dyad Workshop Study

### 3.1 Study Design
- **Platform**: Sherlock (legacy version)
- **Participants**: N = [?] dyads, recruited from [?]
- **Duration**: [?] hour synchronous sessions
- **Format**: Remote, video-supported

### 3.2 Session Structure
```
Timeline (minutes):
  0-15:  Check-in / Waiting Room
 15-30:  Twine Tutorial Video
 30-45:  Authoring 1 (D1) - Initial story draft
 45-60:  Playing 1 (P1) - Play partner's story, leave comments
 60-75:  Authoring 2 (D2) - Revise based on feedback
 75-90:  Playing 2 (P2) - Play revised story
 90-105: Authoring 3 (D3) - Continue revision
105-120: Playing 3 (P3) - Final playthrough
120-135: Authoring 4 (D4) - Final polish
135-200: Exit Survey
```

### 3.3 Data Collected
| Data Type | Format | Volume |
|-----------|--------|--------|
| Story snapshots | Twine JSON (passages, links) | ~[?] snapshots per dyad |
| Story diffs | Text diff between phases | ~[?] per participant |
| Player comments | Timestamped text on passages | ~[?] comments total |
| Exit surveys | Structured + open-ended | [?] responses |
| Demographics | Categorical (gender, ethnicity, language) | Per participant |

### 3.4 Export Format
- Files named: `{id}-{dyadId}-{demographics}-{phase}.txt`
- Diffs: `{phase}d.txt` showing changes between authoring phases
- Reflections: Player comments organized by passage and timestamp

---

## 4. Analysis Methods

### 4.1 Hand-Coding Protocol

#### 4.1.1 Story Evolution Coding
- **Structural codes**: Passages added/removed, links modified, branching complexity
- **Content codes**: Theme development, character introduction, world-building
- **Quality codes**: Coherence, player agency, narrative tension

#### 4.1.2 Feedback Coding
- **Feedback type**: Praise, critique, suggestion, question, confusion
- **Feedback target**: Story structure, writing quality, interactivity, bugs
- **Feedback integration**: Evidence of incorporation in subsequent drafts

#### 4.1.3 Process Coding
- **Revision patterns**: Responsive (to feedback) vs autonomous changes
- **Learning indicators**: Statements about learning in exit surveys
- **Collaboration quality**: Constructiveness, specificity, reciprocity

### 4.2 Automated Analysis Pipeline

#### 4.2.1 Structural Analysis (Deterministic)
```
Automated metrics extracted from Twine JSON:
- Passage count over time
- Link density (links per passage)
- Branching factor (choices per decision point)
- Story graph complexity (cycles, dead ends)
- Word count per passage
- Diff statistics (additions, deletions, modifications)
```

#### 4.2.2 LLM-Based Content Analysis
```
Prompts for each analysis task:

STORY EVOLUTION:
"Analyze these two story versions. Identify:
 1. What themes emerged or developed?
 2. How did characters change?
 3. What narrative techniques were added?"

FEEDBACK CLASSIFICATION:
"Classify this player comment:
 - Type: [praise/critique/suggestion/question/confusion]
 - Target: [structure/writing/interactivity/technical]
 - Specificity: [general/specific]
 - Actionability: [actionable/not actionable]"

FEEDBACK INTEGRATION:
"Given this feedback and the subsequent story revision,
 did the author incorporate the feedback? How?"
```

#### 4.2.3 Hybrid Metrics
- LLM-generated codes validated by human review
- Confidence scores for automated classifications
- Flagging ambiguous cases for human resolution

### 4.3 Comparison Methodology

#### 4.3.1 Inter-Rater Reliability
- Cohen's κ for categorical codes (human vs human, human vs LLM)
- Correlation for continuous metrics
- Qualitative comparison of thematic interpretations

#### 4.3.2 Coverage Analysis
- What codes did humans identify that LLM missed?
- What patterns did LLM surface that humans overlooked?
- Time comparison: Human coding time vs LLM processing + validation

---

## 5. Results

### 5.1 Structural Analysis Comparison
- **Hypothesis**: Automated structural metrics match hand-coding
- **Metrics**: Passage counts, link changes, branching
- **Finding**: [Expected: High agreement on objective structural features]

### 5.2 Feedback Classification Accuracy
- **Hypothesis**: LLM can reliably classify feedback types
- **Metrics**: κ agreement with human coders
- **Finding**: [Expected: Moderate-high agreement on type, lower on nuanced codes]

### 5.3 Thematic Analysis Comparison
- **Hypothesis**: LLM identifies different themes than humans
- **Analysis**: Comparison of emergent themes
- **Finding**: [Expected: Complementary rather than redundant insights]

### 5.4 Feedback Integration Detection
- **Hypothesis**: LLM can trace feedback to revisions
- **Metrics**: Precision/recall on identified integrations
- **Finding**: [Expected: Moderate accuracy, misses subtle incorporations]

### 5.5 Case Studies

#### Case Study 1: High-Agreement Dyad
- Example where human and LLM analysis aligned
- What made this case amenable to automation?

#### Case Study 2: Divergent Interpretations
- Example where human and LLM disagreed
- What contextual knowledge did humans leverage?

#### Case Study 3: LLM-Surfaced Insight
- Pattern identified by LLM that humans missed
- Value of computational scale

---

## 6. Discussion

### 6.1 Taxonomy of Analysis Tasks by Automation Suitability

| Task | Automation Suitability | Rationale |
|------|------------------------|-----------|
| Passage/link counting | ✅ High | Objective, deterministic |
| Diff summarization | ✅ High | Structured comparison |
| Feedback type classification | 🟡 Medium | Clear categories, some ambiguity |
| Theme identification | 🟡 Medium | Surface themes detectable, depth requires context |
| Creative intent interpretation | ❌ Low | Requires author knowledge, cultural context |
| Learning outcome assessment | ❌ Low | Requires pedagogical expertise |
| Collaboration quality judgment | ❌ Low | Requires social/relational understanding |

### 6.2 Recommended Hybrid Workflow

```
Phase 1: Automated Pre-Processing
├── Extract structural metrics (deterministic)
├── Generate LLM classifications with confidence scores
├── Flag low-confidence items for human review
└── Produce summary statistics and visualizations

Phase 2: Human Validation & Deep Analysis
├── Review flagged items
├── Validate sample of high-confidence LLM codes
├── Conduct deep reading of selected cases
└── Interpret patterns requiring context

Phase 3: Synthesis
├── Combine automated metrics with human insights
├── Triangulate findings across methods
└── Generate final codebook with automation notes
```

### 6.3 Implications for Sherlock 2.0

#### Integration Points
- Automated structural analysis in story export pipeline
- LLM-assisted feedback classification in evaluation module
- Confidence-scored annotations for human review queue
- MCP tools for researcher-directed analysis queries

#### New Platform Features Enabled
- Real-time feedback classification during play sessions
- Automated story evolution reports for researchers
- Hybrid coding interface with AI suggestions

### 6.4 Limitations
- Single workshop context (generalizability)
- Specific LLM version (reproducibility concerns)
- English-language focus
- Novice Twine authors (not professional designers)

### 6.5 Future Work
- Longitudinal studies with repeated dyad sessions
- Cross-cultural comparison of feedback patterns
- Integration with Sherlock 2.0's synthetic actor capabilities
- Developing specialized IF analysis models

---

## 7. Conclusion

Our comparison reveals that human and automated analysis of collaborative IF design data serve complementary roles. Automation excels at structural tracking, classification at scale, and pattern detection across large datasets. Human analysis remains essential for interpreting creative intent, contextualizing cultural references, and assessing pedagogical outcomes. We recommend a hybrid workflow that leverages automation for preprocessing and flagging while reserving human expertise for interpretive depth. The instruments and guidelines from this study are integrated into the open-source Sherlock 2.0 platform.

---

## Acknowledgments
- Workshop participants
- [Funding sources]
- Sherlock development team

---

## References
[Key citations to include:]
- Original Sherlock platform paper
- Twine and IF authoring tools
- Qualitative coding methodology (Braun & Clarke thematic analysis)
- LLM-assisted qualitative research (recent HCI papers)
- Peer learning in creative domains
- Process tracing in design research

---

## Appendix A: Codebook

### A.1 Story Evolution Codes
| Code | Definition | Example |
|------|------------|---------|
| STRUCT_ADD | Passage added | New "forest path" passage |
| STRUCT_DEL | Passage removed | Deleted "dead end" |
| STRUCT_LINK | Link added/modified | New choice to castle |
| ... | ... | ... |

### A.2 Feedback Codes
| Code | Definition | Example |
|------|------------|---------|
| FB_PRAISE | Positive comment | "I loved the twist!" |
| FB_CRITIQUE | Negative comment | "This part was confusing" |
| FB_SUGGEST | Improvement suggestion | "Maybe add more choices here" |
| ... | ... | ... |

---

## Appendix B: LLM Prompts

[Full prompts used for automated analysis]

---

## Appendix C: Platform Integration

### C.1 Sherlock 2.0 Analysis Module
- API endpoints for automated analysis
- MCP tools for researcher queries
- Export formats compatible with analysis scripts

### C.2 Installation and Replication
- Docker setup instructions
- Sample data for testing
- Analysis script repository
