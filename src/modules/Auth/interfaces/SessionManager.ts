interface SessionManager {
  sessions?: Map<string, any>;
  publishers?: Map<string, string>;
  subscribers?: Map<string, string[]>;
  destroy(path: string): any;
}

export default SessionManager;
