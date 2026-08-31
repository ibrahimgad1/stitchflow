export async function saveCurrentPageAsPdf(defaultFileName: string): Promise<void> {
  if (window.electronAPI?.savePdf) {
    await window.electronAPI.savePdf(defaultFileName);
    return;
  }

  window.print();
}
