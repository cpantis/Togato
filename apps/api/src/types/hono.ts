export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "admin" | "membru" | "colaborator";
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
