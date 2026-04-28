import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: number;
      role: string;
      email?: string | null;
    };
  }

  interface User {
    id: string;
    role: string;
    email: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    userId?: number;
  }
}
