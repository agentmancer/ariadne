/**
 * Ariadne MCP Server
 *
 * Exposes Ariadne Platform study design and management tools via MCP
 * so that Claude can help with study configuration, condition setup, etc.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create MCP server
const server = new Server(
  {
    name: 'ariadne-platform',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// Tool Definitions
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Project Management
      {
        name: 'list_projects',
        description: 'List all research projects. Returns project names, IDs, and study counts.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'create_project',
        description: 'Create a new research project',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Project name' },
            description: { type: 'string', description: 'Project description (optional)' }
          },
          required: ['name']
        }
      },

      // Study Management
      {
        name: 'list_studies',
        description: 'List studies in a project with their configurations',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Project ID (optional - lists all if omitted)' }
          }
        }
      },
      {
        name: 'create_study',
        description: 'Create a new research study with conditions and configuration',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'Parent project ID' },
            name: { type: 'string', description: 'Study name' },
            description: { type: 'string', description: 'Study description' },
            type: {
              type: 'string',
              enum: ['SINGLE_PARTICIPANT', 'PAIRED_COLLABORATIVE', 'MULTI_ROUND', 'CUSTOM'],
              description: 'Study type'
            },
            conditions: {
              type: 'array',
              description: 'Study conditions to create',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  story_template: { type: 'string' },
                  config: { type: 'object' }
                }
              }
            }
          },
          required: ['project_id', 'name', 'type']
        }
      },
      {
        name: 'get_study_details',
        description: 'Get detailed information about a study including conditions, participants, and sessions',
        inputSchema: {
          type: 'object',
          properties: {
            study_id: { type: 'string', description: 'Study ID' }
          },
          required: ['study_id']
        }
      },

      // Condition Management
      {
        name: 'add_condition',
        description: 'Add an experimental condition to a study',
        inputSchema: {
          type: 'object',
          properties: {
            study_id: { type: 'string', description: 'Study ID' },
            name: { type: 'string', description: 'Condition name' },
            description: { type: 'string', description: 'Condition description' },
            story_template: { type: 'string', description: 'Story template to use' },
            config: {
              type: 'object',
              description: 'Condition-specific configuration (JSON)',
              additionalProperties: true
            }
          },
          required: ['study_id', 'name']
        }
      },
      {
        name: 'list_conditions',
        description: 'List all conditions for a study',
        inputSchema: {
          type: 'object',
          properties: {
            study_id: { type: 'string', description: 'Study ID' }
          },
          required: ['study_id']
        }
      },

      // Agent Definition Management
      {
        name: 'create_agent_definition',
        description: 'Create an agent definition for automated story exploration',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Agent name' },
            description: { type: 'string', description: 'Agent description' },
            strategy: {
              type: 'string',
              enum: ['exploratory', 'goal_driven', 'curious', 'random', 'optimal'],
              description: 'Agent strategy'
            },
            max_actions: { type: 'integer', description: 'Maximum actions per playthrough', default: 50 }
          },
          required: ['name', 'strategy']
        }
      },
      {
        name: 'list_agent_definitions',
        description: 'List all configured agents',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },

      // Batch Execution
      {
        name: 'create_batch_execution',
        description: 'Create a batch execution to run multiple agent playthroughs',
        inputSchema: {
          type: 'object',
          properties: {
            study_id: { type: 'string', description: 'Study ID' },
            agent_definition_id: { type: 'string', description: 'Agent definition ID' },
            story_template: { type: 'string', description: 'Story template to explore' },
            count: { type: 'integer', description: 'Number of playthroughs to run' }
          },
          required: ['study_id', 'agent_definition_id', 'story_template', 'count']
        }
      },
      {
        name: 'get_batch_status',
        description: 'Get status of a batch execution',
        inputSchema: {
          type: 'object',
          properties: {
            batch_id: { type: 'string', description: 'Batch execution ID' }
          },
          required: ['batch_id']
        }
      },

      // Study Templates
      {
        name: 'suggest_study_design',
        description: 'Suggest a study design based on research goals. This is an AI-assisted tool that analyzes the research question and proposes an appropriate study structure.',
        inputSchema: {
          type: 'object',
          properties: {
            research_question: { type: 'string', description: 'The research question or goal' },
            study_type: {
              type: 'string',
              description: 'Preferred study type (optional)',
              enum: ['SINGLE_PARTICIPANT', 'PAIRED_COLLABORATIVE', 'MULTI_ROUND', 'CUSTOM']
            },
            participant_count: { type: 'integer', description: 'Expected number of participants (optional)' }
          },
          required: ['research_question']
        }
      }
    ] as Tool[]
  };
});

// ============================================================================
// Tool Handlers
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      // Projects
      case 'list_projects': {
        // Note: In a real implementation, you'd need researcher authentication
        // For now, just list all projects
        const projects = await prisma.project.findMany({
          include: {
            _count: {
              select: { studies: true }
            }
          }
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(projects.map(p => ({
              id: p.id,
              name: p.name,
              description: p.description,
              study_count: p._count.studies,
              created_at: p.createdAt
            })), null, 2)
          }]
        };
      }

      case 'create_project': {
        // TODO: Get researcher ID from authentication
        // Using John Murray's researcher ID for now
        const researcherId = 'cmhxqdlvn0000115advxqdcdh';

        const project = await prisma.project.create({
          data: {
            name: args.name as string,
            description: args.description as string || null,
            researcherId
          }
        });

        return {
          content: [{
            type: 'text',
            text: `✓ Project created successfully\n\nID: ${project.id}\nName: ${project.name}\nCreated: ${project.createdAt}`
          }]
        };
      }

      // Studies
      case 'list_studies': {
        const where = args.project_id ? { projectId: args.project_id as string } : {};

        const studies = await prisma.study.findMany({
          where,
          include: {
            project: true,
            _count: {
              select: { conditions: true, participants: true, sessions: true }
            }
          }
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(studies.map(s => ({
              id: s.id,
              name: s.name,
              type: s.type,
              status: s.status,
              project: s.project.name,
              condition_count: s._count.conditions,
              participant_count: s._count.participants,
              session_count: s._count.sessions
            })), null, 2)
          }]
        };
      }

      case 'create_study': {
        const study = await prisma.study.create({
          data: {
            projectId: args.project_id as string,
            name: args.name as string,
            description: args.description as string || null,
            type: args.type as string,
            status: 'DRAFT'
          }
        });

        // Create conditions if provided
        const conditions = args.conditions as Array<{ name: string; description?: string; config?: Record<string, unknown> }> | undefined;
        if (conditions && Array.isArray(conditions)) {
          await Promise.all(
            conditions.map((cond) =>
              prisma.condition.create({
                data: {
                  studyId: study.id,
                  name: cond.name,
                  description: cond.description || null,
                  config: JSON.stringify(cond.config || {})
                }
              })
            )
          );
        }

        return {
          content: [{
            type: 'text',
            text: `✓ Study created successfully\n\nID: ${study.id}\nName: ${study.name}\nType: ${study.type}\nConditions: ${conditions?.length || 0}`
          }]
        };
      }

      case 'get_study_details': {
        const study = await prisma.study.findUnique({
          where: { id: args.study_id as string },
          include: {
            project: true,
            conditions: true,
            participants: true,
            sessions: {
              take: 10,
              orderBy: { createdAt: 'desc' }
            }
          }
        });

        if (!study) {
          return {
            content: [{
              type: 'text',
              text: 'Study not found'
            }],
            isError: true
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(study, null, 2)
          }]
        };
      }

      // Conditions
      case 'add_condition': {
        const condition = await prisma.condition.create({
          data: {
            studyId: args.study_id as string,
            name: args.name as string,
            description: args.description as string || null,
            config: JSON.stringify(args.config || {})
          }
        });

        return {
          content: [{
            type: 'text',
            text: `✓ Condition added\n\nID: ${condition.id}\nName: ${condition.name}`
          }]
        };
      }

      case 'list_conditions': {
        const conditions = await prisma.condition.findMany({
          where: { studyId: args.study_id as string }
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(conditions, null, 2)
          }]
        };
      }

      // Agent Definitions
      case 'create_agent_definition': {
        // TODO: Get researcher ID from authentication
        // Using John Murray's researcher ID for now
        const researcherId = 'cmhxqdlvn0000115advxqdcdh';
        const strategy = args.strategy as string;
        const maxActions = args.max_actions as number || 50;

        const agent = await prisma.agentDefinition.create({
          data: {
            researcherId,
            name: args.name as string,
            description: args.description as string || null,
            role: 'PLAYER', // Default role
            systemPrompt: `You are a ${strategy} agent. Max actions: ${maxActions}`,
            llmConfig: JSON.stringify({ strategy, maxActions })
          }
        });

        return {
          content: [{
            type: 'text',
            text: `✓ Agent definition created\n\nID: ${agent.id}\nName: ${agent.name}\nRole: ${agent.role}`
          }]
        };
      }

      case 'list_agent_definitions': {
        const agents = await prisma.agentDefinition.findMany();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(agents, null, 2)
          }]
        };
      }

      // Batch Execution
      case 'create_batch_execution': {
        const storyTemplate = args.story_template as string;
        const count = args.count as number;
        const agentDefinitionId = args.agent_definition_id as string;

        const batch = await prisma.batchExecution.create({
          data: {
            studyId: args.study_id as string,
            name: `Batch: ${storyTemplate}`,
            type: 'SIMULATION',
            status: 'QUEUED',
            config: JSON.stringify({ agentDefinitionId, storyTemplate, count })
          }
        });

        // TODO: Queue for background processing

        return {
          content: [{
            type: 'text',
            text: `✓ Batch execution created\n\nID: ${batch.id}\nStory: ${storyTemplate}\nCount: ${count}\nStatus: ${batch.status}`
          }]
        };
      }

      case 'get_batch_status': {
        const batch = await prisma.batchExecution.findUnique({
          where: { id: args.batch_id as string },
          include: {
            participants: true
          }
        });

        if (!batch) {
          return {
            content: [{
              type: 'text',
              text: 'Batch execution not found'
            }],
            isError: true
          };
        }

        const config = JSON.parse(batch.config || '{}');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: batch.id,
              name: batch.name,
              status: batch.status,
              actorsCreated: batch.actorsCreated,
              actorsCompleted: batch.actorsCompleted,
              config
            }, null, 2)
          }]
        };
      }

      // AI-Assisted Design
      case 'suggest_study_design': {
        // This would call an LLM to suggest study design
        // For now, return a template
        const suggestion = {
          research_question: args.research_question,
          suggested_type: args.study_type || 'SINGLE_PARTICIPANT',
          suggested_conditions: [
            {
              name: 'Control',
              description: 'Baseline condition with no intervention',
              config: {}
            },
            {
              name: 'Experimental',
              description: 'Treatment condition',
              config: {}
            }
          ],
          sample_size_recommendation: args.participant_count || 30,
          notes: 'This is a template suggestion. Customize based on your specific needs.'
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(suggestion, null, 2)
          }]
        };
      }

      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown tool: ${name}`
          }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
});

// ============================================================================
// Start Server
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Ariadne MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
