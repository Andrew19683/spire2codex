export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,24}$/;

export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return "Username должен содержать 3–24 символа: латинские буквы, цифры, _ или -.";
  }
  return null;
}
