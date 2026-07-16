/**
 * Utility to compress and resize a base64 image string using an offscreen canvas.
 */
export function compressBase64Image(base64Str: string, maxDimension = 256, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }

    // Skip if it's already very small (e.g. less than 15KB)
    if (base64Str.length < 20000) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round(height * (maxDimension / width));
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round(width * (maxDimension / height));
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Compress as WebP
        const compressed = canvas.toDataURL('image/webp', quality);
        console.log(`[DND Sheet] Compressed image from ${Math.round(base64Str.length / 1024)}KB to ${Math.round(compressed.length / 1024)}KB`);
        resolve(compressed);
      } catch (err) {
        console.warn('[DND Sheet] Image compression failed, using original:', err);
        resolve(base64Str);
      }
    };

    img.onerror = () => {
      resolve(base64Str);
    };

    img.src = base64Str;
  });
}

/**
 * Recursively scans a character object and compresses all base64 images found inside it.
 */
export async function compressCharacterImages(character: any): Promise<any> {
  if (!character || typeof character !== 'object') return character;

  const cloned = structuredClone(character);

  // 1. Compress portraitUrl
  if (cloned.portraitUrl && cloned.portraitUrl.startsWith('data:image/')) {
    cloned.portraitUrl = await compressBase64Image(cloned.portraitUrl, 256, 0.8);
  }

  // 2. Compress inventory item images
  if (Array.isArray(cloned.inventory)) {
    for (let i = 0; i < cloned.inventory.length; i++) {
      const item = cloned.inventory[i];
      if (item && item.imageUrl && item.imageUrl.startsWith('data:image/')) {
        item.imageUrl = await compressBase64Image(item.imageUrl, 128, 0.75);
      }
    }
  }

  // 3. Compress equipped items
  if (Array.isArray(cloned.equippedItems)) {
    for (let i = 0; i < cloned.equippedItems.length; i++) {
      const item = cloned.equippedItems[i];
      if (item && item.imageUrl && item.imageUrl.startsWith('data:image/')) {
        item.imageUrl = await compressBase64Image(item.imageUrl, 128, 0.75);
      }
    }
  }

  // 4. Compress attack images
  if (Array.isArray(cloned.attacks)) {
    for (let i = 0; i < cloned.attacks.length; i++) {
      const attack = cloned.attacks[i];
      if (attack && attack.imageUrl && attack.imageUrl.startsWith('data:image/')) {
        attack.imageUrl = await compressBase64Image(attack.imageUrl, 128, 0.75);
      }
    }
  }

  // 5. Compress spell images
  if (Array.isArray(cloned.spells)) {
    for (let i = 0; i < cloned.spells.length; i++) {
      const spell = cloned.spells[i];
      if (spell && spell.imageUrl && spell.imageUrl.startsWith('data:image/')) {
        spell.imageUrl = await compressBase64Image(spell.imageUrl, 128, 0.75);
      }
    }
  }

  return cloned;
}
