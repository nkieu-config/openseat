export const paymockOrigin =
  process.env.NEXT_PUBLIC_PAYMOCK_ORIGIN ??
  (process.env.NODE_ENV === "production"
    ? "https://openseat-paymock.onrender.com"
    : "http://localhost:4100");
