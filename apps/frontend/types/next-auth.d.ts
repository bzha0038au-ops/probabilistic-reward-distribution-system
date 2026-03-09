import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: number;
      role: string;
      email?: string | null;
    };
    backendToken?: string;
  }

  interface User {
    id: number;
    role: string;
    email: string;
    backendToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string;
    userId?: number;
    backendToken?: string;
  }
}
