import * as admin from "firebase-admin";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { StorageObjectData } from "firebase-functions/storage";

const visionClient = new ImageAnnotatorClient();

export interface GameResult {
  round: number; // 1-6
  opponentClub: string;
  opponentName: string;
  isWin: boolean; // true=勝ち系, false=負け系
  scoreDiff: number; // 枚数差
  resultType: 'normal' | 'forfeit'; // normal=通常戦, forfeit=不戦勝
}

export interface PlayerCard {
  className: string; // "A", "B2", "D21"など
  club: string; // 所属会（"会"のみの場合は空文字）
  playerName: string;
  school: string; // 学校名（なければ空文字）
  furigana: string; // ふりがな（なければ空文字）
  playerId: string; // 数字のみ
  gameResults: GameResult[]; // 最大6試合分
}

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

export async function processImage(
  object: StorageObjectData
): Promise<ProcessResult> {
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
  annotations?.pages?.forEach((page) =>
    page.blocks?.forEach((block) =>
      block.paragraphs?.forEach((para) =>
        para.words?.forEach((word) => {
          const text = word.symbols?.map((s) => s.text).join("") || "";
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
  annotations?.pages?.forEach((page) =>
    page.blocks?.forEach((block) =>
      block.paragraphs?.forEach((para) =>
        para.words?.forEach((word) => {
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
    angles.length > 0
      ? angles.sort((a, b) => a - b)[Math.floor(angles.length / 2)]
      : 0;

  // --- 4. 回転 & JPEG化 ---
  const rotatedPath = path.join(os.tmpdir(), "rotated.jpg");
  await sharp(tempFilePath).rotate(-rotateAngle).jpeg({ quality: 80 }).toFile(rotatedPath);

  // --- 5. カードごとに分割 ---
  const cardClusters = clusterWordsByCard(words);

  // --- 6. 各カードを解析 ---
  const cards: PlayerCard[] = cardClusters.map((cardWords) => 
    analyzeCard(cardWords)
  );

  const fullText = JSON.stringify(cards, null, 2);

  // --- 7. ファイル名生成 ---
  const classStr = cards.map((c) => c.className).join("-") || "UNKNOWN";
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5).replace(":", "");
  let index = 1;
  let newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, "0")}.jpg`;
  const dir = "uploads";

  while (await bucket.file(path.join(dir, newFileName)).exists().then((r) => r[0])) {
    index++;
    newFileName = `${classStr}_${hhmm}_${String(index).padStart(3, "0")}.jpg`;
  }
  const newFilePath = path.join(dir, newFileName);

  // --- 8. アップロード ---
  await bucket.upload(rotatedPath, {
    destination: newFilePath,
    contentType: "image/jpeg"
  });

  // --- 9. 元ファイル削除 ---
  await bucket.file(filePath).delete();

  // --- 10. 一時ファイル削除 ---
  await fs.promises.unlink(tempFilePath);
  await fs.promises.unlink(rotatedPath);

  return { newFilePath, fullText };
}

function clusterWordsByCard(words: Word[]): Word[][] {
  if (words.length === 0) return [];

  // x座標でソートしてカードごとにクラスタリング
  const sortedWords = [...words].sort((a, b) => a.x - b.x);
  const clusters: Word[][] = [];
  const threshold = 100; // カード間のx座標差閾値

  sortedWords.forEach((word) => {
    let added = false;
    for (const cluster of clusters) {
      const avgX = cluster.reduce((sum, w) => sum + w.x, 0) / cluster.length;
      if (Math.abs(word.x - avgX) < threshold) {
        cluster.push(word);
        added = true;
        break;
      }
    }
    if (!added) {
      clusters.push([word]);
    }
  });

  return clusters;
}

function analyzeCard(words: Word[]): PlayerCard {
  if (words.length === 0) {
    return createEmptyCard();
  }

  // カードの境界を計算
  const minX = Math.min(...words.map(w => w.x));
  const maxX = Math.max(...words.map(w => w.x + w.width));
  const minY = Math.min(...words.map(w => w.y));
  const maxY = Math.max(...words.map(w => w.y + w.height));
  const cardWidth = maxX - minX;
  const cardHeight = maxY - minY;
  const centerX = minX + cardWidth / 2;

  // 右半分と左半分に分割
  const rightWords = words.filter(w => w.x >= centerX);
  const leftWords = words.filter(w => w.x < centerX);

  // 右半分から選手情報を抽出
  const playerInfo = extractPlayerInfo(rightWords, minY, cardHeight);

  // 左半分から戦績情報を抽出
  const gameResults = extractGameResults(leftWords, minY, cardHeight);

  return {
    ...playerInfo,
    gameResults
  };
}

function extractPlayerInfo(words: Word[], cardMinY: number, cardHeight: number): Omit<PlayerCard, 'gameResults'> {
  // 上部30%を所属情報エリア、下部70%を選手情報エリアとする
  const clubAreaMaxY = cardMinY + cardHeight * 0.3;
  const clubWords = words.filter(w => w.y <= clubAreaMaxY);
  const playerWords = words.filter(w => w.y > clubAreaMaxY);

  // クラス名を抽出（「級」を含む文字列）
  let className = "UNKNOWN";
  for (const word of clubWords) {
    const classMatch = word.text.match(/([A-E]\d*)級/);
    if (classMatch) {
      className = classMatch[1];
      break;
    }
  }

  // 所属会を抽出（「◯◯会」の形式）
  let club = "";
  for (const word of clubWords) {
    const clubMatch = word.text.match(/(.+)会/);
    if (clubMatch && clubMatch[1] !== "") {
      club = clubMatch[1] + "会";
      break;
    }
  }

  // 選手IDを抽出（「ID:数字」の形式）
  let playerId = "0000";
  for (const word of [...clubWords, ...playerWords]) {
    const idMatch = word.text.match(/ID:(\d+)/);
    if (idMatch) {
      playerId = idMatch[1];
      break;
    }
  }

  // 選手名、学校名、ふりがなを抽出
  // IDと所属会以外の文字列から推定
  const playerTexts = playerWords
    .filter(w => !w.text.includes("ID:") && !w.text.includes("級") && w.text !== "氏名")
    .sort((a, b) => a.y - b.y)
    .map(w => w.text);

  // 簡易的に最初の文字列を選手名とする（実際はより複雑な解析が必要）
  const playerName = playerTexts.length > 0 ? playerTexts[0] : "";
  
  // 学校名とふりがなの判定（ひらがな・カタカナは仮名、漢字混じりは学校名）
  let school = "";
  let furigana = "";
  
  for (let i = 1; i < playerTexts.length; i++) {
    const text = playerTexts[i];
    if (/^[ひらがなカタカナ\u3040-\u309F\u30A0-\u30FF]+$/.test(text)) {
      furigana = text;
    } else if (/[一-龯]/.test(text)) {
      school = text;
    }
  }

  return {
    className,
    club,
    playerName,
    school,
    furigana,
    playerId
  };
}

function extractGameResults(words: Word[], cardMinY: number, cardHeight: number): GameResult[] {
  if (words.length === 0) return [];

  const gameResults: GameResult[] = [];
  
  // 左半分を6段に分割
  for (let round = 1; round <= 6; round++) {
    const roundStartY = cardMinY + ((round - 1) * cardHeight) / 6;
    const roundEndY = cardMinY + (round * cardHeight) / 6;
    
    const roundWords = words.filter(w => 
      w.y >= roundStartY && w.y < roundEndY
    );

    if (roundWords.length === 0) continue;

    // この段の戦績を解析
    const gameResult = analyzeRoundResult(round, roundWords);
    if (gameResult) {
      gameResults.push(gameResult);
    }
  }

  return gameResults;
}

function analyzeRoundResult(round: number, words: Word[]): GameResult | null {
  // 相手所属会の判定（「会」が含まれているか）
  const clubWords = words.filter(w => w.text.includes("会"));
  const opponentClub = clubWords.length > 0 && clubWords[0].text !== "会" ? clubWords[0].text : "";
  
  // 相手選手名の抽出（所属会以外の小さな文字）
  const nameWords = words.filter(w => !w.text.includes("会") && !w.text.includes("回戦") && 
    !w.text.match(/[◯✕]/) && !w.text.match(/\d/) && !w.text.includes("不"));
  const opponentName = nameWords.length > 0 ? nameWords.map(w => w.text).join("") : "";

  // 戦績の判定
  let isWin = false;
  let scoreDiff = 0;
  let resultType: 'normal' | 'forfeit' = 'normal';

  // 不戦勝の判定（「不」が含まれる）
  const forfeitWords = words.filter(w => w.text.includes("不"));
  if (forfeitWords.length > 0) {
    isWin = true;
    resultType = 'forfeit';
    scoreDiff = 0; // 基本は0、将来的に変更可能
  } else {
    // 通常戦の判定
    const winWords = words.filter(w => w.text.includes("◯"));
    const loseWords = words.filter(w => w.text.includes("✕"));
    
    if (winWords.length > 0) {
      isWin = true;
    } else if (loseWords.length > 0) {
      isWin = false;
    } else {
      // 勝敗が不明な場合はスキップ
      return null;
    }

    // 枚数差の抽出
    const numberWords = words.filter(w => w.text.match(/^\d+$/));
    if (numberWords.length > 0) {
      scoreDiff = parseInt(numberWords[0].text, 10) || 0;
    }
  }

  // 対戦相手の情報がない場合（未記入）はスキップ
  if (opponentClub === "" && opponentName === "") {
    return null;
  }

  return {
    round,
    opponentClub,
    opponentName,
    isWin,
    scoreDiff,
    resultType
  };
}

function createEmptyCard(): PlayerCard {
  return {
    className: "UNKNOWN",
    club: "",
    playerName: "",
    school: "",
    furigana: "",
    playerId: "0000",
    gameResults: []
  };
}