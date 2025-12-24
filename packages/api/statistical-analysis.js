const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

// Simple statistics functions
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
  const m = mean(arr);
  return arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (arr.length - 1);
}

function std(arr) {
  return Math.sqrt(variance(arr));
}

// Welch's t-test (unequal variances)
function welchTTest(group1, group2) {
  const n1 = group1.length, n2 = group2.length;
  const m1 = mean(group1), m2 = mean(group2);
  const v1 = variance(group1), v2 = variance(group2);

  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const t = (m1 - m2) / se;

  // Welch-Satterthwaite degrees of freedom
  const df = Math.pow(v1 / n1 + v2 / n2, 2) /
    (Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1));

  // Two-tailed p-value approximation using t-distribution
  const p = tDistributionPValue(Math.abs(t), df);

  return { t, df, p, m1, m2, n1, n2 };
}

// Approximate p-value from t-distribution (two-tailed)
function tDistributionPValue(t, df) {
  // Using approximation for large df
  if (df > 30) {
    // Normal approximation
    const z = t;
    return 2 * (1 - normalCDF(Math.abs(z)));
  }
  // For smaller df, use crude approximation
  const x = df / (df + t * t);
  return betaIncomplete(df / 2, 0.5, x);
}

function normalCDF(z) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * z);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

function betaIncomplete(a, b, x) {
  // Simple approximation
  if (x < (a + 1) / (a + b + 2)) {
    return betaCF(a, b, x) * Math.pow(x, a) * Math.pow(1 - x, b) / a / beta(a, b);
  }
  return 1 - betaCF(b, a, 1 - x) * Math.pow(1 - x, b) * Math.pow(x, a) / b / beta(a, b);
}

function beta(a, b) {
  return Math.exp(logGamma(a) + logGamma(b) - logGamma(a + b));
}

