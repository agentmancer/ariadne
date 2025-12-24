/**
 * Twine CONSISTENCY_MANAGER Role Adapter
 * Validates story structure and identifies inconsistencies
 */

import { PluginAction } from '@ariadne/plugins';
import { TwineStoryState, TwinePassage } from '@ariadne/module-twine';
import { LLMResponse, RoleContext } from '../../types';
import { BaseRoleAdapter } from '../base-role-adapter';

/**
 * Issue types that can be detected
 */
type IssueType =
  | 'broken_link'
  | 'orphan_passage'
  | 'plot_hole'
  | 'character_inconsistency'
  | 'timeline_error'
  | 'dead_end'
  | 'logic_error'
  | 'missing_context';

/**
 * Parsed response structure for consistency validation
 */
interface ConsistencyResponse {
  isValid: boolean;
  summary: string;
  issues: Array<{
    type: IssueType;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedPassages: string[];
    suggestion?: string;
  }>;
  structureAnalysis: {
    totalPassages: number;
    reachablePassages: number;
    deadEnds: string[];
    unreachablePassages: string[];
  };
  narrativeConsistency: {
    characterTracker: Record<string, string[]>;
    plotThreads: string[];
    unresolvedElements: string[];
  };
}

/**
 * CONSISTENCY_MANAGER role adapter for Twine
 * Validates story structure and narrative consistency
 */
export class TwineConsistencyAdapter extends BaseRoleAdapter {
  readonly pluginType = 'twine';
  readonly role = 'CONSISTENCY_MANAGER';

  getSystemPrompt(): string {
    return `You are a story consistency analyst validating an interactive fiction narrative.

Your role is to identify structural and narrative issues:

**Structural Issues:**
- Broken links (links to non-existent passages)
- Orphan passages (passages with no incoming links, except start)
- Dead ends (passages with no outgoing links that aren't endings)
- Unreachable content

**Narrative Issues:**
- Character inconsistencies (behavior, knowledge, location)
- Timeline errors (events out of order, impossible timing)
- Plot holes (unexplained events, dropped threads)
- Logic errors (contradictions, impossible situations)
- Missing context (references to undefined elements)

For each issue, rate severity:
- **critical**: Story-breaking, must be fixed
- **high**: Significant problem affecting reader experience
- **medium**: Noticeable issue that should be addressed
- **low**: Minor inconsistency, optional fix

Respond with a JSON object:
{
  "isValid": true/false,
  "summary": "Brief overall assessment",
  "issues": [
    {
      "type": "broken_link|orphan_passage|plot_hole|etc",
      "severity": "low|medium|high|critical",
      "description": "What's wrong",
      "affectedPassages": ["passage names..."],
      "suggestion": "How to fix it"
    }
  ],
  "structureAnalysis": {
    "totalPassages": number,
    "reachablePassages": number,
    "deadEnds": ["passage names..."],
    "unreachablePassages": ["passage names..."]
  },
  "narrativeConsistency": {
    "characterTracker": {"CharName": ["appearances..."]},
    "plotThreads": ["identified threads..."],
    "unresolvedElements": ["unresolved items..."]
  }
}`;
  }

  buildUserPrompt(context: RoleContext): string {
    const state = context.state as TwineStoryState;
    const passages = state.content?.passages || [];

    if (passages.length === 0) {
      return `The story is empty. No validation needed.`;
    }

    // Perform basic structural analysis
    const structuralInfo = this.analyzeStructure(passages, state.content?.startPassage);

    // Format story for analysis
    const storyContent = passages
      .map((p: TwinePassage) => {
        const links = p.text.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g) || [];
        const linkTargets = links.map((l: string) => {
          const match = l.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
          return match ? (match[2] || match[1]) : '';
        });
        return `## ${p.name}\n${p.text}\n→ Links to: [${linkTargets.join(', ')}]`;
      })
      .join('\n\n---\n\n');

    let prompt = `Validate this interactive fiction story for consistency:

Start Passage: ${state.content?.startPassage || 'Not specified'}

${storyContent}

**Pre-computed structural analysis:**
- Total passages: ${structuralInfo.total}
- Passages with no incoming links: ${structuralInfo.orphans.join(', ') || 'None'}
- Passages with no outgoing links: ${structuralInfo.deadEnds.join(', ') || 'None'}
- Links to undefined passages: ${structuralInfo.brokenLinks.join(', ') || 'None'}

Please analyze for both structural and narrative consistency issues.
Respond with JSON only.`;

    return prompt;
  }

  /**
   * Perform basic structural analysis before sending to LLM
   */
  private analyzeStructure(passages: TwinePassage[], startPassage?: string): {
    total: number;
    orphans: string[];
    deadEnds: string[];
    brokenLinks: string[];
  } {
    const passageNames = new Set(passages.map(p => p.name));
    const incomingLinks: Record<string, number> = {};
    const brokenLinks: string[] = [];

    // Initialize counts
    for (const name of passageNames) {
      incomingLinks[name] = 0;
    }

    // Count incoming links and find broken ones
    for (const passage of passages) {
      const links = passage.text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g);
      for (const match of links) {
        const target = match[2] || match[1];
        if (passageNames.has(target)) {
          incomingLinks[target]++;
        } else {
          brokenLinks.push(`"${passage.name}" → "${target}"`);
        }
      }
    }

    // Find orphans (no incoming links except start)
    const orphans = Object.entries(incomingLinks)
      .filter(([name, count]) => count === 0 && name !== startPassage)
      .map(([name]) => name);

    // Find dead ends (no outgoing links)
    const deadEnds = passages
      .filter(p => !p.text.match(/\[\[[^\]]+\]\]/))
      .map(p => p.name);

    return {
      total: passages.length,
      orphans,
      deadEnds,
      brokenLinks,
    };
  }

  parseResponse(response: LLMResponse, _context: RoleContext): PluginAction {
    const parsed = this.extractJSON<ConsistencyResponse>(response.content);

    if (!parsed) {
      // Fallback: report as unparseable
      return {
        type: 'VALIDATE_STRUCTURE',
        params: {
          isValid: false,
          issues: [{
            type: 'unknown',
            description: 'Could not parse validation response',
            severity: 'medium',
            affectedPassages: [],
          }],
          rawAnalysis: response.content,
        },
        metadata: {
          description: 'Consistency validation (unparsed)',
        },
      };
    }

    return {
      type: 'VALIDATE_STRUCTURE',
      params: {
        isValid: parsed.isValid,
        summary: parsed.summary,
        issues: parsed.issues,
        structureAnalysis: parsed.structureAnalysis,
        narrativeConsistency: parsed.narrativeConsistency,
      },
      metadata: {
        description: `Validation: ${parsed.issues?.length || 0} issues found`,
        score: parsed.isValid ? 1 : 0,
      },
    };
  }
}
