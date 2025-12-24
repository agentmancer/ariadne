# FDG 2026 Ariadne Paper - Major Revision Plan

Based on peer review feedback (Reviewers #1, #2, #3). Consensus score: 3-4/5 (Borderline Accept).

## Priority 1: Critical Methodological Issues

### 1.1 GPT-5.2 Token Budget Confound
**Issue**: GPT-5.2 receives 32k tokens vs 4k for other models. Reviewers note this 8x difference may explain complexity differences rather than model capability.

**Actions**:
- [ ] Run ablation study: GPT-5.2 with 4k token limit (accept truncation)
- [ ] Run ablation study: Claude Sonnet with 32k token limit
- [ ] Run ablation study: Gemini Pro with 32k token limit
- [ ] Add new Table 5: "Token Budget Ablation Results"
- [ ] Revise claims to distinguish "capability under optimal conditions" vs "capability under equal constraints"

**Script changes needed**:
```typescript
// Add to run-model-comparison.ts
const TOKEN_ABLATION_CONFIGS = [
  { model: 'gpt-5.2', tokens: 4096, label: 'gpt-5.2-4k' },
  { model: 'gpt-5.2', tokens: 32768, label: 'gpt-5.2-32k' },
  { model: 'sonnet', tokens: 4096, label: 'sonnet-4k' },
  { model: 'sonnet', tokens: 32768, label: 'sonnet-32k' },
];
```

### 1.2 Statistical Rigor
**Issue**: No variance measures, confidence intervals, or significance tests despite quantitative claims.

**Actions**:
- [ ] Compute standard deviations for all metrics
- [ ] Add SD columns to Tables 1-4
- [ ] Compute 95% confidence intervals for key comparisons
- [ ] Run Kruskal-Wallis tests for multi-model comparisons
- [ ] Run Mann-Whitney U tests for pairwise comparisons
- [ ] Add effect sizes (Cohen's d or rank-biserial correlation)
- [ ] Revise language: Replace "substantially" with statistically-grounded claims

**Script changes needed**:
```typescript
// Add to evaluate-model-outputs.ts
import { mannWhitneyU, kruskalWallis } from 'stats-lite';

function computeStatistics(values: number[]) {
  return {
    mean: mean(values),
    sd: standardDeviation(values),
    ci95: confidenceInterval(values, 0.95),
    median: median(values),
    iqr: interquartileRange(values),
  };
}
```

### 1.3 Local Model Evaluation Completion
**Issue**: "Hybrid cloud" is central claim but local models weren't evaluated due to timeout issues.

**Options** (choose one):
- [ ] **Option A**: Fix timeout and complete local evaluation
  - Increase Prisma transaction timeout to 120s
  - Use smaller local model (qwen2.5:7b instead of 14b)
  - Run on more powerful host if needed
- [ ] **Option B**: Reframe contribution
  - Change "hybrid cloud evaluation" to "cloud model evaluation with hybrid-capable platform"
  - Move local model characterization explicitly to future work
  - Reduce Section 3.2.2 emphasis

**Recommendation**: Option A if technically feasible within revision timeline; Option B otherwise.

---

## Priority 2: Content Gaps

### 2.1 Qualitative Narrative Analysis
**Issue**: Zero examples of generated stories, no thematic analysis.

**Actions**:
- [ ] Select 4 representative stories (1 per model) showing structural differences
- [ ] Create Figure 2: Side-by-side story graph visualizations
- [ ] Add Section 5.6: "Qualitative Story Analysis" (0.5-1 page)
  - Opening passage comparison
  - Choice point design differences
  - Ending variation patterns
- [ ] Include 2-3 inline story excerpts demonstrating quality differences
- [ ] Add thematic coding of choice types (consequential vs cosmetic, etc.)

### 2.2 Persona Adherence Validation
**Issue**: No evidence models followed "novice writer" constraint.

**Actions**:
- [ ] Develop coding scheme for novice vs expert characteristics:
  - Vocabulary sophistication
  - Narrative technique complexity
  - Self-awareness/uncertainty markers
  - Structural ambition relative to execution
- [ ] Code sample of stories (n=20) for novice adherence
- [ ] Report inter-rater reliability if using multiple coders
- [ ] Add Section 5.7 or incorporate into 5.6: "Persona Adherence Analysis"
- [ ] Discuss implications: Did GPT-5.2's complexity violate novice constraints?

### 2.3 IDN-Related Work Expansion
**Issue**: Missing foundational interactive narrative citations.

**Actions**:
- [ ] Add citations for foundational IDN theory:
  - Ryan, M.-L. (2001). Narrative as Virtual Reality
  - Murray, J. (1997). Hamlet on the Holodeck
  - Mateas, M. & Stern, A. (2003). Façade
  - Wardrip-Fruin, N. - Expressive Processing
  - Riedl, M. - Narrative Intelligence
- [ ] Add citations for IF authoring research:
  - Short, E. - Choice-based narrative design
  - Montfort, N. - Twine and platform studies
  - Salter, A. & Blodgett, B. - Hypertext fiction
- [ ] Add citations for procedural narrative:
  - Compton, K. - Casual creators
  - Smith, G. - Mixed-initiative authoring
- [ ] Expand Section 2.1 to engage more deeply with IDN theory
- [ ] Connect findings to IDN concepts (agency, coherence, consequence)

---

## Priority 3: Presentation Improvements

### 3.1 Infrastructure Section Rebalancing
**Issue**: Section 3 consumes ~40% of paper; reads like systems paper.

**Actions**:
- [ ] Condense Sections 3.1-3.6 from ~2500 words to ~1500 words
- [ ] Move detailed code snippets to GitHub repository
- [ ] Keep architectural overview and novel aspects (MCP, hybrid design)
- [ ] Move Docker/WSL details (3.2.3) to appendix or remove
- [ ] Use reclaimed space for qualitative analysis (2.1 above)

### 3.2 Table Improvements
**Actions**:
- [ ] Add SD column to all tables
- [ ] Add footnotes explaining statistical tests performed
- [ ] Remove bold formatting (implies significance not established)
- [ ] Add Table 5: Token Ablation Results
- [ ] Add Table 6: Statistical Test Results (p-values, effect sizes)

### 3.3 Visualization Additions
**Actions**:
- [ ] Figure 2: Story structure graphs (4 examples)
- [ ] Figure 3: Metric distributions (box plots showing variance)
- [ ] Figure 4: Processing time vs complexity scatter plot

### 3.4 Concrete Protocol Recommendations
**Issue**: Section 6.2 implications are abstract.

**Actions**:
- [ ] Expand 6.2.1-6.2.4 with specific protocol examples
- [ ] Add "Protocol Recommendation" boxes with concrete designs
- [ ] Example: "For GPT-5.2 studies: Present stories in 3-passage chunks with navigation breadcrumbs; limit initial exploration to 10 minutes before feedback phase"

---

## Priority 4: Minor Issues

### 4.1 Citation Fixes
- [ ] Add page numbers to all proceedings citations
- [ ] Add MCP specification citation (Anthropic technical docs)
- [ ] Add BullMQ, Prisma, Ollama citations
- [ ] Standardize citation format throughout

### 4.2 Terminology Clarification
- [ ] Define "frontier models" on first use
- [ ] Define "synthetic dyad" on first use (Section 1, not 4.1)
- [ ] Standardize IF/IDN/interactive fiction terminology

### 4.3 Anonymization for Review
- [ ] Replace GitHub URL with anonymous placeholder
- [ ] Ensure no author-identifying information in acknowledgments

### 4.4 Table 2 Story Count Discrepancy
- [ ] Explain why story counts differ (59 vs 18 vs 22 vs 40)
- [ ] Was this differential completion? Add explanation in methodology.

---

## Execution Timeline

### Phase 1: Data Collection (Days 1-3)
1. Run token ablation experiments (GPT-5.2 @ 4k, Sonnet @ 32k, Gemini @ 32k)
2. Attempt local model fix (increase timeout, try smaller model)
3. Extract representative story examples for qualitative analysis

### Phase 2: Analysis (Days 4-5)
1. Compute all statistical measures (SD, CI, tests)
2. Code stories for persona adherence
3. Create story structure visualizations

### Phase 3: Writing (Days 6-8)
1. Revise Section 2 with expanded IDN citations
2. Condense Section 3
3. Add Section 5.6-5.7 (qualitative analysis, persona adherence)
4. Revise all tables with statistical measures
5. Expand Section 6.2 with concrete protocols
6. Update abstract and conclusion

### Phase 4: Polish (Days 9-10)
1. Fix all citations
2. Add figures
3. Verify page count compliance
4. Final proofread

---

## Questions to Resolve Before Revision

1. **Local model priority**: Is completing local evaluation worth the effort, or better to reframe?
2. **Token ablation scope**: Run full 3-pair protocol for each ablation, or single-pair pilot?
3. **Qualitative coding**: Solo coding acceptable, or need second coder for reliability?
4. **Page budget**: Current ~6800 words; FDG limit is 10 pages. How much can we add?

---

## Files to Modify

| File | Changes |
|------|---------|
| `fdg2026-ariadne-draft.md` | Major revisions per above |
| `run-model-comparison.ts` | Add ablation configurations |
| `evaluate-model-outputs.ts` | Add statistical analysis functions |
| New: `analyze-story-quality.ts` | Qualitative analysis tooling |
| New: `generate-figures.py` | Visualization generation |

---

*Plan created: 2025-12-15*
*Target revision completion: TBD based on deadline*
