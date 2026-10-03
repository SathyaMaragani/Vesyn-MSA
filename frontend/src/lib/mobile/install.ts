export interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

// Capture at shell mount, before the user visits Profile.
let pending: InstallPrompt | null = null;
export const installPrompt = () => pending;
export const rememberInstallPrompt = (event: InstallPrompt | null) => { pending = event; };
