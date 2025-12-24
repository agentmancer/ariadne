#!/usr/bin/env tsx
/**
 * Model Output Evaluation Script
 *
 * Evaluates and compares story and feedback quality across different LLM models.
 *
 * Usage:
 *   pnpm tsx scripts/evaluate-model-outputs.ts [--model <name>] [--all]
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

import { PrismaClient } from '@prisma/client';
import { createLLMClient } from '../src/services/llm/clients/factory';

const prisma = new PrismaClient();

/**
 * Story complexity metrics based on:
 * "Streams of Consciousness in Interactive Digital Narrative Research Design"
 * ICIDS 2024, Wright (2022) TCM
 */
interface StoryMetrics {
  // Core structural metrics (from Streams of Consciousness paper)
  nodes: number;              // Total number of passages
  branches: number;           // Total number of links/transitions
  leaves: number;             // Nodes with no outgoing links (endings)
  nonLeafNodes: number;       // Nodes minus leaves
  choiceNodes: number;        // Nodes with multiple exit branches
  maxPathLength: number;      // Longest path from start to any leaf
  avgPathLength: number;      // Average path length across all paths
  recursiveBranches: number;  // Branches that loop back to earlier nodes

  // Derived metrics
  branchingFactor: number;    // Average branches per non-leaf node
  endingCount: number;        // Number of distinct endings
  choiceRatio: number;        // Proportion of nodes that are choice points

  // Text metrics
  avgPassageLength: number;   // Average character count per passage
  totalWordCount: number;     // Total words across all passages
}

interface FeedbackMetrics {
  totalComments: number;
  avgCommentLength: number;
  commentTypes: Record<string, number>;
  specificity: 'low' | 'medium' | 'high';
}

interface QualityScores {
  narrativeCoherence: number;    // 1-5
  choiceMeaningfulness: number;  // 1-5
  feedbackActionability: number; // 1-5
  collaborativeEngagement: number; // 1-5
}

/**
 * Analyze story structure using Streams of Consciousness metrics
 */
function analyzeStory(content: any): StoryMetrics {
  const passages = content.passages || [];
  const passageNames = new Set(passages.map((p: any) => p.name));

  // Core counts
  const nodes = passages.length;

  // Count all branches (links)
  let branches = 0;
  let recursiveBranches = 0;
  const outgoingCounts: Map<string, number> = new Map();

  for (const passage of passages) {
    const links = passage.links || [];
    branches += links.length;
    outgoingCounts.set(passage.name, links.length);

    // Check for recursive branches (links to earlier passages)
    for (const link of links) {
      const targetIdx = passages.findIndex((p: any) => p.name === link.target);
      const sourceIdx = passages.findIndex((p: any) => p.name === passage.name);
      if (targetIdx !== -1 && targetIdx <= sourceIdx) {
        recursiveBranches++;
      }
    }
  }

  // Leaves: passages with no outgoing links
  const leaves = passages.filter((p: any) =>
    !p.links || p.links.length === 0
  ).length;

  const nonLeafNodes = nodes - leaves;

  // Choice nodes: passages with 2+ outgoing links
  const choiceNodes = passages.filter((p: any) =>
    p.links && p.links.length > 1
  ).length;

  // Calculate path lengths using BFS
  const pathLengths = calculatePathLengths(passages, content.startPassage || passages[0]?.name);
  const maxPathLength = pathLengths.length > 0 ? Math.max(...pathLengths) : 0;
  const avgPathLength = pathLengths.length > 0
    ? pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length
    : 0;

  // Derived metrics
  const branchingFactor = nonLeafNodes > 0 ? branches / nonLeafNodes : 0;
  const choiceRatio = nodes > 0 ? choiceNodes / nodes : 0;

  // Text metrics
  let totalChars = 0;
  let totalWords = 0;
  for (const passage of passages) {
    const text = passage.text || '';
    totalChars += text.length;
    totalWords += text.split(/\s+/).filter((w: string) => w.length > 0).length;
  }
  const avgPassageLength = nodes > 0 ? totalChars / nodes : 0;

  return {
    nodes,
    branches,
    leaves,
    nonLeafNodes,
    choiceNodes,
    maxPathLength,
    avgPathLength,
    recursiveBranches,
    branchingFactor,
    endingCount: leaves,
    choiceRatio,
    avgPassageLength,
    totalWordCount: totalWords,
  };
}

