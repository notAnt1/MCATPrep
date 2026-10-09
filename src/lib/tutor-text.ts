// Display common model formatting as text, without interpreting HTML or changing math operators.
export function tutorText(text: string) {
  return text
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(^|[\s(])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?=$|[\s.,!?;)])/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
}
