/**
 * Run Batch Evaluation of Story Transcripts
 *
 * Uses batch APIs (50% cost savings) to rate story transcripts with frontier models.
 * Suitable for evaluation since immediate responses are not required.
 *
 * Supported providers:
 *   - Anthropic: Message Batches API (https://docs.anthropic.com/en/docs/build-with-claude/message-batches)
 *   - OpenAI: Batch API (https://platform.openai.com/docs/guides/batch)
 *   - Google: Vertex AI Batch Prediction (requires separate setup)
 *
 * Usage:
 *   node run-batch-evaluation.js --sample-file=validation-sample.json [--provider=anthropic|openai|all]
 *
 * Output:
 *   - Creates batch jobs for each provider
 *   - Polls for completion
 *   - Saves results to evaluation-results-{provider}-{timestamp}.json
 */

const fs = require('fs');
const path = require('path');

// Evaluation prompt template (same for all providers)
const EVALUATION_PROMPT = `You are evaluating the quality of an AI-generated interactive story transcript.

## Story Context
Template: {template_name}
Genre: {genre_description}

## Transcript
{transcript_text}

## Rating Instructions
Rate each aspect on the specified scale. Provide ONLY the numeric rating, one per line.

### Items to Rate

1. COHERENCE (1-5): Do the events follow logically from what came before?
   1=Events are contradictory or nonsensical
   3=Some logical gaps but generally followable
   5=Events follow naturally and consistently

2. CHARACTER_VOICE (1-5): Do characters speak/act in distinctive, believable ways?
   1=Characters are indistinguishable or unrealistic
   3=Some character differentiation, occasionally believable
   5=Each character has distinct voice and realistic behavior

3. ENGAGEMENT (1-5): Would you want to continue reading this story?
   1=Not at all engaging
   3=Somewhat interesting
   5=Very compelling, eager to continue

4. ACTION_RESPONSE (1-7): Does the narrative clearly show the result of player actions?
   1=Player actions completely ignored
   4=Actions acknowledged but weakly connected
   7=Clear, meaningful consequences shown

5. CHOICE_MEANINGFULNESS (1-7): Do the offered choices feel meaningfully different?
   1=Choices are redundant/identical
   4=Somewhat different options
   7=Distinct, consequential options

6. FORWARD_MOMENTUM (1-7): Does the story move forward (not repeating)?
   1=Constant repetition of same content
   4=Some repetition but generally progresses
   7=Consistent forward progress, no repetition

7. OVERALL_QUALITY (1-10): Overall quality of this interactive narrative?
   1-3=Poor quality
   4-6=Moderate quality
   7-8=Good quality
   9-10=Excellent quality

## Your Ratings
Provide exactly 7 numbers, one per line, in order:`;

// Provider configurations
const PROVIDERS = {
  anthropic: {
    model: 'claude-opus-4-5-20251101',
    batchEndpoint: 'https://api.anthropic.com/v1/messages/batches',
    envKey: 'ANTHROPIC_API_KEY',
    // Batch pricing: 50% of standard
    costPer1kInput: 0.0025,   // $2.50/MTok
    costPer1kOutput: 0.0125,  // $12.50/MTok
  },
  openai: {
    model: 'gpt-5.2',
    batchEndpoint: 'https://api.openai.com/v1/batches',
    envKey: 'OPENAI_API_KEY',
    // Batch pricing: 50% of standard
    costPer1kInput: 0.005,    // $5/MTok
    costPer1kOutput: 0.015,   // $15/MTok
  },
};

/**
 * Create Anthropic batch request
 */
async function createAnthropicBatch(transcripts, apiKey) {
  const requests = transcripts.map((t, idx) => ({
    custom_id: t.id || `transcript-${idx}`,
    params: {
      model: PROVIDERS.anthropic.model,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: EVALUATION_PROMPT
          .replace('{template_name}', t.template || 'unknown')
          .replace('{genre_description}', t.genre || 'interactive fiction')
          .replace('{transcript_text}', t.transcript)
      }]
    }
  }));

  const response = await fetch(PROVIDERS.anthropic.batchEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ requests })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic batch creation failed: ${error}`);
  }

  return response.json();
}

/**
 * Poll Anthropic batch for completion
 */
async function pollAnthropicBatch(batchId, apiKey) {
  const url = `${PROVIDERS.anthropic.batchEndpoint}/${batchId}`;

  while (true) {
    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }
    });

    const batch = await response.json();
    console.log(`  Anthropic batch ${batchId}: ${batch.processing_status} (${batch.request_counts.succeeded}/${batch.request_counts.processing + batch.request_counts.succeeded} complete)`);

    if (batch.processing_status === 'ended') {
      return batch;
    }

    // Wait 30 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

/**
 * Get Anthropic batch results
 */
async function getAnthropicResults(resultsUrl, apiKey) {
  const response = await fetch(resultsUrl, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
  });

  const text = await response.text();
  // Results are JSONL format
  return text.trim().split('\n').map(line => JSON.parse(line));
}

/**
 * Create OpenAI batch request
 */
async function createOpenAIBatch(transcripts, apiKey) {
  // OpenAI requires uploading a JSONL file first
  const requests = transcripts.map((t, idx) => ({
    custom_id: t.id || `transcript-${idx}`,
    method: 'POST',
    url: '/v1/chat/completions',
    body: {
      model: PROVIDERS.openai.model,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: EVALUATION_PROMPT
          .replace('{template_name}', t.template || 'unknown')
          .replace('{genre_description}', t.genre || 'interactive fiction')
          .replace('{transcript_text}', t.transcript)
      }]
    }
  }));

  // Create JSONL content
  const jsonlContent = requests.map(r => JSON.stringify(r)).join('\n');

  // Upload file
  const formData = new FormData();
  formData.append('file', new Blob([jsonlContent], { type: 'application/jsonl' }), 'batch-input.jsonl');
  formData.append('purpose', 'batch');

  const uploadResponse = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`OpenAI file upload failed: ${error}`);
  }

  const file = await uploadResponse.json();

  // Create batch
  const batchResponse = await fetch(PROVIDERS.openai.batchEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h'
    })
  });

  if (!batchResponse.ok) {
    const error = await batchResponse.text();
    throw new Error(`OpenAI batch creation failed: ${error}`);
  }

  return batchResponse.json();
}

/**
 * Poll OpenAI batch for completion
 */
async function pollOpenAIBatch(batchId, apiKey) {
  const url = `${PROVIDERS.openai.batchEndpoint}/${batchId}`;

  while (true) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    const batch = await response.json();
    console.log(`  OpenAI batch ${batchId}: ${batch.status} (${batch.request_counts?.completed || 0}/${batch.request_counts?.total || '?'} complete)`);

    if (batch.status === 'completed' || batch.status === 'failed' || batch.status === 'expired') {
      return batch;
    }

    // Wait 30 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

/**
 * Get OpenAI batch results
 */
async function getOpenAIResults(outputFileId, apiKey) {
  const response = await fetch(`https://api.openai.com/v1/files/${outputFileId}/content`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    }
  });

  const text = await response.text();
  return text.trim().split('\n').map(line => JSON.parse(line));
}

