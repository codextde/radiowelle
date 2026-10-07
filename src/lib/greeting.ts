export function greetingKey(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 11) return 'greeting.morning' as const;
  if (h >= 11 && h < 18) return 'greeting.afternoon' as const;
  if (h >= 18 && h < 23) return 'greeting.evening' as const;
  return 'greeting.night' as const;
}
