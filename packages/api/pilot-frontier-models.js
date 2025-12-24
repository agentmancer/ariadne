/**
 * Pilot Test for Frontier Models
 *
 * Tests each frontier model (Claude Opus 4.5, GPT-5.2, Gemini 3 Pro) in all roles:
 *   1. Story generation (proposer) - generate narrative prose and choices
 *   2. Player role - select from available choices
 *   3. Critic role - evaluate a proposal and provide feedback
 *
 * Usage:
 *   node pilot-frontier-models.js [--provider=anthropic|openai|google|all]
 */

// Load environment variables from .env
require('dotenv').config();

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    model: 'claude-opus-4-5-20251101',
    envKey: 'ANTHROPIC_API_KEY',
  },
  openai: {
    name: 'OpenAI',
    model: 'gpt-5.2',
    envKey: 'OPENAI_API_KEY',
  },
  google: {
    name: 'Google',
    model: 'gemini-3-pro-preview',  // Full name: models/gemini-3-pro-preview
    envKey: 'GOOGLE_API_KEY',
  },
};

// Test prompts for each role
const TEST_PROMPTS = {
  // Role 1: Story generation (proposer)
  story_generation: {
    system: `You are a narrative AI generating interactive fiction. You write engaging prose and create meaningful player choices.`,
    user: `## Scene Context
Location: The Jade Dragon Museum, Main Gallery
Time: Evening, after hours
Characters present: Detective Maya Chen (protagonist), Security Guard Tom

## Previous Action
Maya has just arrived at the museum after receiving an anonymous tip about suspicious activity.

## Your Task
Write a short narrative passage (2-3 paragraphs) describing what Maya discovers, then provide exactly 3 player choices.

Format your response as JSON:
{
  "prose": "Your narrative text here...",
  "choices": [
    {"id": 1, "text": "First choice"},
    {"id": 2, "text": "Second choice"},
    {"id": 3, "text": "Third choice"}
  ]
}`
  },

  // Role 2: Player role (choosing actions)
  player: {
    system: `You are playing as Detective Maya Chen in an interactive mystery story. You make choices that advance the investigation while staying in character.`,
    user: `## Current Scene
The security guard nervously glances at the emergency exit as you approach. "Detective, I... I wasn't expecting anyone tonight." His hand trembles slightly as he adjusts his cap. Behind him, you notice a faint scratch mark on the display case containing the Jade Dragon artifact.

## Available Choices
1. "I received a tip about suspicious activity. What can you tell me about tonight?"
2. Examine the scratch marks on the display case more closely
3. Check the security footage from the past hour
4. Ask about the emergency exit he keeps glancing at

## Your Task
Choose ONE option (respond with just the number) and briefly explain your reasoning as Maya.

Format:
Choice: [number]
Reasoning: [1-2 sentences as Maya]`
  },

  // Role 3: Critic role (evaluating proposals)
  critic: {
    system: `You are a story critic evaluating narrative proposals for an interactive fiction game. You assess coherence, engagement, genre fit, and choice quality.`,
    user: `## Proposal to Evaluate

**Scene Context**: Detective Maya investigating a museum heist, speaking with nervous security guard

**Proposed Narrative**:
"The fluorescent lights hummed overhead as Maya studied the guard's face. Years of detective work had taught her to read people, and Tom was practically screaming guilt with every nervous twitch. 'The Jade Dragon,' she said slowly, 'is worth three million dollars. And someone knew exactly when to strike.' She let the words hang in the air, watching Tom's reaction."

**Proposed Choices**:
1. Press Tom harder about his whereabouts during the theft
2. Offer Tom immunity in exchange for information
3. Examine the Jade Dragon's display case for evidence

## Your Task
Evaluate this proposal on these criteria (rate 1-5 each):
- Coherence: Does it follow logically from the scene setup?
- Engagement: Is it compelling and well-written?
- Genre fit: Does it feel like a mystery?
- Choice quality: Are the choices distinct and meaningful?

Then provide 2-3 specific suggestions for improvement.

Format as JSON:
{
  "ratings": {
    "coherence": X,
    "engagement": X,
    "genre_fit": X,
    "choice_quality": X
  },
  "suggestions": ["suggestion 1", "suggestion 2"],
  "overall_assessment": "brief summary"
}`
  }
};

/**
 * Call Anthropic API
 */
async function callAnthropic(systemPrompt, userPrompt, apiKey, model) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text,
    usage: {
      input: data.usage.input_tokens,
      output: data.usage.output_tokens,
    },
    model: data.model,
  };
}

/**
 * Call OpenAI API
 */
async function callOpenAI(systemPrompt, userPrompt, apiKey, model) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      max_completion_tokens: 1500,  // GPT-5+ uses max_completion_tokens instead of max_tokens
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    usage: {
      input: data.usage.prompt_tokens,
      output: data.usage.completion_tokens,
    },
    model: data.model,
  };
}

/**
 * Call Google Gemini API
 */
