import * as admin from 'firebase-admin';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import sharp from 'sharp';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { StorageObjectData } from 'firebase-functions/storage';

const visionClient = new ImageAnnotatorClient();

export interface ProcessResult {
  newFilePath: string;
  fullText: string;
}

interface Word {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ClassNameMatch {
  className: string;
  words: Word[]; // このクラス名を構成する単語群
}

export async function processImage(object: StorageObjectData): Promise<ProcessResult> {
  const bucket = admin.storage().bucket(object.bucket!);
  const filePath = object.name!;
  const fileName = path.basename(filePath);
  const tempFilePath = path.join(os.tmpdir(), fileName);

  // --- 1. ダウンロード ---
  await bucket.file(filePath).download({ destination: tempFilePath });

  // --- 2. OCR ---
  const [result] = await visionClient.documentTextDetection(tempFilePath);
  const annotations = result.fullTextAnnotation;

  const words: Word[] = [];
  annotations?.pages?.forEach(page =>
    page.blocks?.forEach(block =>
      block.paragraphs?.forEach(para =>
        para.words?.forEach(word => {
          const text = word.symbols?.map(s => s.text).join('') || '';
          const box = word.boundingBox?.vertices;
          if (box && box.length === 4) {
            const x = Math.min(...box.map(v => v.x || 0));
            const y = Math.min(...box.map(v => v.y || 0));
            const width = Math.max(...box.map(v => v.x || 0)) - x;
            const height = Math.max(...box.map(v => v.y || 0)) - y;
            words.push({ text, x, y, width, height });
          }
        })
      )
    )
  );

  // --- 3. 回転角度計算 ---
  const angles: number[] = [];
  annotations?.pages?.forEach(page =>
    page.blocks?.forEach(block =>
      block.paragraphs?.forEach(para =>
        para.words?.forEach(word => {
          const box = word.boundingBox?.vertices;
          if (box && box.length === 4) {
            const dx = box[1].x! - box[0].x!;
            const dy = box[1].y! - box[0].y!;
            angles.push((Math.atan2(dy, dx) * 180) / Math.PI);
          }
        })
      )
    )
  );
  const rotateAngle =
    angles.length > 0 ? angles.sort((a, b) => a - b)[Math.floor(angles.length / 2)] : 0;

  // --- 4. 回転 & JPEG化 ---
  const rotatedPath = path.join(os.tmpdir(), 'rotated.jpg');
  await sharp(tempFilePath).rotate(-rotateAngle).jpeg({ quality: 80 }).toFile(rotatedPath);

  // --- 5. クラス名を検出 ---
  const classNameMatches = detectClassNames(words);

  // デバッグ情報をログ出力
  console.log(`検出されたクラス名数: ${classNameMatches.length}`);
  classNameMatches.forEach((match, index) => {
    console.log(`クラス名${index + 1}: ${match.className}, 構成単語数=${match.words.length}`);
  });

  const fullText = annotations?.text || '';

  // --- 6. ファイル名生成 ---
  const classStr = classNameMatches.map(m => m.className).join('-') || 'UNKNOWN';
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5).replace(':', '');
  let index = 1;
  let newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, '0')}.jpg`;
  const dir = 'uploads';

  while (
    await bucket
      .file(path.join(dir, newFileName))
      .exists()
      .then(r => r[0])
  ) {
    index++;
    newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, '0')}.jpg`;
  }
  const newFilePath = path.join(dir, newFileName);

  // --- 7. デバッグ用：検出されたクラス名を可視化した画像を作成 ---
  const debugImagePath = await createDebugImage(rotatedPath, classNameMatches);
  const debugFileName = `debug_${classStr}_${hhmm}_${String(index).padStart(3, '0')}.jpg`;
  const debugFilePath = path.join(dir, debugFileName);

  await bucket.upload(debugImagePath, {
    destination: debugFilePath,
    contentType: 'image/jpeg',
  });

  // --- 8. 元画像もアップロード ---
  await bucket.upload(rotatedPath, {
    destination: newFilePath,
    contentType: 'image/jpeg',
  });

  // --- 9. 元ファイル削除 ---
  await bucket.file(filePath).delete();

  // --- 10. 一時ファイル削除 ---
  await fs.promises.unlink(tempFilePath);
  await fs.promises.unlink(rotatedPath);
  await fs.promises.unlink(debugImagePath);

  return { newFilePath, fullText };
}