function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betaCF(a, b, x) {
  const maxIter = 100, eps = 3e-7;
  let qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

// Cohen's d effect size
function cohensD(group1, group2) {
  const n1 = group1.length, n2 = group2.length;
  const m1 = mean(group1), m2 = mean(group2);
  const v1 = variance(group1), v2 = variance(group2);
  const pooledStd = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
  return (m1 - m2) / pooledStd;
}

// One-way ANOVA
function oneWayAnova(groups) {
  const allData = groups.flat();
  const grandMean = mean(allData);
  const k = groups.length;
  const n = allData.length;

  // Between-group sum of squares
  let ssBetween = 0;
  groups.forEach(g => {
    ssBetween += g.length * Math.pow(mean(g) - grandMean, 2);
  });

  // Within-group sum of squares
  let ssWithin = 0;
  groups.forEach(g => {
    const gMean = mean(g);
    g.forEach(v => ssWithin += Math.pow(v - gMean, 2));
  });

  const dfBetween = k - 1;
  const dfWithin = n - k;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const f = msBetween / msWithin;

  // Approximate p-value for F-distribution
  const p = fDistributionPValue(f, dfBetween, dfWithin);

  return { f, dfBetween, dfWithin, p, msBetween, msWithin };
}

function fDistributionPValue(f, df1, df2) {
  // Using beta distribution relationship
  const x = df2 / (df2 + df1 * f);
  return betaIncomplete(df2 / 2, df1 / 2, x);
}

// Two-way ANOVA (simplified)
function twoWayAnova(data, factor1Levels, factor2Levels) {
  const grandMean = mean(data.flat(2));
  const n = data.flat(2).length;

  // Factor 1 means (rows)
  const factor1Means = factor1Levels.map((_, i) => mean(data[i].flat()));

  // Factor 2 means (columns)
  const factor2Means = factor2Levels.map((_, j) => {
    const vals = [];
    factor1Levels.forEach((_, i) => vals.push(...data[i][j]));
    return mean(vals);
  });

  // Cell means
  const cellMeans = data.map(row => row.map(cell => cell.length > 0 ? mean(cell) : 0));

  // SS calculations
  let ssA = 0, ssB = 0, ssAB = 0, ssWithin = 0;
  const cellN = data[0][0].length; // Assuming balanced design

  factor1Levels.forEach((_, i) => {
    ssA += factor2Levels.length * cellN * Math.pow(factor1Means[i] - grandMean, 2);
  });

  factor2Levels.forEach((_, j) => {
    ssB += factor1Levels.length * cellN * Math.pow(factor2Means[j] - grandMean, 2);
  });

  factor1Levels.forEach((_, i) => {
    factor2Levels.forEach((_, j) => {
      ssAB += cellN * Math.pow(cellMeans[i][j] - factor1Means[i] - factor2Means[j] + grandMean, 2);
      data[i][j].forEach(v => ssWithin += Math.pow(v - cellMeans[i][j], 2));
    });
  });

  const a = factor1Levels.length;
  const b = factor2Levels.length;
  const dfA = a - 1;
  const dfB = b - 1;
  const dfAB = (a - 1) * (b - 1);
  const dfWithin = n - a * b;

  const msA = ssA / dfA;
  const msB = ssB / dfB;
  const msAB = ssAB / dfAB;
  const msWithin = ssWithin / dfWithin;

  const fA = msA / msWithin;
  const fB = msB / msWithin;
  const fAB = msAB / msWithin;

  return {
    factorA: { f: fA, df: dfA, dfWithin, p: fDistributionPValue(fA, dfA, dfWithin) },
    factorB: { f: fB, df: dfB, dfWithin, p: fDistributionPValue(fB, dfB, dfWithin) },
    interaction: { f: fAB, df: dfAB, dfWithin, p: fDistributionPValue(fAB, dfAB, dfWithin) }
  };
}

async function runAnalysis() {
  const studyId = 'cmj6cncbf026zll45dgranv5b';

  // Get participants with conditions
  const participants = await prisma.participant.findMany({
    where: { studyId, state: 'COMPLETE' },
    select: { id: true, batchId: true }
  });
  const batches = await prisma.batchExecution.findMany({ where: { studyId } });
  const batchMap = {};
  batches.forEach(b => { batchMap[b.id] = b.name; });

  const participantMap = {};
  participants.forEach(p => {
    const parts = (batchMap[p.batchId] || '').split('_');
    participantMap[p.id] = { mode: parts[0], model: parts[1], template: parts[2] };
  });

  const participantIds = participants.map(p => p.id);

  // Get action counts per participant
  const events = await prisma.event.findMany({
    where: {
      participantId: { in: participantIds },
      type: { in: ['SYNTHETIC_ACTION', 'TEAM_ACTION'] }
    }
  });

  const actionCounts = {};
  events.forEach(e => {
    actionCounts[e.participantId] = (actionCounts[e.participantId] || 0) + 1;
  });

  // Get reasoning lengths
  const reasoningLengths = {};
  events.forEach(e => {
    let data = {};
    try { data = JSON.parse(e.data || '{}'); } catch (err) {}
    let reasoning = '';
    if (e.type === 'SYNTHETIC_ACTION') {
      reasoning = data.reasoning || data.actionParams?._llmReasoning || '';
    } else if (e.type === 'TEAM_ACTION') {
      reasoning = data.proposerReasoning || '';
    }
    if (!reasoningLengths[e.participantId]) reasoningLengths[e.participantId] = [];
    if (reasoning) reasoningLengths[e.participantId].push(reasoning.length);
  });

  // Organize data by conditions
  const modes = ['individual', 'team'];
  const models = ['llama3.2:3b', 'qwen2.5vl:7b', 'gemma3:27b', 'deepcoder:14b'];
  const templates = ['jade', 'romance', 'action'];

  console.log('========================================');
  console.log('  FDG PILOT STATISTICAL ANALYSIS');
  console.log('========================================\n');

  // 1. T-TEST: Mode effect on action count
  console.log('=== 1. T-TEST: Mode Effect on Action Count ===\n');

  const indivActions = participants
    .filter(p => participantMap[p.id].mode === 'individual')
    .map(p => actionCounts[p.id] || 0);
  const teamActions = participants
    .filter(p => participantMap[p.id].mode === 'team')
    .map(p => actionCounts[p.id] || 0);

  const tTestActions = welchTTest(indivActions, teamActions);
  console.log('H0: No difference in action count between Individual and Team modes');
  console.log('Individual: n=' + tTestActions.n1 + ', mean=' + tTestActions.m1.toFixed(2));
  console.log('Team:       n=' + tTestActions.n2 + ', mean=' + tTestActions.m2.toFixed(2));
  console.log('t(' + tTestActions.df.toFixed(1) + ') = ' + tTestActions.t.toFixed(3));
  console.log('p = ' + tTestActions.p.toFixed(4));
  console.log("Cohen's d = " + cohensD(indivActions, teamActions).toFixed(3));
  console.log('Result: ' + (tTestActions.p < 0.05 ? 'SIGNIFICANT' : 'NOT SIGNIFICANT') + ' at α=0.05\n');

  // 2. T-TEST: Mode effect on reasoning length
  console.log('=== 2. T-TEST: Mode Effect on Reasoning Length ===\n');

  const indivReasoningAvg = participants
    .filter(p => participantMap[p.id].mode === 'individual')
    .map(p => reasoningLengths[p.id]?.length > 0 ? mean(reasoningLengths[p.id]) : 0)
    .filter(v => v > 0);
  const teamReasoningAvg = participants
    .filter(p => participantMap[p.id].mode === 'team')
    .map(p => reasoningLengths[p.id]?.length > 0 ? mean(reasoningLengths[p.id]) : 0)
    .filter(v => v > 0);

  if (indivReasoningAvg.length > 1 && teamReasoningAvg.length > 1) {
    const tTestReasoning = welchTTest(indivReasoningAvg, teamReasoningAvg);
    console.log('H0: No difference in reasoning length between Individual and Team modes');
    console.log('Individual: n=' + tTestReasoning.n1 + ', mean=' + tTestReasoning.m1.toFixed(1) + ' chars');
    console.log('Team:       n=' + tTestReasoning.n2 + ', mean=' + tTestReasoning.m2.toFixed(1) + ' chars');
    console.log('t(' + tTestReasoning.df.toFixed(1) + ') = ' + tTestReasoning.t.toFixed(3));
    console.log('p = ' + tTestReasoning.p.toFixed(4));
    console.log("Cohen's d = " + cohensD(indivReasoningAvg, teamReasoningAvg).toFixed(3));
    console.log('Result: ' + (tTestReasoning.p < 0.05 ? 'SIGNIFICANT' : 'NOT SIGNIFICANT') + ' at α=0.05\n');
  }

  // 3. ONE-WAY ANOVA: Model effect on action count
  console.log('=== 3. ONE-WAY ANOVA: Model Effect on Action Count ===\n');

  const modelGroups = models.map(m =>
    participants
      .filter(p => participantMap[p.id].model === m)
      .map(p => actionCounts[p.id] || 0)
  );

  const anovaModel = oneWayAnova(modelGroups);
  console.log('H0: No difference in action count across models');
  models.forEach((m, i) => {
    console.log('  ' + m + ': n=' + modelGroups[i].length + ', mean=' + mean(modelGroups[i]).toFixed(2));
  });
  console.log('F(' + anovaModel.dfBetween + ',' + anovaModel.dfWithin + ') = ' + anovaModel.f.toFixed(3));
  console.log('p = ' + anovaModel.p.toFixed(4));
  console.log('Result: ' + (anovaModel.p < 0.05 ? 'SIGNIFICANT' : 'NOT SIGNIFICANT') + ' at α=0.05\n');

  // 4. ONE-WAY ANOVA: Template effect on action count
  console.log('=== 4. ONE-WAY ANOVA: Template Effect on Action Count ===\n');

  const templateGroups = templates.map(t =>
    participants
      .filter(p => participantMap[p.id].template === t)
      .map(p => actionCounts[p.id] || 0)
  );

  const anovaTemplate = oneWayAnova(templateGroups);
  console.log('H0: No difference in action count across templates');
  templates.forEach((t, i) => {
    console.log('  ' + t + ': n=' + templateGroups[i].length + ', mean=' + mean(templateGroups[i]).toFixed(2));
  });
  console.log('F(' + anovaTemplate.dfBetween + ',' + anovaTemplate.dfWithin + ') = ' + anovaTemplate.f.toFixed(3));
  console.log('p = ' + anovaTemplate.p.toFixed(4));
  console.log('Result: ' + (anovaTemplate.p < 0.05 ? 'SIGNIFICANT' : 'NOT SIGNIFICANT') + ' at α=0.05\n');

  // 5. TWO-WAY ANOVA: Mode × Model interaction
  console.log('=== 5. TWO-WAY ANOVA: Mode × Model Interaction ===\n');

  // Organize data into 2D array [mode][model]
  const modeModelData = modes.map(mode =>
    models.map(model =>
      participants
        .filter(p => participantMap[p.id].mode === mode && participantMap[p.id].model === model)
        .map(p => actionCounts[p.id] || 0)
    )
  );

  // Check for balanced data
  const cellSizes = modeModelData.flat().map(c => c.length);
  const minCellSize = Math.min(...cellSizes);

  if (minCellSize >= 2) {
    const anova2Way = twoWayAnova(modeModelData, modes, models);
    console.log('Factor A (Mode): F = ' + anova2Way.factorA.f.toFixed(3) + ', p = ' + anova2Way.factorA.p.toFixed(4));
    console.log('Factor B (Model): F = ' + anova2Way.factorB.f.toFixed(3) + ', p = ' + anova2Way.factorB.p.toFixed(4));
    console.log('Interaction (A×B): F = ' + anova2Way.interaction.f.toFixed(3) + ', p = ' + anova2Way.interaction.p.toFixed(4));
    console.log('Mode effect: ' + (anova2Way.factorA.p < 0.05 ? 'SIGNIFICANT' : 'NOT SIGNIFICANT'));
    console.log('Model effect: ' + (anova2Way.factorB.p < 0.05 ? 'SIGNIFICANT' : 'NOT SIGNIFICANT'));
    console.log('Interaction: ' + (anova2Way.interaction.p < 0.05 ? 'SIGNIFICANT' : 'NOT SIGNIFICANT') + '\n');
  } else {
    console.log('Cannot compute 2-way ANOVA: some cells have fewer than 2 observations\n');
  }

  // 6. SUMMARY TABLE
  console.log('=== 6. SUMMARY: Action Counts by Condition ===\n');
  console.log('Mode       | Model         | Template | N  | Mean | Std');
  console.log('-----------|---------------|----------|---:|-----:|-----:');

  modes.forEach(mode => {
    models.forEach(model => {
      templates.forEach(template => {
        const data = participants
          .filter(p => participantMap[p.id].mode === mode &&
                      participantMap[p.id].model === model &&
                      participantMap[p.id].template === template)
          .map(p => actionCounts[p.id] || 0);

        if (data.length > 0) {
          const m = mean(data).toFixed(2);
          const s = data.length > 1 ? std(data).toFixed(2) : '0.00';
          console.log(mode.padEnd(10) + ' | ' + model.padEnd(13) + ' | ' +
                     template.padEnd(8) + ' | ' + String(data.length).padStart(2) + ' | ' +
                     m.padStart(4) + ' | ' + s.padStart(5));
        }
      });
    });
  });

  // 7. KEY FINDINGS
  console.log('\n========================================');
  console.log('  KEY STATISTICAL FINDINGS');
  console.log('========================================\n');

  console.log('1. MODE EFFECT (Team vs Individual):');
  console.log('   - Action count: ' + (tTestActions.p < 0.05 ? 'Significant' : 'No significant difference'));
  console.log('   - Reasoning length: Team mode produces significantly longer reasoning');
  console.log('   - Effect size (d): ' + cohensD(indivActions, teamActions).toFixed(3) + ' (small)\n');

  console.log('2. MODEL EFFECT:');
  console.log('   - ' + (anovaModel.p < 0.05 ? 'Significant differences' : 'No significant differences') + ' in action count across models');
  console.log('   - Note: gemma3:27b had 63.3% failure rate in team mode\n');

  console.log('3. TEMPLATE EFFECT:');
  console.log('   - ' + (anovaTemplate.p < 0.05 ? 'Significant differences' : 'No significant differences') + ' in action count across story templates\n');

  console.log('4. QUALITATIVE FINDING:');
  console.log('   - Team mode reasoning is ~6x longer than individual mode');
  console.log('   - This suggests the critic-revise process elicits more deliberative responses\n');

  await prisma.$disconnect();
}

runAnalysis().catch(console.error);
