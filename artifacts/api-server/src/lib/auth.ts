import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generatePatientCode(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = Math.floor(10000 + Math.random() * 90000);
  return `PT${year}${num}`;
}

export function generateCaseCode(): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const num = Math.floor(10000 + Math.random() * 90000);
  return `OC${year}${num}`;
}
