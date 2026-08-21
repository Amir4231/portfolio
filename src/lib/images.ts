import type { ImageMetadata } from "astro";

const images = import.meta.glob<{ default: ImageMetadata }>(
  "/src/assets/projects/*.{png,jpg,jpeg,webp}",
  { eager: true },
);

export function getProjectImage(name: string): ImageMetadata | undefined {
  if (!name) return undefined;
  const path = `/src/assets/projects/${name}`;
  return images[path]?.default;
}

export function isExternalImage(name: string): boolean {
  if (!name) return false;
  return name.startsWith("/") || name.startsWith("http://") || name.startsWith("https://");
}
