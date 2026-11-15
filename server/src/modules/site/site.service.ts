import type { ContactInput, ContactMessage, GalleryImage, PublicSite } from '@calisthenics/shared';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { getSettings } from '../../lib/settings.js';

const galleryOrder = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];
const gallerySelect = { id: true, url: true, caption: true };

/** What anyone can see: the gym's details, the plans on sale and the gallery. */
export async function publicSite(): Promise<PublicSite> {
  const [settings, plans, gallery] = await Promise.all([
    getSettings(),
    prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ priceCents: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        priceCents: true,
        durationMonths: true,
        description: true,
        isActive: true,
      },
    }),
    prisma.galleryImage.findMany({ orderBy: galleryOrder, select: gallerySelect }),
  ]);
  // Only the public fields: the timezone and today's date are app internals.
  const { businessName, coachName, coachBio, address, phone, instagram, openingHours, currency } =
    settings;
  return {
    businessName,
    coachName,
    coachBio,
    address,
    phone,
    instagram,
    openingHours,
    currency,
    plans,
    gallery,
  };
}

// ---------- Gallery ----------

export function listGallery(): Promise<GalleryImage[]> {
  return prisma.galleryImage.findMany({ orderBy: galleryOrder, select: gallerySelect });
}

export async function addImage(url: string, caption: string | null): Promise<GalleryImage> {
  const last = await prisma.galleryImage.aggregate({ _max: { sortOrder: true } });
  return prisma.galleryImage.create({
    data: { url, caption, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    select: gallerySelect,
  });
}

/** Swaps an image with its neighbour, so the coach can reorder the gallery. */
export async function moveImage(id: string, direction: -1 | 1): Promise<GalleryImage[]> {
  await prisma.$transaction(async (tx) => {
    const all = await tx.galleryImage.findMany({ orderBy: galleryOrder, select: { id: true } });
    const from = all.findIndex((image) => image.id === id);
    if (from === -1) throw imageNotFound();
    const to = from + direction;
    if (to < 0 || to >= all.length) return;
    [all[from], all[to]] = [all[to]!, all[from]!];
    // Renumber everything: also repairs equal sortOrder values.
    await Promise.all(
      all.map((image, index) =>
        tx.galleryImage.update({ where: { id: image.id }, data: { sortOrder: index } }),
      ),
    );
  });
  return listGallery();
}

export async function removeImage(id: string): Promise<void> {
  const { count } = await prisma.galleryImage.deleteMany({ where: { id } });
  if (count === 0) throw imageNotFound();
}

const imageNotFound = () => new AppError(404, 'IMAGE_NOT_FOUND', 'This image does not exist.');

// ---------- Contact messages ----------

export async function receiveMessage(input: ContactInput): Promise<void> {
  await prisma.contactMessage.create({ data: input });
}

/** Unread first, newest first. */
export async function listMessages(): Promise<ContactMessage[]> {
  const rows = await prisma.contactMessage.findMany({
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
}

export async function setRead(id: string, isRead: boolean): Promise<void> {
  const { count } = await prisma.contactMessage.updateMany({ where: { id }, data: { isRead } });
  if (count === 0) throw messageNotFound();
}

export async function removeMessage(id: string): Promise<void> {
  const { count } = await prisma.contactMessage.deleteMany({ where: { id } });
  if (count === 0) throw messageNotFound();
}

const messageNotFound = () =>
  new AppError(404, 'MESSAGE_NOT_FOUND', 'This message does not exist.');
