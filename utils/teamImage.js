const { createCanvas, loadImage } = require('@napi-rs/canvas');

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fitImageToSquare(ctx, img, x, y, size, radius = 32) {
  ctx.save();
  roundRect(ctx, x, y, size, size, radius);
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
}

function parseDiscordEmojiUrl(emojiString) {
  const match = emojiString.match(/<a?:[^:]+:(\d+)>/);
  if (!match) return null;
  return `https://cdn.discordapp.com/emojis/${match[1]}.png?size=256`;
}

async function loadCardImage(card) {
  if (card.emoji) {
    const emojiUrl = parseDiscordEmojiUrl(card.emoji);
    if (emojiUrl) {
      try {
        return await loadImage(emojiUrl);
      } catch (e) {
        // fallback to image_url
      }
    }
  }
  if (card.image_url) {
    try {
      return await loadImage(card.image_url);
    } catch (e) {
      // ignore
    }
  }
  return null;
}

async function generateTeamImage({ username, totalPower, cards, backgroundUrl }) {
  const width = 980;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // background
  if (backgroundUrl) {
    try {
      const bg = await loadImage(backgroundUrl);
      const scale = Math.max(width / bg.width, height / bg.height);
      const sw = bg.width * scale;
      const sh = bg.height * scale;
      ctx.drawImage(bg, (width - sw) / 2, (height - sh) / 2, sw, sh);
    } catch (err) {
      ctx.fillStyle = '#0c1221';
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    ctx.fillStyle = '#0c1221';
    ctx.fillRect(0, 0, width, height);
  }

  // dim overlay
  ctx.fillStyle = 'rgba(6, 18, 43, 0.75)';
  ctx.fillRect(0, 0, width, height);

  // top header
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TOTAL POWER', width / 2, 60);

  ctx.font = '800 86px sans-serif';
  ctx.fillStyle = '#ffd85e';
  ctx.fillText(totalPower.toLocaleString(), width / 2, 140);

  // cards row
  const cardSizes = [190, 240, 190];
  const positions = [220, 490, 760];
  const squareYs = [200, 180, 200];

  for (let i = 0; i < 3; i++) {
    const cardSize = cardSizes[i];
    const x = positions[i] - cardSize / 2;
    const squareY = squareYs[i];

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x - 10, squareY - 10, cardSize + 20, cardSize + 20, 34);
    ctx.fill();

    const card = cards[i];
    if (card) {
      const cardImage = await loadCardImage(card);
      if (cardImage) {
        fitImageToSquare(ctx, cardImage, x, squareY, cardSize, 40);
      } else {
        ctx.fillStyle = '#1f2f58';
        roundRect(ctx, x, squareY, cardSize, cardSize, 40);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 40px sans-serif';
        ctx.fillText(card.character.slice(0, 2).toUpperCase(), x + cardSize / 2, squareY + cardSize / 2 + 16);
      }

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8;
      roundRect(ctx, x - 6, squareY - 6, cardSize + 12, cardSize + 12, 42);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRect(ctx, x, squareY, cardSize, cardSize, 40);
      ctx.fill();
    }
  }

  // bottom caption
  ctx.fillStyle = '#c8d2ea';
  ctx.font = '600 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${username}'s team`, width / 2, height - 40);

  return canvas.toBuffer('image/png');
}

module.exports = { generateTeamImage };
