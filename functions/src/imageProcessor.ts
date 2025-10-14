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

  // --- 4.5. 回転後のOCRで座標を再取得 ---
  const [rotatedResult] = await visionClient.documentTextDetection(rotatedPath);
  const rotatedAnnotations = rotatedResult.fullTextAnnotation;

  const rotatedWords: Word[] = [];
  rotatedAnnotations?.pages?.forEach(page =>
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
            rotatedWords.push({ text, x, y, width, height });
          }
        })
      )
    )
  );

  // --- 5. クラス名を検出 ---
  const allClassNameMatches = detectClassNames(rotatedWords);

  // ファイル名用に重複除去
  const uniqueClassNames = Array.from(new Set(allClassNameMatches.map(m => m.className)));

  // デバッグ情報をログ出力
  console.log(`検出されたクラス名数（重複含む）: ${allClassNameMatches.length}`);
  console.log(`検出されたクラス名数（重複除去後）: ${uniqueClassNames.length}`);
  allClassNameMatches.forEach((match, index) => {
    console.log(`クラス名${index + 1}: ${match.className}, 構成単語数=${match.words.length}`);
  });

  const fullText = annotations?.text || '';

  // --- 6. ファイル名生成 ---
  const classStr = uniqueClassNames.join('-') || 'UNKNOWN';
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
  const debugImagePath = await createDebugImage(rotatedPath, rotatedWords);
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

// クラス名を検出する関数
function detectClassNames(words: Word[]): ClassNameMatch[] {
  const matches: ClassNameMatch[] = [];

  // 連続した文字列でのクラス名検索
  words.forEach(word => {
    const classMatch = word.text.match(/^([A-E]\d{0,2})/);
    if (classMatch) {
      matches.push({
        className: classMatch[1],
        words: [word],
      });
    }
  });

  return matches;
}

async function createDebugImage(imagePath: string, allWords: Word[]): Promise<string> {
  const debugPath = path.join(os.tmpdir(), 'debug.jpg');

  // 元画像を読み込んでSVGオーバーレイを作成
  const { width, height } = await sharp(imagePath).metadata();

  let svgOverlay = `<svg width="${width}" height="${height}">`;

  // すべての検出された文字を赤色で囲み、枠内にテキストを表示
  allWords.forEach(word => {
    // 矩形枠
    svgOverlay += `<rect x="${word.x - 2}" y="${word.y - 2}" width="${word.width + 4}" height="${word.height + 4}" 
      fill="none" stroke="#FF0000" stroke-width="1"/>`;

    // 枠内にテキストを表示（明朝体、赤色、9pt）
    svgOverlay += `<text x="${word.x}" y="${word.y + word.height - 2}" fill="#FF0000" 
      font-size="9pt" font-family="serif">${word.text}</text>`;
  });

  svgOverlay += '</svg>';

  // 元画像にSVGオーバーレイを合成
  await sharp(imagePath)
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .jpeg({ quality: 90 })
    .toFile(debugPath);

  return debugPath;
}