/**
 * Parse rating response into structured data
 */
function parseRatings(content) {
  const lines = content.trim().split('\n').filter(l => l.trim());
  const numbers = lines.map(l => {
    const match = l.match(/\d+/);
    return match ? parseInt(match[0]) : null;
  }).filter(n => n !== null);

  if (numbers.length < 7) {
    console.warn(`Warning: Expected 7 ratings, got ${numbers.length}`);
    return null;
  }

  return {
    coherence: numbers[0],
    character_voice: numbers[1],
    engagement: numbers[2],
    action_response: numbers[3],
    choice_meaningfulness: numbers[4],
    forward_momentum: numbers[5],
    overall_quality: numbers[6],
  };
}

/**
 * Main execution
 */
async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const sampleFileArg = args.find(a => a.startsWith('--sample-file='));
  const providerArg = args.find(a => a.startsWith('--provider='));

  if (!sampleFileArg) {
    console.error('Usage: node run-batch-evaluation.js --sample-file=<file> [--provider=anthropic|openai|all]');
    process.exit(1);
  }

  const sampleFile = sampleFileArg.split('=')[1];
  const selectedProvider = providerArg ? providerArg.split('=')[1] : 'all';

  // Load transcripts
  console.log(`Loading transcripts from ${sampleFile}...`);
  const transcripts = JSON.parse(fs.readFileSync(sampleFile, 'utf-8'));
  console.log(`Loaded ${transcripts.length} transcripts`);

  // Determine providers to use
  const providers = selectedProvider === 'all'
    ? Object.keys(PROVIDERS)
    : [selectedProvider];

  // Check API keys
  for (const p of providers) {
    if (!process.env[PROVIDERS[p].envKey]) {
      console.error(`Missing ${PROVIDERS[p].envKey} for provider ${p}`);
      process.exit(1);
    }
  }

  const results = {};

  for (const provider of providers) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing with ${provider.toUpperCase()}`);
    console.log('='.repeat(60));

    const apiKey = process.env[PROVIDERS[provider].envKey];

    try {
      let batch, batchResults;

      if (provider === 'anthropic') {
        console.log('Creating Anthropic batch...');
        batch = await createAnthropicBatch(transcripts, apiKey);
        console.log(`Batch created: ${batch.id}`);

        console.log('Polling for completion...');
        const completedBatch = await pollAnthropicBatch(batch.id, apiKey);

        console.log('Fetching results...');
        batchResults = await getAnthropicResults(completedBatch.results_url, apiKey);

      } else if (provider === 'openai') {
        console.log('Creating OpenAI batch...');
        batch = await createOpenAIBatch(transcripts, apiKey);
        console.log(`Batch created: ${batch.id}`);

        console.log('Polling for completion...');
        const completedBatch = await pollOpenAIBatch(batch.id, apiKey);

        if (completedBatch.status === 'completed') {
          console.log('Fetching results...');
          batchResults = await getOpenAIResults(completedBatch.output_file_id, apiKey);
        } else {
          console.error(`Batch failed with status: ${completedBatch.status}`);
          continue;
        }
      }

      // Parse results
      console.log('Parsing ratings...');
      results[provider] = batchResults.map(r => {
        let content;
        if (provider === 'anthropic') {
          content = r.result?.message?.content?.[0]?.text || '';
        } else {
          content = r.response?.body?.choices?.[0]?.message?.content || '';
        }

        return {
          custom_id: r.custom_id,
          ratings: parseRatings(content),
          raw_response: content,
        };
      });

      console.log(`Parsed ${results[provider].length} ratings from ${provider}`);

    } catch (error) {
      console.error(`Error with ${provider}:`, error.message);
    }
  }

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = `evaluation-results-${timestamp}.json`;

  fs.writeFileSync(outputFile, JSON.stringify({
    metadata: {
      timestamp: new Date().toISOString(),
      providers: providers,
      transcript_count: transcripts.length,
    },
    results
  }, null, 2));

  console.log(`\nResults saved to ${outputFile}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  for (const provider of Object.keys(results)) {
    const valid = results[provider].filter(r => r.ratings).length;
    console.log(`${provider}: ${valid}/${results[provider].length} valid ratings`);
  }
}

main().catch(console.error);