/**
 * Calculate all path lengths from start to each leaf using BFS
 */
function calculatePathLengths(passages: any[], startName: string): number[] {
  const passageMap = new Map<string, any>();
  for (const p of passages) {
    passageMap.set(p.name, p);
  }

  const pathLengths: number[] = [];
  const visited = new Set<string>();

  // BFS with path tracking
  const queue: Array<{ name: string; depth: number }> = [{ name: startName, depth: 1 }];

  while (queue.length > 0) {
    const { name, depth } = queue.shift()!;

    if (visited.has(name)) continue;
    visited.add(name);

    const passage = passageMap.get(name);
    if (!passage) continue;

    const links = passage.links || [];

    if (links.length === 0) {
      // This is a leaf - record path length
      pathLengths.push(depth);
    } else {
      for (const link of links) {
        if (!visited.has(link.target)) {
          queue.push({ name: link.target, depth: depth + 1 });
        }
      }
    }
  }

  return pathLengths;
}

async function analyzeFeedback(comments: any[]): Promise<FeedbackMetrics> {
  const typeCount: Record<string, number> = {};
  let totalLength = 0;

  for (const comment of comments) {
    const type = comment.commentType || 'GENERAL';
    typeCount[type] = (typeCount[type] || 0) + 1;
    totalLength += comment.content?.length || 0;
  }

  // Estimate specificity based on comment length and type distribution
  const avgLength = comments.length > 0 ? totalLength / comments.length : 0;
  const specificity = avgLength > 200 ? 'high' : avgLength > 100 ? 'medium' : 'low';

  return {
    totalComments: comments.length,
    avgCommentLength: avgLength,
    commentTypes: typeCount,
    specificity,
  };
}

async function evaluateWithLLM(
  stories: any[],
  comments: any[],
  evaluatorModel: string = 'claude-3-5-haiku-latest'
): Promise<QualityScores> {
  const llm = createLLMClient({
    provider: 'anthropic',
    model: evaluatorModel,
    temperature: 0,
    maxTokens: 1000,
  });

  // Prepare sample for evaluation
  const storySample = stories.slice(0, 2).map(s => {
    try {
      const content = JSON.parse(s.content || '{}');
      return {
        name: content.name || 'Untitled',
        passageCount: content.passages?.length || 0,
        samplePassage: content.passages?.[0]?.text?.slice(0, 500) || '',
      };
    } catch {
      return { name: 'Parse Error', passageCount: 0, samplePassage: '' };
    }
  });

  const feedbackSample = comments.slice(0, 5).map(c => ({
    type: c.commentType,
    content: c.content?.slice(0, 300),
  }));

  const prompt = `You are evaluating the quality of AI-generated interactive fiction stories and peer feedback.

STORIES (sample):
${JSON.stringify(storySample, null, 2)}

FEEDBACK COMMENTS (sample):
${JSON.stringify(feedbackSample, null, 2)}

Rate each dimension from 1-5 (1=poor, 5=excellent):

1. Narrative Coherence: Does the story flow logically? Are passages well-connected?
2. Choice Meaningfulness: Do choices lead to meaningfully different outcomes?
3. Feedback Actionability: Is the feedback specific and useful for improvement?
4. Collaborative Engagement: Does the feedback show genuine engagement with partner's work?

Respond in JSON format only:
{"narrativeCoherence": X, "choiceMeaningfulness": X, "feedbackActionability": X, "collaborativeEngagement": X}`;

  try {
    const response = await llm.generateChat([
      { role: 'user', content: prompt }
    ]);

    const scores = JSON.parse(response.content);
    return {
      narrativeCoherence: scores.narrativeCoherence || 3,
      choiceMeaningfulness: scores.choiceMeaningfulness || 3,
      feedbackActionability: scores.feedbackActionability || 3,
      collaborativeEngagement: scores.collaborativeEngagement || 3,
    };
  } catch (error) {
    console.error('LLM evaluation failed:', error);
    return {
      narrativeCoherence: 0,
      choiceMeaningfulness: 0,
      feedbackActionability: 0,
      collaborativeEngagement: 0,
    };
  }
}

