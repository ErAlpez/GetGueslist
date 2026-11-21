export function getSignInErrorMessage(message: string | undefined) {
  if (message === "Too many requests. Please try again later.") {
    return "Too many sign-in attempts. Please wait at least 15 minutes before trying again.";
  }

  return message ?? "We couldn’t sign you in.";
}
