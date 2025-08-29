// Mock for debugLogger to avoid import.meta.env issues in tests
export class DebugLogger {
  constructor(_prefix: string) {
    // No-op in tests
  }

  log(_message: string, ..._args: any[]) {
    // No-op in tests
  }

  warn(_message: string, ..._args: any[]) {
    // No-op in tests
  }

  error(_message: string, ..._args: any[]) {
    // No-op in tests
  }

  render(_componentInfo: string, _data?: any) {
    // No-op in tests
  }

  connection(_state: string, _url?: string) {
    // No-op in tests
  }
}

export const createDebugLogger = (_prefix: string) => new DebugLogger(_prefix);

// Helper functions - no-op in tests
export const disableAllDebugLogs = () => {};
export const enableAllDebugLogs = () => {};
export const disableComponentRenderLogs = () => {};
export const disablePerformanceLogs = () => {};
export const disableServiceLogs = () => {};
export const enableServiceLogs = () => {};
export const disableBinanceLogs = () => {};
export const enableDebugLogs = () => {};
