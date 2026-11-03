export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "admin" | "membru";
  email: string;
  name: string;
  /** sesiunea curentă (pentru „deconectează celelalte sesiuni”) */
  sessionId: string;
}

export type AppEnv = {
  Variables: {
    auth: AuthContext;
    requestId: string;
  };
};
