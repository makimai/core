import OpenAI from "openai";
import { ToolsMapType, runTool } from "./tools";

import { ZodError, z } from "zod";

export const makimaConfigSchema = z.object({
  name: z.string(),
  model: z.string().optional(),
  openai: z
    .object({
      openAIApiKey: z.string(),
    })
    .optional(),
  azure: z
    .object({
      azureOpenAIApiKey: z.string(),
      azureOpenAIApiVersion: z.string(),
      azureOpenAIApiInstanceName: z.string(),
      azureOpenAIApiDeploymentName: z.string(),
      azureOpenAIEmbeddingDeploymentName: z.string(),
    })
    .optional(),
});

export type MakimaConfig = z.infer<typeof makimaConfigSchema>;

export type UserToolType = {
  tool: OpenAI.ChatCompletionTool;
  function: ToolsMapType[keyof ToolsMapType];
};

export function createMakimaInstance({
  config,
  tools,
  userSystemPrompts,
}: {
  tools?: UserToolType[];
  config: MakimaConfig;
  userSystemPrompts: OpenAI.ChatCompletionMessageParam[];
}) {
  // Validate the configuration against the schema
  try {
    makimaConfigSchema.parse(config);
    console.log("Configuration is valid!");
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("Configuration validation failed:", error.errors);
      process.exit(1); // Exit the program with a non-zero status code
    } else {
      console.error("An unexpected error occurred during validation:", error);
      process.exit(1); // Exit the program with a non-zero status code
    }
  }

  if (!(config.openai || config.azure)) {
    console.error("Please provide either openai or azure config");
    process.exit(1); // Exit the program with a non-zero status code
  }

  const azureOptions = {
    apiKey: config.azure?.azureOpenAIApiKey,
    baseURL: `https://${config.azure?.azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${config.azure?.azureOpenAIApiDeploymentName}`,
    defaultQuery: { "api-version": config.azure?.azureOpenAIApiVersion },
    defaultHeaders: { "api-key": config.azure?.azureOpenAIApiKey },
  };

  const openaiOptions = {
    apiKey: config.openai?.openAIApiKey,
  };

  const model =
    config.model ??
    config.azure?.azureOpenAIApiDeploymentName ??
    "gpt-3.5-turbo-1106";

  const openai = new OpenAI(config.azure ? azureOptions : openaiOptions);

  const systemPrompts: OpenAI.ChatCompletionMessageParam[] =
    userSystemPrompts ?? [
      {
        role: "system",
        content: `You are makima
        You are a chatbot that can do anything.`,
      },
    ];

  async function ask(
    question: string,
    tools: OpenAI.ChatCompletionTool[] = [],
    tools_map: ToolsMapType,
  ) {
    let messages = systemPrompts.concat({ role: "user", content: question });

    const res = await openai.chat.completions.create({
      model,
      tools: tools.map((tool) => {
        return {
          type: tool.type,
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          },
        } as OpenAI.ChatCompletionTool;
      }),
      messages,
      stream: false,
    });

    messages = messages.concat(res.choices[0].message);
    if (res.choices[0].message?.tool_calls) {
      const result = await resolve_tools({
        tool_calls: res.choices[0].message.tool_calls,
        message_history: messages,
        tools,
        tools_map,
      });
      return messages.concat(result);
    }
    return messages;
  }

  async function resolve_tools({
    tool_calls,
    message_history,
    tools,
    tools_map,
  }: {
    tool_calls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
    message_history: OpenAI.ChatCompletionMessageParam[];
    tools: OpenAI.ChatCompletionTool[];
    tools_map: ToolsMapType;
  }) {
    const tools_results = await Promise.allSettled(
      tool_calls?.map(async (tool) => {
        console.log(
          "Calling: ",
          tool.function.name,
          "\nWith args: ",
          tool.function.arguments,
        );
        return await runTool({ config, tool, tools_map });
      }),
    );

    const new_messages = tools_results
      .map((result) => {
        if (result.status === "fulfilled") {
          return result.value;
        }
      })
      .filter(
        (message) => message !== undefined,
      ) as OpenAI.ChatCompletionMessageParam[];

    const new_message_history = message_history
      .concat(new_messages)
      .map((m) => (m.content ? m : { ...m, content: null }));

    const res = await openai.chat.completions.create({
      model,
      tools: tools.map((tool) => {
        return {
          type: tool.type,
          function: {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          },
        } as OpenAI.ChatCompletionTool;
      }),
      messages: new_message_history,
    });

    if (res.choices[0].message?.tool_calls) {
      const messages = new_message_history.concat(res.choices[0].message);

      return resolve_tools({
        tool_calls: res.choices[0].message.tool_calls,
        message_history: messages,
        tools,
        tools_map,
      });
    }

    return new_message_history.concat(res.choices[0].message);
  }

  const generated_tools_map = tools?.reduce((acc, t) => {
    acc[t.tool.function.name] = t.function;
    return acc;
  }, {} as ToolsMapType);

  const generated_tools = tools?.map((t) => t.tool);

  return (question: string) =>
    ask(question, generated_tools, generated_tools_map ?? {});
}