async function evaluateModel(modelPattern: string) {
  console.log(`\nEvaluating model: ${modelPattern}`);
  console.log('='.repeat(50));

  // Find participants for this model
  const participants = await prisma.participant.findMany({
    where: {
      uniqueId: { contains: modelPattern },
      actorType: 'SYNTHETIC',
    },
    include: {
      storyData: true,
    },
  });

  if (participants.length === 0) {
    console.log('No participants found for this model');
    return null;
  }

  const participantIds = participants.map(p => p.id);

  // Get stories with S3 keys
  const stories = await prisma.storyData.findMany({
    where: { participantId: { in: participantIds } },
  });

  // Get comments
  const comments = await prisma.comment.findMany({
    where: {
      OR: [
        { authorId: { in: participantIds } },
        { targetParticipantId: { in: participantIds } },
      ],
    },
  });

  console.log(`Found ${participants.length} participants, ${stories.length} stories, ${comments.length} comments`);

  // Analyze story complexity using Streams of Consciousness metrics
  const storyMetricsList: StoryMetrics[] = [];

  for (const story of stories) {
    try {
      // Fetch story content from S3
      const content = await fetchStoryFromS3(story.s3Key, story.s3Bucket);
      if (content) {
        const metrics = analyzeStory(content);
        storyMetricsList.push(metrics);
      }
    } catch (error) {
      console.warn(`Failed to analyze story ${story.id}:`, error);
    }
  }

  // Aggregate story metrics
  const aggregatedStoryMetrics = aggregateStoryMetrics(storyMetricsList);
  const feedbackMetrics = await analyzeFeedback(comments);

  const results = {
    model: modelPattern,
    participants: participants.length,
    stories: stories.length,
    comments: comments.length,
    avgStoriesPerParticipant: stories.length / participants.length,
    avgCommentsPerParticipant: comments.length / participants.length,
    // Streams of Consciousness metrics (aggregated)
    storyComplexity: aggregatedStoryMetrics,
    feedbackMetrics,
  };

  console.log('\nStreams of Consciousness Metrics:');
  console.log('─'.repeat(40));
  if (aggregatedStoryMetrics) {
    console.log(`  Nodes (avg):           ${aggregatedStoryMetrics.avgNodes.toFixed(1)}`);
    console.log(`  Branches (avg):        ${aggregatedStoryMetrics.avgBranches.toFixed(1)}`);
    console.log(`  Leaves/Endings (avg):  ${aggregatedStoryMetrics.avgLeaves.toFixed(1)}`);
    console.log(`  Choice Nodes (avg):    ${aggregatedStoryMetrics.avgChoiceNodes.toFixed(1)}`);
    console.log(`  Max Path Length (avg): ${aggregatedStoryMetrics.avgMaxPathLength.toFixed(1)}`);
    console.log(`  Avg Path Length:       ${aggregatedStoryMetrics.avgAvgPathLength.toFixed(1)}`);
    console.log(`  Branching Factor:      ${aggregatedStoryMetrics.avgBranchingFactor.toFixed(2)}`);
    console.log(`  Choice Ratio:          ${(aggregatedStoryMetrics.avgChoiceRatio * 100).toFixed(1)}%`);
    console.log(`  Recursive Branches:    ${aggregatedStoryMetrics.avgRecursiveBranches.toFixed(1)}`);
    console.log(`  Word Count (avg):      ${aggregatedStoryMetrics.avgWordCount.toFixed(0)}`);
  }

  console.log('\nFeedback Metrics:');
  console.log('─'.repeat(40));
  console.log(`  Total Comments:        ${feedbackMetrics.totalComments}`);
  console.log(`  Avg Comment Length:    ${feedbackMetrics.avgCommentLength.toFixed(0)} chars`);
  console.log(`  Specificity:           ${feedbackMetrics.specificity}`);

  return results;
}

/**
 * Fetch story content from S3
 */
async function fetchStoryFromS3(s3Key: string | null, s3Bucket: string | null): Promise<any | null> {
  if (!s3Key || !s3Bucket) return null;

  try {
    // Use AWS SDK to fetch from S3
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');

    const s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minioadmin',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
      },
      forcePathStyle: true,
    });

    const response = await s3.send(new GetObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
    }));

    const bodyString = await response.Body?.transformToString();
    return bodyString ? JSON.parse(bodyString) : null;
  } catch (error) {
    console.warn(`S3 fetch failed for ${s3Key}:`, error);
    return null;
  }
}

/**
 * Aggregate metrics across multiple stories
 */
