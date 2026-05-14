const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Replace `{{var}}` placeholders. Throws if a placeholder is present but `vars` omits it.
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number | boolean>,
): string {
  return template.replace(PLACEHOLDER, (_, name: string) => {
    if (!(name in vars)) {
      throw new Error(`Missing interpolation value for "{{${name}}}" in string: ${template}`);
    }
    return String(vars[name]);
  });
}
