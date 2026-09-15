export function base64ToBlob(base64Data: string, contentType = 'application/pdf'): Blob {
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      } else {
        reject(new Error('Не удалось преобразовать Blob в base64'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Ошибка чтения Blob'));
    };
    reader.readAsDataURL(blob);
  });
}

export function savePdfInBrowser(blobOrBase64: Blob | string, fileName: string): void {
  const blob =
    typeof blobOrBase64 === 'string' ? base64ToBlob(blobOrBase64, 'application/pdf') : blobOrBase64;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export function printPdfInBrowser(
  blobOrBase64: Blob | string
): Promise<{ success: boolean; error?: string }> {
  return new Promise(resolve => {
    try {
      const blob =
        typeof blobOrBase64 === 'string'
          ? base64ToBlob(blobOrBase64, 'application/pdf')
          : blobOrBase64;
      const blobUrl = window.URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.src = blobUrl;

      let resolved = false;

      const finish = (result: { success: boolean; error?: string }) => {
        if (!resolved) {
          resolved = true;
          window.setTimeout(() => {
            if (iframe.parentNode !== null) {
              document.body.removeChild(iframe);
            }
            window.URL.revokeObjectURL(blobUrl);
          }, 3000);
          resolve(result);
        }
      };

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          finish({ success: true });
        } catch (e) {
          const printWindow = window.open(blobUrl, '_blank');
          if (printWindow !== null) {
            printWindow.focus();
            printWindow.print();
            finish({ success: true });
          } else {
            finish({
              success: false,
              error: e instanceof Error ? e.message : 'Не удалось открыть диалог печати'
            });
          }
        }
      };

      iframe.onerror = () => {
        finish({ success: false, error: 'Ошибка загрузки документа для печати' });
      };

      document.body.appendChild(iframe);
    } catch (err) {
      resolve({
        success: false,
        error: err instanceof Error ? err.message : 'Неизвестная ошибка печати'
      });
    }
  });
}