function aggregateStoryMetrics(metricsList: StoryMetrics[]): {
  avgNodes: number;
  avgBranches: number;
  avgLeaves: number;
  avgChoiceNodes: number;
  avgMaxPathLength: number;
  avgAvgPathLength: number;
  avgBranchingFactor: number;
  avgChoiceRatio: number;
  avgRecursiveBranches: number;
  avgWordCount: number;
  storiesAnalyzed: number;
} | null {
  if (metricsList.length === 0) return null;

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr: number[]) => sum(arr) / arr.length;

  return {
    avgNodes: avg(metricsList.map(m => m.nodes)),
    avgBranches: avg(metricsList.map(m => m.branches)),
    avgLeaves: avg(metricsList.map(m => m.leaves)),
    avgChoiceNodes: avg(metricsList.map(m => m.choiceNodes)),
    avgMaxPathLength: avg(metricsList.map(m => m.maxPathLength)),
    avgAvgPathLength: avg(metricsList.map(m => m.avgPathLength)),
    avgBranchingFactor: avg(metricsList.map(m => m.branchingFactor)),
    avgChoiceRatio: avg(metricsList.map(m => m.choiceRatio)),
    avgRecursiveBranches: avg(metricsList.map(m => m.recursiveBranches)),
    avgWordCount: avg(metricsList.map(m => m.totalWordCount)),
    storiesAnalyzed: metricsList.length,
  };
}

async function main() {
  const args = process.argv.slice(2);

  let models = ['claude-sonnet', 'claude-opus-4-5', 'gpt-5.2', 'gemini-2.5-pro'];

  if (args.includes('--model')) {
    const idx = args.indexOf('--model');
    models = [args[idx + 1]];
  }

  console.log('='.repeat(60));
  console.log('Ariadne Model Output Evaluation');
  console.log('='.repeat(60));

  const results = [];

  for (const model of models) {
    const result = await evaluateModel(model);
    if (result) results.push(result);
  }

  // Print comparison table
  if (results.length > 1) {
    console.log('\n' + '='.repeat(80));
    console.log('COMPARISON SUMMARY - Streams of Consciousness Metrics');
    console.log('='.repeat(80));

    // Structure table
    console.log('\n## Story Structure');
    console.log('| Model | Nodes | Branches | Leaves | Choice Nodes | Max Path | Branching Factor |');
    console.log('|-------|-------|----------|--------|--------------|----------|------------------|');

    for (const r of results) {
      const m = r.storyComplexity;
      if (m) {
        console.log(
          `| ${r.model.padEnd(12)} | ` +
          `${m.avgNodes.toFixed(1).padStart(5)} | ` +
          `${m.avgBranches.toFixed(1).padStart(8)} | ` +
          `${m.avgLeaves.toFixed(1).padStart(6)} | ` +
          `${m.avgChoiceNodes.toFixed(1).padStart(12)} | ` +
          `${m.avgMaxPathLength.toFixed(1).padStart(8)} | ` +
          `${m.avgBranchingFactor.toFixed(2).padStart(16)} |`
        );
      }
    }

    // Content table
    console.log('\n## Content & Feedback');
    console.log('| Model | Stories | Words/Story | Comments | Chars/Comment | Specificity |');
    console.log('|-------|---------|-------------|----------|---------------|-------------|');

    for (const r of results) {
      const m = r.storyComplexity;
      console.log(
        `| ${r.model.padEnd(12)} | ` +
        `${r.stories.toString().padStart(7)} | ` +
        `${(m?.avgWordCount || 0).toFixed(0).padStart(11)} | ` +
        `${r.comments.toString().padStart(8)} | ` +
        `${r.feedbackMetrics.avgCommentLength.toFixed(0).padStart(13)} | ` +
        `${r.feedbackMetrics.specificity.padStart(11)} |`
      );
    }

    // Derived metrics
    console.log('\n## Derived Metrics');
    console.log('| Model | Choice Ratio | Recursive Branches | Avg Path Length |');
    console.log('|-------|--------------|-------------------|-----------------|');

    for (const r of results) {
      const m = r.storyComplexity;
      if (m) {
        console.log(
          `| ${r.model.padEnd(12)} | ` +
          `${(m.avgChoiceRatio * 100).toFixed(1).padStart(11)}% | ` +
          `${m.avgRecursiveBranches.toFixed(1).padStart(17)} | ` +
          `${m.avgAvgPathLength.toFixed(1).padStart(15)} |`
        );
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
