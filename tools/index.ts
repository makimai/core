import { search } from "./search";
import OpenAI from "openai";
import { MakimaConfig } from "..";
import { ChatCompletionMessageToolCall } from "openai/resources/index.mjs";

export type ToolsMapType = Record<
  string,
  (args: any, props: { config: MakimaConfig }) => Promise<any>
>;

export async function runTool({
  tool,
  config,
  tools_map,
}: {
  tool: ChatCompletionMessageToolCall;
  tools_map: ToolsMapType;
  config: MakimaConfig;
}): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam> {
  let validated_args;
  try {
    validated_args = JSON.parse(tool.function.arguments);
  } catch {
    return {
      role: "tool",
      tool_call_id: tool.id,
      content: "Invalid JSON passed as arguments",
    } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
  }
  if (tool.function.name === "switch_tool_set") {
    return validated_args.context;
  }

  try {
    let tool_res = await tools_map[tool.function.name](validated_args, {
      config,
    });
    tool_res = JSON.stringify(tool_res);

    const res: OpenAI.Chat.Completions.ChatCompletionToolMessageParam = {
      tool_call_id: tool.id,
      role: "tool",
      content: tool_res,
    };
    return res;
  } catch (error) {
    console.log(error);
    return {
      role: "tool",
      tool_call_id: tool.id,
      content: JSON.stringify(error),
    } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
  }
}
