export function formatVatDisplay(vatName: string): string {
  if (vatName === undefined || vatName === null || vatName === '') {
    return '';
  }

  const match = /^(\d+(?:\.\d+)?)\/\d+$/.exec(vatName.trim());
  if (match?.[1] !== undefined) {
    return `${match[1]}%`;
  }

  return vatName;
}
