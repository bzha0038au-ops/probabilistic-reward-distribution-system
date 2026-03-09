type MessageValue = string | Record<string, unknown> | unknown[];

const getNestedValue = (
  messages: Record<string, unknown>,
  key: string
): MessageValue | undefined => {
  return key.split('.').reduce<MessageValue | undefined>((acc, part) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part] as MessageValue | undefined;
  }, messages);
};

export const createTranslator =
  (messages: Record<string, unknown>) =>
  (key: string, vars?: Record<string, string | number>) => {
    const value = getNestedValue(messages, key);
    let text = typeof value === 'string' ? value : key;

    if (vars) {
      Object.entries(vars).forEach(([name, replacement]) => {
        text = text.replace(
          new RegExp(`\\{${name}\\}`, 'g'),
          String(replacement)
        );
      });
    }

    return text;
  };
