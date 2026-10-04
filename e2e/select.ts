import { expect, type Locator } from '@playwright/test';
/** Exercise the actual themed popup and its options. */
export async function selectOption(control: Locator, value: string) {
  await control.click();
  await control.page().getByRole('listbox').locator(`[role="option"][data-value="${value}"]`).click();
}

/** Exercise the searchable reference cards rather than a model/parameter selector. */
export async function chooseReference(browser: Locator, assetId: string) {
  await browser.waitFor({state:'visible'});
  await expect(browser.getByRole('status')).not.toContainText('正在加载');
  const card = browser.locator(`button[data-asset-id="${assetId}"]`);
  while (!await card.count() && await browser.getByRole('button', {name:/显示更多/}).isVisible()) {
    await browser.getByRole('button', {name:/显示更多/}).click();
    await expect(browser.getByRole('status')).not.toContainText('正在加载');
  }
  await card.click();
}
