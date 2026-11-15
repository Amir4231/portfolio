import { sanitizeImageUrl, sanitizeSafeUrl } from "../lib/security";

export interface Site {
  name: string;
  nickname: string;
  role: string;
  location: string;
  email: string;
  github: string;
  linkedin: string;
  twitter: string;
  whatsapp: string;
  resume: string;
  tagline: string;
  builtWith: string;
  avatar?: string;
}

export const site: Site = {
  name: "Alex Chen",
  nickname: "",
  role: "Full-Stack Engineer",
  location: "San Francisco, CA",
  email: "hello@example.com",
  github: "https://github.com/your-username",
  linkedin: "https://www.linkedin.com/in/your-username",
  twitter: "https://twitter.com/your-username",
  whatsapp: "",
  resume: "/resume.pdf",
  tagline:
    "Full-stack engineer with 6+ years shipping production TypeScript, React, and Node.js applications. I obsess over performance, accessibility, and developer experience — turning complex problems into fast, elegant products.",
  builtWith: "Built with Astro + Tailwind",
};

export const SETTING_KEYS = [
  "name",
  "nickname",
  "role",
  "location",
  "email",
  "github",
  "linkedin",
  "twitter",
  "whatsapp",
  "resume",
  "tagline",
  "builtWith",
  "avatar",
] as const;

export function resolveSite(settings?: Record<string, string>): Site {
  const s = settings ?? {};
  return {
    name: s.name || site.name,
    nickname: s.nickname || site.nickname,
    role: s.role || site.role,
    location: s.location || site.location,
    email: s.email || site.email,
    github: sanitizeSafeUrl(s.github) || site.github,
    linkedin: sanitizeSafeUrl(s.linkedin) || site.linkedin,
    twitter: sanitizeSafeUrl(s.twitter) || site.twitter,
    whatsapp: sanitizeSafeUrl(s.whatsapp) || site.whatsapp,
    resume: sanitizeSafeUrl(s.resume) || site.resume,
    tagline: s.tagline || site.tagline,
    builtWith: s.builtWith || site.builtWith,
    avatar: sanitizeImageUrl(s.avatar) || undefined,
  };
}