export function downloadFile(filename: string, blob: Blob): void {
   const url = URL.createObjectURL(blob);
   const anchor = document.createElement('a');
   anchor.href = url;
   anchor.download = filename;
   document.body.appendChild(anchor);
   anchor.click();
   anchor.remove();
   URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, text: string): void {
   downloadFile(filename, new Blob([text], { type: 'text/csv;charset=utf-8' }));
}