// クラス名を検出する関数（縦書き対応）
function detectClassNames(words: Word[]): ClassNameMatch[] {
  const matches: ClassNameMatch[] = [];

  // 1. 連続した文字列でのクラス名検索
  words.forEach(word => {
    const classMatch = word.text.match(/([A-E]\d*)級/);
    if (classMatch) {
      matches.push({
        className: classMatch[1],
        words: [word],
      });
    }
  });

  // 2. 分離された文字の組み合わせでクラス名検索（縦書き対応）
  if (matches.length === 0) {
    const classLetters = words.filter(w => /^[A-E]$/.test(w.text));
    const numbers = words.filter(w => /^\d+$/.test(w.text));
    const kyuWords = words.filter(w => w.text === '級');

    classLetters.forEach(letter => {
      // この文字の下方向にある数字を探す
      const nearbyNumbers = numbers.filter(num => {
        const horizontalDistance = Math.abs(num.x - letter.x);
        const verticalDistance = num.y - letter.y;

        // 水平方向の距離が文字幅の2倍以内、垂直方向は文字の下側で文字高の5倍以内
        return (
          horizontalDistance <= letter.width * 2 &&
          verticalDistance > 0 &&
          verticalDistance <= letter.height * 5
        );
      });

      nearbyNumbers.forEach(number => {
        // この数字の下方向にある「級」を探す
        const nearbyKyu = kyuWords.find(kyu => {
          const horizontalDistance = Math.abs(kyu.x - number.x);
          const verticalDistance = kyu.y - number.y;

          // 水平方向の距離が数字幅の2倍以内、垂直方向は数字の下側で数字高の5倍以内
          return (
            horizontalDistance <= number.width * 2 &&
            verticalDistance > 0 &&
            verticalDistance <= number.height * 5
          );
        });

        if (nearbyKyu) {
          const className = letter.text + number.text;
          matches.push({
            className,
            words: [letter, number, nearbyKyu],
          });
        }
      });
    });
  }

  // 重複除去（同じクラス名は1つにまとめる）
  const uniqueMatches: ClassNameMatch[] = [];
  const seenClassNames = new Set<string>();

  matches.forEach(match => {
    if (!seenClassNames.has(match.className)) {
      seenClassNames.add(match.className);
      uniqueMatches.push(match);
    }
  });

  return uniqueMatches;
}

async function createDebugImage(
  imagePath: string,
  classNameMatches: ClassNameMatch[]
): Promise<string> {
  const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
  const debugPath = path.join(os.tmpdir(), 'debug.jpg');

  // 元画像を読み込んでSVGオーバーレイを作成
  const { width, height } = await sharp(imagePath).metadata();

  let svgOverlay = `<svg width="${width}" height="${height}">`;

  // 検出されたクラス名ごとに異なる色で描画
  classNameMatches.forEach((match, matchIndex) => {
    const color = colors[matchIndex % colors.length];

    // このクラス名を構成する各単語を囲む
    match.words.forEach(word => {
      svgOverlay += `<rect x="${word.x - 2}" y="${word.y - 2}" width="${word.width + 4}" height="${word.height + 4}" 
        fill="none" stroke="${color}" stroke-width="3"/>`;

      // 単語の上にテキストを表示
      svgOverlay += `<text x="${word.x}" y="${word.y - 5}" fill="${color}" 
        font-size="14" font-weight="bold">${word.text}</text>`;
    });

    // クラス名全体のラベルを表示（最初の単語の上に）
    if (match.words.length > 0) {
      const firstWord = match.words[0];
      svgOverlay += `<text x="${firstWord.x - 10}" y="${firstWord.y - 20}" fill="${color}" 
        font-size="18" font-weight="bold">${match.className}級</text>`;
    }
  });

  svgOverlay += '</svg>';

  // 元画像にSVGオーバーレイを合成
  await sharp(imagePath)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toFile(debugPath);

  return debugPath;
}
