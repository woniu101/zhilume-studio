import type { Locator } from '@playwright/test';
/** Exercise the actual themed popup and its options. */
export async function selectOption(control: Locator, value: string) {
  await control.click();
  await control.page().getByRole('listbox').locator(`[role="option"][data-value="${value}"]`).click();
}
