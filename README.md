# Makima Core

Core runner for Makima, used for creating instances or agents that can be defined by a prompt set and a set of functions.

```bash
bun install @makimai/core
```

### Get started

```typescript
const test = createMakimaInstance({
  config: {
    config: {
      name: "test bot",
      openai: {
        openAIApiKey: makima_config.ai.openai_api_key!,
      },
    },
    integrations: {
      // this config can be accessed inside the tools that you declare.
      search_api_key: makima_config.integrations.search_api_key!,
    },
  },
  tools: [
    {
      tool: {
        type: "function",
        function: {
          name: "log",
          description: `Send system logs`,
          parameters: {
            type: "object",
            properties: {
              log: {
                type: "string",
                description: "Log string to print",
              },
            },
            required: ["query", "type"],
          },
        },
      },
      function: async ({ log }: { log: string }) => console.log(log),
    },
  ],
  system_prompts: [
    {
      role: "system",
      content: `
Log any user input.
`,
    },
  ],
});

const messages = await test("Hey whats up");
```

The `messages` returned is the array of messages it got from the default or custom messages controller.

### Messages Controller

Messages can be handled by default in memory, or by a custom messages controller that implements the following type:

```typescript
export interface MessagesController {
  add(
    message:
      | OpenAI.ChatCompletionMessageParam
      | OpenAI.ChatCompletionMessageParam[]
  ): Promise<OpenAI.ChatCompletionMessageParam[]>;
  getAll(): Promise<OpenAI.ChatCompletionMessageParam[]>;
  clear(): Promise<void>;
}
const messages_controller: MessagesController = {...}
const test = createMakimaInstance({
    // ... other config,
    messages_controller
})
```

Use custom controller to manage your messages history, the default messages controller stores messages in memory and does not share state between calls.

### TODOS

lot of shit todo lol
