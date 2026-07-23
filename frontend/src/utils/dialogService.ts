export type DialogOptions = {
  type: 'alert' | 'confirm' | 'prompt';
  message: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: any) => void;
};

let dialogListener: ((options: DialogOptions) => void) | null = null;

export const registerDialogListener = (listener: (options: DialogOptions) => void) => {
  dialogListener = listener;
};

export const customAlert = (message: string): Promise<void> => {
  return new Promise((resolve) => {
    if (dialogListener) {
      dialogListener({ type: 'alert', message, resolve });
    } else {
      window.alert(message);
      resolve();
    }
  });
};

export const customConfirm = (message: string, options?: { confirmLabel?: string; cancelLabel?: string }): Promise<boolean> => {
  return new Promise((resolve) => {
    if (dialogListener) {
      dialogListener({ type: 'confirm', message, confirmLabel: options?.confirmLabel, cancelLabel: options?.cancelLabel, resolve });
    } else {
      resolve(window.confirm(message));
    }
  });
};

export const customPrompt = (message: string, defaultValue?: string): Promise<string | null> => {
  return new Promise((resolve) => {
    if (dialogListener) {
      dialogListener({ type: 'prompt', message, defaultValue, resolve });
    } else {
      resolve(window.prompt(message, defaultValue));
    }
  });
};
