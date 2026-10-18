// Which sign-in methods this build offers. Vite copies VITE_ variables into the bundle at
// build time, so each Netlify context decides at deploy time. Only the exact value "on"
// counts: a typo such as "true" or "ON" leaves the method off.
export type SignInMethods = { google: boolean; email: boolean };

export const signInMethods = (env: Record<string, unknown>): SignInMethods => ({
  google: env.VITE_GOOGLE_SIGNIN === "on",
  email: env.VITE_EMAIL_SIGNIN === "on",
});