async function callGoogle(systemPrompt, userPrompt, apiKey, model) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1500,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error (${response.status}): ${error}`);
  }

  const data = await response.json();
  return {
    content: data.candidates[0].content.parts[0].text,
    usage: {
      input: data.usageMetadata?.promptTokenCount || 0,
      output: data.usageMetadata?.candidatesTokenCount || 0,
    },
    model: model,
  };
}

/**
 * Call the appropriate API based on provider
 */
async function callLLM(provider, systemPrompt, userPrompt) {
  const config = PROVIDERS[provider];
  const apiKey = process.env[config.envKey];

  if (!apiKey || apiKey.includes('your-') || apiKey.includes('-here')) {
    throw new Error(`${config.envKey} not configured`);
  }

  switch (provider) {
    case 'anthropic':
      return callAnthropic(systemPrompt, userPrompt, apiKey, config.model);
    case 'openai':
      return callOpenAI(systemPrompt, userPrompt, apiKey, config.model);
    case 'google':
      return callGoogle(systemPrompt, userPrompt, apiKey, config.model);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Run a single test
 */
async function runTest(provider, role) {
  const prompt = TEST_PROMPTS[role];
  const startTime = Date.now();

  try {
    const result = await callLLM(provider, prompt.system, prompt.user);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      success: true,
      provider,
      role,
      model: result.model,
      elapsed: `${elapsed}s`,
      tokens: result.usage,
      response: result.content,
    };
  } catch (error) {
    return {
      success: false,
      provider,
      role,
      error: error.message,
    };
  }
}

/**
 * Validate response format
 */
function validateResponse(role, response) {
  const issues = [];

  if (role === 'story_generation') {
    try {
      const json = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
      if (!json.prose) issues.push('Missing prose field');
      if (!json.choices || !Array.isArray(json.choices)) issues.push('Missing or invalid choices array');
      else if (json.choices.length < 3) issues.push(`Only ${json.choices.length} choices (expected 3)`);
    } catch {
      issues.push('Failed to parse JSON response');
    }
  }

  if (role === 'player') {
    if (!response.match(/Choice:\s*[1-4]/i)) issues.push('Missing choice selection');
    if (!response.match(/Reasoning:/i)) issues.push('Missing reasoning');
  }

  if (role === 'critic') {
    try {
      const json = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
      if (!json.ratings) issues.push('Missing ratings object');
      if (!json.suggestions || !Array.isArray(json.suggestions)) issues.push('Missing suggestions array');
    } catch {
      issues.push('Failed to parse JSON response');
    }
  }

  return issues;
}

/**
 * Print results
 */
function printResult(result) {
  const status = result.success ? '✓' : '✗';
  const color = result.success ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log(`\n${color}${status}${reset} ${PROVIDERS[result.provider].name} - ${result.role.toUpperCase()}`);

  if (result.success) {
    console.log(`  Model: ${result.model}`);
    console.log(`  Time: ${result.elapsed}`);
    console.log(`  Tokens: ${result.tokens.input} in / ${result.tokens.output} out`);

    // Validate format
    const issues = validateResponse(result.role, result.response);
    if (issues.length > 0) {
      console.log(`  ⚠ Format issues: ${issues.join(', ')}`);
    } else {
      console.log(`  ✓ Response format valid`);
    }

    // Show truncated response
    const preview = result.response.substring(0, 200).replace(/\n/g, ' ');
    console.log(`  Preview: ${preview}...`);
  } else {
    console.log(`  Error: ${result.error}`);
  }
}

/**
 * Main
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FRONTIER MODEL PILOT TEST');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Testing each model in three roles:');
  console.log('  1. Story Generation (proposer)');
  console.log('  2. Player (choice selection)');
  console.log('  3. Critic (proposal evaluation)');
  console.log('');

  // Parse args
  const providerArg = process.argv.find(a => a.startsWith('--provider='));
  const selectedProvider = providerArg ? providerArg.split('=')[1] : 'all';

  const providers = selectedProvider === 'all'
    ? Object.keys(PROVIDERS)
    : [selectedProvider];

  const roles = ['story_generation', 'player', 'critic'];
  const results = [];

  for (const provider of providers) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Testing ${PROVIDERS[provider].name} (${PROVIDERS[provider].model})`);
    console.log('─'.repeat(60));

    for (const role of roles) {
      process.stdout.write(`  Testing ${role}...`);
      const result = await runTest(provider, role);
      results.push(result);
      console.log(result.success ? ' done' : ' FAILED');
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('  RESULTS SUMMARY');
  console.log('═'.repeat(60));

  for (const result of results) {
    printResult(result);
  }

  // Overall summary
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  const allPassed = passed === total;

  console.log('\n' + '═'.repeat(60));
  if (allPassed) {
    console.log(`  ✓ ALL TESTS PASSED (${passed}/${total})`);
    console.log('  Frontier models are ready for the full study.');
  } else {
    console.log(`  ⚠ SOME TESTS FAILED (${passed}/${total} passed)`);
    console.log('  Review errors above before proceeding.');
  }
  console.log('═'.repeat(60));

  // Save full results
  const fs = require('fs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = `pilot-results-${timestamp}.json`;
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\nFull results saved to ${outputFile}`);
}

main().catch(console.error);
