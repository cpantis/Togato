export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "admin" | "membru";
  email: string;
  name: string;
}

export type AppEnv = {
  Variables: {
    auth: AuthContext;
  };
};
